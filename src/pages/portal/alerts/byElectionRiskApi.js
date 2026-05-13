import { getSupabaseServiceClient } from "../../../lib/supabaseServiceClient.js";

const SELECT = "id, title, summary, detail, risk_level, created_at, local_authority_id, local_authorities(name, region, gss_code)";

function parseAlerts(rows) {
  return rows
    .map(row => {
      let detail = {};
      try { detail = JSON.parse(row.detail) || {}; } catch { /* empty */ }
      return {
        id: row.id,
        councillorName: detail.councillorName ?? "",
        ward: detail.ward ?? "",
        party: detail.party ?? "",
        lastAttendanceDate: detail.lastAttendanceDate ?? null,
        monthsElapsed: detail.monthsElapsed ?? null,
        riskStatus: detail.riskStatus ?? "",
        riskLevel: row.risk_level,
        councilName: row.local_authorities?.name ?? "",
        region: row.local_authorities?.region ?? "",
        gssCode: row.local_authorities?.gss_code ?? "",
        createdAt: row.created_at,
      };
    })
    .filter(a => a.councillorName)
    .sort((a, b) => (b.monthsElapsed ?? 0) - (a.monthsElapsed ?? 0));
}

export async function getAllByElectionAlerts() {
  const db = getSupabaseServiceClient();
  if (!db) return [];
  const { data, error } = await db
    .from("political_alerts")
    .select(SELECT)
    .eq("alert_type", "by_election_risk")
    .eq("is_active", true);
  if (error) return [];
  return parseAlerts(data ?? []);
}

export async function getByElectionAlertsForConstituencies(constituencyIds) {
  if (!constituencyIds || constituencyIds.length === 0) return [];

  const db = getSupabaseServiceClient();
  if (!db) return [];

  // Resolve constituencies to local_authority_ids via constituency_council_lookup
  const allAuthorityIds = new Set();
  const CHUNK = 50;
  for (let i = 0; i < constituencyIds.length; i += CHUNK) {
    const chunk = constituencyIds.slice(i, i + CHUNK);
    const { data } = await db
      .from("constituency_council_lookup")
      .select("local_authority_id")
      .in("constituency_id", chunk);
    (data ?? []).forEach(r => { if (r.local_authority_id) allAuthorityIds.add(r.local_authority_id); });
  }

  if (allAuthorityIds.size === 0) {
    console.warn("[byElectionRiskApi] constituency_council_lookup returned no authority links for this user — no alerts returned");
    return [];
  }

  const { data, error } = await db
    .from("political_alerts")
    .select(SELECT)
    .in("local_authority_id", [...allAuthorityIds])
    .eq("alert_type", "by_election_risk")
    .eq("is_active", true);
  if (error) return [];
  return parseAlerts(data ?? []);
}
