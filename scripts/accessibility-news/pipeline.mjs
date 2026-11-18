// Turns raw items from MTA, news sites and Reddit into a feed, groups
// evidence per station, and applies verified openings to the station data.

import { createHash } from "node:crypto";
import {
  buildStationIndex,
  classifyUrl,
  detectOpening,
  hasNycSignal,
  NATIONAL_NEWS_DOMAINS,
  isAccessibilitySubject,
  resolveStations,
} from "./classify.mjs";

export const NEWS_FILE_VERSION = 2;
const FEED_LIMIT = 160;
// MTA-published sources that aren't press releases.
const MTA_KINDS = new Set(["mta", "capital", "newsletter"]);
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
  if (raw.kind === "equipment") return evaluateEquipmentItem(raw, index, review);
  const title = raw.title.trim();
  const lead =
    raw.kind === "reddit" ? raw.body ?? "" : raw.lead ?? "";
  const subjectText = `${title} ${lead}`;

  let tier;
  let proofUrls = [];
  if (MTA_KINDS.has(raw.kind)) {
    tier = "official";
    proofUrls = [raw.url];
  } else if (raw.kind === "news") {
    const fromSource = classifyUrl(raw.sourceUrl || raw.url);
    tier = fromSource.tier === "community" ? "unverified" : fromSource.tier;
    const nationalCheckText = `${title} ${raw.lead ?? ""}`;
    const national = NATIONAL_NEWS_DOMAINS.some(
      (domain) => fromSource.domain === domain || fromSource.domain.endsWith(`.${domain}`),
    );
    if (tier === "news" && national && !hasNycSignal(nationalCheckText)) tier = "unverified";
    // Prefer the publisher's own link over the Google News redirect.
    proofUrls = [raw.articleUrl || raw.url];
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
            publishedAt: raw.publishedAt,
            // An article read for a vague headline may name the lines further
            // down, so scan all of it for route bullets.
            routeText: `${title}. ${raw.glimpse === "found" ? lead : lead.slice(0, 600)}`,
            text: `${title}. ${lead.slice(0, raw.kind === "reddit" ? 400 : 900)}`,
          },
          index,
        )
      : { mentions: [], reason: rejected ? "rejected" : "not-opening", rows: [] };

  const rejectStations = new Set(review.rejectStations ?? []);
  const matchedRows = resolution.rows.filter(
    (rowIndex) => !rejectStations.has(stationKey(index.stations[rowIndex])),
  );
  // Capital dashboard milestones track progress; they can back up an opening
  // found elsewhere but never change a station on their own.
  const supportOnly = raw.kind === "capital";
  const rows = supportOnly ? [] : matchedRows;

  // Show which station a report was about even when nothing needed changing.
  const keyToIndex = raw.stationKeys?.length
    ? new Map(index.stations.map((row, rowIndex) => [stationKey(row), rowIndex]))
    : null;
  const listedRows = (raw.stationKeys ?? [])
    .map((key) => keyToIndex.get(key))
    .filter((value) => value !== undefined);
  const shownRows =
    matchedRows.length > 0
      ? matchedRows
      : (resolution.alreadyAccessibleRows ?? []).length > 0
        ? resolution.alreadyAccessibleRows
        : listedRows;

  let status;
  if (detection.tentative && !rejected) status = rows.length > 0 ? "needs-review" : resolution.reason === "already-accessible" ? "already-accessible" : "news";
  else if (!detection.isOpening) status = rejected ? "rejected" : "news";
  else if (supportOnly) status = "news";
  else if (rows.length > 0) status = tier === "official" || tier === "news" ? "verified" : "needs-review";
  else if (resolution.reason === "already-accessible") status = "already-accessible";
  else status = "needs-review";

  return {
    id: itemId(raw.url),
    item: {
      discussionUrl: raw.kind === "reddit" ? raw.url : null,
      glimpse: raw.glimpse,
      glimpsedAt: raw.glimpsedAt,
      id: itemId(raw.url),
      kind: raw.kind,
      opening: detection.isOpening || (detection.tentative && rows.length > 0),
      tentative: detection.tentative,
      partial: detection.partial,
      proofUrls,
      publishedAt: raw.publishedAt,
      reason: resolution.reason,
      stationsFromArticle: Boolean(
        raw.glimpse === "found" &&
          shownRows.length > 0 &&
          ["ambiguous", "no-station"].includes(
            resolveStations({ publishedAt: raw.publishedAt, text: title }, index).reason,
          ),
      ),
      source: raw.kind === "reddit" ? `r/${raw.subreddit || "reddit"}` : raw.sourceName || classifyUrl(raw.url).domain,
      stations: shownRows.map((rowIndex) => describeRow(index.stations[rowIndex])),
      status,
      subject: raw.kind === "capital" || isAccessibilitySubject(subjectText),
      ...(raw.projectTitle ? { projectTitle: raw.projectTitle } : {}),
      // The MTA's own milestone note from the dashboard's open data.
      ...(raw.kind === "capital" && raw.lead ? { detail: raw.lead.slice(0, 280) } : {}),
      tier,
      title,
      url: proofUrls[0] ?? raw.url,
    },
    // Stations this report is about that are already accessible; used to add
    // corroborating sources to openings the tracker found earlier.
    corroborates: detection.isOpening && !rejected ? shownRows.filter((rowIndex) => !rows.includes(rowIndex)) : [],
    // (capital items reach openings only through corroborates)
    rows,
  };
}

/**
 * Equipment items come with their station rows resolved from the MTA
 * inventory. New ADA elevators reaching both directions' platforms make a
 * station accessible; one direction makes it partially accessible.
 */
function evaluateEquipmentItem(raw, index, review) {
  const keyToIndex = new Map(index.stations.map((row, rowIndex) => [stationKey(row), rowIndex]));
  const rows = (raw.rowKeys ?? []).map((key) => keyToIndex.get(key)).filter((value) => value !== undefined);
  const rejected = (review.rejectUrls ?? []).includes(raw.url);
  const hasAdaElevator = (raw.equipment ?? []).some((unit) => unit.kind === "Elevator" && unit.ada);
  const opening = !rejected && hasAdaElevator && raw.coverage !== "none";
  const partial = raw.coverage === "one";
  const rejectStations = new Set(review.rejectStations ?? []);

  const eligible = opening
    ? rows.filter((rowIndex) => {
        const row = index.stations[rowIndex];
        if (rejectStations.has(stationKey(row))) return false;
        return partial
          ? row.accessibilityStatus === "Not accessible"
          : row.accessibilityStatus !== "Accessible";
      })
    : [];

  const status = rejected
    ? "rejected"
    : eligible.length > 0
      ? "verified"
      : opening && rows.length > 0
        ? "already-accessible"
        : "news";

  return {
    corroborates: opening ? rows.filter((rowIndex) => !eligible.includes(rowIndex)) : [],
    id: itemId(raw.url),
    item: {
      discussionUrl: null,
      equipment: raw.equipment,
      id: itemId(raw.url),
      kind: "equipment",
      opening,
      partial,
      proofUrls: [raw.url],
      publishedAt: raw.publishedAt,
      reason: eligible.length > 0 ? "matched" : rows.length > 0 ? "already-accessible" : "no-station",
      source: raw.sourceName,
      stations: rows.map((rowIndex) => describeRow(index.stations[rowIndex])),
      status,
      subject: true,
      tier: "official",
      title: raw.title,
      url: raw.url,
    },
    rows: eligible,
  };
}

const GLIMPSE_RETRY_MS = 7 * 24 * 60 * 60 * 1_000;
const GLIMPSE_LIMIT_PER_RUN = 15;

/**
 * For opening headlines that don't name the station (or don't say which
 * line), read the article's opening paragraphs so the station can be found.
 * Results are cached in the news file: a found article is never re-read,
 * and an unavailable one is retried weekly.
 */
export async function enrichWithGlimpses({ accessibilityData, fetchGlimpse, now = new Date(), previous, rawItems }) {
  const index = buildStationIndex(accessibilityData.stations);
  const previousById = new Map((previous?.feed ?? []).map((item) => [item.id, item]));
  const log = [];
  const byUrl = new Map();
  let fetched = 0;

  for (const raw of rawItems) {
    if (raw.kind !== "news" || raw.lead) continue;
    // The same story often comes back from several searches; read it once.
    const earlier = byUrl.get(raw.url);
    if (earlier) {
      for (const key of ["articleUrl", "glimpse", "glimpsedAt", "lead"]) {
        if (earlier[key] !== undefined) raw[key] = earlier[key];
      }
      continue;
    }
    byUrl.set(raw.url, raw);
    const detection = detectOpening({ title: raw.title });
    if (!detection.isOpening) continue;
    const resolution = resolveStations({ publishedAt: raw.publishedAt, text: raw.title }, index);
    if (resolution.reason !== "no-station" && resolution.reason !== "ambiguous") continue;

    const cached = previousById.get(itemId(raw.url));
    if (cached?.glimpse === "found") {
      Object.assign(raw, { articleUrl: cached.url, glimpse: "found", glimpsedAt: cached.glimpsedAt });
      continue;
    }
    if (cached?.glimpse === "unavailable" && now - Date.parse(cached.glimpsedAt ?? 0) < GLIMPSE_RETRY_MS) {
      Object.assign(raw, { glimpse: "unavailable", glimpsedAt: cached.glimpsedAt });
      continue;
    }
    if (fetched >= GLIMPSE_LIMIT_PER_RUN) continue;
    fetched += 1;

    const glimpse = await fetchGlimpse(raw);
    if (glimpse?.text) {
      Object.assign(raw, {
        articleUrl: glimpse.articleUrl,
        glimpse: "found",
        glimpsedAt: now.toISOString(),
        lead: glimpse.text,
      });
      log.push({ found: true, title: raw.title, via: glimpse.via });
    } else {
      Object.assign(raw, { glimpse: "unavailable", glimpsedAt: now.toISOString() });
      log.push({ failures: glimpse?.failures ?? [], found: false, title: raw.title });
    }
  }
  return log;
}

/** Group evidence by station and decide which openings are safe to apply. */
export function buildOpenings(evaluated, index, previousOpenings = []) {
  const byStation = new Map();
  for (const opening of previousOpenings) {
    byStation.set(opening.key, { ...opening, evidence: [...opening.evidence] });
  }

  for (const { corroborates = [], item, rows } of evaluated) {
    if (item.tentative) continue;
    // Only extend openings already on record; never create one from a report
    // about a station that was accessible before the tracker saw it.
    const targets = [
      ...(item.opening ? rows : []),
      ...corroborates.filter((rowIndex) => {
        const existing = byStation.get(stationKey(index.stations[rowIndex]));
        if (!existing?.openedAt) return false;
        // Coverage around the opening, not a later elevator replacement.
        const offsetDays = (Date.parse(item.publishedAt) - Date.parse(existing.openedAt)) / 864e5;
        return offsetDays >= -14 && offsetDays <= 90;
      }),
    ];
    for (const rowIndex of targets) {
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
      // Lead with the most readable trusted source (a press release before
      // an inventory record); the opening date still uses the earliest one.
      const KIND_RANK = { mta: 3, news: 2, equipment: 1, reddit: 0 };
      const evidence = entry.evidence.sort(
        (left, right) =>
          TIER_RANK[right.tier] - TIER_RANK[left.tier] ||
          (KIND_RANK[right.kind] ?? 0) - (KIND_RANK[left.kind] ?? 0) ||
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
        primarySource: best ? { kind: best.kind, source: best.source, title: best.title, url: best.url } : null,
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
  equipment: "MTA elevator & escalator data",
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
      // An earlier source (e.g. MTA equipment data showing the elevators in
      // service before the press release) moves the date of an opening this
      // tracker applied. Hand-curated dates are left alone.
      const trackerOverride = accessibilityData.sourceOverrides.find(
        (entry) =>
          entry.verifiedBy === "accessibility-news-sync" &&
          entry.station === row.station &&
          (!entry.services || entry.services.join("/") === row.services.join("/")),
      );
      const effectiveDate = formatEffectiveDate(opening.openedAt);
      if (opening.applied && trackerOverride && row.dateMadeAccessible !== effectiveDate) {
        const before = row.dateMadeAccessible;
        row.dateMadeAccessible = effectiveDate;
        trackerOverride.effectiveDate = effectiveDate;
        changes.push({ after: row.accessibilityStatus, before: `${row.accessibilityStatus} (${before})`, date: effectiveDate, key: opening.key });
      }
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
      source:
        opening.primarySource?.kind === "equipment"
          ? SOURCE_LABEL.equipment
          : SOURCE_LABEL[opening.verification],
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
export function buildNewsFile({ accessibilityData, extras = {}, now, previous, rawItems, review, sources }) {
  const index = buildStationIndex(accessibilityData.stations);
  const evaluated = [];
  const seen = new Set();

  const previousById = new Map((previous?.feed ?? []).map((item) => [item.id, item]));
  for (const raw of rawItems) {
    const cached = previousById.get(itemId(raw.url));
    if (cached?.glimpse === "found" && !raw.lead && raw.glimpse === "found") {
      // Read on an earlier run; article text isn't stored, so keep that result.
      if (seen.has(cached.url)) continue;
      seen.add(cached.url);
      evaluated.push({ id: cached.id, item: cached, rows: [] });
      continue;
    }
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
      // Caches for the capital dashboard diff and the newsletter reader.
      capitalSnapshot: extras.capitalSnapshot ?? previous?.capitalSnapshot ?? null,
      newsletterIssues: extras.newsletterIssues ?? previous?.newsletterIssues ?? [],
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
    JSON.stringify({
      capitalSnapshot: file.capitalSnapshot ?? null,
      feed: file.feed,
      newsletterIssues: (file.newsletterIssues ?? []).map((issue) => issue.url),
      openings: file.openings?.map(withoutTimestamps),
    });
  return strip(previous) !== strip(next);
}
