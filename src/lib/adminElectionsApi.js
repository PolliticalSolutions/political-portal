import { getSupabaseServiceClient } from "./supabaseServiceClient.js";

function getAdminDb() {
  const db = getSupabaseServiceClient();
  if (!db) {
    throw new Error("Supabase service client not available.");
  }
  return db;
}

function normalizePconCodes(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .flatMap((entry) =>
          Array.isArray(entry)
            ? entry
            : (entry || "")
                .toString()
                .split(/[\s,]+/)
        )
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function mapElectionRow(row = {}) {
  const links = Array.isArray(row.constituency_elections) ? row.constituency_elections : [];
  const constituencyLinks = links
    .map((link) => ({
      relevance: link.relevance || "direct",
      constituencyId: link.constituencies?.id || "",
      name: link.constituencies?.name || "",
      onsCode: link.constituencies?.ons_code || "",
    }))
    .filter((entry) => entry.constituencyId);

  const pconCodes = normalizePconCodes(constituencyLinks.map((entry) => entry.onsCode));

  return {
    electionId: row.id || "",
    name: row.name || "",
    date: row.polling_date || row.election_date || "",
    election_date: row.election_date || "",
    polling_date: row.polling_date || "",
    electionType: (row.election_type || "").toString().trim().toUpperCase(),
    election_type: row.election_type || "",
    status: (row.status || "").toString().trim().toUpperCase(),
    isByElection: row.is_by_election === true,
    localAuthorityName: row.local_authority_name || "",
    wardName: row.ward_name || "",
    democracyClubId: row.democracy_club_id || "",
    lastSyncedAt: row.last_synced_at || "",
    pconCodes,
    constituencyLinks,
  };
}

export async function listManagedElections() {
  const db = getAdminDb();
  const { data, error } = await db
    .from("elections")
    .select(`
      id,
      name,
      election_date,
      election_type,
      status,
      is_by_election,
      local_authority_name,
      ward_name,
      polling_date,
      democracy_club_id,
      last_synced_at,
      constituency_elections(
        relevance,
        constituencies(id, name, ons_code)
      )
    `)
    .order("polling_date", { ascending: false })
    .order("election_date", { ascending: false })
    .limit(1000);

  if (error) throw new Error(error.message);
  return (data || []).map(mapElectionRow);
}

export async function searchElectionConstituencies(query) {
  const db = getAdminDb();
  const trimmed = (query || "").trim();
  if (trimmed.length < 2) return [];

  const upper = trimmed.toUpperCase();
  let builder = db
    .from("constituencies")
    .select("id, name, ons_code")
    .order("name")
    .limit(12);

  if (/^[EWNS]\d+/i.test(upper)) {
    builder = builder.ilike("ons_code", `%${upper}%`);
  } else {
    builder = builder.ilike("name", `%${trimmed}%`);
  }

  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveManagedElection(input = {}) {
  const db = getAdminDb();
  const pconCodes = normalizePconCodes(input.pconCodes);
  if (!input.name?.trim()) throw new Error("Election name is required.");
  if (!input.date?.trim()) throw new Error("Election date is required.");
  if (!input.electionType?.trim()) throw new Error("Election type is required.");
  if (pconCodes.length === 0) throw new Error("At least one constituency must be linked.");

  const { data: constituencies, error: constituenciesError } = await db
    .from("constituencies")
    .select("id, ons_code, name")
    .in("ons_code", pconCodes);
  if (constituenciesError) throw new Error(constituenciesError.message);

  const constituencyIdByPcon = new Map(
    (constituencies || []).map((row) => [(row.ons_code || "").toString().trim().toUpperCase(), row.id])
  );
  const missing = pconCodes.filter((code) => !constituencyIdByPcon.has(code));
  if (missing.length > 0) {
    throw new Error(`Unknown constituency code(s): ${missing.join(", ")}`);
  }

  const electionId = (input.electionId || "").trim() || crypto.randomUUID();
  const row = {
    id: electionId,
    name: input.name.trim(),
    election_date: input.date.trim(),
    polling_date: input.date.trim(),
    election_type: input.electionType.trim().toLowerCase(),
    status: (input.status || "OPEN").toString().trim().toUpperCase(),
    is_by_election: Boolean(input.isByElection),
    local_authority_name: input.localAuthorityName?.trim() || null,
    ward_name: input.wardName?.trim() || null,
    democracy_club_id: input.democracyClubId?.trim() || null,
    last_synced_at: input.lastSyncedAt || null,
  };

  const { error: saveError } = await db.from("elections").upsert(row, { onConflict: "id" });
  if (saveError) throw new Error(saveError.message);

  const { data: existingLinks, error: linksError } = await db
    .from("constituency_elections")
    .select("constituency_id")
    .eq("election_id", electionId);
  if (linksError) throw new Error(linksError.message);

  const nextConstituencyIds = new Set(pconCodes.map((code) => constituencyIdByPcon.get(code)));
  const currentConstituencyIds = new Set((existingLinks || []).map((row) => row.constituency_id));

  const linkRows = [...nextConstituencyIds].map((constituencyId) => ({
    election_id: electionId,
    constituency_id: constituencyId,
    relevance: "direct",
  }));
  if (linkRows.length > 0) {
    const { error: upsertLinksError } = await db
      .from("constituency_elections")
      .upsert(linkRows, { onConflict: "election_id,constituency_id" });
    if (upsertLinksError) throw new Error(upsertLinksError.message);
  }

  const removedIds = [...currentConstituencyIds].filter((constituencyId) => !nextConstituencyIds.has(constituencyId));
  if (removedIds.length > 0) {
    const { error: deleteLinksError } = await db
      .from("constituency_elections")
      .delete()
      .eq("election_id", electionId)
      .in("constituency_id", removedIds);
    if (deleteLinksError) throw new Error(deleteLinksError.message);
  }

  return electionId;
}

export async function archiveManagedElection(electionId) {
  const db = getAdminDb();
  if (!electionId) throw new Error("Election ID is required.");
  const { error } = await db
    .from("elections")
    .update({ status: "ARCHIVED" })
    .eq("id", electionId);
  if (error) throw new Error(error.message);
}
