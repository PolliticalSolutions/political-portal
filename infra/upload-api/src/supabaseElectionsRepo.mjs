import { randomUUID } from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();
const ALLOWED_STATUSES = new Set(["UPCOMING", "OPEN", "CLOSED", "ARCHIVED"]);
const DEFAULT_STATUSES = ["UPCOMING", "OPEN", "CLOSED", "ARCHIVED"];

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeStatuses(status) {
  const statuses = toArray(status)
    .flatMap((entry) =>
      Array.isArray(entry)
        ? entry
        : (entry || "")
            .toString()
            .split(",")
    )
    .map((entry) => (entry || "").toString().trim().toUpperCase())
    .filter((entry) => ALLOWED_STATUSES.has(entry));
  return statuses.length > 0 ? statuses : DEFAULT_STATUSES;
}

function normalizePconCodes(pconCodes) {
  return Array.from(
    new Set(
      toArray(pconCodes)
        .flatMap((entry) =>
          Array.isArray(entry)
            ? entry
            : (entry || "")
                .toString()
                .split(",")
        )
        .map((entry) => (entry || "").toString().trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function compareDateAsc(a, b) {
  const aDate = (a?.date || "").toString();
  const bDate = (b?.date || "").toString();
  const byDate = aDate.localeCompare(bDate);
  if (byDate !== 0) return byDate;
  return (a?.electionId || "").toString().localeCompare((b?.electionId || "").toString());
}

function compareDateDesc(a, b) {
  return compareDateAsc(b, a);
}

function buildSupabaseUrl(path, params = {}) {
  const url = new URL(`/rest/v1/${path}`, `${SUPABASE_URL}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.append(key, value);
  }
  return url.toString();
}

async function supabaseRequest(path, { method = "GET", params = {}, body, headers = {} } = {}) {
  const url = buildSupabaseUrl(path, params);
  const response = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.hint || `Supabase request failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

function mapLinksToPconCodes(links = []) {
  return normalizePconCodes(
    links.map((link) => link?.constituencies?.ons_code || link?.constituency?.ons_code || "")
  );
}

function mapRowToElection(row = {}, links = []) {
  const pconCodes = mapLinksToPconCodes(links);
  const date = row.polling_date || row.election_date || "";
  return {
    electionId: row.id || "",
    name: row.name || "",
    date,
    election_date: row.election_date || "",
    polling_date: row.polling_date || "",
    electionType: (row.election_type || "").toString().trim().toUpperCase(),
    election_type: row.election_type || "",
    status: (row.status || "").toString().trim().toUpperCase(),
    pconCodes,
    authority: row.local_authority_name || "",
    localAuthorityName: row.local_authority_name || "",
    wardName: row.ward_name || "",
    isByElection: row.is_by_election === true,
    democracyClubId: row.democracy_club_id || "",
    lastSyncedAt: row.last_synced_at || "",
  };
}

async function resolveConstituenciesByPconCodes(pconCodes) {
  const normalizedPconCodes = normalizePconCodes(pconCodes);
  if (normalizedPconCodes.length === 0) return [];
  const rows = await supabaseRequest("constituencies", {
    params: {
      select: "id,ons_code,name",
      ons_code: `in.(${normalizedPconCodes.join(",")})`,
      limit: normalizedPconCodes.length.toString(),
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function listLinksForElection(electionId) {
  if (!electionId) return [];
  const rows = await supabaseRequest("constituency_elections", {
    params: {
      select: "id,constituency_id,relevance,constituencies(id,name,ons_code)",
      election_id: `eq.${electionId}`,
      limit: "5000",
    },
  });
  return Array.isArray(rows) ? rows : [];
}

export function createSupabaseElectionsRepo() {
  if (!isConfigured()) {
    throw new Error("Supabase elections repo is not configured.");
  }

  return {
    source: "supabase",

    async getElection(electionId) {
      if (!electionId) return null;
      const rows = await supabaseRequest("elections", {
        params: {
          select: "id,name,election_date,election_type,status,is_by_election,local_authority_name,ward_name,polling_date,democracy_club_id,last_synced_at",
          id: `eq.${electionId}`,
          limit: "1",
        },
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      const links = await listLinksForElection(electionId);
      return mapRowToElection(row, links);
    },

    async listElectionsForPconByStatuses(pconCode, status = DEFAULT_STATUSES) {
      const normalizedPconCode = normalizePconCodes([pconCode])[0] || "";
      if (!normalizedPconCode) return [];
      return this.listElectionsByPcon([normalizedPconCode], status);
    },

    async listElectionsByPcon(pconCodes, status = DEFAULT_STATUSES) {
      const normalizedPconCodes = normalizePconCodes(pconCodes);
      if (normalizedPconCodes.length === 0) return [];

      const constituencies = await resolveConstituenciesByPconCodes(normalizedPconCodes);
      const constituencyIds = constituencies.map((row) => row.id).filter(Boolean);
      if (constituencyIds.length === 0) return [];

      const linkRows = await supabaseRequest("constituency_elections", {
        params: {
          select:
            "election_id,relevance,elections!inner(id,name,election_date,election_type,status,is_by_election,local_authority_name,ward_name,polling_date,democracy_club_id,last_synced_at)",
          constituency_id: `in.(${constituencyIds.join(",")})`,
          limit: "5000",
        },
      });

      const allowedStatuses = new Set(normalizeStatuses(status));
      const electionsById = new Map();
      const linksByElectionId = new Map();

      for (const row of Array.isArray(linkRows) ? linkRows : []) {
        const election = row?.elections;
        if (!election?.id) continue;
        if (!allowedStatuses.has((election.status || "").toString().trim().toUpperCase())) continue;

        electionsById.set(election.id, election);
        const existing = linksByElectionId.get(election.id) || [];
        existing.push({
          relevance: row.relevance || "direct",
          constituencies: constituencies.find((item) => item.id === row.constituency_id) || null,
        });
        linksByElectionId.set(election.id, existing);
      }

      return Array.from(electionsById.values())
        .map((row) => mapRowToElection(row, linksByElectionId.get(row.id) || []))
        .sort(compareDateAsc);
    },

    async listAllElections(status = DEFAULT_STATUSES) {
      const rows = await supabaseRequest("elections", {
        params: {
          select: "id,name,election_date,election_type,status,is_by_election,local_authority_name,ward_name,polling_date,democracy_club_id,last_synced_at",
          limit: "5000",
        },
      });
      const allowedStatuses = new Set(normalizeStatuses(status));
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => allowedStatuses.has((row.status || "").toString().trim().toUpperCase()))
        .map((row) => mapRowToElection(row))
        .sort(compareDateDesc);
    },

    async upsertElectionWithProjections(electionInput = {}) {
      const pconCodes = normalizePconCodes(electionInput.pconCodes);
      if (pconCodes.length === 0) {
        throw new Error("pconCodes is required.");
      }

      const statuses = normalizeStatuses([electionInput.status || "OPEN"]);
      const nowIso = new Date().toISOString();
      const democracyClubId = (electionInput.democracyClubId || electionInput.democracy_club_id || "").toString().trim();
      let electionId = (electionInput.electionId || "").toString().trim();

      if (!electionId && democracyClubId) {
        const existingRows = await supabaseRequest("elections", {
          params: {
            select: "id",
            democracy_club_id: `eq.${democracyClubId}`,
            limit: "1",
          },
        });
        electionId = Array.isArray(existingRows) && existingRows[0]?.id ? existingRows[0].id : "";
      }
      if (!electionId) {
        electionId = randomUUID();
      }

      const constituencies = await resolveConstituenciesByPconCodes(pconCodes);
      const constituencyIdByPcon = new Map(
        constituencies.map((row) => [(row.ons_code || "").toString().trim().toUpperCase(), row.id])
      );
      const missingPcons = pconCodes.filter((code) => !constituencyIdByPcon.has(code));
      if (missingPcons.length > 0) {
        throw new Error(`Unknown constituency code(s): ${missingPcons.join(", ")}`);
      }

      const row = {
        id: electionId,
        name: (electionInput.name || "").toString().trim(),
        election_date: (electionInput.date || electionInput.election_date || "").toString().trim(),
        election_type: (electionInput.electionType || electionInput.election_type || "").toString().trim().toLowerCase(),
        status: statuses[0],
        is_by_election: electionInput.isByElection === true || electionInput.is_by_election === true,
        local_authority_name: (electionInput.localAuthorityName || electionInput.local_authority_name || electionInput.authority || "").toString().trim() || null,
        ward_name: (electionInput.wardName || electionInput.ward_name || "").toString().trim() || null,
        polling_date: (electionInput.pollingDate || electionInput.polling_date || electionInput.date || electionInput.election_date || "").toString().trim() || null,
        democracy_club_id: democracyClubId || null,
        last_synced_at: (electionInput.lastSyncedAt || electionInput.last_synced_at || "").toString().trim() || null,
      };

      if (!row.name) throw new Error("name is required.");
      if (!row.election_date) throw new Error("date is required.");
      if (!row.election_type) throw new Error("electionType is required.");

      await supabaseRequest("elections?on_conflict=id", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: row,
      });

      const existingLinks = await listLinksForElection(electionId);
      const desiredRows = pconCodes.map((code) => ({
        election_id: electionId,
        constituency_id: constituencyIdByPcon.get(code),
        relevance: "direct",
        created_at: nowIso,
      }));

      if (desiredRows.length > 0) {
        await supabaseRequest("constituency_elections?on_conflict=election_id,constituency_id", {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: desiredRows,
        });
      }

      const desiredConstituencyIds = new Set(desiredRows.map((entry) => entry.constituency_id));
      const removedIds = existingLinks
        .map((entry) => entry.constituency_id)
        .filter((constituencyId) => constituencyId && !desiredConstituencyIds.has(constituencyId));
      if (removedIds.length > 0) {
        await supabaseRequest("constituency_elections", {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
          params: {
            election_id: `eq.${electionId}`,
            constituency_id: `in.(${removedIds.join(",")})`,
          },
        });
      }

      return mapRowToElection(row, desiredRows.map((entry) => ({
        relevance: entry.relevance,
        constituencies: constituencies.find((item) => item.id === entry.constituency_id) || null,
      })));
    },

    async archiveElection(electionId) {
      const existing = await this.getElection(electionId);
      if (!existing) return null;
      await supabaseRequest("elections", {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        params: {
          id: `eq.${electionId}`,
        },
        body: {
          status: "ARCHIVED",
        },
      });
      return this.getElection(electionId);
    },
  };
}

export function isSupabaseElectionsConfigured() {
  return isConfigured();
}
