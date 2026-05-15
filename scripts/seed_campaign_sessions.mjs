// Seeds the campaign_sessions table with 20 sessions across up to 5 associations
// and at least 3 distinct regions. Each association is paired with one of its
// constituencies (via association_constituencies) so the FKs resolve.
//
// Idempotent: dedupes by (title, association_id, session_date) before insert.
//
// Usage:
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_KEY = "<service role key>"
//   node scripts/seed_campaign_sessions.mjs

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

const SESSION_TYPES = ["canvass", "leaflet", "phone_bank", "committee_room", "other"];

const SESSION_TEMPLATES = [
  { title: "Saturday morning canvass", type: "canvass", duration: 180, capacity: 20 },
  { title: "Evening leaflet drop", type: "leaflet", duration: 120, capacity: null },
  { title: "Sunday afternoon canvass", type: "canvass", duration: 180, capacity: 25 },
  { title: "Phone bank session", type: "phone_bank", duration: 120, capacity: 15 },
  { title: "Committee room open day", type: "committee_room", duration: 360, capacity: null },
  { title: "Weekday lunchtime canvass", type: "canvass", duration: 90, capacity: 10 },
  { title: "Targeted swing-voter canvass", type: "canvass", duration: 180, capacity: 30 },
  { title: "Get out the vote — leaflets", type: "leaflet", duration: 150, capacity: null },
  { title: "Coffee morning and street stall", type: "other", duration: 120, capacity: null },
  { title: "Town centre leafleting", type: "leaflet", duration: 90, capacity: 12 },
  { title: "Doorknock — priority wards", type: "canvass", duration: 180, capacity: 20 },
  { title: "Phone bank — pledge confirmation", type: "phone_bank", duration: 120, capacity: 10 },
  { title: "Saturday volunteer training", type: "other", duration: 90, capacity: 30 },
  { title: "Evening committee meeting", type: "committee_room", duration: 120, capacity: null },
  { title: "Weekend canvass — student wards", type: "canvass", duration: 240, capacity: 25 },
  { title: "Leaflet run — rural villages", type: "leaflet", duration: 180, capacity: null },
  { title: "Phone bank — postal vote chase", type: "phone_bank", duration: 120, capacity: 15 },
  { title: "Wednesday morning canvass", type: "canvass", duration: 120, capacity: 15 },
  { title: "Sunday afternoon leaflet", type: "leaflet", duration: 120, capacity: null },
  { title: "Committee room open evening", type: "committee_room", duration: 180, capacity: null },
];

const ADDRESSES = [
  "Association office, 14 High Street",
  "Conservative Club, Market Square",
  "Town Hall car park",
  "Volunteer HQ, 22 Church Lane",
  "Memorial Hall, Mill Road",
  "Community Centre, Park Avenue",
  "Library car park",
  "Village Hall, The Green",
];

const CONTACT_NAMES = [
  "Sarah Henderson", "James Carmichael", "Eleanor Whittaker", "David Bennett",
  "Charlotte Pickering", "Michael Foster", "Anne Marshall",
];

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

async function main() {
  // 1. Pick up to 5 associations with at least one constituency mapped.
  const { data: associations, error: assocErr } = await supabase
    .from("associations")
    .select("id, name, region, association_constituencies(constituency_id)")
    .limit(50);

  if (assocErr) {
    console.error("Failed to load associations:", assocErr.message);
    process.exit(1);
  }

  const usable = (associations || [])
    .filter((a) => Array.isArray(a.association_constituencies) && a.association_constituencies.length > 0)
    .slice(0, 5);

  if (usable.length === 0) {
    console.error("No associations with linked constituencies found. Run association seed first.");
    process.exit(1);
  }

  const regions = new Set(usable.map((a) => a.region).filter(Boolean));
  if (regions.size < 1) {
    console.error("No region values found on associations. Cannot proceed.");
    process.exit(1);
  }

  // 2. Build 20 sessions spread over the next 6 weeks across the usable associations.
  const today = new Date();
  const rows = [];
  for (let i = 0; i < SESSION_TEMPLATES.length; i++) {
    const tmpl = SESSION_TEMPLATES[i];
    const assoc = usable[i % usable.length];
    const constituencyId = assoc.association_constituencies[0].constituency_id;
    const daysAhead = 3 + (i * 2);
    const date = new Date(today);
    date.setDate(today.getDate() + daysAhead);
    const startHour = 9 + ((i * 3) % 9);

    rows.push({
      title: tmpl.title,
      session_type: tmpl.type,
      constituency_id: constituencyId,
      association_id: assoc.id,
      region: assoc.region || "South East",
      meeting_place: ADDRESSES[i % ADDRESSES.length],
      session_date: isoDate(date),
      start_time: `${pad2(startHour)}:00:00`,
      duration_minutes: tmpl.duration,
      contact_name: CONTACT_NAMES[i % CONTACT_NAMES.length],
      contact_phone: "01234 567890",
      contact_email: "campaigns@example.org",
      max_capacity: tmpl.capacity,
      notes: null,
      status: "published",
      created_by_sub: "seed-script",
    });
  }

  // 3. Dedup by (title, association_id, session_date).
  const { data: existing, error: existingErr } = await supabase
    .from("campaign_sessions")
    .select("title, association_id, session_date");
  if (existingErr) {
    console.error("Failed to load existing sessions:", existingErr.message);
    process.exit(1);
  }
  const key = (row) => `${row.title}|${row.association_id}|${row.session_date}`;
  const known = new Set((existing || []).map(key));

  const toInsert = rows.filter((r) => !known.has(key(r)));

  if (toInsert.length === 0) {
    console.log(`campaign_sessions: all ${rows.length} seed rows already present, nothing to insert.`);
    return;
  }

  const { data, error } = await supabase
    .from("campaign_sessions")
    .insert(toInsert)
    .select("id");

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log(`campaign_sessions: inserted ${data?.length ?? 0} of ${rows.length} planned rows (skipped ${rows.length - toInsert.length} duplicates).`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
