import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const rootDir = process.cwd();
const cliPath = process.argv[2];
const envPath = process.env.ASSOCIATIONS_XLSX;
const resolvedInputPath = envPath || cliPath || path.join(rootDir, "Associations.xlsx");
const inputPath = path.isAbsolute(resolvedInputPath)
  ? resolvedInputPath
  : path.join(rootDir, resolvedInputPath);
const outputPath = path.join(rootDir, "src", "data", "associations.json");

if (!fs.existsSync(inputPath)) {
  console.error(`Missing input file: ${inputPath}`);
  console.error("Set ASSOCIATIONS_XLSX or pass a path argument, or place Associations.xlsx at repo root.");
  process.exit(1);
}

const workbook = xlsx.readFile(inputPath, { cellDates: false });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

const byAssociationMap = new Map();
const byConstituency = {};

for (const row of rows) {
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
