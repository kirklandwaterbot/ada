import { describe, expect, it } from "vitest";
import { getDataHealthStatus } from "@/lib/data-health";
import type { DataMetadata } from "@/lib/mta-assets";

const NOW = Date.parse("2026-09-04T02:00:00.000Z");

function metadata(overrides: Partial<DataMetadata> = {}): DataMetadata {
  return {
    countApiUrl: "https://example.test/count",
    csvDownloadUrl: "https://example.test/data.csv",
    datasetId: "test",
    datasetPageUrl: "https://example.test",
    jsonApiUrl: "https://example.test/data.json",
    lastSyncedAt: "2026-09-03T05:00:00.000Z",
    localSnapshotWrittenAt: "2026-09-03T05:00:00.000Z",
    pageSourceMode: "sql",
    sqlitePath: "data/test.sqlite",
    upstreamSource: "live_api",
    validation: {
      expectedRowCount: 756,
      loadedRowCount: 756,
      rowCountMatches: true,
    },
    ...overrides,
  };
}

describe("data health status", () => {
  it("stays quiet for a complete, recent database sync", () => {
    expect(getDataHealthStatus(metadata(), NOW)).toBeNull();
  });

  it("warns when a complete local fallback is active", () => {
    expect(
      getDataHealthStatus(metadata({ pageSourceMode: "local_snapshot" }), NOW),
    ).toMatchObject({ title: "Using the fallback snapshot" });
  });

  it("warns when the database snapshot is older than 36 hours", () => {
    expect(
      getDataHealthStatus(
        metadata({ lastSyncedAt: "2026-09-01T00:00:00.000Z" }),
        NOW,
      ),
    ).toMatchObject({ title: "Equipment snapshot is delayed" });
  });

  it("reports failed row-count validation as an error", () => {
    expect(
      getDataHealthStatus(
        metadata({
          validation: {
            expectedRowCount: 756,
            loadedRowCount: 704,
            rowCountMatches: false,
          },
        }),
        NOW,
      ),
    ).toMatchObject({ severity: "error", title: "Equipment data is incomplete" });
  });
});
