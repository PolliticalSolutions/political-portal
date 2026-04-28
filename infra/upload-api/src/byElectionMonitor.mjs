/**
 * By-Election Monitor Lambda
 *
 * Triggered daily by EventBridge at 06:00 UTC.
 * Queries the Parliament Members API for recently departed Commons members,
 * cross-references Supabase constituencies, and inserts political_alerts rows
 * for new by-election risks. Resolves alerts where the seat is now filled.
 *
 * Can also be invoked manually with an empty event for ad-hoc runs.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();

const PARLIAMENT_API = "https://members-api.parliament.uk/api";
const HOUSE_COMMONS = 1;
const LOOKBACK_DAYS = 90;
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

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
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (!res.ok) {
    const parsed = text ? JSON.parse(text) : {};
    throw new Error(parsed?.message || parsed?.hint || `Supabase ${method} ${path} failed (${res.status})`);
  }
  return text ? JSON.parse(text) : null;
}

// ── Parliament API helpers ────────────────────────────────────────────────────

async function fetchRecentlyDepartedMembers() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  const members = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const skip = page * PAGE_SIZE;
    const url = `${PARLIAMENT_API}/Members/Search?IsCurrentMember=false&skip=${skip}&take=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "PoliticalSolutions/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Parliament Members API error ${res.status}`);
    const data = await res.json();
    const items = data?.items || [];
    if (items.length === 0) break;

    let foundOldRecord = false;
    for (const item of items) {
      const member = item.value;
      const hm = member?.latestHouseMembership;
      if (!hm || hm.house !== HOUSE_COMMONS) continue;

      const endDate = hm.membershipEndDate ? new Date(hm.membershipEndDate) : null;
      if (!endDate) continue;
      if (endDate < cutoff) {
        foundOldRecord = true;
        continue;
      }

      members.push({
        id: member.id,
        name: member.nameDisplayAs || member.nameListAs || "",
        party: member.latestParty?.name || "",
        constituencyName: (hm.membershipFrom || "").trim(),
        endDate: hm.membershipEndDate,
        endReason: hm.membershipEndReason || hm.membershipEndReasonNotes || "",
      });
    }

    if (items.length < PAGE_SIZE || foundOldRecord) break;
  }

  return members;
}

async function checkConstituencyHasCurrentMember(constituencyName) {
  if (!constituencyName) return false;
  try {
    const url = `${PARLIAMENT_API}/Members/Search?IsCurrentMember=true&searchText=${encodeURIComponent(constituencyName)}&skip=0&take=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": "PoliticalSolutions/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const items = data?.items || [];
    return items.some((item) => {
      const hm = item.value?.latestHouseMembership;
      return (hm?.membershipFrom || "").toLowerCase() === constituencyName.toLowerCase();
    });
  } catch {
    return false;
  }
}

// ── Supabase operations ───────────────────────────────────────────────────────

async function findConstituencyByName(name) {
  if (!name) return null;
  try {
    const rows = await supabaseRequest("constituencies", {
      params: {
        select: "id,ons_code,name",
        name: `ilike.${name}`,
        limit: "1",
      },
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function findExistingByElectionAlert(constituencyName) {
  const title = `By-election Risk: ${constituencyName}`;
  const rows = await supabaseRequest("political_alerts", {
    params: {
      select: "id,is_active",
      alert_type: "eq.by_election_risk",
      title: `eq.${title}`,
      limit: "1",
    },
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function insertByElectionAlert({ mpName, mpParty, constituencyName, endDate, endReason, constituencyRow }) {
  const nowIso = new Date().toISOString();
  const formattedDate = endDate
    ? new Date(endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "unknown date";

  await supabaseRequest("political_alerts", {
    method: "POST",
    extraHeaders: { Prefer: "return=minimal" },
    body: {
      alert_type: "by_election_risk",
      risk_level: "high",
      title: `By-election Risk: ${constituencyName}`,
      summary: `${mpName} (${mpParty || "Unknown party"}) left as MP for ${constituencyName} on ${formattedDate}, triggering a potential by-election.`,
      detail: JSON.stringify({
        mpName,
        mpParty,
        constituencyName,
        constituencyOnsCode: constituencyRow?.ons_code || null,
        endDate,
        endReason: endReason || null,
      }),
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso,
    },
  });
}

async function resolveByElectionAlert(alertId) {
  await supabaseRequest("political_alerts", {
    method: "PATCH",
    params: { id: `eq.${alertId}` },
    extraHeaders: { Prefer: "return=minimal" },
    body: { is_active: false, updated_at: new Date().toISOString() },
  });
}

async function listActiveByElectionAlerts() {
  const rows = await supabaseRequest("political_alerts", {
    params: {
      select: "id,title",
      alert_type: "eq.by_election_risk",
      is_active: "eq.true",
      limit: "500",
    },
  });
  return Array.isArray(rows) ? rows : [];
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (_event) => {
  console.log("[by-election-monitor] Run started");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[by-election-monitor] Supabase credentials not configured — aborting.");
    return { statusCode: 500, body: "Supabase not configured." };
  }

  const stats = { checked: 0, inserted: 0, resolved: 0, skipped: 0, errors: 0 };

  // Phase 1 & 2 — detect new triggers and deduplicate
  let recentDepartures;
  try {
    recentDepartures = await fetchRecentlyDepartedMembers();
    console.log(`[by-election-monitor] Parliament API: ${recentDepartures.length} recently departed Commons members`);
  } catch (err) {
    console.error(`[by-election-monitor] Parliament API failed: ${err.message}`);
    return { statusCode: 500, body: `Parliament API error: ${err.message}` };
  }

  for (const member of recentDepartures) {
    const { name, party, constituencyName, endDate, endReason } = member;
    stats.checked++;

    if (!constituencyName) {
      console.log(`[by-election-monitor] ${name}: no constituency, skipping`);
      stats.skipped++;
      continue;
    }

    try {
      const existing = await findExistingByElectionAlert(constituencyName);
      if (existing) {
        console.log(`[by-election-monitor] ${constituencyName}: alert already exists (id=${existing.id})`);
        stats.skipped++;
        continue;
      }

      const constituencyRow = await findConstituencyByName(constituencyName);
      if (constituencyRow) {
        console.log(`[by-election-monitor] ${constituencyName}: matched Supabase constituency (${constituencyRow.ons_code})`);
      } else {
        console.log(`[by-election-monitor] ${constituencyName}: no Supabase constituency match — inserting without link`);
      }

      await insertByElectionAlert({ mpName: name, mpParty: party, constituencyName, endDate, endReason, constituencyRow });
      console.log(`[by-election-monitor] Inserted by-election alert: ${constituencyName} (${name})`);
      stats.inserted++;
    } catch (err) {
      console.error(`[by-election-monitor] Error on ${constituencyName}: ${err.message}`);
      stats.errors++;
    }
  }

  // Phase 2 — resolve alerts where the seat is now filled
  try {
    const activeAlerts = await listActiveByElectionAlerts();
    console.log(`[by-election-monitor] Checking ${activeAlerts.length} active by-election alert(s) for resolution`);

    for (const alert of activeAlerts) {
      const constituencyName = (alert.title || "").replace(/^By-election Risk:\s*/, "").trim();
      if (!constituencyName) continue;

      try {
        const hasMember = await checkConstituencyHasCurrentMember(constituencyName);
        if (hasMember) {
          await resolveByElectionAlert(alert.id);
          console.log(`[by-election-monitor] Resolved: ${constituencyName} — seat now filled`);
          stats.resolved++;
        }
      } catch (err) {
        console.error(`[by-election-monitor] Resolution check failed for ${constituencyName}: ${err.message}`);
        stats.errors++;
      }
    }
  } catch (err) {
    console.error(`[by-election-monitor] Resolution phase failed: ${err.message}`);
  }

  const summary = `checked=${stats.checked} inserted=${stats.inserted} resolved=${stats.resolved} skipped=${stats.skipped} errors=${stats.errors}`;
  console.log(`[by-election-monitor] Done. ${summary}`);
  return { statusCode: 200, body: summary };
};
