// VolunteerOpsFunction — single Lambda handling four public routes:
//   POST /volunteer/signup              — create a volunteer record
//   POST /volunteer/membership-check    — instant in-form membership lookup
//   POST /volunteer/rsvp                — tokenised RSVP from email link
//   GET  /volunteer/unsubscribe         — tokenised email opt-out
//
// All four routes are unauthenticated public endpoints. Writes go via the
// Supabase service-role REST API (volunteers and volunteer_rsvps tables
// have RLS enabled and block anon traffic). Token-bearing endpoints use
// HMAC-SHA256 JWTs verified via ./lib/jwt.mjs.

import { signToken, verifyToken } from "./lib/jwt.mjs";
import {
  supabaseSelect,
  supabaseInsert,
  supabaseUpdate,
} from "./lib/supabaseRest.mjs";
import { getPostcodeArea, getRegionFromPostcode } from "./lib/postcodeRegions.mjs";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TOKEN_SECRET = (process.env.VOLUNTEER_TOKEN_SECRET || "").trim();

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "*";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function response(statusCode, body, origin) {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function htmlResponse(statusCode, html, origin) {
  return {
    statusCode,
    headers: { ...corsHeaders(origin), "Content-Type": "text/html; charset=utf-8" },
    body: html,
    isBase64Encoded: false,
  };
}

function parseBody(event) {
  if (!event || !event.body) return {};
  try {
    return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return null;
  }
}

function methodAndPath(event) {
  const http = event && event.requestContext && event.requestContext.http;
  return {
    method: (http && http.method) || event.httpMethod || "GET",
    path: (http && http.path) || event.path || "",
  };
}

function originFrom(event) {
  return (event && event.headers && (event.headers.origin || event.headers.Origin)) || "";
}

// ===========================================================================
// Route handlers
// ===========================================================================

async function handleMembershipCheck(event, origin) {
  const body = parseBody(event);
  if (!body) return response(400, { ok: false, message: "Invalid JSON body." }, origin);
  const raw = String(body.membershipNumber || "").trim().toUpperCase();
  if (!raw) return response(400, { ok: false, message: "membershipNumber is required." }, origin);

  const rows = await supabaseSelect("party_membership", {
    select: "membership_number,is_active",
    membership_number: `eq.${raw}`,
    limit: 1,
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return response(200, { ok: true, match: Boolean(row && row.is_active) }, origin);
}

async function handleSignup(event, origin) {
  const body = parseBody(event);
  if (!body) return response(400, { ok: false, message: "Invalid JSON body." }, origin);

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = body.phone == null ? null : String(body.phone).trim() || null;
  const postcode = String(body.postcode || "").trim().toUpperCase();
  const membershipNumber = body.membershipNumber == null
    ? null
    : String(body.membershipNumber).trim().toUpperCase() || null;
  const associationPreference = body.associationPreference == null
    ? null
    : String(body.associationPreference).trim() || null;
  const heardVia = body.heardVia == null ? null : String(body.heardVia).trim() || null;
  const consent = Boolean(body.consent);

  if (!firstName || !lastName) {
    return response(400, { ok: false, message: "First name and last name are required." }, origin);
  }
  if (!email || !email.includes("@")) {
    return response(400, { ok: false, message: "A valid email address is required." }, origin);
  }
  if (!postcode) {
    return response(400, { ok: false, message: "Postcode is required." }, origin);
  }
  if (!consent) {
    return response(400, { ok: false, message: "You must consent to be contacted." }, origin);
  }

  // Derive region.
  let region = null;
  if (associationPreference) {
    try {
      const assocs = await supabaseSelect("associations", {
        select: "id,region",
        id: `eq.${associationPreference}`,
        limit: 1,
      });
      region = assocs && assocs[0] ? assocs[0].region : null;
    } catch { region = null; }
  }
  if (!region) region = getRegionFromPostcode(postcode);
  if (!region) region = "pending_region";

  const postcodeArea = getPostcodeArea(postcode) || "??";

  // Membership verification.
  let membershipVerified = false;
  let approvalNote = null;
  let status = "pending";
  if (membershipNumber) {
    try {
      const rows = await supabaseSelect("party_membership", {
        select: "membership_number,is_active",
        membership_number: `eq.${membershipNumber}`,
        limit: 1,
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && row.is_active) {
        membershipVerified = true;
        status = "approved";
      } else if (row && !row.is_active) {
        approvalNote = "Membership number found but flagged inactive — manual review required.";
      } else {
        approvalNote = "Membership number not recognised — manual review required.";
      }
    } catch {
      approvalNote = "Membership lookup failed — manual review required.";
    }
  }

  const row = {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    postcode,
    postcode_area: postcodeArea,
    membership_number: membershipNumber,
    association_preference: associationPreference,
    heard_via: heardVia,
    consent_given: true,
    consent_at: new Date().toISOString(),
    region,
    status,
    membership_verified: membershipVerified,
    approval_note: approvalNote,
    approved_by_sub: status === "approved" ? "system-membership-check" : null,
    approved_at: status === "approved" ? new Date().toISOString() : null,
  };

  try {
    const inserted = await supabaseInsert("volunteers", row);
    const newRow = Array.isArray(inserted) ? inserted[0] : inserted;
    return response(200, {
      ok: true,
      id: newRow.id,
      status,
      membershipVerified,
      region,
    }, origin);
  } catch (err) {
    if (err && err.status === 409) {
      return response(409, { ok: false, message: "This email is already registered." }, origin);
    }
    return response(500, { ok: false, message: err.message || "Signup failed." }, origin);
  }
}

async function handleRsvp(event, origin) {
  const body = parseBody(event);
  if (!body) return response(400, { ok: false, message: "Invalid JSON body." }, origin);
  const token = String(body.token || "").trim();
  if (!token) return response(400, { ok: false, message: "Missing token." }, origin);

  let payload;
  try {
    payload = verifyToken(token, TOKEN_SECRET);
  } catch (err) {
    if (err.expired) return response(410, { ok: false, expired: true, message: "This link has expired." }, origin);
    return response(401, { ok: false, message: "Invalid token." }, origin);
  }
  if (payload.type !== "rsvp" || !payload.volunteer_id || !payload.session_id) {
    return response(400, { ok: false, message: "Token payload invalid." }, origin);
  }

  // Look up session + volunteer for snapshot + capacity check.
  const sessions = await supabaseSelect("campaign_sessions", {
    select: "id,title,session_type,session_date,start_time,meeting_place,contact_name,max_capacity,status",
    id: `eq.${payload.session_id}`,
    limit: 1,
  });
  const session = sessions && sessions[0];
  if (!session) return response(404, { ok: false, message: "Session not found." }, origin);
  if (session.status === "cancelled") return response(410, { ok: false, cancelled: true, message: "This session has been cancelled." }, origin);

  const existing = await supabaseSelect("volunteer_rsvps", {
    select: "id",
    session_id: `eq.${payload.session_id}`,
    volunteer_id: `eq.${payload.volunteer_id}`,
    limit: 1,
  });
  if (existing && existing[0]) {
    return response(200, { ok: true, alreadyRsvpd: true, session }, origin);
  }

  if (session.max_capacity != null) {
    const head = await supabaseSelect("volunteer_rsvps", {
      select: "id",
      session_id: `eq.${payload.session_id}`,
    });
    const count = Array.isArray(head) ? head.length : 0;
    if (count >= session.max_capacity) {
      return response(200, { ok: true, sessionFull: true, session }, origin);
    }
  }

  const volunteers = await supabaseSelect("volunteers", {
    select: "id,first_name,last_name,email,status",
    id: `eq.${payload.volunteer_id}`,
    limit: 1,
  });
  const volunteer = volunteers && volunteers[0];
  if (!volunteer) return response(404, { ok: false, message: "Volunteer not found." }, origin);

  await supabaseInsert("volunteer_rsvps", {
    session_id: payload.session_id,
    volunteer_id: payload.volunteer_id,
    first_name: volunteer.first_name,
    last_name: volunteer.last_name,
    email: volunteer.email,
  });

  return response(200, { ok: true, session }, origin);
}

async function handleUnsubscribe(event, origin) {
  const token = (event.queryStringParameters && event.queryStringParameters.token) || "";
  if (!token) return htmlResponse(400, simpleHtml("Missing token.", "Please use the link from your email."), origin);

  let payload;
  try {
    payload = verifyToken(token, TOKEN_SECRET);
  } catch (err) {
    if (err.expired) return htmlResponse(410, simpleHtml("Link expired", "This unsubscribe link has expired."), origin);
    return htmlResponse(401, simpleHtml("Invalid link", "We could not verify this unsubscribe link."), origin);
  }
  if (payload.type !== "unsubscribe" || !payload.volunteer_id) {
    return htmlResponse(400, simpleHtml("Invalid link", "Token payload is not valid for unsubscribe."), origin);
  }

  await supabaseUpdate("volunteers", { id: `eq.${payload.volunteer_id}` }, { email_opt_out: true });
  return htmlResponse(200, simpleHtml(
    "You've been unsubscribed",
    "You will no longer receive campaign session emails. You can sign up again any time."
  ), origin);
}

function simpleHtml(title, message) {
  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:Gill Sans,Calibri,Trebuchet MS,sans-serif;background:#F4F6F8;color:#1A1A1A;margin:0;padding:48px 16px;}
.card{max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #D8DDE3;border-radius:4px;padding:32px;}
h1{color:#0F2744;font-size:20px;margin:0 0 12px 0;}p{color:#4A5C6E;line-height:1.6;margin:0;}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

// ===========================================================================
// Entry point
// ===========================================================================

export const handler = async (event) => {
  const origin = originFrom(event);
  const { method, path } = methodAndPath(event);

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin), body: "" };
  }

  try {
    if (method === "POST" && path === "/volunteer/signup") return await handleSignup(event, origin);
    if (method === "POST" && path === "/volunteer/membership-check") return await handleMembershipCheck(event, origin);
    if (method === "POST" && path === "/volunteer/rsvp") return await handleRsvp(event, origin);
    if (method === "GET" && path === "/volunteer/unsubscribe") return await handleUnsubscribe(event, origin);
    return response(404, { ok: false, message: "Route not found." }, origin);
  } catch (err) {
    console.error("[volunteerOps] error", err);
    return response(500, { ok: false, message: err.message || "Server error." }, origin);
  }
};

// Exposed for testing.
export const _internals = {
  signToken,
  verifyToken,
};
