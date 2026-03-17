import { supabase } from "../../../lib/supabaseClient.js";

export async function searchConstituencies({ query = "", region = "", country = "" } = {}) {
  let q = supabase
    .from("constituencies")
    .select("id, ons_code, name, region, country, constituency_type, electorate_current")
    .order("name");

  if (query) q = q.ilike("name", `%${query}%`);
  if (region) q = q.eq("region", region);
  if (country) q = q.eq("country", country);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getConstituency(onsCode) {
  const { data, error } = await supabase
    .from("constituencies")
    .select("id, ons_code, name, region, country, constituency_type, electorate_current, leave_vote_share")
    .eq("ons_code", onsCode)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getConstituencyResults(constituencyId) {
  const { data, error } = await supabase
    .from("results")
    .select(`
      id, votes, vote_share, votes_change, vote_share_change,
      is_winner, majority, turnout, electorate,
      elections(id, election_date, election_type, name),
      candidates(id, first_name, last_name),
      parties(id, name, short_name, colour_hex)
    `)
    .eq("constituency_id", constituencyId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => row.elections?.election_type !== "notional")
    .sort((a, b) => {
      const dateA = a.elections?.election_date ?? "";
      const dateB = b.elections?.election_date ?? "";
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      return (b.votes ?? 0) - (a.votes ?? 0);
    });
}

export async function getConstituencySwings(constituencyId) {
  const [{ data: swings, error: swErr }, { data: nationals, error: natErr }] = await Promise.all([
    supabase
      .from("swings")
      .select("id, swing_value, from_party_id, to_party_id")
      .eq("constituency_id", constituencyId),
    supabase
      .from("swings")
      .select("id, swing_value, from_party_id, to_party_id")
      .is("constituency_id", null),
  ]);
  if (swErr) throw new Error(swErr.message);
  if (natErr) throw new Error(natErr.message);
  return { swings: swings ?? [], nationals: nationals ?? [] };
}

export async function getCouncilData(constituencyId) {
  const { data, error } = await supabase
    .from("council_data")
    .select("*")
    .eq("constituency_id", constituencyId)
    .order("council_tier", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getLinkedAuthorities(constituencyId) {
  const { data, error } = await supabase
    .from("constituency_council_lookup")
    .select(`
      id, overlap_type, is_primary,
      local_authorities(id, gss_code, name, authority_type, tier, region, country,
        total_seats, controlling_party, control_type, composition,
        last_election_date, next_election_date, website_url)
    `)
    .eq("constituency_id", constituencyId)
    .order("is_primary", { ascending: false });
  // Table may not exist during transition — return empty rather than throw
  if (error) return [];
  return (data ?? []).map((row) => row.local_authorities).filter(Boolean);
}

export async function getConstituencyDemographics(constituencyId) {
  const { data, error } = await supabase
    .from("demographics")
    .select("*")
    .eq("constituency_id", constituencyId)
    .order("census_year", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMarginalityScore(constituencyId) {
  const { data, error } = await supabase
    .from("marginality_scores")
    .select("marginality_score, majority_pct, swing_deviation, historical_volatility, demographic_factor, classification, calculated_at")
    .eq("constituency_id", constituencyId)
    .single();
  if (error) return null; // table may not exist yet
  return data ?? null;
}

export async function getAllMarginalityScores() {
  const { data, error } = await supabase
    .from("marginality_scores")
    .select("constituency_id, marginality_score, classification");
  if (error) return []; // graceful fallback
  return data ?? [];
}

export async function getElectorateTrend(constituencyId) {
  // Returns winner rows with electorate per election, sorted oldest first
  const { data, error } = await supabase
    .from("results")
    .select("electorate, elections(id, election_date, name, election_type)")
    .eq("constituency_id", constituencyId)
    .eq("is_winner", true);
  if (error) return [];
  return (data ?? [])
    .filter((r) => r.elections?.election_type !== "notional" && r.electorate)
    .sort((a, b) => (a.elections?.election_date ?? "").localeCompare(b.elections?.election_date ?? ""));
}

export async function getSwingTimeline(constituencyId) {
  // Returns winner results with vote_share per general election for swing chart
  const { data, error } = await supabase
    .from("results")
    .select("vote_share, votes, electorate, parties(id, name, short_name, colour_hex), elections(id, election_date, name, election_type)")
    .eq("constituency_id", constituencyId)
    .eq("is_winner", true);
  if (error) return [];
  return (data ?? [])
    .filter((r) => r.elections?.election_type !== "notional")
    .sort((a, b) => (a.elections?.election_date ?? "").localeCompare(b.elections?.election_date ?? ""));
}

export async function getByElectionRisk(constituencyId) {
  const { data, error } = await supabase
    .from("by_election_risk")
    .select("risk_score, risk_level, majority_factor, council_instability_factor, defection_risk_factor, polling_trend_factor, risk_summary, calculated_at")
    .eq("constituency_id", constituencyId)
    .single();
  if (error) return null;
  return data ?? null;
}

export async function getHighRiskByElectionSeats() {
  const { data, error } = await supabase
    .from("by_election_risk")
    .select("constituency_id, risk_score, risk_level, risk_summary")
    .in("risk_level", ["High", "Very High"])
    .order("risk_score", { ascending: false })
    .limit(10);
  if (error) return [];
  return data ?? [];
}

export async function getByElectionWatchSeats() {
  const { data, error } = await supabase
    .from("by_election_risk")
    .select(`
      constituency_id,
      risk_score,
      risk_level,
      majority_factor,
      council_instability_factor,
      defection_risk_factor,
      polling_trend_factor,
      risk_summary,
      calculated_at
    `)
    .gt("risk_score", 7)
    .order("risk_score", { ascending: false });
  if (error) return [];
  return data ?? [];
}

// Returns Conservative 2024 seats meeting objective watchlist criteria.
// Criteria checked here: majority < 5000.
// Council territory and incumbency are evaluated in the page component
// using council_data and candidates.first_elected_year respectively.
export async function getByElectionWatchlist() {
  // Latest general election
  const { data: elections, error: elErr } = await supabase
    .from("elections")
    .select("id")
    .eq("election_type", "general")
    .order("election_date", { ascending: false })
    .limit(1);
  if (elErr || !elections?.length) return [];
  const latestId = elections[0].id;

  const CON_PARTY_ID = "a4f20caf-ba89-4fb0-9ae3-313a7f937719";

  const { data, error } = await supabase
    .from("results")
    .select(`
      constituency_id,
      candidate_id,
      majority,
      electorate,
      vote_share,
      constituencies(id, ons_code, name, region, leave_vote_share),
      candidates(id, first_name, last_name, first_elected_year)
    `)
    .eq("election_id", latestId)
    .eq("party_id", CON_PARTY_ID)
    .eq("is_winner", true)
    .lt("majority", 5000)
    .order("majority", { ascending: true });
  if (error) return [];
  return data ?? [];
}

export async function getVulnerabilityScore(constituencyId) {
  const { data, error } = await supabase
    .from("vulnerability_scores")
    .select("vulnerability_score, vulnerability_level, primary_threat, labour_threat, reform_threat, libdem_threat, calculated_at")
    .eq("constituency_id", constituencyId)
    .single();
  if (error) return null;
  return data ?? null;
}

export async function getAllVulnerabilityScores() {
  const { data, error } = await supabase
    .from("vulnerability_scores")
    .select("constituency_id, vulnerability_score, vulnerability_level, primary_threat, labour_threat, reform_threat, libdem_threat")
    .order("vulnerability_score", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function getReformThreatIndex() {
  const { data, error } = await supabase
    .from("reform_threat_index")
    .select("constituency_id, threat_score, threat_rank, con_ruk_swing, ruk_2024_share, con_majority, council_reform_strength, demographic_alignment")
    .order("threat_rank", { ascending: true })
    .limit(50);
  if (error) return [];
  return data ?? [];
}

export async function getRegionalCorrelations(region) {
  const { data, error } = await supabase
    .from("demographic_correlations")
    .select("demographic_variable, correlation_coefficient, sample_size, parties(id, name, short_name, colour_hex)")
    .eq("region", region)
    .order("correlation_coefficient", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function getNationalCorrelations() {
  return getRegionalCorrelations("National");
}

export async function getAlertSubscriptions(email) {
  const { data, error } = await supabase
    .from("alert_subscriptions")
    .select("id, constituency_id, local_authority_id, alert_types, is_active, created_at")
    .eq("user_email", email)
    .eq("is_active", true);
  if (error) return [];
  return data ?? [];
}

export async function addAlertSubscription({ email, constituencyId, localAuthorityId, alertTypes }) {
  const { error } = await supabase
    .from("alert_subscriptions")
    .insert({
      user_email: email,
      constituency_id: constituencyId ?? null,
      local_authority_id: localAuthorityId ?? null,
      alert_types: alertTypes ?? { by_election_risk: true, council_instability: true, mp_defection: true },
      is_active: true,
    });
  if (error) throw new Error(error.message);
}

export async function removeAlertSubscription(subscriptionId) {
  const { error } = await supabase
    .from("alert_subscriptions")
    .update({ is_active: false })
    .eq("id", subscriptionId);
  if (error) throw new Error(error.message);
}

export async function getLatestElectionWinners() {
  const { data: elections, error: elErr } = await supabase
    .from("elections")
    .select("id, election_date, name, election_type")
    .eq("election_type", "general")
    .order("election_date", { ascending: false })
    .limit(1);
  if (elErr) throw new Error(elErr.message);
  if (!elections?.length) return { electionName: null, electionDate: null, winners: [] };

  const latestId = elections[0].id;

  // Include constituency data in the same query to avoid a separate large .in() call.
  // PostgREST resolves results.constituency_id → constituencies via the FK relationship.
  const { data: winners, error: wErr } = await supabase
    .from("results")
    .select(`
      constituency_id,
      majority,
      candidates(id, first_name, last_name),
      parties(id, name, short_name, colour_hex),
      constituencies(id, ons_code, name, region, country, constituency_type, electorate_current)
    `)
    .eq("election_id", latestId)
    .eq("is_winner", true);
  if (wErr) throw new Error(wErr.message);

  return {
    electionName: elections[0].name,
    electionDate: elections[0].election_date,
    winners: winners ?? [],
  };
}
