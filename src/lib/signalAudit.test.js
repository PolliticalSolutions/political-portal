import { describe, expect, it } from "vitest";
import { getSignalAuditForModel } from "./signalAudit.js";

describe("signal audit", () => {
  it("summarises model signals and status counts", () => {
    const audit = getSignalAuditForModel("reformThreat");

    expect(audit.modelTitle).toMatch(/Reform/i);
    expect(audit.signals.length).toBeGreaterThan(0);
    expect(audit.counts.robust).toBeGreaterThan(0);
    expect(audit.counts.noisy).toBeGreaterThan(0);
    expect(["strong", "mixed", "weak", "limited"]).toContain(audit.confidenceSummary);
  });

  it("flags limited confidence where insufficient-data signals are present", () => {
    const audit = getSignalAuditForModel("byElectionRisk");

    expect(audit.counts.insufficient_data).toBeGreaterThan(0);
    expect(audit.confidenceSummary).toBe("limited");
    expect(audit.warning).toMatch(/directional/i);
  });
});
