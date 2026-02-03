import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const cliPath = process.argv[2];
const envPath = process.env.ASSOCIATIONS_CSV;
const resolvedInputPath = envPath || cliPath || path.join(rootDir, "Associations.csv");
const inputPath = path.isAbsolute(resolvedInputPath)
  ? resolvedInputPath
  : path.join(rootDir, resolvedInputPath);
const outputPath = path.join(rootDir, "src", "data", "associations.json");

if (!fs.existsSync(inputPath)) {
  console.error(`Missing input file: ${inputPath}`);
  console.error("Set ASSOCIATIONS_CSV or pass a path argument, or place Associations.csv at repo root.");
  process.exit(1);
}

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
};

const csvText = fs.readFileSync(inputPath, "utf8");
const rows = parseCsv(csvText);
const [headerRow, ...dataRows] = rows;
if (!headerRow || headerRow.length === 0) {
  console.error("Missing CSV header row.");
  process.exit(1);
}

const headers = headerRow.map((header) => header.trim());
const rowsAsObjects = dataRows.map((row) =>
  headers.reduce((acc, header, index) => {
    acc[header] = row[index] ?? "";
    return acc;
  }, {})
);

const byAssociationMap = new Map();
const byConstituency = {};

for (const row of rowsAsObjects) {
  const associationRaw = row.Association ?? row["Association/Federation"] ?? "";
  const constituencyRaw = row.Constituency ?? "";
  const association = String(associationRaw).trim();
  const constituency = String(constituencyRaw).trim();

  if (!association || !constituency) {
    continue;
  }

  if (!byAssociationMap.has(association)) {
    byAssociationMap.set(association, new Set());
  }

  byAssociationMap.get(association).add(constituency);
  byConstituency[constituency] = association;
}

const byAssociation = {};

for (const [association, constituencies] of byAssociationMap.entries()) {
  byAssociation[association] = Array.from(constituencies).sort();
}

const sortedAssociationKeys = Object.keys(byAssociation).sort();
const sortedByAssociation = {};
for (const key of sortedAssociationKeys) {
  sortedByAssociation[key] = byAssociation[key];
}

const sortedByConstituency = {};
for (const key of Object.keys(byConstituency).sort()) {
  sortedByConstituency[key] = byConstituency[key];
}

const payload = {
  byAssociation: sortedByAssociation,
  byConstituency: sortedByConstituency,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Wrote ${outputPath}`);
