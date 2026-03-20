/**
 * Permissions API — association-based constituency access control.
 *
 * All functions use the Supabase service role client so they can read
 * user_permissions (blocked from the anon role by RLS).
 *
 * Caching: callers should cache results in React context rather than
 * calling these functions on every render.
 */
import { getSupabaseServiceClient } from "./supabaseServiceClient.js";

/**
 * Returns the full permission record list for a user, including their
 * associations and the constituencies each association covers.
 *
 * @param {string} cognitoSub
 * @returns {Promise<Array<{
 *   id: string,
 *   association_id: string,
 *   association_name: string,
 *   granted_at: string,
 *   constituencies: Array<{ id: string, name: string, ons_code: string }>
 * }>>}
 */
export async function getUserPermissions(cognitoSub) {
  if (!cognitoSub) return [];
  const db = getSupabaseServiceClient();
  if (!db) {
    console.warn("[permissionsApi] Supabase service client unavailable in getUserPermissions.", {
      cognitoSub,
    });
    return [];
  }

  console.log("[permissionsApi] Querying user_permissions.", {
    table: "user_permissions",
    filters: {
      cognito_sub: cognitoSub,
      is_active: true,
    },
  });

  const { data: perms, error: permsErr } = await db
    .from("user_permissions")
    .select("id, association_id, granted_at, associations(id, name)")
    .eq("cognito_sub", cognitoSub)
    .eq("is_active", true);

  console.log("[permissionsApi] Raw Supabase response for user_permissions.", {
    cognitoSub,
    data: perms,
    error: permsErr,
    rowCount: Array.isArray(perms) ? perms.length : 0,
  });

  if (permsErr || !perms?.length) return [];

  const assocIds = perms.map((p) => p.association_id);

  console.log("[permissionsApi] Querying association_constituencies.", {
    table: "association_constituencies",
    filters: {
      association_id_in: assocIds,
    },
  });

  const { data: links, error: linksErr } = await db
    .from("association_constituencies")
    .select("association_id, constituencies(id, name, ons_code)")
    .in("association_id", assocIds);

  console.log("[permissionsApi] Raw Supabase response for association_constituencies.", {
    cognitoSub,
    associationIds: assocIds,
    data: links,
    error: linksErr,
    rowCount: Array.isArray(links) ? links.length : 0,
  });

  const consByAssoc = {};
  for (const link of links || []) {
    const aid = link.association_id;
    if (!consByAssoc[aid]) consByAssoc[aid] = [];
    if (link.constituencies) consByAssoc[aid].push(link.constituencies);
  }

  return perms.map((p) => ({
    id: p.id,
    association_id: p.association_id,
    association_name: p.associations?.name || "Unknown",
    granted_at: p.granted_at,
    constituencies: consByAssoc[p.association_id] || [],
  }));
}

/**
 * Returns a flat, de-duplicated list of constituencies the user can
 * upload for, across all their active associations.
 *
 * @param {string} cognitoSub
 * @returns {Promise<Array<{ id: string, name: string, ons_code: string }>>}
 */
export async function getUserConstituencies(cognitoSub) {
  console.log("[permissionsApi] getUserConstituencies called.", { cognitoSub });
  const perms = await getUserPermissions(cognitoSub);
  const seen = new Set();
  const result = [];
  for (const perm of perms) {
    for (const c of perm.constituencies) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push({ ...c, association_name: perm.association_name });
      }
    }
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  console.log("[permissionsApi] getUserConstituencies flattened result.", {
    cognitoSub,
    permissions: perms,
    constituencies: result,
    constituencyCount: result.length,
  });
  return result;
}

/**
 * Returns true if the user has access to the given constituency ID.
 *
 * @param {string} cognitoSub
 * @param {string} constituencyId  — Supabase UUID
 * @returns {Promise<boolean>}
 */
export async function hasAccessToConstituency(cognitoSub, constituencyId) {
  const cons = await getUserConstituencies(cognitoSub);
  return cons.some((c) => c.id === constituencyId);
}

// ── Admin functions (service role required) ────────────────────────────────

/**
 * Returns all associations with computed pricing and constituency count.
 * Uses the associations_with_pricing view for admin pages.
 * Falls back to the base table for lightweight dropdowns.
 */
export async function listAssociations({ withPricing = false } = {}) {
  const db = getSupabaseServiceClient();
  if (!db) return [];
  if (withPricing) {
    const { data } = await db
      .from("associations_with_pricing")
      .select("*")
      .order("name");
    return data || [];
  }
  const { data } = await db
    .from("associations")
    .select("id, name, region, country, notes, created_at")
    .order("name");
  return data || [];
}

/**
 * Returns the count of active users (permissions) per association.
 * Returns a map of associationId -> count.
 */
export async function getActiveUserCountsByAssociation() {
  const db = getSupabaseServiceClient();
  if (!db) return {};
  const { data } = await db
    .from("user_permissions")
    .select("association_id")
    .eq("is_active", true);
  const counts = {};
  for (const row of data || []) {
    counts[row.association_id] = (counts[row.association_id] || 0) + 1;
  }
  return counts;
}

/**
 * Returns all permissions for a user identified by email.
 */
export async function getPermissionsByEmail(email) {
  if (!email) return [];
  const db = getSupabaseServiceClient();
  if (!db) return [];
  const { data } = await db
    .from("user_permissions")
    .select("id, cognito_sub, user_email, association_id, granted_by, granted_at, is_active, associations(id, name)")
    .ilike("user_email", email)
    .order("granted_at", { ascending: false });
  return data || [];
}

/**
 * Grants a user permission to an association, and logs the action.
 */
export async function grantPermission({ cognitoSub, userEmail, associationId, adminEmail, notes }) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");

  const { data, error } = await db
    .from("user_permissions")
    .upsert(
      {
        cognito_sub: cognitoSub,
        user_email: userEmail,
        association_id: associationId,
        granted_by: adminEmail,
        is_active: true,
        notes: notes || null,
      },
      { onConflict: "cognito_sub,association_id" }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);

  await db.from("permission_audit_log").insert({
    admin_email: adminEmail,
    action: "GRANT",
    target_email: userEmail,
    association_id: associationId,
    detail: notes || null,
  });

  return data;
}

/**
 * Revokes a permission by ID, and logs the action.
 */
export async function revokePermission({ permissionId, adminEmail, targetEmail, associationId }) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");

  const { error } = await db
    .from("user_permissions")
    .update({ is_active: false })
    .eq("id", permissionId);

  if (error) throw new Error(error.message);

  await db.from("permission_audit_log").insert({
    admin_email: adminEmail,
    action: "REVOKE",
    target_email: targetEmail,
    association_id: associationId,
    detail: `Revoked permission ${permissionId}`,
  });
}

/**
 * Creates a new association.
 */
export async function createAssociation({ name, region, country, notes }) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");
  const { data, error } = await db
    .from("associations")
    .insert({ name, region, country: country || "England", notes })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Updates an association.
 */
export async function updateAssociation(id, { name, region, country, notes }) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");
  const { data, error } = await db
    .from("associations")
    .update({ name, region, country, notes })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Returns constituencies linked to an association.
 */
export async function getAssociationConstituencies(associationId) {
  const db = getSupabaseServiceClient();
  if (!db) return [];
  const { data } = await db
    .from("association_constituencies")
    .select("id, constituency_id, constituencies(id, name, ons_code)")
    .eq("association_id", associationId)
    .order("constituencies(name)");
  return (data || []).map((r) => ({ linkId: r.id, ...r.constituencies }));
}

/**
 * Links a constituency to an association.
 */
export async function linkConstituency(associationId, constituencyId) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");
  const { error } = await db
    .from("association_constituencies")
    .upsert({ association_id: associationId, constituency_id: constituencyId }, { onConflict: "association_id,constituency_id" });
  if (error) throw new Error(error.message);
}

/**
 * Unlinks a constituency from an association (by link row ID).
 */
export async function unlinkConstituency(linkId) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");
  const { error } = await db.from("association_constituencies").delete().eq("id", linkId);
  if (error) throw new Error(error.message);
}

export async function listSubscriptions() {
  const db = getSupabaseServiceClient();
  if (!db) return [];
  const { data } = await db
    .from("subscriptions")
    .select(`
      id,
      association_id,
      cognito_sub,
      user_email,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_invoice_id,
      status,
      amount_ex_vat,
      amount_inc_vat,
      billing_period_start,
      billing_period_end,
      created_at,
      updated_at,
      admin_override_active,
      admin_override_notes,
      associations(id, name)
    `)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function setSubscriptionStatus({
  subscriptionId,
  status,
  adminEmail,
  activatePermissions = false,
  notes = "",
}) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");

  const { data: subscription, error: subscriptionError } = await db
    .from("subscriptions")
    .select("id, association_id, cognito_sub, user_email")
    .eq("id", subscriptionId)
    .single();

  if (subscriptionError || !subscription) {
    throw new Error(subscriptionError?.message || "Subscription not found.");
  }

  const { error } = await db
    .from("subscriptions")
    .update({
      status,
      admin_override_active: activatePermissions,
      admin_override_notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  if (error) throw new Error(error.message);

  if (subscription.cognito_sub && subscription.association_id) {
    if (activatePermissions) {
      await db
        .from("user_permissions")
        .upsert(
          {
            cognito_sub: subscription.cognito_sub,
            user_email: subscription.user_email,
            association_id: subscription.association_id,
            granted_by: adminEmail,
            is_active: true,
            notes: notes || "Manual subscription activation",
          },
          { onConflict: "cognito_sub,association_id" }
        );
    } else {
      await db
        .from("user_permissions")
        .update({ is_active: false })
        .eq("cognito_sub", subscription.cognito_sub)
        .eq("association_id", subscription.association_id);
    }
  }

  await db.from("permission_audit_log").insert({
    admin_email: adminEmail,
    action: activatePermissions ? "SUBSCRIPTION_ACTIVATE" : "SUBSCRIPTION_SUSPEND",
    target_email: subscription.user_email,
    association_id: subscription.association_id,
    detail: notes || status,
  });
}
