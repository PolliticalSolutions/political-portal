// Populates demo portal-user RSVPs and attendance so the
// /portal/campaigns/activity page has something to show for the demo.
//
// Creates 6 synthetic "members" (cognito_sub = "demo-<slug>"). Each
// member RSVPs to a varied set of seeded sessions, and most of those
// RSVPs are marked attended. The distribution is deliberate so the
// Activity dashboard shows interesting variation:
//   - One high-activity organiser (attends a lot)
//   - One leaflet specialist
//   - One who only does phone banks
//   - One GOTV regular
//   - One casual contributor
//   - One who's signed up but never showed up
//
// Idempotent: uses upsert keyed on (session_id, cognito_sub).
//
// Usage:
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_KEY = "<service role key>"
//   node scripts/seed_demo_activity.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_MEMBERS = [
  { sub: "demo-organiser-1",    name: "Eleanor Pemberton",  email: "eleanor.demo@example.org",  profile: "organiser",    sessionLimit: 12, attendRate: 0.95 },
  { sub: "demo-leaflet-1",      name: "James Carmichael",   email: "james.demo@example.org",    profile: "leaflet",      sessionLimit: 6,  attendRate: 0.85 },
  { sub: "demo-phonebank-1",    name: "Margaret Thornbury", email: "margaret.demo@example.org", profile: "phone_bank",   sessionLimit: 5,  attendRate: 0.90 },
  { sub: "demo-gotv-1",         name: "Henry Faulkner",     email: "henry.demo@example.org",    profile: "gotv",         sessionLimit: 4,  attendRate: 1.00 },
  { sub: "demo-casual-1",       name: "Sophia Latimer",     email: "sophia.demo@example.org",   profile: "any",          sessionLimit: 3,  attendRate: 0.66 },
  { sub: "demo-noshow-1",       name: "William Hargreaves", email: "william.demo@example.org",  profile: "any",          sessionLimit: 4,  attendRate: 0.00 },
];

function pickSessionsFor(profile, allSessions) {
  if (profile === "any") return allSessions;
  if (profile === "leaflet") return allSessions.filter((s) => (s.session_types || []).includes("leaflet"));
  if (profile === "phone_bank") return allSessions.filter((s) => (s.session_types || []).includes("phone_bank"));
  if (profile === "gotv") return allSessions.filter((s) => (s.session_types || []).includes("gotv") || (s.session_types || []).includes("gotpv"));
  return allSessions; // organiser → everything
}

async function main() {
  const { data: sessions, error } = await supabase
    .from("campaign_sessions")
    .select("id, association_id, session_types")
    .eq("created_by_sub", "seed-script");
  if (error) { console.error(error.message); process.exit(1); }
  if (!sessions || sessions.length === 0) {
    console.error("No seeded campaign_sessions found. Run `npm run seed:campaign-sessions` first.");
    process.exit(1);
  }
  console.log(`Found ${sessions.length} seeded sessions to attach demo RSVPs to.`);

  // Wipe any prior demo RSVPs so this script is fully idempotent.
  await supabase.from("session_rsvps").delete().like("cognito_sub", "demo-%");

  let rsvpsCreated = 0;
  let attendedMarked = 0;

  for (const member of DEMO_MEMBERS) {
    const eligible = pickSessionsFor(member.profile, sessions);
    // Deterministic pick: take the first N from the eligible list so the
    // script is reproducible.
    const chosen = eligible.slice(0, member.sessionLimit);
    if (chosen.length === 0) {
      console.warn(`No eligible sessions for ${member.sub} (profile=${member.profile})`);
      continue;
    }

    const rows = chosen.map((s, i) => {
      const willAttend = i < Math.round(chosen.length * member.attendRate);
      return {
        session_id: s.id,
        cognito_sub: member.sub,
        display_name: member.name,
        user_email: member.email,
        association_id: s.association_id,
        attendance_status: willAttend ? "attended" : "pending",
        attendance_set_at: willAttend ? new Date().toISOString() : null,
      };
    });

    const { error: insErr } = await supabase.from("session_rsvps").insert(rows);
    if (insErr) {
      console.error(`Insert failed for ${member.sub}:`, insErr.message);
      continue;
    }
    rsvpsCreated += rows.length;
    attendedMarked += rows.filter((r) => r.attendance_status === "attended").length;
    console.log(`  ${member.name.padEnd(22)} → ${rows.length} RSVPs, ${rows.filter((r) => r.attendance_status === "attended").length} attended`);
  }

  console.log(`\nseed_demo_activity: ${rsvpsCreated} RSVPs created, ${attendedMarked} marked attended across ${DEMO_MEMBERS.length} demo members.`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
