import { supabase } from "../../../lib/supabaseClient.js";

export async function getLocalAuthorities({ query = "", country = "", region = "", authorityType = "", controllingParty = "" } = {}) {
  let q = supabase
    .from("local_authorities")
    .select("id, gss_code, name, authority_type, tier, region, country, total_seats, controlling_party, control_type, last_election_date, next_election_date, composition")
    .order("name");

  if (query) q = q.ilike("name", `%${query}%`);
  if (country) q = q.eq("country", country);
  if (region) q = q.eq("region", region);
  if (authorityType) q = q.eq("authority_type", authorityType);
  if (controllingParty) q = q.eq("controlling_party", controllingParty);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getLocalAuthority(gssCode) {
  const { data, error } = await supabase
    .from("local_authorities")
    .select("*")
    .eq("gss_code", gssCode)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getAuthorityElections(authorityId) {
  const { data, error } = await supabase
    .from("council_elections")
    .select("id, election_date, election_type, seats_contested, turnout")
    .eq("local_authority_id", authorityId)
    .order("election_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getElectionResults(electionId) {
  const { data, error } = await supabase
    .from("council_results")
    .select("id, party_name, party_id, seats_won, seats_change, vote_share")
    .eq("council_election_id", electionId)
    .order("seats_won", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAuthorityAlerts(authorityId) {
  const { data, error } = await supabase
    .from("political_alerts")
    .select("id, alert_type, risk_level, title, summary, detail, is_active, created_at, updated_at")
    .eq("local_authority_id", authorityId)
    .eq("is_active", true)
    .order("risk_level");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAllActiveAlerts() {
  const { data, error } = await supabase
    .from("political_alerts")
    .select(`
      id, alert_type, risk_level, title, summary, is_active, updated_at,
      local_authorities(id, gss_code, name, authority_type, region, country)
    `)
    .eq("is_active", true)
    .order("risk_level");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAuthorityWards(authorityId) {
  const { data, error } = await supabase
    .from("council_wards")
    .select("id, ward_name, ward_code, total_seats, controlling_party, last_election_date")
    .eq("local_authority_id", authorityId)
    .order("ward_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getLinkedConstituencies(authorityId) {
  const { data, error } = await supabase
    .from("constituency_council_lookup")
    .select(`
      id, overlap_type, is_primary,
      constituencies(id, ons_code, name, region, country)
    `)
    .eq("local_authority_id", authorityId)
    .order("is_primary", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getLgrStatus(authorityName) {
  if (!authorityName) return null;
  const { data, error } = await supabase
    .from("lgr_authorities")
    .select("id, authority_name, area_name, lgr_status, lgr_wave, proposed_unitary_name, abolition_date, replacement_authority, mayoral_combined_authority, mayoral_ca_name, political_context, source_url")
    .ilike("authority_name", authorityName)
    .maybeSingle();
  if (error) return null; // table may not exist yet
  return data ?? null;
}

export async function getAllLgrAuthorities() {
  const { data, error } = await supabase
    .from("lgr_authorities")
    .select("id, authority_name, area_name, lgr_status, lgr_wave, proposed_unitary_name, abolition_date, replacement_authority, mayoral_combined_authority, mayoral_ca_name, political_context, source_url")
    .order("lgr_wave")
    .order("authority_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAuthoritiesByNames(names) {
  if (!names || names.length === 0) return [];
  const { data, error } = await supabase
    .from("local_authorities")
    .select("id, gss_code, name, controlling_party, control_type, composition")
    .in("name", names);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCouncillorAttendance(authorityId) {
  const { data, error } = await supabase
    .from("councillor_attendance")
    .select("id, councillor_name, ward, party, meetings_eligible, meetings_attended, attendance_pct, period_start, period_end, source_url")
    .eq("local_authority_id", authorityId)
    .order("attendance_pct", { ascending: true });
  if (error) return [];
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
  if (error) throw new Error(error.message);
  return data ?? [];
}
