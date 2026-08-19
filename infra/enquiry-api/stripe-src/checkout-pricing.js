"use strict";

const VAT_RATE = 0.2;

function calculateAssociationPricePence(constituencyCount) {
  const count = Math.max(1, Number(constituencyCount) || 1);
  const exVatPence = (500 + Math.max(0, count - 1) * 250) * 100;
  const vatPence = Math.round(exVatPence * VAT_RATE);
  return { exVatPence, vatPence, incVatPence: exVatPence + vatPence };
}

function buildAnnualCheckoutSessionParams({
  association,
  constituencyCount,
  customerId,
  siteUrl,
  cognitoSub = "",
  userEmail = "",
}) {
  const count = Math.max(1, Number(constituencyCount) || association?.constituency_count || 1);
  const pricing = calculateAssociationPricePence(count);
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");

  return {
    mode: "subscription",
    customer: customerId,
    success_url: `${normalizedSiteUrl}/portal?subscription=success`,
    cancel_url: `${normalizedSiteUrl}/subscribe?cancelled=true`,
    line_items: [
      {
        price_data: {
          currency: "gbp",
          unit_amount: pricing.incVatPence,
          tax_behavior: "inclusive",
          recurring: { interval: "year" },
          product_data: {
            name: `${association.name} Political Solutions subscription`,
            description: `${count} constituency annual access, including VAT`,
          },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: {
        association_id: association.id,
        association_name: association.name,
        cognito_sub: cognitoSub,
        user_email: userEmail,
        constituency_count: String(count),
        amount_ex_vat_pence: String(pricing.exVatPence),
        vat_pence: String(pricing.vatPence),
        amount_inc_vat_pence: String(pricing.incVatPence),
      },
    },
    metadata: {
      association_id: association.id,
      cognito_sub: cognitoSub,
      user_email: userEmail,
    },
  };
}

module.exports = {
  VAT_RATE,
  calculateAssociationPricePence,
  buildAnnualCheckoutSessionParams,
};
