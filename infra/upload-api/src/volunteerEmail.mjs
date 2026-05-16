// VolunteerEmailFunction — scheduled Lambda that runs weekly on Mondays at
// 08:00 UTC. Queries all approved + opted-in volunteers, groups by region,
// finds published sessions in the next 7 days for each region, generates
// tokenised RSVP / unsubscribe links, and sends a personalised email per
// volunteer via AWS SES. Logs each send to volunteer_email_log.

import { createRequire } from "module";
import { signToken } from "./lib/jwt.mjs";
import { supabaseSelect, supabaseInsert } from "./lib/supabaseRest.mjs";
import { volunteerWeeklyHtml, volunteerWeeklyText } from "./lib/emailTemplates.mjs";

const require = createRequire(import.meta.url);
let AWS;
try {
  AWS = require("aws-sdk");
} catch (error) {
  if (globalThis.__AWS_SDK_MOCK__) {
    AWS = globalThis.__AWS_SDK_MOCK__;
  } else {
    throw error;
  }
}

const REGION = process.env.AWS_REGION || "eu-west-2";
const ses = new AWS.SES({ region: REGION });

const TOKEN_SECRET = (process.env.VOLUNTEER_TOKEN_SECRET || "").trim();
const BASE_URL = (process.env.PLATFORM_BASE_URL || "https://politicalsolutions.uk").replace(/\/+$/, "");
const FROM_EMAIL = process.env.CAMPAIGNS_FROM_EMAIL || "campaigns@politicalsolutions.uk";
const SEVEN_DAYS = 7;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function rsvpUrlFor(volunteerId, sessionId) {
  const token = signToken({ volunteer_id: volunteerId, session_id: sessionId, type: "rsvp" }, TOKEN_SECRET, { expiresInSeconds: TOKEN_TTL_SECONDS });
  return `${BASE_URL}/campaign/rsvp?token=${encodeURIComponent(token)}`;
}

function unsubscribeUrlFor(volunteerId) {
  const token = signToken({ volunteer_id: volunteerId, type: "unsubscribe" }, TOKEN_SECRET, { expiresInSeconds: TOKEN_TTL_SECONDS });
  return `${BASE_URL}/campaign/unsubscribe?token=${encodeURIComponent(token)}`;
}

function logEvent(stage, data) {
  console.log(JSON.stringify({ stage, ts: new Date().toISOString(), ...data }));
}

async function loadActiveVolunteers() {
  return supabaseSelect("volunteers", {
    select: "id,first_name,email,region",
    status: "eq.approved",
    email_opt_out: "eq.false",
  });
}

async function loadSessionsForRegion(region, fromDate, toDate) {
  return supabaseSelect("campaign_sessions", {
    select: "id,title,session_types,campaign_context,session_date,start_time,venue_name,street_address,postcode,contact_name",
    region: `eq.${region}`,
    status: "eq.published",
    session_date: `gte.${fromDate}`,
    [`session_date`]: `lte.${toDate}`,
    order: "session_date.asc",
  });
}

async function loadSessionsForRegionRange(region, fromDate, toDate) {
  // Two filters on same column require PostgREST 'and' syntax.
  return supabaseSelect("campaign_sessions", {
    select: "id,title,session_types,campaign_context,session_date,start_time,venue_name,street_address,postcode,contact_name",
    region: `eq.${region}`,
    status: "eq.published",
    and: `(session_date.gte.${fromDate},session_date.lte.${toDate})`,
    order: "session_date.asc",
  });
}

async function logSend(volunteerId, region, sessionIds, success, sesMessageId, errorMessage) {
  try {
    await supabaseInsert("volunteer_email_log", {
      volunteer_id: volunteerId,
      region,
      session_ids: sessionIds,
      success,
      ses_message_id: sesMessageId || null,
      error_message: errorMessage || null,
    }, { returnRepresentation: false });
  } catch (err) {
    console.error("[volunteerEmail] failed to log send", err);
  }
}

export const handler = async () => {
  if (!TOKEN_SECRET) {
    console.error("[volunteerEmail] VOLUNTEER_TOKEN_SECRET not set — aborting.");
    return { sent: 0, skipped: 0, error: "missing secret" };
  }

  const today = new Date();
  const fromDate = isoDate(today);
  const future = new Date(today);
  future.setDate(today.getDate() + SEVEN_DAYS);
  const toDate = isoDate(future);
  const weekOfLabel = today.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  const volunteers = await loadActiveVolunteers();
  logEvent("loaded_volunteers", { count: volunteers ? volunteers.length : 0 });
  if (!volunteers || volunteers.length === 0) return { sent: 0, skipped: 0 };

  // Group volunteers by region.
  const byRegion = new Map();
  for (const v of volunteers) {
    const region = v.region || "pending_region";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region).push(v);
  }

  let sent = 0;
  let skipped = 0;

  for (const [region, regionVolunteers] of byRegion.entries()) {
    if (region === "pending_region") {
      skipped += regionVolunteers.length;
      continue;
    }

    let sessions;
    try {
      sessions = await loadSessionsForRegionRange(region, fromDate, toDate);
    } catch (err) {
      logEvent("region_sessions_query_failed", { region, error: err.message });
      skipped += regionVolunteers.length;
      continue;
    }
    if (!sessions || sessions.length === 0) {
      logEvent("region_no_sessions", { region, volunteers: regionVolunteers.length });
      skipped += regionVolunteers.length;
      continue;
    }

    for (const vol of regionVolunteers) {
      const sessionsWithUrls = sessions.map((s) => ({ ...s, rsvpUrl: rsvpUrlFor(vol.id, s.id) }));
      const unsubscribeUrl = unsubscribeUrlFor(vol.id);

      const html = volunteerWeeklyHtml({
        firstName: vol.first_name,
        region,
        sessions: sessionsWithUrls,
        unsubscribeUrl,
        weekOfDateLabel: weekOfLabel,
      });
      const text = volunteerWeeklyText({
        firstName: vol.first_name,
        region,
        sessions: sessionsWithUrls,
        unsubscribeUrl,
        weekOfDateLabel: weekOfLabel,
      });

      const params = {
        Destination: { ToAddresses: [vol.email] },
        Message: {
          Subject: { Data: `Campaign sessions near you — week of ${weekOfLabel}`, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text, Charset: "UTF-8" },
          },
        },
        Source: FROM_EMAIL,
      };

      try {
        const result = await ses.sendEmail(params).promise();
        sent += 1;
        await logSend(vol.id, region, sessionsWithUrls.map((s) => s.id), true, result.MessageId, null);
      } catch (err) {
        skipped += 1;
        logEvent("ses_send_failed", { region, volunteer: vol.id, error: err.message });
        await logSend(vol.id, region, sessionsWithUrls.map((s) => s.id), false, null, err.message);
      }
    }
  }

  logEvent("done", { sent, skipped });
  return { sent, skipped };
};
