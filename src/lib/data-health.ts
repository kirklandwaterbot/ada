import type { DataMetadata } from "@/lib/mta-assets";

const STALE_AFTER_MS = 36 * 60 * 60 * 1_000;

export type DataHealthStatus = {
  message: string;
  severity: "error" | "warning";
  title: string;
};

export function getDataHealthStatus(
  metadata: DataMetadata,
  now = Date.now(),
): DataHealthStatus | null {
  if (
    metadata.validation.loadedRowCount <= 0 ||
    metadata.validation.rowCountMatches === false
  ) {
    return {
      message: "The active dataset failed its row-count validation. Use the official MTA source before relying on these records.",
      severity: "error",
      title: "Equipment data is incomplete",
    };
  }

  const syncedAt = metadata.lastSyncedAt
    ? Date.parse(metadata.lastSyncedAt)
    : Number.NaN;
  const isStale = !Number.isFinite(syncedAt) || now - syncedAt > STALE_AFTER_MS;

  if (metadata.pageSourceMode !== "sql") {
    return {
      message: isStale
        ? "The database source is unavailable or incomplete, and the local fallback is older than 36 hours. Verify conditions with the MTA."
        : "The database source is unavailable or incomplete. A complete local daily snapshot is being shown instead.",
      severity: "warning",
      title: "Using the fallback snapshot",
    };
  }

  if (isStale) {
    return {
      message: "The latest successful database sync is older than 36 hours. Verify conditions with the MTA while the next refresh is pending.",
      severity: "warning",
      title: "Equipment snapshot is delayed",
    };
  }

  return null;
}
