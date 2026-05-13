/**
 * Attendance Risk Refresh Lambda
 *
 * Triggered every Monday at 07:00 UTC by EventBridge.
 * Reads councillor_attendance rows, scores each councillor against the
 * Section 85 LGA 1972 non-attendance thresholds (4/5/6 months), and
 * inserts political_alerts for critical (5 months) and vacant (6 months)
 * seats. Elevated (4 months) councillors are logged only.
 *
 * Safe to re-run: deduplicates on title + local_authority_id + is_active.
 * Authorities with no data, or whose newest record is >365 days old, are skipped.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();

const MONTHS_VACANT   = 6;
const MONTHS_CRITICAL = 5;
const MONTHS_ELEVATED = 4;
const STALE_DAYS      = 365;

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function supabaseRequest(path, { method = "GET", params = {}, body, extraHeaders = {} } = {}) {
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
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    const parsed = text ? JSON.parse(text) : {};
    throw new Error(parsed?.message || parsed?.hint || `Supabase ${method} ${path} (${res.status})`);
  }
  return text ? JSON.parse(text) : null;
}

async function fetchAllRows(path, extraParams = {}) {
  const rows = [];
  let offset = 0;
  while (true) {
    const batch = await supabaseRequest(path, {
      params: { select: "*", limit: "1000", offset: String(offset), ...extraParams },
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(s) {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10));
  return isNaN(d.getTime()) ? null : d;
}

function monthsElapsed(d, today) {
  if (!d) return 0;
  return Math.floor((today - d) / (1000 * 60 * 60 * 24 * 30.44));
}

// ── Alert dedup ────────────────────────────────────────────────────────────────

async function alertExists(title, authorityId) {
  try {
    const rows = await supabaseRequest("political_alerts", {
      params: {
        select: "id",
        alert_type: "eq.by_election_risk",
        title: `eq.${title}`,
        local_authority_id: `eq.${authorityId}`,
        is_active: "eq.true",
        limit: "1",
      },
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (_event) => {
  console.log("[attendance-risk-refresh] Run started");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[attendance-risk-refresh] Supabase credentials not configured — aborting.");
    return { statusCode: 500, body: "Supabase not configured." };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = { checked: 0, sparse: 0, elevated: 0, inserted: 0, existing: 0, errors: 0 };

  // ── Fetch all local authorities ────────────────────────────────────────────

  let authorities;
  try {
    authorities = await fetchAllRows("local_authorities", { select: "id,name" });
    console.log(`[attendance-risk-refresh] ${authorities.length} authorities to check`);
  } catch (err) {
    console.error(`[attendance-risk-refresh] Failed to load authorities: ${err.message}`);
    return { statusCode: 500, body: `Failed to load authorities: ${err.message}` };
  }

  for (const authority of authorities) {
    const { id: authId, name: authName } = authority;
    stats.checked++;

    // ── Fetch attendance rows for this authority ────────────────────────────

    let rows;
    try {
      rows = await fetchAllRows("councillor_attendance", {
        select: "councillor_name,ward,party,meetings_eligible,meetings_attended,period_start,period_end",
        local_authority_id: `eq.${authId}`,
      });
    } catch (err) {
      console.error(`[attendance-risk-refresh] ${authName}: fetch error — ${err.message}`);
      stats.errors++;
      continue;
    }

    if (rows.length === 0) {
      stats.sparse++;
      continue;
    }

    // ── Sparseness check ───────────────────────────────────────────────────

    const periodEnds = rows.map(r => parseDate(r.period_end)).filter(Boolean);
    const latestPeriodEnd = periodEnds.length ? new Date(Math.max(...periodEnds)) : null;
    const daysOld = latestPeriodEnd ? Math.floor((today - latestPeriodEnd) / 86400000) : Infinity;

    if (daysOld > STALE_DAYS) {
      console.log(`[attendance-risk-refresh] ${authName}: SPARSE — data is ${daysOld} days old`);
      stats.sparse++;
      continue;
    }

    // ── Group by councillor ────────────────────────────────────────────────

    const councillors = new Map();
    for (const r of rows) {
      const name = (r.councillor_name || "").trim();
      if (!name) continue;
      if (!councillors.has(name)) {
        councillors.set(name, { ward: r.ward || "", party: r.party || "", rows: [] });
      }
      councillors.get(name).rows.push(r);
    }

    // ── Score each councillor ──────────────────────────────────────────────

    for (const [councillorName, cdata] of councillors) {
      const { ward, party, rows: crows } = cdata;

      const attendedRows = crows.filter(r => (r.meetings_attended || 0) > 0);
      let lastDate;
      if (attendedRows.length > 0) {
        const ends = attendedRows.map(r => parseDate(r.period_end)).filter(Boolean);
        lastDate = ends.length ? new Date(Math.max(...ends)) : null;
      } else {
        const starts = crows.map(r => parseDate(r.period_start)).filter(Boolean);
        lastDate = starts.length ? new Date(Math.min(...starts)) : null;
      }

      const mo = monthsElapsed(lastDate, today);

      let riskStatus;
      if (mo >= MONTHS_VACANT) {
        riskStatus = "vacant";
      } else if (mo >= MONTHS_CRITICAL) {
        riskStatus = "critical";
      } else if (mo >= MONTHS_ELEVATED) {
        console.log(`[attendance-risk-refresh] ${authName}: ELEVATED — ${councillorName} (${ward}) — ${mo} months`);
        stats.elevated++;
        continue;
      } else {
        continue;
      }

      const title = `By-election Risk: ${councillorName}${ward ? ` (${ward})` : ""}`;

      try {
        if (await alertExists(title, authId)) {
          console.log(`[attendance-risk-refresh] SKIP (exists): ${authName} — ${councillorName}`);
          stats.existing++;
          continue;
        }

        const lastDateStr = lastDate ? lastDate.toISOString().slice(0, 10) : "unknown";
        const nowIso = new Date().toISOString();

        await supabaseRequest("political_alerts", {
          method: "POST",
          extraHeaders: { Prefer: "return=minimal" },
          body: {
            alert_type: "by_election_risk",
            risk_level: riskStatus === "vacant" ? "critical" : "high",
            title,
            summary: `${councillorName} (${party || "Unknown party"}${ward ? `, ${ward}` : ""}) has not attended a qualifying meeting for ${mo} months — ${riskStatus} under Section 85 LGA 1972.`,
            detail: JSON.stringify({
              councillorName,
              ward: ward || null,
              party: party || null,
              lastAttendanceDate: lastDateStr,
              monthsElapsed: mo,
              riskStatus,
              localAuthorityId: authId,
            }),
            is_active: true,
            local_authority_id: authId,
            created_at: nowIso,
            updated_at: nowIso,
          },
        });

        console.log(`[attendance-risk-refresh] INSERTED (${riskStatus}): ${authName} — ${councillorName} — ${mo} months`);
        stats.inserted++;
      } catch (err) {
        console.error(`[attendance-risk-refresh] Error on ${authName}/${councillorName}: ${err.message}`);
        stats.errors++;
      }
    }
  }

  const summary = `checked=${stats.checked} sparse=${stats.sparse} elevated=${stats.elevated} inserted=${stats.inserted} existing=${stats.existing} errors=${stats.errors}`;
  console.log(`[attendance-risk-refresh] Done. ${summary}`);
  return { statusCode: 200, body: summary };
};
