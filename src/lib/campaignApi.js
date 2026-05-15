// Supabase queries for the campaign module. All reads/writes go through
// the anon client — RLS is disabled on the portal-internal tables
// (campaign_sessions, session_rsvps, campaign_roles) matching the CRM
// pattern. The volunteers / volunteer_rsvps / volunteer_email_log tables
// are RLS-locked and ONLY accessed via the Lambda handlers, not from here.
//
// Admin override: paul@politicalsolutions.uk always has full access,
// regardless of campaign_roles or admin_users contents.

import { supabase } from "./supabaseClient.js";
import { isAdmin } from "./subscriptionApi.js";
import { ADMIN_EMAIL_OVERRIDE } from "./campaignConfig.js";

// ===========================================================================
// Access aggregation
// ===========================================================================

/**
 * Resolve a user's full campaign access profile in a single call.
 *
 * @param {string|null} cognitoSub
 * @param {string|null} userEmail
 * @returns {Promise<{
 *   isAdmin: boolean,
 *   isCampaignManagerFor: Set<string>,
 *   isCoordinatorFor: Set<string>,
 *   regionalViewerOf: Set<string>,
 *   userRegions: Set<string>,
 * }>}
 */
export async function getCampaignAccess(cognitoSub, userEmail) {
  const emailMatchesAdmin =
    typeof userEmail === "string" && userEmail.trim().toLowerCase() === ADMIN_EMAIL_OVERRIDE;

  const access = {
    isAdmin: false,
    isCampaignManagerFor: new Set(),
    isCoordinatorFor: new Set(),
    regionalViewerOf: new Set(),
    userRegions: new Set(),
  };

  if (!cognitoSub) {
    access.isAdmin = emailMatchesAdmin;
    return access;
  }

  if (emailMatchesAdmin) {
    access.isAdmin = true;
  } else {
    access.isAdmin = await isAdmin(cognitoSub);
  }

  const { data: roles, error: rolesError } = await supabase
    .from("campaign_roles")
    .select("role, association_id, region")
    .eq("cognito_sub", cognitoSub)
    .eq("is_active", true);
  if (rolesError) throw new Error(rolesError.message);

  for (const r of roles || []) {
    if (r.role === "campaign_manager" && r.association_id) {
      access.isCampaignManagerFor.add(r.association_id);
    } else if (r.role === "volunteer_coordinator" && r.association_id) {
      access.isCoordinatorFor.add(r.association_id);
    } else if (r.role === "regional_viewer" && r.region) {
      access.regionalViewerOf.add(r.region);
    }
  }

  // Derive userRegions from user_permissions → associations.
  const { data: perms } = await supabase
    .from("user_permissions")
    .select("association_id, associations(region)")
    .eq("cognito_sub", cognitoSub)
    .eq("is_active", true);
  for (const p of perms || []) {
    const region = p.associations && p.associations.region;
    if (region) access.userRegions.add(region);
  }

  // Plus regions from campaign_manager / coordinator associations.
  const linkedAssocIds = [
    ...access.isCampaignManagerFor,
    ...access.isCoordinatorFor,
  ];
  if (linkedAssocIds.length > 0) {
    const { data: linkedAssocs } = await supabase
      .from("associations")
      .select("id, region")
      .in("id", linkedAssocIds);
    for (const a of linkedAssocs || []) {
      if (a.region) access.userRegions.add(a.region);
    }
  }

  return access;
}

function canSeeAllRegions(access) {
  return access.isAdmin;
}

function visibleRegions(access) {
  const set = new Set(access.userRegions);
  for (const r of access.regionalViewerOf) set.add(r);
  return set;
}

// ===========================================================================
// Sessions
// ===========================================================================

const SESSION_COLUMNS = "id, title, session_type, constituency_id, association_id, region, meeting_place, session_date, start_time, duration_minutes, contact_name, contact_phone, contact_email, max_capacity, notes, status, created_by_sub, created_at, updated_at";

export async function listSessionsForUser(access) {
  let q = supabase
    .from("campaign_sessions")
    .select(SESSION_COLUMNS)
    .neq("status", "cancelled")
    .order("session_date", { ascending: true });

  if (!canSeeAllRegions(access)) {
    const regions = Array.from(visibleRegions(access));
    if (regions.length === 0) {
      // No region visibility at all: only own Drafts visible.
      q = q.eq("status", "published").in("region", ["__none__"]);
    } else {
      q = q.in("region", regions).eq("status", "published");
    }
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSessionById(id) {
  const { data, error } = await supabase
    .from("campaign_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createSession(input, createdBySub) {
  // Region is denormalised from the association at insert time.
  const { data: assoc, error: assocError } = await supabase
    .from("associations")
    .select("id, region")
    .eq("id", input.association_id)
    .maybeSingle();
  if (assocError) throw new Error(assocError.message);
  if (!assoc) throw new Error("Association not found.");

  const row = {
    title: input.title,
    session_type: input.session_type,
    constituency_id: input.constituency_id,
    association_id: assoc.id,
    region: assoc.region || "South East",
    meeting_place: input.meeting_place,
    session_date: input.session_date,
    start_time: input.start_time,
    duration_minutes: input.duration_minutes,
    contact_name: input.contact_name,
    contact_phone: input.contact_phone,
    contact_email: input.contact_email,
    max_capacity: input.max_capacity ?? null,
    notes: input.notes ?? null,
    status: input.status || "draft",
    created_by_sub: createdBySub,
  };

  const { data, error } = await supabase
    .from("campaign_sessions")
    .insert(row)
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSession(id, patch) {
  const { data, error } = await supabase
    .from("campaign_sessions")
    .update(patch)
    .eq("id", id)
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelSession(id) {
  const { error } = await supabase
    .from("campaign_sessions")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listSessionsByRegion(region, fromDate, toDate) {
  let q = supabase
    .from("campaign_sessions")
    .select(SESSION_COLUMNS)
    .eq("region", region)
    .eq("status", "published")
    .order("session_date", { ascending: true });
  if (fromDate) q = q.gte("session_date", fromDate);
  if (toDate) q = q.lte("session_date", toDate);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

// ===========================================================================
// RSVPs and attendance
// ===========================================================================

export async function listRsvpsForSession(sessionId) {
  const { data, error } = await supabase
    .from("session_rsvps")
    .select("id, session_id, cognito_sub, display_name, user_email, association_id, attendance_status, rsvp_at, attendance_set_at")
    .eq("session_id", sessionId)
    .order("rsvp_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function countRsvpsForSession(sessionId) {
  const { count, error } = await supabase
    .from("session_rsvps")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function getMyRsvp(sessionId, cognitoSub) {
  if (!cognitoSub) return null;
  const { data, error } = await supabase
    .from("session_rsvps")
    .select("id, attendance_status")
    .eq("session_id", sessionId)
    .eq("cognito_sub", cognitoSub)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function rsvpSession(sessionId, cognitoSub, displayName, userEmail, associationId) {
  // Capacity pre-check (race-tolerant — see plan §A).
  const session = await getSessionById(sessionId);
  if (!session) throw new Error("Session not found.");
  if (session.status !== "published") throw new Error("Session is not open for RSVPs.");
  if (session.max_capacity != null) {
    const count = await countRsvpsForSession(sessionId);
    if (count >= session.max_capacity) throw new Error("Session full");
  }

  const { data, error } = await supabase
    .from("session_rsvps")
    .insert({
      session_id: sessionId,
      cognito_sub: cognitoSub,
      display_name: displayName,
      user_email: userEmail,
      association_id: associationId || null,
    })
    .select("id, attendance_status")
    .single();
  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return await getMyRsvp(sessionId, cognitoSub);
    }
    throw new Error(error.message);
  }
  return data;
}

export async function cancelRsvp(sessionId, cognitoSub) {
  const { error } = await supabase
    .from("session_rsvps")
    .delete()
    .eq("session_id", sessionId)
    .eq("cognito_sub", cognitoSub);
  if (error) throw new Error(error.message);
}

export async function setAttendance(rsvpId, status) {
  if (!["pending", "attended", "did_not_attend"].includes(status)) {
    throw new Error(`Invalid attendance status: ${status}`);
  }
  const { error } = await supabase
    .from("session_rsvps")
    .update({ attendance_status: status, attendance_set_at: new Date().toISOString() })
    .eq("id", rsvpId);
  if (error) throw new Error(error.message);
}

// ===========================================================================
// Candidate activity
// ===========================================================================

/**
 * Build a per-individual campaign activity record across all sessions.
 *
 * @param {string} cognitoSub
 * @returns {Promise<{
 *   totalAttended: number,
 *   byType: Record<string, number>,
 *   associations: string[],
 *   regions: string[],
 *   firstAt: string|null,
 *   lastAt: string|null,
 *   sessionsCreated: number,
 * }>}
 */
export async function getCandidateActivity(cognitoSub) {
  if (!cognitoSub) return emptyActivity();

  // Attendances joined to sessions for type/region/association.
  const { data: rsvps, error: rsvpsError } = await supabase
    .from("session_rsvps")
    .select("id, attendance_status, attendance_set_at, association_id, campaign_sessions(session_type, region)")
    .eq("cognito_sub", cognitoSub)
    .eq("attendance_status", "attended");
  if (rsvpsError) throw new Error(rsvpsError.message);

  const byType = {};
  const associations = new Set();
  const regions = new Set();
  let firstAt = null;
  let lastAt = null;
  for (const r of rsvps || []) {
    const type = r.campaign_sessions && r.campaign_sessions.session_type;
    if (type) byType[type] = (byType[type] || 0) + 1;
    if (r.campaign_sessions && r.campaign_sessions.region) regions.add(r.campaign_sessions.region);
    if (r.association_id) associations.add(r.association_id);
    if (r.attendance_set_at) {
      if (!firstAt || r.attendance_set_at < firstAt) firstAt = r.attendance_set_at;
      if (!lastAt || r.attendance_set_at > lastAt) lastAt = r.attendance_set_at;
    }
  }

  const { count: sessionsCreated } = await supabase
    .from("campaign_sessions")
    .select("id", { count: "exact", head: true })
    .eq("created_by_sub", cognitoSub);

  return {
    totalAttended: (rsvps || []).length,
    byType,
    associations: Array.from(associations),
    regions: Array.from(regions),
    firstAt,
    lastAt,
    sessionsCreated: sessionsCreated || 0,
  };
}

function emptyActivity() {
  return { totalAttended: 0, byType: {}, associations: [], regions: [], firstAt: null, lastAt: null, sessionsCreated: 0 };
}

// ===========================================================================
// Campaign roles
// ===========================================================================

export async function listCampaignRoles(cognitoSub) {
  if (!cognitoSub) return [];
  const { data, error } = await supabase
    .from("campaign_roles")
    .select("id, role, association_id, region, granted_at, is_active")
    .eq("cognito_sub", cognitoSub)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function grantCampaignRole(input, grantedBySub) {
  const { data, error } = await supabase
    .from("campaign_roles")
    .insert({
      cognito_sub: input.cognito_sub,
      user_email: input.user_email || null,
      role: input.role,
      association_id: input.association_id || null,
      region: input.region || null,
      granted_by_sub: grantedBySub,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function revokeCampaignRole(id) {
  const { error } = await supabase
    .from("campaign_roles")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ===========================================================================
// Volunteers (read-only from the portal — writes happen via Lambda)
// ===========================================================================

const VOLUNTEER_COLUMNS = "id, first_name, last_name, email, phone, postcode, region, status, membership_number, membership_verified, association_preference, heard_via, email_opt_out, created_at, approved_at";

export async function listVolunteersForAssociation(associationId, status) {
  let q = supabase
    .from("volunteers")
    .select(VOLUNTEER_COLUMNS)
    .eq("association_preference", associationId)
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listVolunteersForRegion(region, status) {
  let q = supabase
    .from("volunteers")
    .select(VOLUNTEER_COLUMNS)
    .eq("region", region)
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getVolunteerById(id) {
  const { data, error } = await supabase
    .from("volunteers")
    .select(VOLUNTEER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function approveVolunteer(id, approvedBySub, note) {
  const { error } = await supabase
    .from("volunteers")
    .update({
      status: "approved",
      approved_by_sub: approvedBySub,
      approved_at: new Date().toISOString(),
      approval_note: note || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function rejectVolunteer(id, approvedBySub, note) {
  const { error } = await supabase
    .from("volunteers")
    .update({
      status: "rejected",
      approved_by_sub: approvedBySub,
      approved_at: new Date().toISOString(),
      approval_note: note || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ===========================================================================
// Convenience: list associations the user can manage
// ===========================================================================

export async function listManagedAssociations(access) {
  const ids = Array.from(new Set([...access.isCampaignManagerFor, ...access.isCoordinatorFor]));
  if (access.isAdmin) {
    const { data, error } = await supabase
      .from("associations")
      .select("id, name, region")
      .order("name");
    if (error) throw new Error(error.message);
    return data || [];
  }
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("associations")
    .select("id, name, region")
    .in("id", ids)
    .order("name");
  if (error) throw new Error(error.message);
  return data || [];
}
