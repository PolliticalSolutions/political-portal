"use strict";

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

const VAT_RATE = 0.2;
const REGION = process.env.AWS_REGION || "eu-west-2";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cognito = new CognitoIdentityProviderClient({ region: REGION });
const ses = new SESv2Client({ region: REGION });

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function calculateAssociationPricePence(constituencyCount) {
  const count = Math.max(1, Number(constituencyCount) || 1);
  const exVatPence = (500 + Math.max(0, count - 1) * 250) * 100;
  const vatPence = Math.round(exVatPence * VAT_RATE);
  return { exVatPence, vatPence, incVatPence: exVatPence + vatPence };
}

async function getAssociationWithPricing(associationId) {
  const { data, error } = await supabase
    .from("associations_with_pricing")
    .select("id, name, region, constituency_count, constituency_names, amount_ex_vat_pence, vat_pence, amount_inc_vat_pence")
    .eq("id", associationId)
    .single();

  if (!error && data) return data;

  const { data: association, error: associationError } = await supabase
    .from("associations")
    .select("id, name, region")
    .eq("id", associationId)
    .single();
  if (associationError || !association) {
    throw new Error(associationError?.message || "Association not found.");
  }

  const { data: links } = await supabase
    .from("association_constituencies")
    .select("constituencies(name)")
    .eq("association_id", associationId);
  const constituencyNames = (links || []).map((row) => row.constituencies?.name).filter(Boolean);
  const pricing = calculateAssociationPricePence(constituencyNames.length);

  return {
    ...association,
    constituency_count: constituencyNames.length,
    constituency_names: constituencyNames,
    amount_ex_vat_pence: pricing.exVatPence,
    vat_pence: pricing.vatPence,
    amount_inc_vat_pence: pricing.incVatPence,
  };
}

async function findOrCreateStripeCustomer(userEmail, customerName) {
  const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
  if (customers.data.length > 0) return customers.data[0];
  return stripe.customers.create({
    email: userEmail,
    name: customerName || userEmail,
  });
}

async function ensureCognitoUser(userEmail, customerName) {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) throw new Error("Missing COGNITO_USER_POOL_ID.");

  try {
    const existing = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: userEmail })
    );
    return existing;
  } catch (error) {
    if (error.name !== "UserNotFoundException") throw error;
  }

  const tempPassword = process.env.COGNITO_TEMP_PASSWORD || "ChangeMe!123";
  const created = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: userEmail,
      TemporaryPassword: tempPassword,
      UserAttributes: [
        { Name: "email", Value: userEmail },
        { Name: "email_verified", Value: "true" },
        ...(customerName ? [{ Name: "name", Value: customerName }] : []),
      ],
      MessageAction: "SUPPRESS",
    })
  );

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: userEmail,
      Password: tempPassword,
      Permanent: false,
    })
  );

  return created.User;
}

async function grantAssociationPermission({ cognitoSub, userEmail, associationId }) {
  await supabase
    .from("user_permissions")
    .upsert(
      {
        cognito_sub: cognitoSub,
        user_email: userEmail,
        association_id: associationId,
        granted_by: "stripe_webhook",
        is_active: true,
        notes: "Auto-granted after Stripe payment",
      },
      { onConflict: "cognito_sub,association_id" }
    );
}

async function revokeAssociationPermission({ cognitoSub, associationId }) {
  await supabase
    .from("user_permissions")
    .update({ is_active: false })
    .eq("cognito_sub", cognitoSub)
    .eq("association_id", associationId);
}

async function audit(action, detail, targetEmail, associationId) {
  await supabase.from("permission_audit_log").insert({
    admin_email: "stripe_webhook",
    action,
    target_email: targetEmail,
    association_id: associationId,
    detail,
  });
}

async function sendWelcomeEmail(toAddress, associationName, constituencyNames) {
  if (!process.env.SES_FROM_EMAIL) return;

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.SES_FROM_EMAIL,
      Destination: { ToAddresses: [toAddress] },
      Content: {
        Simple: {
          Subject: { Data: `Political Solutions access enabled for ${associationName}` },
          Body: {
            Text: {
              Data: [
                `Your Political Solutions subscription for ${associationName} is now active.`,
                "",
                `Access granted to: ${constituencyNames.join(", ") || "association constituencies"}.`,
                "",
                "Use your welcome email or Cognito invite to sign in.",
              ].join("\n"),
            },
          },
        },
      },
    })
  );
}

async function createPaymentIntent(body) {
  const association = await getAssociationWithPricing(body.association_id);
  const customer = await findOrCreateStripeCustomer(body.user_email, body.customer_name);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: association.amount_inc_vat_pence,
    currency: "gbp",
    customer: customer.id,
    receipt_email: body.user_email,
    metadata: {
      association_id: association.id,
      association_name: association.name,
      user_email: body.user_email,
    },
  });

  return json(200, {
    client_secret: paymentIntent.client_secret,
    amount: association.amount_inc_vat_pence,
    association,
  });
}

async function createInvoice(body) {
  const association = await getAssociationWithPricing(body.association_id);
  const customer = await findOrCreateStripeCustomer(body.user_email, body.customer_name);

  await stripe.invoiceItems.create({
    customer: customer.id,
    amount: association.amount_inc_vat_pence,
    currency: "gbp",
    description: `${association.name} annual Political Solutions subscription`,
  });

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: "send_invoice",
    days_until_due: 14,
    metadata: {
      association_id: association.id,
      user_email: body.user_email,
    },
  });

  await stripe.invoices.sendInvoice(invoice.id);

  return json(200, {
    invoice_id: invoice.id,
    invoice_url: invoice.hosted_invoice_url,
  });
}

async function handleWebhook(event) {
  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeEvent = stripe.webhooks.constructEvent(event.body, signature, webhookSecret);

  if (stripeEvent.type === "payment_intent.succeeded") {
    const paymentIntent = stripeEvent.data.object;
    const association = await getAssociationWithPricing(paymentIntent.metadata.association_id);
    const cognitoUser = await ensureCognitoUser(paymentIntent.receipt_email, paymentIntent.metadata.customer_name);
    const cognitoSub =
      cognitoUser?.Attributes?.find?.((item) => item.Name === "sub")?.Value ||
      cognitoUser?.UserAttributes?.find?.((item) => item.Name === "sub")?.Value ||
      null;

    await supabase.from("subscriptions").insert({
      association_id: association.id,
      cognito_sub: cognitoSub,
      user_email: paymentIntent.receipt_email,
      stripe_customer_id: paymentIntent.customer,
      stripe_subscription_id: paymentIntent.invoice || null,
      stripe_invoice_id: paymentIntent.latest_charge || null,
      status: "active",
      payment_method: "stripe",
      amount_ex_vat: association.amount_ex_vat_pence / 100,
      amount_inc_vat: association.amount_inc_vat_pence / 100,
      billing_period_start: new Date().toISOString().slice(0, 10),
      billing_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });

    if (cognitoSub) {
      await grantAssociationPermission({
        cognitoSub,
        userEmail: paymentIntent.receipt_email,
        associationId: association.id,
      });
    }
    await sendWelcomeEmail(paymentIntent.receipt_email, association.name, association.constituency_names || []);
    await audit("SUBSCRIPTION_PAID", `PaymentIntent ${paymentIntent.id}`, paymentIntent.receipt_email, association.id);
  }

  if (stripeEvent.type === "invoice.payment_failed") {
    const invoice = stripeEvent.data.object;
    await supabase
      .from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("stripe_customer_id", invoice.customer);
  }

  if (stripeEvent.type === "customer.subscription.deleted") {
    const subscription = stripeEvent.data.object;
    const { data } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", subscription.id)
      .select("cognito_sub, association_id, user_email")
      .single();
    if (data?.cognito_sub && data?.association_id) {
      await revokeAssociationPermission({
        cognitoSub: data.cognito_sub,
        associationId: data.association_id,
      });
      await audit("SUBSCRIPTION_CANCELLED", subscription.id, data.user_email, data.association_id);
    }
  }

  return json(200, { received: true });
}

async function handleRenewalSweep() {
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: overdue } = await supabase
    .from("subscriptions")
    .select("id, cognito_sub, association_id, user_email")
    .eq("status", "past_due")
    .lte("updated_at", sevenDaysAgo);

  for (const subscription of overdue || []) {
    if (subscription.cognito_sub && subscription.association_id) {
      await revokeAssociationPermission({
        cognitoSub: subscription.cognito_sub,
        associationId: subscription.association_id,
      });
      await audit("SUBSCRIPTION_SUSPENDED", "Past due > 7 days", subscription.user_email, subscription.association_id);
    }
    await supabase
      .from("subscriptions")
      .update({ status: "suspended", updated_at: new Date().toISOString() })
      .eq("id", subscription.id);
  }

  return json(200, { processed: (overdue || []).length });
}

exports.handler = async (event) => {
  try {
    if (event.source === "aws.events") {
      return handleRenewalSweep();
    }

    const method = event.httpMethod || event.requestContext?.http?.method;
    const path = event.rawPath || event.path || "";
    const body = event.body ? JSON.parse(event.body) : {};

    if (method === "POST" && path.endsWith("/create-payment-intent")) {
      return createPaymentIntent(body);
    }
    if (method === "POST" && path.endsWith("/create-invoice")) {
      return createInvoice(body);
    }
    if (method === "POST" && path.endsWith("/webhook")) {
      return handleWebhook(event);
    }

    return json(404, { message: "Not found" });
  } catch (error) {
    return json(500, { message: error.message || "Unhandled Stripe handler error." });
  }
};

