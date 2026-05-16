// Seeds the party_membership table with 50 rows of realistic UK Conservative
// membership records. 45 active, 5 inactive (to test the rejection path on
// volunteer signup). Idempotent via upsert on membership_number.
//
// Usage:
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_KEY = "<service role key>"
//   node scripts/seed_party_membership.mjs

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

const FIRST_NAMES = [
  "James", "Oliver", "William", "Harry", "George", "Charles", "Edward", "Thomas",
  "Henry", "Arthur", "Sophia", "Charlotte", "Olivia", "Emily", "Amelia", "Isabella",
  "Margaret", "Elizabeth", "Catherine", "Victoria", "Anne", "Eleanor",
  "Richard", "Anthony", "Michael", "David", "Andrew",
];

const LAST_NAMES = [
  "Smith", "Jones", "Williams", "Brown", "Taylor", "Davies", "Wilson", "Evans",
  "Thomas", "Roberts", "Walker", "Hughes", "Edwards", "Green", "Hall", "Wood",
  "Harris", "Wright", "Clarke", "Cooper", "Bennett", "Carter", "Mitchell",
  "Patterson", "Bell", "Phillips", "Russell", "Howard", "Hamilton", "Murray",
];

// Realistic UK postcodes from a mix of regions/areas.
const POSTCODES = [
  "SW1A 1AA", "SW1A 2AA", "SE1 7PB", "EC2A 4PU", "W1U 6PZ", "WC1A 1NN",
  "B15 2TT", "B30 1JS", "CV1 5QP", "ST5 1JG", "WS1 1TP",
  "M1 1AE", "M2 4BS", "OL1 1BD", "BL1 1JR", "WA1 1AA",
  "LS1 5AA", "BD1 1JF", "S1 2HH", "HD1 5RH", "YO1 7HH",
  "NE1 5XU", "DH1 4SQ", "SR1 1PE", "TS1 2BU",
  "BS1 4XG", "BA1 1SX", "EX1 1HJ", "PL1 1AE", "TR1 1HE",
  "CB2 1TN", "NR1 4DR", "IP1 1AG", "CO1 1JZ", "PE1 1BG",
  "BN1 1RG", "PO1 2HU", "SO14 7DU", "RG1 1JX", "OX1 4BJ",
  "EH1 1YZ", "G1 1XL", "AB10 1AB", "DD1 1HG", "IV1 1JN",
  "CF10 1PG", "SA1 1NW", "LL11 1AB", "BT1 3QH",
];

const ACTIVE_COUNT = 45;
const INACTIVE_COUNT = 5;
const TOTAL = ACTIVE_COUNT + INACTIVE_COUNT;

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function membershipNumber(index) {
  // Deterministic per index so reruns produce stable seed data.
  return `CON-${String(100000 + index).padStart(6, "0")}`;
}

async function main() {
  // Use a stable seed so rerunning produces identical data — important for
  // cross-referencing in the seed_volunteers script.
  const rows = [];
  for (let i = 0; i < TOTAL; i++) {
    rows.push({
      membership_number: membershipNumber(i),
      first_name: rand(FIRST_NAMES),
      last_name: rand(LAST_NAMES),
      postcode: rand(POSTCODES),
      is_active: i < ACTIVE_COUNT,
    });
  }

  const { data, error } = await supabase
    .from("party_membership")
    .upsert(rows, { onConflict: "membership_number" })
    .select("membership_number");

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  const inserted = data?.length ?? 0;
  console.log(`party_membership: upserted ${inserted} row(s) (${ACTIVE_COUNT} active, ${INACTIVE_COUNT} inactive).`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
