import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../template.yaml", import.meta.url), "utf8");

const node24Functions = [
  "UploadFunction",
  "WorkerFunction",
  "UploadCompleteFunction",
  "ScanResultHandlerFunction",
  "PersonaFunction",
  "VolunteerOpsFunction",
  "ByElectionMonitorFunction",
  "VolunteerEmailFunction",
];

function resourceBlock(logicalId) {
  const match = template.match(
    new RegExp(`^  ${logicalId}:\\r?\\n([\\s\\S]*?)(?=^  [A-Za-z0-9]+:\\s*$|$(?![\\s\\S]))`, "m")
  );
  expect(match, `${logicalId} must exist in the production SAM template`).not.toBeNull();
  return match[1];
}

function runtimeFor(logicalId) {
  const match = resourceBlock(logicalId).match(/^      Runtime:\s*(\S+)\s*$/m);
  expect(match, `${logicalId} must declare a runtime`).not.toBeNull();
  return match[1];
}

describe("production Lambda runtimes", () => {
  it("does not allow the deprecated Node.js 20 runtime", () => {
    expect(template).not.toMatch(/^\s+Runtime:\s*nodejs20\.x\s*$/m);
  });

  it.each(node24Functions)("keeps %s on Node.js 24", (logicalId) => {
    expect(runtimeFor(logicalId)).toBe("nodejs24.x");
  });

  it("keeps the worker event-source mapping disabled", () => {
    expect(resourceBlock("WorkerProcessQueueMapping")).toMatch(/^      Enabled:\s*false\b/m);
  });
});
