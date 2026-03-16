import { supabase } from "../../../lib/supabaseClient.js";

export async function searchConstituencies({ query = "", region = "", country = "", ids = null } = {}) {
  let q = supabase
    .from("constituencies")
    .select("id, ons_code, name, region, country, constituency_type, electorate_current")
    .order("name");

  if (ids) q = q.in("id", ids);
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
    .select("id, ons_code, name, region, country, constituency_type, electorate_current")
    .eq("ons_code", onsCode)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getRegionsAndCountries(ids = null) {
  let q = supabase.from("constituencies").select("region, country");
  if (ids) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const regions = [...new Set((data ?? []).map((r) => r.region).filter(Boolean))].sort();
  const countries = [...new Set((data ?? []).map((r) => r.country).filter(Boolean))].sort();
  return { regions, countries };
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

  return (data ?? []).sort((a, b) => {
    const dateA = a.elections?.election_date ?? "";
    const dateB = b.elections?.election_date ?? "";
    if (dateB !== dateA) return dateB.localeCompare(dateA);
    return (b.votes ?? 0) - (a.votes ?? 0);
  });
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

export async function getLatestElectionWinners() {
  const { data: elections, error: elErr } = await supabase
    .from("elections")
    .select("id, election_date, name")
    .order("election_date", { ascending: false })
    .limit(1);
  if (elErr) throw new Error(elErr.message);
  if (!elections?.length) return { electionName: null, electionDate: null, winners: [] };

  const latestId = elections[0].id;

  const { data: winners, error: wErr } = await supabase
    .from("results")
    .select("constituency_id, parties(id, name, short_name, colour_hex)")
    .eq("election_id", latestId)
    .eq("is_winner", true);
  if (wErr) throw new Error(wErr.message);

  return {
    electionName: elections[0].name,
    electionDate: elections[0].election_date,
    winners: winners ?? [],
  };
}
