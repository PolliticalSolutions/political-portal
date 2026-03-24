import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceClient = { from: vi.fn() };

vi.mock("./supabaseServiceClient.js", () => ({
  getSupabaseServiceClient: vi.fn(() => serviceClient),
}));

vi.mock("./supabaseClient.js", () => ({
  supabase: { from: vi.fn() },
}));

function makeQuery(resolvedValue) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    ilike: () => query,
    limit: () => query,
    single: () => Promise.resolve(resolvedValue),
    maybeSingle: () => Promise.resolve(resolvedValue),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(resolvedValue).then(onFulfilled, onRejected),
  };

  return query;
}

describe("getUserConstituencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates constituencies by id and preserves combined association names", async () => {
    serviceClient.from
      .mockReturnValueOnce(
        makeQuery({
          data: [
            {
              id: "perm-1",
              association_id: "assoc-1",
              granted_at: "2026-03-24T10:00:00.000Z",
              associations: { id: "assoc-1", name: "Exeter Association" },
            },
            {
              id: "perm-2",
              association_id: "assoc-2",
              granted_at: "2026-03-24T10:05:00.000Z",
              associations: { id: "assoc-2", name: "Devon Federation" },
            },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(
        makeQuery({
          data: [
            {
              association_id: "assoc-1",
              constituencies: { id: "seat-1", name: "Exeter", ons_code: "E14000698" },
            },
            {
              association_id: "assoc-2",
              constituencies: { id: "seat-1", name: "Exeter", ons_code: "E14000698" },
            },
            {
              association_id: "assoc-2",
              constituencies: { id: "seat-2", name: "East Devon", ons_code: "E14000677" },
            },
          ],
          error: null,
        })
      );

    const { getUserConstituencies } = await import("./permissionsApi.js");
    const result = await getUserConstituencies("user-sub-1");

    expect(result).toEqual([
      {
        id: "seat-2",
        name: "East Devon",
        ons_code: "E14000677",
        association_name: "Devon Federation",
        association_names: ["Devon Federation"],
      },
      {
        id: "seat-1",
        name: "Exeter",
        ons_code: "E14000698",
        association_name: "Devon Federation, Exeter Association",
        association_names: ["Devon Federation", "Exeter Association"],
      },
    ]);
  });

  it("falls back to ons_code when constituency id is missing", async () => {
    serviceClient.from
      .mockReturnValueOnce(
        makeQuery({
          data: [
            {
              id: "perm-1",
              association_id: "assoc-1",
              granted_at: "2026-03-24T10:00:00.000Z",
              associations: { id: "assoc-1", name: "West Kent" },
            },
            {
              id: "perm-2",
              association_id: "assoc-2",
              granted_at: "2026-03-24T10:05:00.000Z",
              associations: { id: "assoc-2", name: "North Kent" },
            },
          ],
          error: null,
        })
      )
      .mockReturnValueOnce(
        makeQuery({
          data: [
            {
              association_id: "assoc-1",
              constituencies: { name: "Chatham and Aylesford", ons_code: "E14001111" },
            },
            {
              association_id: "assoc-2",
              constituencies: { name: "Chatham and Aylesford", ons_code: "E14001111" },
            },
          ],
          error: null,
        })
      );

    const { getUserConstituencies } = await import("./permissionsApi.js");
    const result = await getUserConstituencies("user-sub-2");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "E14001111",
      name: "Chatham and Aylesford",
      ons_code: "E14001111",
      association_name: "North Kent, West Kent",
    });
  });
});
