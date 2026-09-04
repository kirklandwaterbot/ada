import { describe, expect, it } from "vitest";
import {
  assertCompleteDataset,
  assertPersistedRowCount,
  getActualRowCountMatch,
} from "@/lib/data-integrity";

describe("MTA dataset integrity", () => {
  it("rejects an incomplete upstream response before replacement", () => {
    expect(() => assertCompleteDataset(756, 704, "live MTA dataset")).toThrow(
      /expected 756 rows but loaded 704/,
    );
  });

  it("rejects an empty response even when the expected count is unavailable", () => {
    expect(() => assertCompleteDataset(null, 0, "live MTA dataset")).toThrow(
      /empty dataset/,
    );
  });

  it("uses the rows actually loaded when reporting count validity", () => {
    expect(getActualRowCountMatch(756, 704)).toBe(false);
    expect(getActualRowCountMatch(756, 756)).toBe(true);
    expect(getActualRowCountMatch(null, 756)).toBeNull();
  });

  it("rejects a post-transaction persisted count mismatch", () => {
    expect(() => assertPersistedRowCount(756, 755)).toThrow(
      /intended 756 rows but persisted 755/,
    );
  });
});
