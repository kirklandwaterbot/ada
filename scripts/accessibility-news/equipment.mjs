// MTA elevator & escalator inventory as a news source.
//
// The MTA's own equipment inventory (data.ny.gov 94fv-bak7) often records a
// new elevator as installed and in service days before the press release:
// Kings Hwy (F) EL795–797 went into service Aug 14, 2026, five days before
// the release; 137 St-City College's downtown elevator EL520 on Oct 8, six
// days before. This module turns recent installs into feed items, and into
// openings when the new ADA elevators reach the platforms in both directions.

import { normalizeStationText } from "./classify.mjs";

const stationKey = (row) => `${row.station}|${row.line}|${row.services.join("/")}`;

export const INVENTORY_DATASET_URL = "https://data.ny.gov/d/94fv-bak7";
export const STATUS_PAGE_URL = "https://www.mta.info/elevator-escalator-status";
const INVENTORY_API_URL = "https://data.ny.gov/resource/94fv-bak7.json?$limit=5000";

export { INVENTORY_API_URL };

const IN_SERVICE = "IFIS";

function routesFromCode(stationCode) {
  const last = String(stationCode ?? "").split("-").at(-1) ?? "";
  return last
    .split("/")
    .map((route) => route.trim().toUpperCase())
    .filter((route) => /^(?:[1-7A-GJLMNQRWZ]|SIR|S)$/.test(route));
}

function stationNameFromDescription(description) {
  return String(description ?? "").replace(/\s*-\s*Station$/i, "").trim();
}

function installDate(asset) {
  const value = asset.latest_installation_date;
  if (!value || value.startsWith("1900")) return null;
  const parsed = Date.parse(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Find the station rows (accessibility-stations.json) an inventory station code belongs to. */
export function matchStationRows(asset, stations) {
  const name = normalizeStationText(stationNameFromDescription(asset.station_description));
  const routes = routesFromCode(asset.station_name);
  if (!name) return [];
  return stations
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => {
      const rowName = normalizeStationText(row.station);
      const components = row.station.split(/\s*[-/]\s*/).map(normalizeStationText);
      const nameMatches = rowName === name || components.includes(name);
      const routeMatches =
        routes.length === 0 || row.services.map(String).some((service) => routes.includes(service));
      return nameMatches && routeMatches;
    })
    .map(({ rowIndex }) => rowIndex);
}

/**
 * Directions whose platforms an in-service ADA elevator reaches. "Both"
 * covers both; Northbound + Southbound together also cover both.
 */
export function platformCoverage(elevators) {
  const reaching = elevators.filter(
    (asset) =>
      asset.service_status_code === IN_SERVICE &&
      asset.ada_compliant === "YES" &&
      asset.elevator_platform_access === "+",
  );
  const directions = new Set(reaching.map((asset) => asset.elevator_direction_serviced));
  if (directions.has("Both") || (directions.has("Northbound") && directions.has("Southbound"))) {
    return "both";
  }
  return directions.size > 0 ? "one" : "none";
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Build raw news items from recently installed equipment.
 * Returns items of kind "equipment" with the station rows already resolved.
 */
export function equipmentItems(assets, accessibilityData, { lookbackDays = 150, now = Date.now() } = {}) {
  const stations = accessibilityData.stations;
  const byStation = new Map();
  for (const asset of assets) {
    if (!asset?.station_name || !asset.equipment_code) continue;
    const list = byStation.get(asset.station_name) ?? [];
    list.push(asset);
    byStation.set(asset.station_name, list);
  }

  const items = [];
  for (const [stationCode, units] of byStation) {
    const recent = units.filter((asset) => {
      const installed = installDate(asset);
      return (
        installed !== null &&
        installed <= now &&
        now - installed <= lookbackDays * 864e5 &&
        asset.service_status_code === IN_SERVICE
      );
    });
    if (recent.length === 0) continue;

    // One item per install date, the way the MTA puts a batch into service.
    const batches = new Map();
    for (const asset of recent) {
      const day = new Date(installDate(asset)).toISOString().slice(0, 10);
      const batch = batches.get(day) ?? [];
      batch.push(asset);
      batches.set(day, batch);
    }

    const rows = matchStationRows(units[0], stations);
    const stationName = stationNameFromDescription(units[0].station_description) || stationCode;
    const routes = routesFromCode(stationCode);
    // Name it the way the rest of the site does when the station is known.
    const label = rows.length
      ? [...new Set(rows.map((rowIndex) => `${stations[rowIndex].station} (${stations[rowIndex].services.join("/")})`))].join(", ")
      : routes.length
        ? `${stationName} (${routes.join("/")})`
        : stationName;

    for (const [day, batch] of [...batches.entries()].sort()) {
      const elevators = batch.filter((asset) => asset.elevator_or_escalator === "Elevator");
      const escalators = batch.filter((asset) => asset.elevator_or_escalator === "Escalator");
      const adaElevators = elevators.filter((asset) => asset.ada_compliant === "YES");

      // Coverage counts every in-service ADA elevator at the station as of
      // this batch, so a second-phase elevator completes an earlier one.
      const installedByThen = units.filter((asset) => {
        const installed = installDate(asset);
        return asset.elevator_or_escalator === "Elevator" && (installed === null || installed <= Date.parse(`${day}T23:59:59Z`));
      });
      const coverage = adaElevators.length > 0 ? platformCoverage(installedByThen) : "none";

      const parts = [];
      if (elevators.length) parts.push(plural(elevators.length, "elevator"));
      if (escalators.length) parts.push(plural(escalators.length, "escalator"));
      const codes = batch.map((asset) => asset.equipment_code).sort();

      items.push({
        coverage,
        equipment: batch.map((asset) => ({
          ada: asset.ada_compliant === "YES",
          code: asset.equipment_code,
          kind: asset.elevator_or_escalator,
          notes: asset.notes ?? "",
        })),
        kind: "equipment",
        publishedAt: `${day}T12:00:00.000Z`,
        rowKeys: rows.map((rowIndex) => stationKey(stations[rowIndex])),
        sourceName: "MTA elevator & escalator data",
        sourceUrl: INVENTORY_DATASET_URL,
        title: `${parts.join(" and ")} entered service at ${label}`,
        // Stable per batch, and specific enough to verify in MTA's data.
        url: `${STATUS_PAGE_URL}#${encodeURIComponent(`${stationCode}:${day}:${codes.join(",")}`)}`,
      });
    }
  }
  return items;
}
