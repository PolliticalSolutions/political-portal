import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock supabaseClient before importing the module under test.
vi.mock("../../../lib/supabaseClient.js", () => {
  const makeMockQuery = (resolvedValue) => {
    const obj = {
      select: () => obj,
      order: () => obj,
      ilike: () => obj,
      eq: () => obj,
      limit: () => obj,
      single: () => Promise.resolve(resolvedValue),
      then: (resolve) => Promise.resolve(resolvedValue).then(resolve),
    };
    // Make the query itself thenable so `await q` works
    obj[Symbol.for("mockResolvedValue")] = resolvedValue;
    // Attach a custom then so `const { data, error } = await q` works
    obj.then = (onFulfilled) => Promise.resolve(resolvedValue).then(onFulfilled);
    return obj;
  };

  return {
    supabase: {
      from: vi.fn(() => makeMockQuery({ data: [], error: null })),
    },
  };
});

import { supabase } from "../../../lib/supabaseClient.js";
import {
  getConstituency,
  getConstituencyReformThreat,
  getConstituencyResults,
  getLgrImpactsForAuthorityNames,
  getLatestElectionScenarioBaseline,
  getLatestElectionWinners,
  searchConstituencies,
} from "./constituencyApi.js";

const mockFrom = (resolvedValue) => {
  const obj = {
    select: () => obj,
    order: () => obj,
    ilike: () => obj,
    eq: () => obj,
    limit: () => obj,
    single: () => Promise.resolve(resolvedValue),
    then: (onFulfilled) => Promise.resolve(resolvedValue).then(onFulfilled),
  };
  return obj;
};

describe("searchConstituencies", () => {
  beforeEach(() => {
    supabase.from.mockReset();
  });

  it("returns an empty array when Supabase returns no data", async () => {
    supabase.from.mockReturnValue(mockFrom({ data: null, error: null }));
    const result = await searchConstituencies();
    expect(result).toEqual([]);
  });

  it("returns the data array on success", async () => {
    const rows = [{ id: 1, name: "Test Seat", ons_code: "E14000001" }];
    supabase.from.mockReturnValue(mockFrom({ data: rows, error: null }));
    const result = await searchConstituencies({ query: "test" });
    expect(result).toEqual(rows);
  });

  it("throws when Supabase returns an error", async () => {
    supabase.from.mockReturnValue(
      mockFrom({ data: null, error: { message: "DB connection failed" } })
    );
    await expect(searchConstituencies()).rejects.toThrow("DB connection failed");
  });
});

describe("getConstituency", () => {
  beforeEach(() => {
    supabase.from.mockReset();
  });

  it("returns the single constituency record", async () => {
    const row = { id: 1, ons_code: "E14000001", name: "Test Seat" };
    const singleQuery = {
      select: () => singleQuery,
      eq: () => singleQuery,
      single: () => Promise.resolve({ data: row, error: null }),
    };
    supabase.from.mockReturnValue(singleQuery);
    const result = await getConstituency("E14000001");
    expect(result).toEqual(row);
  });

  it("throws when Supabase returns an error", async () => {
    const singleQuery = {
      select: () => singleQuery,
      eq: () => singleQuery,
      single: () => Promise.resolve({ data: null, error: { message: "Not found" } }),
    };
    supabase.from.mockReturnValue(singleQuery);
    await expect(getConstituency("INVALID")).rejects.toThrow("Not found");
  });
});

describe("getConstituencyResults", () => {
  beforeEach(() => {
    supabase.from.mockReset();
  });

  it("returns results sorted by election date descending then votes descending", async () => {
    const rows = [
      { elections: { election_date: "2024-07-04" }, votes: 100, is_winner: false },
      { elections: { election_date: "2019-12-12" }, votes: 200, is_winner: true },
      { elections: { election_date: "2024-07-04" }, votes: 200, is_winner: true },
    ];
    supabase.from.mockReturnValue(mockFrom({ data: rows, error: null }));
    const result = await getConstituencyResults(1);
    expect(result[0].votes).toBe(200);
    expect(result[0].elections.election_date).toBe("2024-07-04");
    expect(result[1].votes).toBe(100);
    expect(result[2].elections.election_date).toBe("2019-12-12");
  });

  it("throws when Supabase returns an error", async () => {
    supabase.from.mockReturnValue(
      mockFrom({ data: null, error: { message: "Query failed" } })
    );
    await expect(getConstituencyResults(99)).rejects.toThrow("Query failed");
  });
});

describe("getLatestElectionWinners", () => {
  beforeEach(() => {
    supabase.from.mockReset();
  });

  it("returns empty winners when no elections exist", async () => {
    supabase.from.mockReturnValue(mockFrom({ data: [], error: null }));
    const result = await getLatestElectionWinners();
    expect(result).toEqual({ electionName: null, electionDate: null, winners: [] });
  });

  it("throws when the elections query fails", async () => {
    supabase.from.mockReturnValue(
      mockFrom({ data: null, error: { message: "Elections table error" } })
    );
    await expect(getLatestElectionWinners()).rejects.toThrow("Elections table error");
  });

  it("returns the latest general election winners", async () => {
    const electionQuery = {
      select: () => electionQuery,
      eq: () => electionQuery,
      order: () => electionQuery,
      limit: () => Promise.resolve({
        data: [{ id: "election-2024", election_date: "2024-07-04", name: "2024 General Election" }],
        error: null,
      }),
    };
    const winnersQuery = {
      select: () => winnersQuery,
      eq: () => winnersQuery,
      then: (onFulfilled) => Promise.resolve({
        data: [
          {
            constituency_id: "seat-1",
            parties: { name: "Labour", short_name: "Lab", colour_hex: "#e31d1a" },
            constituencies: { id: "seat-1", ons_code: "E14000001", name: "Test Seat" },
          },
        ],
        error: null,
      }).then(onFulfilled),
    };

    supabase.from
      .mockReturnValueOnce(electionQuery)
      .mockReturnValueOnce(winnersQuery);

    const result = await getLatestElectionWinners();

    expect(result).toEqual({
      electionName: "2024 General Election",
      electionDate: "2024-07-04",
      winners: [
        {
          constituency_id: "seat-1",
          parties: { name: "Labour", short_name: "Lab", colour_hex: "#e31d1a" },
          constituencies: { id: "seat-1", ons_code: "E14000001", name: "Test Seat" },
        },
      ],
    });
  });
});

describe("getLatestElectionScenarioBaseline", () => {
  beforeEach(() => {
    supabase.from.mockReset();
  });

  it("returns empty rows when no elections exist", async () => {
    supabase.from.mockReturnValue(mockFrom({ data: [], error: null }));
    const result = await getLatestElectionScenarioBaseline();
    expect(result).toEqual({ electionName: null, electionDate: null, rows: [] });
  });

  it("returns latest election rows for scenario modelling", async () => {
    const electionQuery = {
      select: () => electionQuery,
      eq: () => electionQuery,
      order: () => electionQuery,
      limit: () => Promise.resolve({
        data: [{ id: "election-2024", election_date: "2024-07-04", name: "2024 General Election" }],
        error: null,
      }),
    };
    const rowsQuery = {
      select: () => rowsQuery,
      eq: () => rowsQuery,
      then: (onFulfilled) => Promise.resolve({
        data: [
          {
            constituency_id: "seat-1",
            vote_share: 42,
            is_winner: true,
            parties: { short_name: "Con" },
            constituencies: { id: "seat-1", ons_code: "E14000001", name: "Test Seat" },
          },
        ],
        error: null,
      }).then(onFulfilled),
    };

    supabase.from
      .mockReturnValueOnce(electionQuery)
      .mockReturnValueOnce(rowsQuery);

    const result = await getLatestElectionScenarioBaseline();

    expect(result).toEqual({
      electionName: "2024 General Election",
      electionDate: "2024-07-04",
      rows: [
        {
          constituency_id: "seat-1",
          vote_share: 42,
          is_winner: true,
          parties: { short_name: "Con" },
          constituencies: { id: "seat-1", ons_code: "E14000001", name: "Test Seat" },
        },
      ],
    });
  });
});

describe("threat and LGR helpers", () => {
  beforeEach(() => {
    supabase.from.mockReset();
  });

  it("returns a constituency-level Reform threat record", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () =>
        Promise.resolve({
          data: { threat_score: 7.2, threat_rank: 3 },
          error: null,
        }),
    };
    supabase.from.mockReturnValue(query);

    const result = await getConstituencyReformThreat("seat-1");
    expect(result).toEqual({ threat_score: 7.2, threat_rank: 3 });
  });

  it("matches LGR rows against linked authority names", async () => {
    const query = {
      select: () =>
        Promise.resolve({
          data: [
            { authority_name: "Kent County Council", area_name: "Kent", lgr_status: "Consultation open" },
            { authority_name: "Unrelated Council", area_name: "Elsewhere", lgr_status: "Completed" },
          ],
          error: null,
        }),
    };
    supabase.from.mockReturnValue(query);

    const result = await getLgrImpactsForAuthorityNames(["Kent County Council"]);
    expect(result).toHaveLength(1);
    expect(result[0].authority_name).toBe("Kent County Council");
  });
});
