import { unstable_cache } from "next/cache";
import {
  isSubwayAccessibilityRelease,
  parsePressReleaseMarkup,
} from "@/lib/mta-press-release-parser";

const MTA_ORIGIN = "https://www.mta.info";
const MTA_PRESS_RELEASE_VIEW_URL = `${MTA_ORIGIN}/views/ajax`;
const PRESS_RELEASE_CACHE_RETENTION_SECONDS = 60 * 60 * 48;
const PRESS_RELEASE_PAGES_TO_SCAN = 3;
const PRESS_RELEASE_REQUEST_ATTEMPTS = 3;
const PRESS_RELEASE_RETRY_DELAY_MS = 500;
const DAILY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const DAILY_REFRESH_OFFSET_MS = (5 * 60 + 15) * 60 * 1_000;

export const MTA_PRESS_RELEASE_CACHE_TAG = "mta-press-release-spotlight";

export type { MtaPressRelease } from "@/lib/mta-press-release-parser";

type DrupalAjaxCommand = {
  command?: string;
  data?: unknown;
};

export async function getLatestMtaAccessibilityPressRelease() {
  const refreshBucket = getDailyRefreshBucket();

  try {
    const release = await getCachedMtaAccessibilityPressRelease(refreshBucket);

    if (release) {
      return release;
    }
  } catch {
    // Fall through to the previous daily snapshot when today's refresh fails.
  }

  return getCachedMtaAccessibilityPressRelease(
    String(Number(refreshBucket) - 1),
  ).catch(() => null);
}

export async function refreshLatestMtaAccessibilityPressRelease() {
  return getCachedMtaAccessibilityPressRelease(getDailyRefreshBucket());
}

export async function fetchLatestMtaAccessibilityPressRelease() {
  const pages = await Promise.all(
    Array.from({ length: PRESS_RELEASE_PAGES_TO_SCAN }, (_, page) =>
      fetchPressReleasePage(page),
    ),
  );
  const releases = pages.flat();

  return (
    releases
      .filter((release) => isSubwayAccessibilityRelease(release.title))
      .sort(
        (left, right) =>
          Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
      )[0] ?? null
  );
}

const getCachedMtaAccessibilityPressRelease = unstable_cache(
  async (refreshBucket: string) => {
    void refreshBucket;
    return fetchLatestMtaAccessibilityPressRelease();
  },
  ["latest-mta-accessibility-press-release"],
  {
    revalidate: PRESS_RELEASE_CACHE_RETENTION_SECONDS,
    tags: [MTA_PRESS_RELEASE_CACHE_TAG],
  },
);

export function formatMtaPressReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "America/New_York",
    year: "numeric",
  }).format(new Date(value));
}

async function fetchPressReleasePage(page: number) {
  const params = new URLSearchParams({
    page: String(page),
    view_display_id: "block_1",
    view_name: "index_press_release",
    view_path: "press-release",
  });
  const url = `${MTA_PRESS_RELEASE_VIEW_URL}?${params.toString()}`;
  const response = await fetchPressReleaseResponse(url);

  const commands = (await response.json()) as DrupalAjaxCommand[];
  const markup = commands.find(
    (command) =>
      command.command === "insert" &&
      typeof command.data === "string" &&
      command.data.includes("view-index-press-release"),
  )?.data;

  return typeof markup === "string" ? parsePressReleaseMarkup(markup) : [];
}

async function fetchPressReleaseResponse(url: string) {
  for (let attempt = 1; attempt <= PRESS_RELEASE_REQUEST_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      if (attempt === PRESS_RELEASE_REQUEST_ATTEMPTS) {
        throw createPressReleaseRequestError(url, attempt, error);
      }

      await waitForRetry(attempt, url, describeError(error));
      continue;
    }

    if (response.ok) {
      return response;
    }

    const error = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    if (!isRetryableStatus(response.status)) {
      throw createPressReleaseRequestError(url, attempt, error);
    }

    if (attempt === PRESS_RELEASE_REQUEST_ATTEMPTS) {
      throw createPressReleaseRequestError(url, attempt, error);
    }

    await response.body?.cancel().catch(() => {});
    await waitForRetry(attempt, url, describeError(error));
  }

  throw new Error(`MTA press release request failed for ${url}.`);
}

function getDailyRefreshBucket(now = Date.now()) {
  return String(
    Math.floor((now - DAILY_REFRESH_OFFSET_MS) / DAILY_REFRESH_INTERVAL_MS),
  );
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function waitForRetry(attempt: number, url: string, reason: string) {
  const delayMs = PRESS_RELEASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  console.warn(
    `MTA press release request attempt ${attempt}/${PRESS_RELEASE_REQUEST_ATTEMPTS} failed for ${url}: ${reason}. Retrying in ${delayMs}ms.`,
  );
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function createPressReleaseRequestError(
  url: string,
  attempts: number,
  error: unknown,
) {
  return new Error(
    `MTA press release request failed for ${url} after ${attempts} attempts: ${describeError(error)}`,
    { cause: error },
  );
}

function describeError(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
