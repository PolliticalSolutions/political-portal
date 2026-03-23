import { getDocumentClient } from "./dynamoClient.mjs";

const ELECTIONS_TABLE = process.env.ELECTIONS_TABLE || "";
const STATUS_PCON_INDEX = "StatusPconDateIndex";
const PROJECTION_RECORD_TYPE = "ELECTION_PROJECTION";
const CANONICAL_RECORD_TYPE = "ELECTION";
const ALLOWED_STATUSES = new Set(["UPCOMING", "OPEN", "CLOSED", "ARCHIVED"]);

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeStatuses(status) {
  const statuses = toArray(status)
    .map((entry) => (entry || "").toString().trim().toUpperCase())
    .filter(Boolean);
  const valid = statuses.filter((entry) => ALLOWED_STATUSES.has(entry));
  return valid.length > 0 ? valid : ["UPCOMING", "OPEN"];
}

function normalizePconCodes(pconCodes) {
  return toArray(pconCodes)
    .map((entry) => (entry || "").toString().trim().toUpperCase())
    .filter(Boolean);
}

function normalizeElectionType(value) {
  return (value || "").toString().trim().toUpperCase();
}

function normalizeElection(input = {}) {
  const electionId = (input.electionId || "").toString().trim();
  const status = (input.status || "").toString().trim().toUpperCase();
  const pconCodes = Array.from(new Set(normalizePconCodes(input.pconCodes)));
  const normalized = {
    electionId,
    name: (input.name || "").toString().trim(),
    date: (input.date || "").toString().trim(),
    electionType: normalizeElectionType(input.electionType),
    authority: (input.authority || "").toString().trim(),
    status,
    pconCodes,
  };

  if (!normalized.electionId) throw new Error("electionId is required.");
  if (!normalized.name) throw new Error("name is required.");
  if (!normalized.date) throw new Error("date is required.");
  if (!normalized.electionType) throw new Error("electionType is required.");
  if (!ALLOWED_STATUSES.has(normalized.status)) throw new Error("status is invalid.");
  if (normalized.pconCodes.length === 0) throw new Error("pconCodes is required.");
  return normalized;
}

function statusPconKey(status, pconCode) {
  return `${status}#${pconCode}`;
}

function dateElectionKey(date, electionId) {
  return `${date}#${electionId}`;
}

function compareDateAsc(a, b) {
  const aDate = (a?.date || "").toString();
  const bDate = (b?.date || "").toString();
  const byDate = aDate.localeCompare(bDate);
  if (byDate !== 0) return byDate;
  return (a?.electionId || "").toString().localeCompare((b?.electionId || "").toString());
}

function projectionToElection(item) {
  return {
    electionId: item.canonicalElectionId || item.electionId || "",
    name: item.name || "",
    date: item.date || "",
    electionType: item.electionType || "",
    status: (item.status || "").toString().toUpperCase(),
    pconCodes: normalizePconCodes(item.pconCodes),
    authority: item.authority || "",
  };
}

function canonicalToElection(item) {
  if (!item) return null;
  return {
    electionId: item.electionId || "",
    name: item.name || "",
    date: item.date || "",
    electionType: item.electionType || "",
    status: (item.status || "").toString().toUpperCase(),
    pconCodes: normalizePconCodes(item.pconCodes),
    authority: item.authority || "",
  };
}

export function createElectionsRepo({
  dynamo = getDocumentClient(),
  tableName = ELECTIONS_TABLE,
  indexName = STATUS_PCON_INDEX,
} = {}) {
  if (!tableName) {
    throw new Error("ELECTIONS_TABLE is not configured.");
  }

  return {
    async getElection(electionId) {
      if (!electionId) return null;
      const result = await dynamo.get({ TableName: tableName, Key: { electionId } }).promise();
      const item = result.Item || null;
      if (!item || item.recordType !== CANONICAL_RECORD_TYPE) return null;
      return canonicalToElection(item);
    },

    async listElectionsForPconByStatuses(pconCode, status = ["UPCOMING", "OPEN"]) {
      const normalizedPcon = normalizePconCodes([pconCode])[0] || "";
      const statuses = normalizeStatuses(status);
      if (!normalizedPcon) return [];

      const candidates = [];
      for (const electionStatus of statuses) {
        const key = statusPconKey(electionStatus, normalizedPcon);
        const result = await dynamo
          .query({
            TableName: tableName,
            IndexName: indexName,
            KeyConditionExpression: "statusPconKey = :statusPconKey",
            ExpressionAttributeValues: {
              ":statusPconKey": key,
            },
            ScanIndexForward: true,
          })
          .promise();

        for (const item of result.Items || []) {
          if (item.recordType === PROJECTION_RECORD_TYPE) {
            candidates.push(item);
          }
        }
      }

      const deduped = new Map();
      for (const item of candidates) {
        const canonicalId = item.canonicalElectionId || item.electionId;
        if (!canonicalId) continue;
        deduped.set(canonicalId, projectionToElection(item));
      }

      return Array.from(deduped.values()).sort(compareDateAsc);
    },

    async listElectionsByPcon(pconCodes, status = ["UPCOMING", "OPEN"]) {
      const normalizedPcons = normalizePconCodes(pconCodes);
      if (normalizedPcons.length === 0) return [];

      const byId = new Map();
      for (const pconCode of normalizedPcons) {
        const rows = await this.listElectionsForPconByStatuses(pconCode, status);
        for (const row of rows) {
          byId.set(row.electionId, row);
        }
      }
      return Array.from(byId.values()).sort(compareDateAsc);
    },

    async upsertElectionWithProjections(electionInput) {
      const election = normalizeElection(electionInput);
      const now = new Date().toISOString();
      const existing = await dynamo
        .get({ TableName: tableName, Key: { electionId: election.electionId } })
        .promise();
      const existingItem = existing.Item || null;
      const previousPcons = normalizePconCodes(existingItem?.pconCodes);

      await dynamo
        .put({
          TableName: tableName,
          Item: {
            electionId: election.electionId,
            recordType: CANONICAL_RECORD_TYPE,
            canonicalElectionId: election.electionId,
            name: election.name,
            date: election.date,
            electionType: election.electionType,
            authority: election.authority,
            pconCodes: election.pconCodes,
            status: election.status,
            updatedAt: now,
          },
        })
        .promise();

      for (const pconCode of election.pconCodes) {
        await dynamo
          .put({
            TableName: tableName,
            Item: {
              electionId: `${election.electionId}#${pconCode}`,
              recordType: PROJECTION_RECORD_TYPE,
              canonicalElectionId: election.electionId,
              pconCode,
              status: election.status,
              statusPconKey: statusPconKey(election.status, pconCode),
              dateElectionKey: dateElectionKey(election.date, election.electionId),
              date: election.date,
              name: election.name,
              electionType: election.electionType,
              authority: election.authority,
              pconCodes: election.pconCodes,
              updatedAt: now,
            },
          })
          .promise();
      }

      const removedPcons = previousPcons.filter((code) => !election.pconCodes.includes(code));
      for (const pconCode of removedPcons) {
        await dynamo
          .delete({
            TableName: tableName,
            Key: { electionId: `${election.electionId}#${pconCode}` },
          })
          .promise();
      }

      return canonicalToElection({
        electionId: election.electionId,
        name: election.name,
        date: election.date,
        electionType: election.electionType,
        authority: election.authority,
        pconCodes: election.pconCodes,
        status: election.status,
      });
    },

    async listAllElections(status = ["UPCOMING", "OPEN"]) {
      const statuses = new Set(normalizeStatuses(status));
      const result = await dynamo
        .scan({
          TableName: tableName,
          FilterExpression: "recordType = :rt",
          ExpressionAttributeValues: { ":rt": CANONICAL_RECORD_TYPE },
        })
        .promise();
      return (result.Items || [])
        .map(canonicalToElection)
        .filter((e) => statuses.has(e.status))
        .sort((a, b) => b.date.localeCompare(a.date) || a.electionId.localeCompare(b.electionId));
    },

    async archiveElection(electionId) {
      const existing = await this.getElection(electionId);
      if (!existing) return null;
      return this.upsertElectionWithProjections({
        ...existing,
        status: "ARCHIVED",
      });
    },
  };
}

export const electionsRepo = ELECTIONS_TABLE ? createElectionsRepo() : null;
