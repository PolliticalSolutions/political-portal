import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const DEFAULT_SEED_FILE = path.resolve("scripts/elections.seed.json");
const DEFAULT_TABLE = process.env.ELECTIONS_TABLE || "";
const DEFAULT_REGION = process.env.AWS_REGION || "eu-west-2";
const ALLOWED_STATUSES = new Set(["UPCOMING", "OPEN", "CLOSED", "ARCHIVED"]);

function parseArgs(argv) {
  const result = {
    table: DEFAULT_TABLE,
    region: DEFAULT_REGION,
    profile: process.env.AWS_PROFILE || "",
    file: DEFAULT_SEED_FILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--table" && argv[i + 1]) {
      result.table = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--region" && argv[i + 1]) {
      result.region = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--profile" && argv[i + 1]) {
      result.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--file" && argv[i + 1]) {
      result.file = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
  }

  return result;
}

function validateElection(raw, index) {
  const context = `seed[${index}]`;
  const electionId = String(raw?.electionId || "").trim();
  const name = String(raw?.name || "").trim();
  const date = String(raw?.date || "").trim();
  const electionType = String(raw?.electionType || "").trim().toUpperCase();
  const authority = String(raw?.authority || "").trim();
  const status = String(raw?.status || "").trim().toUpperCase();
  const pconCodes = Array.isArray(raw?.pconCodes)
    ? raw.pconCodes.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean)
    : [];

  if (!electionId) throw new Error(`${context}: electionId is required.`);
  if (!name) throw new Error(`${context}: name is required.`);
  if (!date) throw new Error(`${context}: date is required.`);
  if (!electionType) throw new Error(`${context}: electionType is required.`);
  if (pconCodes.length === 0) throw new Error(`${context}: at least one pconCode is required.`);
  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error(`${context}: status must be one of ${Array.from(ALLOWED_STATUSES).join(", ")}.`);
  }

  return {
    electionId,
    name,
    date,
    electionType,
    authority,
    status,
    pconCodes,
  };
}

function marshallValue(value) {
  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === "string") return { S: value };
  if (typeof value === "number") return { N: String(value) };
  if (typeof value === "boolean") return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(marshallValue) };
  if (typeof value === "object") {
    const map = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      map[key] = marshallValue(nested);
    }
    return { M: map };
  }
  throw new Error(`Unsupported value type for marshalling: ${typeof value}`);
}

function marshallItem(item) {
  const marshalled = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined) continue;
    marshalled[key] = marshallValue(value);
  }
  return marshalled;
}

function buildCanonicalRecord(election) {
  return {
    electionId: election.electionId,
    recordType: "ELECTION",
    canonicalElectionId: election.electionId,
    name: election.name,
    date: election.date,
    electionType: election.electionType,
    authority: election.authority,
    pconCodes: election.pconCodes,
    status: election.status,
    updatedAt: new Date().toISOString(),
  };
}

function buildProjectionRecords(election) {
  return election.pconCodes.map((pconCode) => ({
    electionId: `${election.electionId}#${pconCode}`,
    recordType: "ELECTION_PROJECTION",
    canonicalElectionId: election.electionId,
    pconCode,
    status: election.status,
    statusPconKey: `${election.status}#${pconCode}`,
    dateElectionKey: `${election.date}#${election.electionId}`,
    date: election.date,
    name: election.name,
    electionType: election.electionType,
    authority: election.authority,
    pconCodes: election.pconCodes,
    updatedAt: new Date().toISOString(),
  }));
}

function runAwsPutItem({ table, region, profile, item }) {
  const args = ["dynamodb", "put-item", "--table-name", table, "--region", region, "--item", JSON.stringify(marshallItem(item))];
  if (profile) {
    args.push("--profile", profile);
  }

  const result = spawnSync("aws", args, { stdio: "pipe", encoding: "utf-8" });
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "").trim();
    throw new Error(`aws dynamodb put-item failed for ${item.electionId}: ${details}`);
  }
}

function printUsage() {
  console.log("Usage: node scripts/seed-elections.mjs --table <tableName> [--region eu-west-2] [--profile profile] [--file scripts/elections.seed.json]");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.table) {
    throw new Error("Missing table name. Set ELECTIONS_TABLE or pass --table.");
  }

  const raw = await readFile(args.file, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Seed file must contain a non-empty array.");
  }

  const elections = parsed.map(validateElection);
  let writes = 0;

  for (const election of elections) {
    const canonical = buildCanonicalRecord(election);
    runAwsPutItem({ table: args.table, region: args.region, profile: args.profile, item: canonical });
    writes += 1;

    const projections = buildProjectionRecords(election);
    for (const projection of projections) {
      runAwsPutItem({ table: args.table, region: args.region, profile: args.profile, item: projection });
      writes += 1;
    }
  }

  console.log(`Seeded ${elections.length} elections into ${args.table} (${writes} total items written).`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
