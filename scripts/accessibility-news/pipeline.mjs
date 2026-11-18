// Turns raw items from MTA, news sites and Reddit into a feed, groups
// evidence per station, and applies verified openings to the station data.

import { createHash } from "node:crypto";
import {
  buildStationIndex,
  classifyUrl,
  hasNycSignal,
  NATIONAL_NEWS_DOMAINS,
  detectOpening,
  isAccessibilitySubject,
  resolveStations,
} from "./classify.mjs";

export const NEWS_FILE_VERSION = 2;
const FEED_LIMIT = 80;
const TIER_RANK = { official: 3, news: 2, community: 1, unverified: 0 };

export function itemId(url) {
  return createHash("sha1").update(String(url)).digest("hex").slice(0, 12);
}

export function stationKey(row) {
  return `${row.station}|${row.line}|${row.services.join("/")}`;
}

export function stationSlug(row) {
  return [row.station, row.line, row.services.join("-")]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function describeRow(row) {
  return {
    line: row.line,
    services: row.services.map(String),
    slug: stationSlug(row),
    station: row.station,
  };
}

/**
 * Work out what a single raw item proves.
 * Reddit posts only count as proof through what they link to (an MTA page,
 * a recognised news outlet) or, at a lower tier, a photo/video of the opening.
 */
export function evaluateItem(raw, index, { review = {} } = {}) {
  const title = raw.title.trim();
  const lead = raw.kind === "mta" ? raw.lead ?? "" : raw.kind === "reddit" ? raw.body ?? "" : "";
  const subjectText = `${title} ${lead}`;

  let tier;
  let proofUrls = [];
  if (raw.kind === "mta") {
    tier = "official";
    proofUrls = [raw.url];
  } else if (raw.kind === "news") {
    const fromSource = classifyUrl(raw.sourceUrl || raw.url);
    tier = fromSource.tier === "community" ? "unverified" : fromSource.tier;
    const national = NATIONAL_NEWS_DOMAINS.some(
      (domain) => fromSource.domain === domain || fromSource.domain.endsWith(`.${domain}`),
    );
    if (tier === "news" && national && !hasNycSignal(title)) tier = "unverified";
    proofUrls = [raw.url];
  } else {
    const linked = (raw.linkedUrls ?? []).map((url) => ({ url, ...classifyUrl(url) }));
    const best = linked
      .filter((link) => link.tier === "official" || link.tier === "news")
      .sort((left, right) => TIER_RANK[right.tier] - TIER_RANK[left.tier])[0];
    if (best) {
      tier = best.tier;
      proofUrls = linked.filter((link) => link.tier === best.tier).map((link) => link.url);
    } else if (raw.media) {
      tier = "community";
      proofUrls = linked.filter((link) => link.tier === "community").map((link) => link.url);
    } else {
      tier = "unverified";
    }
  }

  const detection = detectOpening({ title, lead });
  const rejected =
    (review.rejectUrls ?? []).includes(raw.url) ||
    proofUrls.some((url) => (review.rejectUrls ?? []).includes(url));

  const considered = detection.isOpening || detection.tentative;
  const resolution =
    considered && !rejected
      ? resolveStations(
          {
            partial: detection.partial,
            routeText: `${title}. ${lead.slice(0, 600)}`,
            text: `${title}. ${lead.slice(0, raw.kind === "mta" ? 900 : 400)}`,
          },
          index,
        )
      : { mentions: [], reason: rejected ? "rejected" : "not-opening", rows: [] };

  const rejectStations = new Set(review.rejectStations ?? []);
  const rows = resolution.rows.filter(
    (rowIndex) => !rejectStations.has(stationKey(index.stations[rowIndex])),
  );

  let status;
  if (detection.tentative && !rejected) status = rows.length > 0 ? "needs-review" : resolution.reason === "already-accessible" ? "already-accessible" : "news";
  else if (!detection.isOpening) status = rejected ? "rejected" : "news";
  else if (rows.length > 0) status = tier === "official" || tier === "news" ? "verified" : "needs-review";
  else if (resolution.reason === "already-accessible") status = "already-accessible";
  else status = "needs-review";

  return {
    id: itemId(raw.url),
    item: {
      discussionUrl: raw.kind === "reddit" ? raw.url : null,
      id: itemId(raw.url),
      kind: raw.kind,
      opening: detection.isOpening || (detection.tentative && rows.length > 0),
      tentative: detection.tentative,
      partial: detection.partial,
      proofUrls,
      publishedAt: raw.publishedAt,
      reason: resolution.reason,
      source: raw.kind === "reddit" ? `r/${raw.subreddit || "reddit"}` : raw.sourceName || classifyUrl(raw.url).domain,
      stations: rows.map((rowIndex) => describeRow(index.stations[rowIndex])),
      status,
      subject: isAccessibilitySubject(subjectText),
      tier,
      title,
      url: proofUrls[0] ?? raw.url,
    },
    rows,
  };
}

/** Group evidence by station and decide which openings are safe to apply. */
export function buildOpenings(evaluated, index, previousOpenings = []) {
  const byStation = new Map();
  for (const opening of previousOpenings) {
    byStation.set(opening.key, { ...opening, evidence: [...opening.evidence] });
  }

  for (const { item, rows } of evaluated) {
    if (!item.opening || item.tentative) continue;
    for (const rowIndex of rows) {
      const row = index.stations[rowIndex];
      const key = stationKey(row);
      const entry =
        byStation.get(key) ??
        {
          ...describeRow(row),
          applied: false,
          evidence: [],
          key,
        };
      if (!entry.evidence.some((evidence) => evidence.id === item.id)) {
        entry.evidence.push({
          discussionUrl: item.discussionUrl,
          id: item.id,
          kind: item.kind,
          partial: item.partial,
          publishedAt: item.publishedAt,
          source: item.source,
          tier: item.tier,
          title: item.title,
          url: item.url,
        });
      }
      byStation.set(key, entry);
    }
  }

  return [...byStation.values()]
    .map((entry) => {
      const evidence = entry.evidence.sort(
        (left, right) =>
          TIER_RANK[right.tier] - TIER_RANK[left.tier] ||
          Date.parse(left.publishedAt) - Date.parse(right.publishedAt),
      );
      const trusted = evidence.filter((item) => item.tier === "official" || item.tier === "news");
      const communityAuthors = new Set(
        evidence.filter((item) => item.tier === "community").map((item) => item.discussionUrl),
      );
      const best = trusted[0] ?? evidence[0];
      const verification = trusted.some((item) => item.tier === "official")
        ? "official"
        : trusted.length > 0
          ? "news"
          : "community";
      const dated = (trusted.length ? trusted : evidence)
        .map((item) => Date.parse(item.publishedAt))
        .filter(Number.isFinite);
      const partial = (trusted.length ? trusted : evidence).every((item) => item.partial);

      return {
        ...entry,
        evidence,
        openedAt: new Date(Math.min(...dated)).toISOString(),
        primarySource: best ? { source: best.source, title: best.title, url: best.url } : null,
        readyToApply: trusted.length > 0 || communityAuthors.size >= 2,
        resultingStatus: partial ? "Partially accessible" : "Accessible",
        verification,
      };
    })
    .sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt));
}

export function formatEffectiveDate(iso) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "America/New_York",
    year: "numeric",
  }).format(new Date(iso));
}

const SOURCE_LABEL = {
  community: "Community reports with photo proof (Reddit)",
  news: "News coverage",
  official: "MTA press release",
};

/** Apply ready openings to accessibility-stations.json data. Returns a change log. */
export function applyOpenings(accessibilityData, openings) {
  const changes = [];
  const rowsByKey = new Map(accessibilityData.stations.map((row) => [stationKey(row), row]));
  accessibilityData.sourceOverrides ??= [];

  for (const opening of openings) {
    if (!opening.readyToApply) continue;
    const row = rowsByKey.get(opening.key);
    if (!row) continue;

    const target = opening.resultingStatus;
    const alreadyThere =
      row.accessibilityStatus === "Accessible" ||
      (target === "Partially accessible" && row.accessibilityStatus === "Partially accessible");

    if (alreadyThere) {
      opening.applied = opening.applied || false;
      continue;
    }

    const before = row.accessibilityStatus;
    row.accessibilityStatus = target;
    row.accessibilityRaw = target === "Accessible" ? "♿" : "♿ (partial)";
    row.dateMadeAccessible = formatEffectiveDate(opening.openedAt);
    if (target === "Accessible") {
      row.plannedAda = false;
      row.plannedAdaNote = "";
    }
    opening.applied = true;
    opening.appliedAt = new Date().toISOString();

    const override = {
      effectiveDate: row.dateMadeAccessible,
      evidence: `${opening.evidence.length === 1 ? "1 source reports" : `${opening.evidence.length} sources report`} this station ${target === "Accessible" ? "is now fully accessible" : "now has partial accessible access"}: ${opening.evidence
        .slice(0, 3)
        .map((item) => `${item.source} — “${item.title}”`)
        .join("; ")}.`,
      line: row.line,
      services: row.services,
      source: SOURCE_LABEL[opening.verification],
      sourceUrl: opening.primarySource?.url ?? "",
      station: row.station,
      verifiedBy: "accessibility-news-sync",
    };
    const existing = accessibilityData.sourceOverrides.findIndex(
      (entry) =>
        entry.station === row.station &&
        (!entry.services || entry.services.join("/") === row.services.join("/")),
    );
    if (existing >= 0) accessibilityData.sourceOverrides[existing] = override;
    else accessibilityData.sourceOverrides.push(override);

    changes.push({ after: target, before, date: row.dateMadeAccessible, key: opening.key });
  }

  if (changes.length) accessibilityData.summary = recomputeSummary(accessibilityData);
  return changes;
}

/**
 * Keep the supplemental accessible-station map markers in step with applied
 * openings: upgrade an existing partial marker, or add a marker from the
 * planned-ADA coordinates so the station appears before MTA's equipment
 * inventory catches up.
 */
export function applyMarkerUpdates(markersData, plannedData, openings) {
  let updated = 0;
  for (const opening of openings) {
    if (!opening.applied) continue;
    const full = opening.resultingStatus === "Accessible";
    const matches = (entry) =>
      entry.station === opening.station &&
      entry.services.map(String).some((service) => opening.services.includes(service));

    const existing = markersData.stations.find(matches);
    if (existing) {
      if (full && existing.statusLabel !== "Accessible station") {
        existing.statusLabel = "Accessible station";
        existing.upgradedBy = "accessibility-news-sync";
        existing.sourceUrl = opening.primarySource?.url;
        updated += 1;
      }
      continue;
    }

    const planned = plannedData.stations.find(matches);
    if (!planned) continue;
    markersData.stations.push({
      accessMethod: "elevator",
      coordinateSource: planned.coordinateSource,
      id: `${opening.station.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}-${opening.services.join("-")}-${opening.line}`,
      latitude: planned.latitude,
      line: opening.line,
      longitude: planned.longitude,
      services: opening.services,
      sourceUrl: opening.primarySource?.url,
      station: opening.station,
      statusLabel: full ? "Accessible station" : "Partially accessible station",
      verifiedBy: "accessibility-news-sync",
    });
    updated += 1;
  }
  return updated;
}

export function recomputeSummary(accessibilityData) {
  const rows = accessibilityData.stations;
  const sir = rows.filter((row) => row.services.map(String).includes("SIR"));
  return {
    ...accessibilityData.summary,
    accessible: rows.filter((row) => row.accessibilityStatus === "Accessible").length,
    notAccessible: rows.filter((row) => row.accessibilityStatus === "Not accessible").length,
    partiallyAccessible: rows.filter((row) => row.accessibilityStatus === "Partially accessible").length,
    plannedAda: rows.filter((row) => row.plannedAda).length,
    sirAccessible: sir.filter((row) => row.accessibilityStatus === "Accessible").length,
    sirPlannedAda: sir.filter((row) => row.plannedAda).length,
    statenIslandStations: sir.length,
    totalStations: rows.length,
  };
}

/** Merge a fresh run into the persisted news file. */
export function buildNewsFile({ accessibilityData, now, previous, rawItems, review, sources }) {
  const index = buildStationIndex(accessibilityData.stations);
  const evaluated = [];
  const seen = new Set();

  for (const raw of rawItems) {
    const evaluation = evaluateItem(raw, index, { review });
    const dedupeKey = evaluation.item.url;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (!evaluation.item.subject) continue;
    evaluated.push(evaluation);
  }

  const previousOpenings = (previous?.openings ?? []).filter(
    (opening) => !(review.rejectStations ?? []).includes(opening.key),
  );
  const openings = buildOpenings(evaluated, index, previousOpenings);
  const changes = applyOpenings(accessibilityData, openings);

  const freshFeed = evaluated.map(({ item }) => item);
  const feedById = new Map((previous?.feed ?? []).map((item) => [item.id, item]));
  for (const item of freshFeed) feedById.set(item.id, item);
  const feed = [...feedById.values()]
    .filter((item) => !(review.rejectUrls ?? []).includes(item.url))
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, FEED_LIMIT);

  return {
    changes,
    file: {
      version: NEWS_FILE_VERSION,
      checkedAt: now.toISOString(),
      methodology:
        "Openings are applied automatically only when an MTA/NY State/NYC government page or a recognised NYC news outlet reports that a specific station is now accessible. Reddit posts count through the official or news links they cite; photo-only Reddit reports need two independent posts and are otherwise held for review. Ambiguous station names are never guessed.",
      sources,
      openings,
      feed,
    },
  };
}

/** Compare everything except timestamps so scheduled runs don't churn git. */
export function hasMeaningfulChange(previous, next) {
  if (!previous) return true;
  const withoutTimestamps = (opening) => {
    const copy = { ...opening };
    delete copy.appliedAt;
    return copy;
  };
  const strip = (file) =>
    JSON.stringify({ feed: file.feed, openings: file.openings?.map(withoutTimestamps) });
  return strip(previous) !== strip(next);
}
