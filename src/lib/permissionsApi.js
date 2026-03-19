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
  if (!db) return [];

  const { data: perms, error: permsErr } = await db
    .from("user_permissions")
    .select("id, association_id, granted_at, associations(id, name)")
    .eq("cognito_sub", cognitoSub)
    .eq("is_active", true);

  if (permsErr || !perms?.length) return [];

  const assocIds = perms.map((p) => p.association_id);

  const { data: links } = await db
    .from("association_constituencies")
    .select("association_id, constituencies(id, name, ons_code)")
    .in("association_id", assocIds);

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
  const perms = await getUserPermissions(cognitoSub);
  const seen = new Set();
  const result = [];
  for (const perm of perms) {
    for (const c of perm.constituencies) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        result.push(c);
      }
    }
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
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
 * Returns all associations (for admin dropdowns).
 */
export async function listAssociations() {
  const db = getSupabaseServiceClient();
  if (!db) return [];
  const { data } = await db
    .from("associations")
    .select("id, name, region, country, notes, created_at")
    .order("name");
  return data || [];
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
