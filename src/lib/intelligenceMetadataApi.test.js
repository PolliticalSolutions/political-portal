import { beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
const eqMock = vi.fn();
const singleMock = vi.fn();
const orderMock = vi.fn();
const limitMock = vi.fn();
const maybeSingleMock = vi.fn();
const fromMock = vi.fn();

vi.mock("./supabaseClient.js", () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

import {
  getDatasetProvenanceLinks,
  getEntityQualityMetadata,
  getIntelligenceMetadata,
  getScoringModelVersion,
} from "./intelligenceMetadataApi.js";

describe("intelligenceMetadataApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null quality metadata when the optional columns are unavailable", async () => {
    fromMock.mockReturnValue({
      select: selectMock.mockReturnValue({
        eq: eqMock.mockReturnValue({
          single: singleMock.mockResolvedValue({ data: null, error: { message: "missing column" } }),
        }),
      }),
    });

    await expect(getEntityQualityMetadata("constituencies", "seat-1")).resolves.toBeNull();
  });

  it("returns provenance links when available", async () => {
    fromMock.mockReturnValue({
      select: selectMock.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        order: orderMock.mockResolvedValue({
          data: [
            {
              dataset_key: "results",
              relationship_type: "source",
              notes: "Verified against official declaration",
              reviewed_at: "2026-03-01T00:00:00Z",
              data_sources: { name: "Commons Library", publisher: "UK Parliament" },
            },
          ],
          error: null,
        }),
      }),
    });

    const result = await getDatasetProvenanceLinks({
      entityType: "constituency",
      entityId: "seat-1",
      datasetKey: "results",
    });

    expect(result).toHaveLength(1);
    expect(result[0].source.name).toBe("Commons Library");
  });

  it("returns the active model version when available", async () => {
    fromMock.mockReturnValue({
      select: selectMock.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: limitMock.mockReturnValue({
          maybeSingle: maybeSingleMock.mockResolvedValue({
            data: { model_key: "vulnerability", version_label: "v1.0", display_name: "Vulnerability" },
            error: null,
          }),
        }),
      }),
    });

    const result = await getScoringModelVersion("vulnerability");
    expect(result.version).toBe("v1.0");
  });

  it("combines quality, sources, and model metadata without throwing on missing optional data", async () => {
    const provenanceQuery = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const modelQuery = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    };
    const tables = {
      constituencies: {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: { message: "missing" } }),
          }),
        }),
      },
      dataset_provenance_links: {
        select: () => provenanceQuery,
      },
      scoring_model_versions: {
        select: () => modelQuery,
      },
    };

    fromMock.mockImplementation((name) => tables[name]);

    const result = await getIntelligenceMetadata({
      tableName: "constituencies",
      entityType: "constituency",
      entityId: "seat-1",
      datasetKey: "results",
      modelKey: "vulnerability",
    });

    expect(result.quality).toBeNull();
    expect(result.sources).toEqual([]);
    expect(result.modelVersion).toBeNull();
  });
});
