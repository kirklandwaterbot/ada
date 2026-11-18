// MTA Capital Program Dashboard as a news source.
//
// The daily sync already snapshots every elevator, escalator and ADA project
// from the dashboard's open data (data/mta-capital-elevator-escalator-
// projects.json). Each project carries dated milestones ("Schedule
// Adjustment: completion delay due to utility relocation work at 137
// Street", "Progress Update: Work at Northern Blvd …") plus its phase and
// estimated completion. This module turns recent milestones, phase changes
// and completion-date changes into feed items.

import { buildStationIndex, findStationMentions, normalizeStationText } from "./classify.mjs";

export const capitalDashboardUrl = (externalId) =>
  `https://capitaldashboard.mta.info/?projectId=${encodeURIComponent(externalId)}`;

const stationKey = (row) => `${row.station}|${row.line}|${row.services.join("/")}`;

function projectUrl(project) {
  return project.externalId ? capitalDashboardUrl(project.externalId) : project.sourceUrl;
}

function formatDay(iso) {
  if (!iso) return "no date";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
}

/**
 * Stations named in a project description with their line, e.g. "DeKalb
 * Avenue (3 elevators) on the 4 Avenue Line". A name is only matched when a
 * row with that name is on the stated line; nothing is guessed.
 */
export function stationsFromDescription(description, accessibilityData, index = buildStationIndex(accessibilityData.stations)) {
  const text = String(description ?? "");
  const lines = [...text.matchAll(/\bon the ([^,;.]+?) Line\b/gi)].map((match) => ({
    end: match.index + match[0].length,
    line: normalizeStationText(match[1]),
    start: match.index,
  }));
  if (lines.length === 0) return [];

  const keys = new Set();
  let segmentStart = 0;
  for (const line of lines) {
    const segment = text.slice(segmentStart, line.start);
    segmentStart = line.end;
    for (const mention of findStationMentions(segment, index)) {
      for (const rowIndex of mention.indexes) {
        const row = accessibilityData.stations[rowIndex];
        const rowLine = normalizeStationText(row.line.replace(/\s+Line$/i, ""));
        if (rowLine === line.line || rowLine.startsWith(`${line.line} `) || line.line.startsWith(`${rowLine} `)) {
          keys.add(stationKey(row));
        }
      }
    }
  }
  return [...keys];
}

/** Station rows (accessibility-stations.json keys) a capital project covers. */
export function projectStationKeys(project, adaStatuses, accessibilityData, index) {
  const url = projectUrl(project);
  const statuses = (adaStatuses?.stations ?? []).filter(
    (station) =>
      station.sourceUrl === url ||
      (station.projectTitle && station.projectTitle === project.title),
  );
  const keys = new Set();
  for (const status of statuses) {
    for (const row of accessibilityData.stations) {
      if (
        row.station === status.station &&
        row.services.map(String).some((service) => status.services.map(String).includes(service))
      ) {
        keys.add(stationKey(row));
      }
    }
  }
  if (keys.size === 0) {
    for (const key of stationsFromDescription(project.description, accessibilityData, index)) keys.add(key);
  }
  return [...keys];
}

export function snapshotProjects(capitalData) {
  return Object.fromEntries(
    (capitalData?.projects ?? []).map((project) => [
      project.key,
      {
        estimatedCompletionDate: project.estimatedCompletionDate ?? null,
        phase: project.phase ?? null,
        title: project.title,
      },
    ]),
  );
}

/**
 * Build raw items from the capital snapshot.
 * Returns { items, snapshot } where snapshot is stored for the next run's diff.
 */
export function capitalItems(
  capitalData,
  { accessibilityData, adaStatuses, lookbackDays = 365, now = Date.now(), previousSnapshot = null } = {},
) {
  const items = [];
  // The dashboard's open data is refreshed monthly and runs months behind,
  // so milestones get a longer window than news does.
  const cutoff = now - lookbackDays * 864e5;
  const index = buildStationIndex(accessibilityData.stations);
  const snapshot = snapshotProjects(capitalData);

  for (const project of capitalData?.projects ?? []) {
    const url = projectUrl(project);
    const stationKeys = projectStationKeys(project, adaStatuses, accessibilityData, index);
    const base = {
      kind: "capital",
      projectTitle: project.title,
      sourceName: "MTA Capital Program Dashboard",
      sourceUrl: url,
      stationKeys,
    };

    // 1. Dated milestones the MTA posted on the project.
    for (const phase of project.phases ?? []) {
      for (const [position, milestone] of (phase.milestones ?? []).entries()) {
        const published = Date.parse(`${milestone.date}T12:00:00Z`);
        if (!Number.isFinite(published) || published < cutoff || published > now) continue;
        items.push({
          ...base,
          lead: milestone.description ?? "",
          publishedAt: new Date(published).toISOString(),
          title: `${project.title}: ${milestone.title}`,
          url: `${url}#${encodeURIComponent(`${phase.name}:${milestone.date}:${position}`)}`,
        });
      }
    }

    // 2. Changes since the last run (phase, estimated completion).
    const before = previousSnapshot?.[project.key];
    if (!previousSnapshot || !before) continue;
    const changedAt = new Date(now).toISOString();
    if (before.phase && project.phase && before.phase !== project.phase) {
      items.push({
        ...base,
        lead: `Phase changed from ${before.phase} to ${project.phase}.`,
        phaseChange: { from: before.phase, to: project.phase },
        publishedAt: changedAt,
        title: `${project.title}: now ${project.phase === "Complete" ? "complete" : `in ${project.phase.toLowerCase()}`}`,
        url: `${url}#${encodeURIComponent(`phase:${before.phase}->${project.phase}`)}`,
      });
    }
    if (
      before.estimatedCompletionDate &&
      project.estimatedCompletionDate &&
      before.estimatedCompletionDate !== project.estimatedCompletionDate
    ) {
      const later = project.estimatedCompletionDate > before.estimatedCompletionDate;
      items.push({
        ...base,
        lead: `Estimated completion moved from ${formatDay(before.estimatedCompletionDate)} to ${formatDay(project.estimatedCompletionDate)}.`,
        publishedAt: changedAt,
        title: `${project.title}: completion ${later ? "pushed back" : "moved up"} to ${formatDay(project.estimatedCompletionDate)}`,
        url: `${url}#${encodeURIComponent(`eta:${before.estimatedCompletionDate}->${project.estimatedCompletionDate}`)}`,
      });
    }
  }

  return { items, snapshot };
}
