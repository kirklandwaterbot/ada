export const CAPITAL_DATASET_IDS = {
  legacyBudgetDetails: "kizb-nxtu",
  legacySummaryHistory: "ehz8-ag3n",
  modernBudgets: "f6fd-xfps",
  modernDetails: "9hy6-8j6t",
  modernSchedules: "nswv-d6bz",
};

export const CAPITAL_SOURCE_URLS = Object.fromEntries(
  Object.entries(CAPITAL_DATASET_IDS).map(([key, id]) => [
    key,
    `https://data.ny.gov/d/${id}`,
  ]),
);

export const MODERN_DETAILS_PAGE_URL =
  CAPITAL_SOURCE_URLS.modernDetails;
export const LEGACY_SUMMARY_PAGE_URL =
  CAPITAL_SOURCE_URLS.legacySummaryHistory;

const SODA_ORIGIN = "https://data.ny.gov";
const PAGE_LIMIT = 50_000;
const LEGACY_PROJECT_FILTER =
  "agency_name='New York City Transit' AND " +
  "(lower(element_description) like '%elevator%' OR " +
  "lower(element_description) like '%escalator%' OR " +
  "lower(proj_description) like '%elevator%' OR " +
  "lower(proj_description) like '%escalator%' OR " +
  "lower(scope_objective) like '%elevator%' OR " +
  "lower(scope_objective) like '%escalator%')";
const SOURCE_CONFIG = {
  modernDetails: { order: "project_id", where: null },
  modernBudgets: { order: "update_date DESC, project_id, acep", where: null },
  modernSchedules: {
    order: "project_id, phase_sequence, activity_date",
    where: null,
  },
  legacySummaryHistory: {
    order: "proj_num, loaddate DESC",
    where: LEGACY_PROJECT_FILTER,
  },
  legacyBudgetDetails: {
    order: "project_number, plan_revision",
    where: null,
  },
};
const RETRYABLE_STATUS = new Set([408, 425, 429]);

export async function fetchCapitalProjectSourceBundle({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for Capital Plan sync.");
  }

  const sourceKeys = Object.keys(SOURCE_CONFIG);
  const requests = sourceKeys.flatMap((key) => {
    const config = SOURCE_CONFIG[key];
    return [
      fetchJson(buildRowsUrl(CAPITAL_DATASET_IDS[key], config), fetchImpl),
      fetchJson(
        buildCountUrl(CAPITAL_DATASET_IDS[key], config.where),
        fetchImpl,
      ),
    ];
  });
  const responses = await Promise.all(requests);
  const bundle = { checkedAt: new Date().toISOString(), expectedCounts: {} };

  sourceKeys.forEach((key, index) => {
    const rows = responses[index * 2];
    const countPayload = responses[index * 2 + 1];
    const count = Number(countPayload?.[0]?.count);

    if (!Array.isArray(rows) || !Number.isInteger(count)) {
      throw new Error(`The Capital Plan ${key} response was malformed.`);
    }

    bundle[key] = rows;
    bundle.expectedCounts[key] = count;
  });

  return bundle;
}

function buildRowsUrl(datasetId, { order, where }) {
  const url = new URL(`/resource/${datasetId}.json`, SODA_ORIGIN);
  url.searchParams.set("$limit", String(PAGE_LIMIT));
  url.searchParams.set("$order", order);
  if (where) url.searchParams.set("$where", where);
  return url.toString();
}

function buildCountUrl(datasetId, where) {
  const url = new URL(`/resource/${datasetId}.json`, SODA_ORIGIN);
  url.searchParams.set("$select", "count(*)");
  if (where) url.searchParams.set("$where", where);
  return url.toString();
}

async function fetchJson(url, fetchImpl) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;

    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "access-nyc-capital-projects/0.1",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt === maxAttempts) {
        throw requestError(url, attempt, error);
      }

      await wait(500 * 2 ** (attempt - 1));
      continue;
    }

    if (response.ok) return response.json();

    const retryable =
      RETRYABLE_STATUS.has(response.status) || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw requestError(
        url,
        attempt,
        new Error(`HTTP ${response.status} ${response.statusText}`.trim()),
      );
    }

    await response.body?.cancel().catch(() => {});
    await wait(500 * 2 ** (attempt - 1));
  }

  throw new Error(`Capital Plan request failed for ${url}.`);
}

function requestError(url, attempts, error) {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(
    `Capital Plan request failed for ${url} after ${attempts} attempts: ${reason}`,
    { cause: error },
  );
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
