// Validate + geocode a UK postcode via postcodes.io. No API key required,
// no rate-limit concern at portal scale. Used by SessionForm (on postcode
// blur), BulkUploadPage (per row before insert), and the seed script.

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
const API_BASE = "https://api.postcodes.io";

/**
 * Find the first UK postcode inside a longer text (e.g. a meeting address)
 * and return it normalised to canonical form ("SW1A 1AA").
 * Returns null when no postcode is found.
 *
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
export function extractPostcode(text) {
  if (!text) return null;
  const m = String(text).toUpperCase().match(POSTCODE_RE);
  if (!m) return null;
  const raw = m[1].replace(/\s+/g, "");
  return raw.length >= 5 ? raw.slice(0, -3) + " " + raw.slice(-3) : raw;
}

/**
 * Normalise a postcode string to canonical "SW1A 1AA" form.
 * Returns null for null/empty/malformed input.
 *
 * @param {string|null|undefined} postcode
 * @returns {string|null}
 */
export function normalisePostcode(postcode) {
  if (!postcode) return null;
  const raw = String(postcode).toUpperCase().replace(/\s+/g, "");
  if (raw.length < 5 || raw.length > 7) return null;
  return raw.slice(0, -3) + " " + raw.slice(-3);
}

/**
 * Validate a single postcode against postcodes.io and return its
 * coordinates. Never throws — returns { valid: false } on any failure
 * (network, 404, malformed input).
 *
 * @param {string} postcode
 * @returns {Promise<{ valid: boolean, lat: number|null, lon: number|null }>}
 */
export async function validateAndGeocodePostcode(postcode) {
  const norm = normalisePostcode(postcode);
  if (!norm) return { valid: false, lat: null, lon: null };
  try {
    const res = await fetch(`${API_BASE}/postcodes/${encodeURIComponent(norm)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { valid: false, lat: null, lon: null };
    const data = await res.json();
    if (!data || data.status !== 200 || !data.result) {
      return { valid: false, lat: null, lon: null };
    }
    return { valid: true, lat: data.result.latitude, lon: data.result.longitude };
  } catch {
    return { valid: false, lat: null, lon: null };
  }
}

/**
 * Bulk-geocode up to 100 postcodes via the postcodes.io bulk endpoint.
 * Used by the CSV bulk upload + the backfill script.
 *
 * @param {string[]} postcodes  raw or canonical postcodes
 * @returns {Promise<Map<string, { lat: number, lon: number }>>}  keyed by canonical postcode
 */
export async function bulkGeocodePostcodes(postcodes) {
  const out = new Map();
  if (!Array.isArray(postcodes) || postcodes.length === 0) return out;

  const canon = postcodes
    .map((p) => normalisePostcode(p))
    .filter(Boolean);
  if (canon.length === 0) return out;

  // postcodes.io bulk accepts up to 100 per call.
  const chunks = [];
  for (let i = 0; i < canon.length; i += 100) {
    chunks.push(canon.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const res = await fetch(`${API_BASE}/postcodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: chunk }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const row of data?.result || []) {
        if (row.result && typeof row.result.latitude === "number") {
          out.set(row.query, { lat: row.result.latitude, lon: row.result.longitude });
        }
      }
    } catch {
      // skip on network error — caller treats missing entries as ungeocoded
    }
  }
  return out;
}
