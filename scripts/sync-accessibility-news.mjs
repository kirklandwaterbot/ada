#!/usr/bin/env node
// Accessibility news auto-updater.
//
// Pulls MTA press releases, NYC news coverage (Google News RSS) and Reddit
// posts, detects newly accessible subway/SIR stations, and applies openings
// that have trustworthy proof to data/accessibility-stations.json. Everything
// it found — applied or not — is written to data/accessibility-news.json so
// the site can show the proof behind each change.
//
// Usage:
//   node scripts/sync-accessibility-news.mjs            # fetch + write
//   node scripts/sync-accessibility-news.mjs --dry-run  # fetch, print, no writes
//   node scripts/sync-accessibility-news.mjs --fixtures path/to/items.json

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyMarkerUpdates,
  buildNewsFile,
  enrichWithGlimpses,
  hasMeaningfulChange,
} from "./accessibility-news/pipeline.mjs";
import {
  fetchArticleGlimpse,
  fetchGoogleNews,
  fetchMtaReleases,
  fetchReddit,
} from "./accessibility-news/sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIONS_FILE = path.join(root, "data/accessibility-stations.json");
const NEWS_FILE = path.join(root, "data/accessibility-news.json");
const REVIEW_FILE = path.join(root, "data/accessibility-news-review.json");
const MARKERS_FILE = path.join(root, "data/accessible-station-coordinates.json");
const PLANNED_FILE = path.join(root, "data/planned-ada-station-coordinates.json");
const LOOKBACK_DAYS = Number(process.env.ACCESSIBILITY_NEWS_LOOKBACK_DAYS ?? 150);
const HEARTBEAT_MS = 24 * 60 * 60 * 1_000;

const args = new Set(process.argv.slice(2));
const fixturesIndex = process.argv.indexOf("--fixtures");
const fixturesPath = fixturesIndex > -1 ? process.argv[fixturesIndex + 1] : null;
const dryRun = args.has("--dry-run");

const now = new Date();
const accessibilityData = JSON.parse(await readFile(STATIONS_FILE, "utf8"));
const previous = await readJsonIfExists(NEWS_FILE);
const review = (await readJsonIfExists(REVIEW_FILE)) ?? {};

const { rawItems, sources } = fixturesPath
  ? await loadFixtures(fixturesPath)
  : await collect();

const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1_000;
const recentItems = rawItems.filter(
  (item) => now.getTime() - Date.parse(item.publishedAt) <= lookbackMs,
);

// Read the article behind headlines that don't name the station.
const glimpses = await enrichWithGlimpses({
  accessibilityData,
  fetchGlimpse: fixturesPath
    ? async (item) => item.fixtureGlimpse ?? null
    : (item) => fetchArticleGlimpse(item),
  now,
  previous,
  rawItems: recentItems,
});
if (glimpses.length > 0) {
  console.log("\nRead articles for headlines without a station:");
  for (const glimpse of glimpses) {
    console.log(`  ${glimpse.found ? `✓ via ${glimpse.via}` : "✗ not available"}  ${glimpse.title}`);
  }
}

const { changes, file } = buildNewsFile({
  accessibilityData,
  now,
  previous,
  rawItems: recentItems,
  review,
  sources,
});

printReport(file, changes);

const allFailed = sources.length > 0 && sources.every((source) => source.status === "failed");
if (allFailed && !fixturesPath) {
  console.warn("::warning::Every accessibility news source failed; keeping the previous snapshot.");
  process.exit(0);
}

if (dryRun) {
  console.log("\nDry run: no files written.");
  process.exit(0);
}

const stale = !previous || now.getTime() - Date.parse(previous.checkedAt ?? 0) > HEARTBEAT_MS;
if (hasMeaningfulChange(previous, file) || stale || changes.length > 0) {
  await writeFile(NEWS_FILE, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(root, NEWS_FILE)}.`);
} else {
  console.log("No new accessibility news since the last snapshot.");
}

if (changes.length > 0) {
  await writeFile(STATIONS_FILE, `${JSON.stringify(accessibilityData, null, 2)}\n`, "utf8");
  console.log(`Updated ${changes.length} station row(s) in ${path.relative(root, STATIONS_FILE)}.`);
}

// Map markers follow every applied opening (also repairs a previous run that
// updated station rows but not markers).
const markersData = JSON.parse(await readFile(MARKERS_FILE, "utf8"));
const plannedData = JSON.parse(await readFile(PLANNED_FILE, "utf8"));
const markerUpdates = applyMarkerUpdates(markersData, plannedData, file.openings);
if (markerUpdates > 0) {
  await writeFile(MARKERS_FILE, `${JSON.stringify(markersData, null, 2)}\n`, "utf8");
  console.log(`Updated ${markerUpdates} accessible-station map marker(s).`);
}

async function collect() {
  const sources = [];
  const rawItems = [];
  const runs = [
    ["MTA press releases", "mta", () => fetchMtaReleases({ lookbackMs: LOOKBACK_DAYS * 864e5 })],
    ["News outlets (Google News)", "news", () => fetchGoogleNews({ windowDays: LOOKBACK_DAYS })],
    ["Reddit", "reddit", () => fetchReddit({})],
  ];

  for (const [name, kind, run] of runs) {
    console.log(`Checking ${name}…`);
    try {
      const result = await run();
      rawItems.push(...result.items);
      sources.push({
        checkedAt: new Date().toISOString(),
        itemCount: result.items.length,
        kind,
        mode: result.mode,
        name,
        status: "ok",
      });
    } catch (error) {
      console.warn(`::warning::${name} failed: ${error instanceof Error ? error.message : error}`);
      const previousSource = previous?.sources?.find((source) => source.kind === kind);
      sources.push({
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message.slice(0, 200) : String(error),
        itemCount: 0,
        kind,
        lastSuccessAt:
          previousSource?.status === "ok" ? previousSource.checkedAt : previousSource?.lastSuccessAt ?? null,
        name,
        status: "failed",
      });
    }
  }

  return { rawItems, sources };
}

async function loadFixtures(file) {
  const fixture = JSON.parse(await readFile(path.resolve(file), "utf8"));
  return {
    rawItems: fixture.items,
    sources: [{ checkedAt: now.toISOString(), itemCount: fixture.items.length, kind: "fixture", name: "Fixtures", status: "ok" }],
  };
}

function printReport(file, changes) {
  console.log("\nSources:");
  for (const source of file.sources) {
    console.log(`  ${source.status === "ok" ? "✓" : "✗"} ${source.name}: ${source.status === "ok" ? `${source.itemCount} items${source.mode ? ` (${source.mode})` : ""}` : source.error}`);
  }

  const openingItems = file.feed.filter((item) => item.opening);
  console.log(`\nOpening reports (${openingItems.length}):`);
  for (const item of openingItems.slice(0, 25)) {
    const where = item.stations.map((station) => `${station.station} (${station.services.join("/")})`).join(", ");
    console.log(`  [${item.status}] [${item.tier}] ${item.title} — ${where || item.reason} <${item.url}>`);
  }

  console.log(`\nStation openings tracked: ${file.openings.length}`);
  for (const opening of file.openings.slice(0, 15)) {
    console.log(
      `  ${opening.applied ? "✓ applied" : opening.readyToApply ? "• ready" : "? review"}  ${opening.station} (${opening.services.join("/")}) → ${opening.resultingStatus}, ${opening.openedAt.slice(0, 10)}, ${opening.verification}, ${opening.evidence.length} source(s)`,
    );
  }

  console.log(changes.length ? `\nApplied ${changes.length} change(s):` : "\nNo station changes applied.");
  for (const change of changes) {
    console.log(`  ${change.key}: ${change.before} → ${change.after} (${change.date})`);
  }
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
