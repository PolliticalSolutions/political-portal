import { describe, expect, it, vi } from "vitest";
import { createUsersRepo } from "../src/usersRepo.mjs";
import { createElectionsRepo } from "../src/electionsRepo.mjs";
import { createSubmissionsRepo } from "../src/submissionsRepo.mjs";
import { createAuditRepo } from "../src/auditRepo.mjs";
import { createOrgsRepo } from "../src/orgsRepo.mjs";
import { createManualReviewRepo } from "../src/manualReviewRepo.mjs";

function resolved(value) {
  return { promise: async () => value };
}

describe("usersRepo", () => {
  it("gets and conditionally creates users", async () => {
    const dynamo = {
      get: vi.fn(() => resolved({ Item: { userId: "sub-1", status: "PENDING" } })),
      put: vi.fn(() => resolved({})),
      update: vi.fn(() => resolved({})),
    };
    const repo = createUsersRepo({ dynamo, tableName: "users-table" });

    const existing = await repo.getUser("sub-1");
    expect(existing).toEqual({ userId: "sub-1", status: "PENDING" });

    const created = await repo.putUserIfAbsent({ userId: "sub-2", requestedOrgId: "org-a" });
    expect(created.created).toBe(true);
    expect(created.item.userId).toBe("sub-2");
    expect(created.item.status).toBe("APPROVED");

    expect(dynamo.put).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "users-table",
        ConditionExpression: "attribute_not_exists(userId)",
      })
    );
  });

  it("updates user status with org and constituency fields", async () => {
    const dynamo = {
      get: vi.fn(() => resolved({ Item: { userId: "sub-1", status: "APPROVED" } })),
      put: vi.fn(() => resolved({})),
      update: vi.fn(() => resolved({})),
    };
    const repo = createUsersRepo({ dynamo, tableName: "users-table" });

    const updated = await repo.updateUserStatus({
      userId: "sub-1",
      status: "APPROVED",
      orgId: "org-1",
      orgType: "ASSOCIATION",
      allowedPconCodes: ["E14000637"],
      approvedBy: "admin-sub",
      approvedAt: "2026-02-19T12:00:00.000Z",
    });

    expect(updated).toEqual({ userId: "sub-1", status: "APPROVED" });
    expect(dynamo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "users-table",
        Key: { userId: "sub-1" },
        ConditionExpression: "attribute_exists(userId)",
      })
    );
  });
});

describe("electionsRepo", () => {
  it("queries by pcon and status without scans and returns sorted unique rows", async () => {
    const query = vi
      .fn()
      .mockImplementationOnce(() =>
        resolved({
          Items: [
            {
              electionId: "2026-05-07:PCC:west-yorkshire#E14000637",
              canonicalElectionId: "2026-05-07:PCC:west-yorkshire",
              recordType: "ELECTION_PROJECTION",
              status: "OPEN",
              date: "2026-05-07",
              name: "PCC",
              electionType: "PCC",
              pconCodes: ["E14000637"],
            },
          ],
        })
      )
      .mockImplementationOnce(() =>
        resolved({
          Items: [
            {
              electionId: "2026-05-01:LOCAL:seat-a#E14000637",
              canonicalElectionId: "2026-05-01:LOCAL:seat-a",
              recordType: "ELECTION_PROJECTION",
              status: "UPCOMING",
              date: "2026-05-01",
              name: "Seat A",
              electionType: "LOCAL",
              pconCodes: ["E14000637"],
            },
          ],
        })
      );

    const dynamo = {
      get: vi.fn(() => resolved({ Item: null })),
      query,
    };

    const repo = createElectionsRepo({
      dynamo,
      tableName: "elections-table",
      indexName: "StatusPconDateIndex",
    });

    const items = await repo.listElectionsForPconByStatuses("E14000637", ["OPEN", "UPCOMING"]);

    expect(items.map((entry) => entry.electionId)).toEqual([
      "2026-05-01:LOCAL:seat-a",
      "2026-05-07:PCC:west-yorkshire",
    ]);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "elections-table",
        IndexName: "StatusPconDateIndex",
        KeyConditionExpression: "statusPconKey = :statusPconKey",
      })
    );
  });

  it("gets a canonical election by id", async () => {
    const dynamo = {
      get: vi.fn(() => resolved({ Item: { electionId: "e-1", recordType: "ELECTION" } })),
      query: vi.fn(() => resolved({ Items: [] })),
    };

    const repo = createElectionsRepo({ dynamo, tableName: "elections-table" });
    const item = await repo.getElection("e-1");
    expect(item).toEqual({
      electionId: "e-1",
      name: "",
      date: "",
      electionType: "",
      status: "",
      pconCodes: [],
      authority: "",
    });
  });

  it("upserts canonical and projection records and deletes removed projections", async () => {
    const dynamo = {
      get: vi.fn(() =>
        resolved({
          Item: {
            electionId: "e-1",
            recordType: "ELECTION",
            pconCodes: ["E14000637", "E14000638"],
          },
        })
      ),
      query: vi.fn(() => resolved({ Items: [] })),
      put: vi.fn(() => resolved({})),
      delete: vi.fn(() => resolved({})),
    };

    const repo = createElectionsRepo({ dynamo, tableName: "elections-table" });
    const updated = await repo.upsertElectionWithProjections({
      electionId: "e-1",
      name: "Election One",
      date: "2026-05-01",
      electionType: "LOCAL",
      status: "OPEN",
      pconCodes: ["E14000637"],
    });

    expect(updated.electionId).toBe("e-1");
    expect(dynamo.put).toHaveBeenCalled();
    expect(dynamo.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "elections-table",
        Key: { electionId: "e-1#E14000638" },
      })
    );
  });
});

describe("submissionsRepo", () => {
  it("creates, fetches, and lists submissions by user", async () => {
    const dynamo = {
      put: vi.fn(() => resolved({})),
      get: vi.fn(() => resolved({ Item: { submissionId: "subm-1", userId: "user-1" } })),
      query: vi.fn(() => resolved({ Items: [{ submissionId: "subm-1", userId: "user-1" }] })),
    };

    const repo = createSubmissionsRepo({
      dynamo,
      tableName: "submissions-table",
      userIdIndexName: "UserIdCreatedAtIndex",
    });

    const created = await repo.createSubmission({
      submissionId: "subm-1",
      userId: "user-1",
      orgId: "org-1",
      pconCode: "E14000637",
      electionId: "e-1",
      jobId: "job-1",
    });

    expect(created.submissionId).toBe("subm-1");
    expect(created.status).toBe("RECEIVED");

    const fetched = await repo.getSubmission("subm-1");
    expect(fetched).toEqual({ submissionId: "subm-1", userId: "user-1" });

    const list = await repo.listSubmissionsByUser("user-1", { limit: 20 });
    expect(list).toEqual([{ submissionId: "subm-1", userId: "user-1" }]);

    expect(dynamo.query).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "submissions-table",
        IndexName: "UserIdCreatedAtIndex",
        KeyConditionExpression: "userId = :userId",
      })
    );
  });
});

describe("auditRepo", () => {
  it("writes audit entries", async () => {
    const dynamo = {
      put: vi.fn(() => resolved({})),
    };
    const repo = createAuditRepo({ dynamo, tableName: "audit-table" });
    const item = await repo.writeAudit({
      action: "USER_APPROVED",
      actor: { actorId: "admin-sub", email: "admin@example.com" },
      target: { type: "USER", targetKey: "USER#123" },
      metadata: { after: { status: "APPROVED" } },
    });

    expect(item.action).toBe("USER_APPROVED");
    expect(item.actorId).toBe("admin-sub");
    expect(dynamo.put).toHaveBeenCalledWith(expect.objectContaining({ TableName: "audit-table" }));
  });
});

describe("orgsRepo", () => {
  it("lists active organisations by org type and fetches single org", async () => {
    const dynamo = {
      get: vi.fn(() =>
        resolved({
          Item: {
            orgId: "org-1",
            name: "Org 1",
            orgType: "ASSOCIATION",
            isActive: true,
            pconCodes: ["E14000637"],
          },
        })
      ),
      query: vi.fn(() =>
        resolved({
          Items: [
            {
              orgId: "org-1",
              name: "Org 1",
              orgType: "ASSOCIATION",
              isActive: true,
              pconCodes: ["E14000637"],
            },
          ],
        })
      ),
    };
    const repo = createOrgsRepo({ dynamo, tableName: "orgs-table", indexName: "ActiveOrgTypeIndex" });
    const one = await repo.getOrganisation("org-1");
    const list = await repo.listOrganisations({ orgType: "ASSOCIATION", active: true });

    expect(one.orgId).toBe("org-1");
    expect(list).toHaveLength(1);
    expect(dynamo.query).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "orgs-table",
        IndexName: "ActiveOrgTypeIndex",
      })
    );
  });
});

describe("manualReviewRepo", () => {
  it("lists open jobs from manual review index and resolves a job", async () => {
    const dynamo = {
      query: vi.fn(() =>
        resolved({
          Items: [{ jobId: "job-1", manualReviewKey: "MR#OPEN", requiresManualReview: true }],
          LastEvaluatedKey: null,
        })
      ),
      get: vi.fn(() => resolved({ Item: { jobId: "job-1", requiresManualReview: true } })),
      update: vi.fn(() => resolved({})),
    };
    const repo = createManualReviewRepo({ dynamo, tableName: "jobs-table", indexName: "ManualReviewIndex" });

    const listed = await repo.listJobs({ status: "OPEN", limit: 20 });
    expect(listed.items).toHaveLength(1);
    expect(dynamo.query).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "jobs-table",
        IndexName: "ManualReviewIndex",
        KeyConditionExpression: "manualReviewKey = :manualReviewKey",
      })
    );

    const resolvedJob = await repo.resolveJob({
      jobId: "job-1",
      decision: "APPROVE",
      note: "This has been reviewed and approved.",
      reviewedBy: "admin-sub",
      correctedElectionId: "election-1",
    });
    expect(resolvedJob.before.jobId).toBe("job-1");
    expect(dynamo.update).toHaveBeenCalled();
  });
});
