// Geocode campaign_sessions rows that have a postcode but no lat/lon.
// Uses postcodes.io bulk endpoint via the shared lib. Idempotent — safe
// to re-run; skips rows that already have coordinates.
//
// Usage:
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_KEY = "<service role key>"
//   node scripts/backfill_session_coords.mjs

import { createClient } from "@supabase/supabase-js";
import { bulkGeocodePostcodes, normalisePostcode } from "../src/lib/postcodeGeocoding.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: rows, error } = await supabase
    .from("campaign_sessions")
    .select("id, postcode, latitude")
    .is("latitude", null)
    .not("postcode", "is", null);

  if (error) {
    console.error("Failed to load sessions:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("backfill_session_coords: nothing to do — all sessions already have coordinates or no postcode.");
    return;
  }

  // Group rows by canonical postcode to minimise API calls.
  const byPostcode = new Map();   // canonical → array of row ids
  for (const r of rows) {
    const canon = normalisePostcode(r.postcode);
    if (!canon) continue;
    if (!byPostcode.has(canon)) byPostcode.set(canon, []);
    byPostcode.get(canon).push(r.id);
  }

  const uniquePostcodes = Array.from(byPostcode.keys());
  console.log(`Geocoding ${uniquePostcodes.length} unique postcode(s) covering ${rows.length} session(s)…`);

  const coords = await bulkGeocodePostcodes(uniquePostcodes);

  let updated = 0;
  let failed = 0;
  const skippedNoPostcode = rows.length - Array.from(byPostcode.values()).reduce((a, arr) => a + arr.length, 0);

  for (const [postcode, ids] of byPostcode.entries()) {
    const c = coords.get(postcode);
    if (!c) { failed += ids.length; continue; }
    const { error: updErr } = await supabase
      .from("campaign_sessions")
      .update({ latitude: c.lat, longitude: c.lon })
      .in("id", ids);
    if (updErr) {
      console.error(`Update failed for ${postcode}:`, updErr.message);
      failed += ids.length;
    } else {
      updated += ids.length;
    }
  }

  console.log(`backfill_session_coords: geocoded ${updated} session(s), failed ${failed}, skipped_no_postcode ${skippedNoPostcode}.`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
