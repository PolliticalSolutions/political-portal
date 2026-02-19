import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const DEFAULT_SEED_FILE = path.resolve("scripts/organisations.seed.json");
const DEFAULT_TABLE = process.env.ORGANISATIONS_TABLE || "";
const DEFAULT_REGION = process.env.AWS_REGION || "eu-west-2";

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
    } else if (arg === "--region" && argv[i + 1]) {
      result.region = argv[i + 1];
      i += 1;
    } else if (arg === "--profile" && argv[i + 1]) {
      result.profile = argv[i + 1];
      i += 1;
    } else if (arg === "--file" && argv[i + 1]) {
      result.file = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return result;
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
  throw new Error(`Unsupported value type: ${typeof value}`);
}

function marshallItem(item) {
  const output = {};
  for (const [key, value] of Object.entries(item)) {
    output[key] = marshallValue(value);
  }
  return output;
}

function normalizeOrg(raw, index) {
  const orgId = (raw?.orgId || "").toString().trim();
  const name = (raw?.name || "").toString().trim();
  const orgType = (raw?.orgType || "").toString().trim().toUpperCase();
  const isActive = Boolean(raw?.isActive);
  const pconCodes = Array.isArray(raw?.pconCodes)
    ? raw.pconCodes.map((entry) => (entry || "").toString().trim().toUpperCase()).filter(Boolean)
    : [];

  if (!orgId) throw new Error(`seed[${index}]: orgId is required.`);
  if (!name) throw new Error(`seed[${index}]: name is required.`);
  if (orgType !== "ASSOCIATION" && orgType !== "FEDERATION") {
    throw new Error(`seed[${index}]: orgType must be ASSOCIATION or FEDERATION.`);
  }

  return {
    orgId,
    name,
    orgType,
    isActive,
    pconCodes,
    activeOrgTypeKey: `${isActive ? "ACTIVE" : "INACTIVE"}#${orgType}`,
    updatedAt: new Date().toISOString(),
  };
}

function putItem({ table, region, profile, item }) {
  const args = ["dynamodb", "put-item", "--table-name", table, "--region", region, "--item", JSON.stringify(marshallItem(item))];
  if (profile) args.push("--profile", profile);
  const result = spawnSync("aws", args, { stdio: "pipe", encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`aws put-item failed for ${item.orgId}: ${(result.stderr || result.stdout || "").trim()}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.table) {
    throw new Error("Missing table name. Set ORGANISATIONS_TABLE or pass --table.");
  }

  const raw = JSON.parse(await readFile(args.file, "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Seed file must contain a non-empty array.");
  }

  const items = raw.map(normalizeOrg);
  for (const item of items) {
    putItem({ table: args.table, region: args.region, profile: args.profile, item });
  }

  console.log(`Seeded ${items.length} organisations into ${args.table}.`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
