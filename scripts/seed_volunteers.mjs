// Seeds the volunteers table with 30 records: 15 approved, 15 pending.
// 12 carry membership numbers from the party_membership seed (so the
// auto-approve path is exercised on validation). Mix of email_opt_out.
//
// Idempotent: upsert on email.
//
// Usage:
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_KEY = "<service role key>"
//   node scripts/seed_volunteers.mjs

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

const POSTCODE_AREA_TO_REGION = {
  E: "London", EC: "London", N: "London", NW: "London",
  SE: "London", SW: "London", W: "London", WC: "London",
  BR: "London", CR: "London", DA: "London", EN: "London",
  HA: "London", IG: "London", KT: "London", RM: "London",
  TW: "London", UB: "London",
  BN: "South East", CT: "South East", GU: "South East", ME: "South East",
  OX: "South East", PO: "South East", RG: "South East", RH: "South East",
  SL: "South East", SO: "South East", TN: "South East", MK: "South East",
  BA: "South West", BH: "South West", BS: "South West", DT: "South West",
  EX: "South West", GL: "South West", PL: "South West", SN: "South West",
  SP: "South West", TA: "South West", TQ: "South West", TR: "South West",
  AL: "East of England", CB: "East of England", CM: "East of England",
  CO: "East of England", HP: "East of England", IP: "East of England",
  LU: "East of England", NR: "East of England", PE: "East of England",
  SG: "East of England", SS: "East of England", WD: "East of England",
  B: "West Midlands", CV: "West Midlands", DY: "West Midlands",
  HR: "West Midlands", ST: "West Midlands", TF: "West Midlands",
  WR: "West Midlands", WS: "West Midlands", WV: "West Midlands",
  DE: "East Midlands", LE: "East Midlands", LN: "East Midlands",
  NG: "East Midlands", NN: "East Midlands",
  BD: "Yorkshire and the Humber", DN: "Yorkshire and the Humber",
  HD: "Yorkshire and the Humber", HG: "Yorkshire and the Humber",
  HU: "Yorkshire and the Humber", HX: "Yorkshire and the Humber",
  LS: "Yorkshire and the Humber", S: "Yorkshire and the Humber",
  WF: "Yorkshire and the Humber", YO: "Yorkshire and the Humber",
  BB: "North West", BL: "North West", CA: "North West", CH: "North West",
  CW: "North West", FY: "North West", L: "North West", LA: "North West",
  M: "North West", OL: "North West", PR: "North West", SK: "North West",
  WA: "North West", WN: "North West",
  DH: "North East", DL: "North East", NE: "North East",
  SR: "North East", TS: "North East",
  AB: "Scotland", DD: "Scotland", DG: "Scotland", EH: "Scotland",
  FK: "Scotland", G: "Scotland", HS: "Scotland", IV: "Scotland",
  KA: "Scotland", KW: "Scotland", KY: "Scotland", ML: "Scotland",
  PA: "Scotland", PH: "Scotland", TD: "Scotland", ZE: "Scotland",
  CF: "Wales", LD: "Wales", LL: "Wales", NP: "Wales", SA: "Wales", SY: "Wales",
  BT: "Northern Ireland",
};

function regionFromPostcode(postcode) {
  if (!postcode) return null;
  const m = String(postcode).trim().toUpperCase().match(/^([A-Z]{1,2})\d/);
  return m ? (POSTCODE_AREA_TO_REGION[m[1]] || null) : null;
}

const FIXTURES = [
  // 15 approved
  { fn: "Charlotte", ln: "Whitfield",  email: "charlotte.whitfield@example.org",  pc: "SW1A 1AA", member: 0, optOut: false },
  { fn: "Henry",     ln: "Carmichael", email: "henry.carmichael@example.org",     pc: "B15 2TT",  member: 1, optOut: false },
  { fn: "Eleanor",   ln: "Pemberton",  email: "eleanor.pemberton@example.org",    pc: "M1 1AE",   member: 2, optOut: false },
  { fn: "George",    ln: "Faulkner",   email: "george.faulkner@example.org",      pc: "LS1 5AA",  member: 3, optOut: false },
  { fn: "Margaret",  ln: "Thornbury",  email: "margaret.thornbury@example.org",   pc: "BS1 4XG",  member: 4, optOut: true  },
  { fn: "Edward",    ln: "Ashworth",   email: "edward.ashworth@example.org",      pc: "BN1 1RG",  member: 5, optOut: false },
  { fn: "Sophia",    ln: "Latimer",    email: "sophia.latimer@example.org",       pc: "EH1 1YZ",  member: 6, optOut: false },
  { fn: "William",   ln: "Hargreaves", email: "william.hargreaves@example.org",   pc: "NE1 5XU",  member: 7, optOut: false },
  { fn: "Catherine", ln: "Wadsworth",  email: "catherine.wadsworth@example.org",  pc: "CB2 1TN",  member: 8, optOut: true  },
  { fn: "James",     ln: "Pickering",  email: "james.pickering@example.org",      pc: "CF10 1PG", member: 9, optOut: false },
  { fn: "Anne",      ln: "Marchbanks", email: "anne.marchbanks@example.org",      pc: "OX1 4BJ",  member: 10, optOut: false },
  { fn: "Thomas",    ln: "Holbrook",   email: "thomas.holbrook@example.org",      pc: "PE1 1BG",  member: 11, optOut: false },
  { fn: "Olivia",    ln: "Granger",    email: "olivia.granger@example.org",       pc: "GU1 4SY",  member: null, optOut: false },
  { fn: "Charles",   ln: "Beckett",    email: "charles.beckett@example.org",      pc: "PO1 2HU",  member: null, optOut: false },
  { fn: "Isabella",  ln: "Trenholme",  email: "isabella.trenholme@example.org",   pc: "DD1 1HG",  member: null, optOut: true  },

  // 15 pending
  { fn: "Oliver",    ln: "Mortimer",   email: "oliver.mortimer@example.org",      pc: "SE1 7PB",  member: null, optOut: false },
  { fn: "Amelia",    ln: "Holbrook",   email: "amelia.holbrook@example.org",      pc: "RG1 1JX",  member: null, optOut: false },
  { fn: "Arthur",    ln: "Greenfield", email: "arthur.greenfield@example.org",    pc: "M2 4BS",   member: null, optOut: false },
  { fn: "Emily",     ln: "Bromfield",  email: "emily.bromfield@example.org",      pc: "BD1 1JF",  member: null, optOut: false },
  { fn: "Richard",   ln: "Norbury",    email: "richard.norbury@example.org",      pc: "S1 2HH",   member: null, optOut: true  },
  { fn: "Victoria",  ln: "Wexford",    email: "victoria.wexford@example.org",     pc: "EX1 1HJ",  member: null, optOut: false },
  { fn: "Andrew",    ln: "Carlisle",   email: "andrew.carlisle@example.org",      pc: "NR1 4DR",  member: null, optOut: false },
  { fn: "Elizabeth", ln: "Pendleton",  email: "elizabeth.pendleton@example.org",  pc: "SO14 7DU", member: null, optOut: false },
  { fn: "David",     ln: "Sutherland", email: "david.sutherland@example.org",     pc: "G1 1XL",   member: null, optOut: false },
  { fn: "Anthony",   ln: "Whitlock",   email: "anthony.whitlock@example.org",     pc: "TR1 1HE",  member: null, optOut: false },
  { fn: "Sarah",     ln: "Goodwin",    email: "sarah.goodwin@example.org",        pc: "LL11 1AB", member: null, optOut: false },
  { fn: "Michael",   ln: "Eastwood",   email: "michael.eastwood@example.org",     pc: "DH1 4SQ",  member: null, optOut: false },
  { fn: "Lucy",      ln: "Fairbairn",  email: "lucy.fairbairn@example.org",       pc: "ST5 1JG",  member: null, optOut: false },
  { fn: "Robert",    ln: "Marlow",     email: "robert.marlow@example.org",        pc: "DE1 1QS",  member: null, optOut: false },
  { fn: "Jane",      ln: "Wickham",    email: "jane.wickham@example.org",         pc: "CT1 2RA",  member: null, optOut: true  },
];

const HEARD_VIA = [
  "association", "social_media", "friend", "email", "other",
];

function membershipNumber(index) {
  return `CON-${String(100000 + index).padStart(6, "0")}`;
}

async function main() {
  const rows = FIXTURES.map((fx, i) => {
    const approved = i < 15;
    const postcode = fx.pc.toUpperCase();
    const area = postcode.match(/^([A-Z]{1,2})/)[1];
    const region = regionFromPostcode(postcode) || "pending_region";
    return {
      first_name: fx.fn,
      last_name: fx.ln,
      email: fx.email,
      phone: null,
      postcode,
      postcode_area: area,
      membership_number: fx.member === null ? null : membershipNumber(fx.member),
      association_preference: null,
      heard_via: HEARD_VIA[i % HEARD_VIA.length],
      consent_given: true,
      consent_at: new Date().toISOString(),
      region,
      status: approved ? "approved" : "pending",
      membership_verified: approved && fx.member !== null,
      approval_note: approved ? "seeded" : null,
      approved_by_sub: approved ? "seed-script" : null,
      approved_at: approved ? new Date().toISOString() : null,
      email_opt_out: fx.optOut,
    };
  });

  const { data, error } = await supabase
    .from("volunteers")
    .upsert(rows, { onConflict: "email" })
    .select("id");

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`volunteers: upserted ${data?.length ?? 0} row(s) (15 approved, 15 pending; 12 with membership numbers).`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
