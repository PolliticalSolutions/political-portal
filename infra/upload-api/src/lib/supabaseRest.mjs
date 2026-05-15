// Thin Supabase REST helper used by the volunteer Lambda handlers.
// Avoids pulling @supabase/supabase-js into the Lambda bundle.
// Mirrors the pattern used in byElectionMonitor.mjs.

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();

function ensureConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase env vars not configured (SUPABASE_URL, SUPABASE_SERVICE_KEY).");
  }
}

export async function supabaseRequest(path, { method = "GET", params = {}, body, extraHeaders = {} } = {}) {
  ensureConfigured();
  const url = new URL(`/rest/v1/${path}`, SUPABASE_URL + "/");
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.append(key, value);
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (!res.ok) {
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { /* keep parsed as {} */ }
    const message = parsed.message || parsed.hint || `Supabase ${method} ${path} failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

export async function supabaseSelect(table, params) {
  return supabaseRequest(table, { method: "GET", params });
}

export async function supabaseInsert(table, row, { returnRepresentation = true } = {}) {
  return supabaseRequest(table, {
    method: "POST",
    body: Array.isArray(row) ? row : [row],
    extraHeaders: returnRepresentation
      ? { Prefer: "return=representation" }
      : { Prefer: "return=minimal" },
  });
}

export async function supabaseUpdate(table, filter, patch) {
  return supabaseRequest(table, {
    method: "PATCH",
    params: filter,
    body: patch,
    extraHeaders: { Prefer: "return=representation" },
  });
}
