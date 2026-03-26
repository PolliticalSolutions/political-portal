const DEMOCRACY_CLUB_BASE_URL = "https://elections.democracyclub.org.uk/api/elections/";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();

function assertSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase sync support is not configured.");
  }
}

function buildSupabaseUrl(path, params = {}) {
  const url = new URL(`/rest/v1/${path}`, `${SUPABASE_URL}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.append(key, value);
  }
  return url.toString();
}

async function supabaseGet(fetchImpl, path, params = {}) {
  assertSupabaseConfigured();
  const response = await fetchImpl(buildSupabaseUrl(path, params), {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.hint || `Supabase request failed (${response.status}).`;
    throw new Error(message);
  }
  return Array.isArray(data) ? data : [];
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date, months) {
  const copy = new Date(date.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function normaliseName(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/\b(city|county|district|borough|metropolitan|council|the|of)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function classifyStatus(dateString, today) {
  if (!dateString) return "UPCOMING";
  if (dateString > today) return "UPCOMING";
  if (dateString === today) return "OPEN";
  return "CLOSED";
}

async function fetchDemocracyClubRows(fetchImpl, { startDate, endDate }) {
  const rows = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = new URL(DEMOCRACY_CLUB_BASE_URL);
    url.searchParams.set("poll_open_date__gte", startDate);
    url.searchParams.set("poll_open_date__lte", endDate);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetchImpl(url.toString());
    if (!response.ok) {
      throw new Error(`Democracy Club request failed (${response.status}).`);
    }
    const payload = await response.json();
    const batch = Array.isArray(payload?.results) ? payload.results : [];
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return rows;
}

async function loadSupportData(fetchImpl) {
  const [constituencies, authorities, links] = await Promise.all([
    supabaseGet(fetchImpl, "constituencies", {
      select: "id,name,ons_code",
      limit: "5000",
    }),
    supabaseGet(fetchImpl, "local_authorities", {
      select: "id,name,gss_code,authority_type,tier,region,country",
      limit: "2000",
    }),
    supabaseGet(fetchImpl, "constituency_council_lookup", {
      select: "local_authority_id,constituency_id",
      limit: "5000",
    }),
  ]);

  const constituencyById = new Map();
  const constituencyByOnsCode = new Map();
  const constituencyByName = new Map();
  for (const row of constituencies) {
    const constituencyId = (row.id || "").toString().trim();
    if (constituencyId) constituencyById.set(constituencyId, row);
    const onsCode = (row.ons_code || "").toString().trim().toUpperCase();
    if (onsCode) constituencyByOnsCode.set(onsCode, row);
    const normalized = normaliseName(row.name);
    if (normalized) constituencyByName.set(normalized, row);
  }

  const pconCodesByAuthorityId = new Map();
  for (const row of links) {
    const authorityId = row.local_authority_id;
    const constituency = constituencyById.get((row.constituency_id || "").toString().trim());
    const pconCode = (constituency?.ons_code || "").toString().trim().toUpperCase();
    if (!authorityId || !pconCode) continue;
    const existing = pconCodesByAuthorityId.get(authorityId) || new Set();
    existing.add(pconCode);
    pconCodesByAuthorityId.set(authorityId, existing);
  }

  const authorityByKey = new Map();
  for (const authority of authorities) {
    const keys = new Set([
      normaliseName(authority.name),
      slugify(authority.name),
    ]);
    for (const key of keys) {
      if (key) authorityByKey.set(key, authority);
    }
  }

  return {
    constituencyByOnsCode,
    constituencyByName,
    authorityByKey,
    pconCodesByAuthorityId,
  };
}

function isRelevantRow(row) {
  const type = row?.election_type?.election_type;
  const territory = row?.organisation?.territory_code || row?.division?.territory_code || "";
  const normalizedTerritory = territory.toString().trim().toUpperCase();

  if (type === "parl") return true;
  if (type !== "local") return false;
  return ["ENG", "WLS"].includes(normalizedTerritory);
}

function getCandidateRows(rows) {
  const deduped = new Map();
  for (const row of rows) {
    if (!row?.election_id || !isRelevantRow(row)) continue;

    const type = row.election_type?.election_type;
    const identifierType = (row.identifier_type || "").toString().trim().toLowerCase();

    if (type === "parl" && identifierType === "election") {
      deduped.set(row.election_id, row);
      continue;
    }
    if (type === "parl" && identifierType === "ballot") {
      deduped.set(row.election_id, row);
      continue;
    }
    if (type === "local" && identifierType === "organisation") {
      deduped.set(row.election_id, row);
      continue;
    }
    if (type === "local" && identifierType === "ballot") {
      deduped.set(row.election_id, row);
    }
  }
  return Array.from(deduped.values());
}

function resolveAuthority(authorityByKey, organisation = {}) {
  const candidates = [
    organisation.official_name,
    organisation.common_name,
    organisation.slug,
  ];

  for (const candidate of candidates) {
    const normalized = normaliseName(candidate);
    if (normalized && authorityByKey.has(normalized)) {
      return authorityByKey.get(normalized);
    }
    const slug = slugify(candidate);
    if (slug && authorityByKey.has(slug)) {
      return authorityByKey.get(slug);
    }
  }
  return null;
}

function mapParliamentaryByElection(row, support) {
  const officialIdentifier = (row?.division?.official_identifier || "").toString();
  const directCode = officialIdentifier.startsWith("gss:")
    ? officialIdentifier.slice(4).trim().toUpperCase()
    : "";
  if (directCode && support.constituencyByOnsCode.has(directCode)) {
    return [directCode];
  }

  const constituency = support.constituencyByName.get(normaliseName(row?.division?.name));
  return constituency?.ons_code ? [constituency.ons_code.toString().trim().toUpperCase()] : [];
}

function mapLocalElection(row, support) {
  const authority = resolveAuthority(support.authorityByKey, row.organisation);
  if (!authority?.id) return [];
  const codes = support.pconCodesByAuthorityId.get(authority.id);
  return codes ? Array.from(codes).sort((a, b) => a.localeCompare(b)) : [];
}

function mapLocalBallotElection(row, support) {
  const authorityCodes = mapLocalElection(row, support);
  if (authorityCodes.length === 1) {
    return authorityCodes;
  }
  return [];
}

function buildElectionRecord(row, pconCodes, todayIso) {
  const type = row.election_type?.election_type;
  const identifierType = (row.identifier_type || "").toString().trim().toLowerCase();
  const pollDate = (row.poll_open_date || "").toString().trim();
  const authorityName = row.organisation?.official_name || "";
  const divisionName = row.division?.name || "";
  const isParliamentaryByElection = type === "parl" && identifierType === "ballot";
  const isLocalBallot = type === "local" && identifierType === "ballot";
  const isByElection = isParliamentaryByElection || isLocalBallot;

  let electionType = "general";
  if (isParliamentaryByElection) electionType = "by_election";
  if (type === "local") electionType = "local";

  let name = row.election_title || "Election";
  if (type === "parl" && identifierType === "election") {
    name = `${pollDate.slice(0, 4)} General Election`;
  } else if (isParliamentaryByElection && divisionName) {
    name = `${divisionName} By-Election`;
  } else if (type === "local" && authorityName) {
    name = isLocalBallot && divisionName
      ? `${authorityName} — ${divisionName} By-Election`
      : `${authorityName} Elections`;
  }

  return {
    name,
    date: pollDate,
    electionType,
    status: classifyStatus(pollDate, todayIso),
    pconCodes,
    localAuthorityName: authorityName || null,
    wardName: isLocalBallot ? divisionName || null : null,
    isByElection,
    democracyClubId: row.election_id,
    lastSyncedAt: new Date().toISOString(),
  };
}

function buildUnmatchedReason(row) {
  const type = row?.election_type?.election_type;
  const identifierType = (row?.identifier_type || "").toString().trim().toLowerCase();
  if (type === "local" && identifierType === "ballot") {
    return "Local ballot-level by-election requires a finer ward/division-to-constituency mapping.";
  }
  if (type === "local") {
    return "Local authority could not be matched to the local_authorities / constituency_council_lookup data.";
  }
  if (type === "parl") {
    return "Parliamentary by-election constituency code could not be matched to constituencies.ons_code.";
  }
  return "Election type not handled by the sync.";
}

export async function runDemocracyClubSync({
  electionsRepo,
  fetchImpl = fetch,
  monthsBack = 6,
  monthsForward = 12,
  dryRun = false,
  now = new Date(),
} = {}) {
  if (!electionsRepo || typeof electionsRepo.upsertElectionWithProjections !== "function") {
    throw new Error("A writable electionsRepo is required.");
  }

  const startDate = formatDate(addMonths(now, -monthsBack));
  const endDate = formatDate(addMonths(now, monthsForward));
  const todayIso = formatDate(now);

  const [support, democracyClubRows] = await Promise.all([
    loadSupportData(fetchImpl),
    fetchDemocracyClubRows(fetchImpl, { startDate, endDate }),
  ]);

  const candidates = getCandidateRows(democracyClubRows);
  const matched = [];
  const unmatched = [];

  for (const row of candidates) {
    const type = row.election_type?.election_type;
    const identifierType = (row.identifier_type || "").toString().trim().toLowerCase();

    let pconCodes = [];
    if (type === "parl" && identifierType === "election") {
      pconCodes = Array.from(support.constituencyByOnsCode.keys()).sort((a, b) => a.localeCompare(b));
    } else if (type === "parl" && identifierType === "ballot") {
      pconCodes = mapParliamentaryByElection(row, support);
    } else if (type === "local" && identifierType === "organisation") {
      pconCodes = mapLocalElection(row, support);
    } else if (type === "local" && identifierType === "ballot") {
      pconCodes = mapLocalBallotElection(row, support);
    }

    if (pconCodes.length === 0) {
      unmatched.push({
        electionId: row.election_id,
        title: row.election_title || "",
        pollOpenDate: row.poll_open_date || "",
        reason: buildUnmatchedReason(row),
      });
      continue;
    }

    matched.push({
      source: row,
      record: buildElectionRecord(row, pconCodes, todayIso),
    });
  }

  if (!dryRun) {
    for (const item of matched) {
      await electionsRepo.upsertElectionWithProjections(item.record);
    }
  }

  const upcomingCutoff = formatDate(addMonths(now, 6));
  const upcoming = matched
    .map((item) => item.record)
    .filter((record) => record.date >= todayIso && record.date <= upcomingCutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    window: { startDate, endDate },
    dryRun,
    foundCount: candidates.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    syncedCount: dryRun ? 0 : matched.length,
    upcoming,
    unmatched,
  };
}
