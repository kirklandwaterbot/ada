import type { RawCapitalSourceBundle } from "./mta-capital-types";

export const CAPITAL_DATASET_IDS: {
  legacyBudgetDetails: string;
  legacySummaryHistory: string;
  modernBudgets: string;
  modernDetails: string;
  modernSchedules: string;
};

export const CAPITAL_SOURCE_URLS: Record<keyof typeof CAPITAL_DATASET_IDS, string>;
export const MODERN_DETAILS_PAGE_URL: string;
export const LEGACY_SUMMARY_PAGE_URL: string;

export function fetchCapitalProjectSourceBundle(options?: {
  fetchImpl?: typeof fetch;
}): Promise<RawCapitalSourceBundle>;
