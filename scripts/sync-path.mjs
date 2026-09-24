import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry } from "./fetch-with-retry.mjs";
import { parseCsv, readZipEntries, simplifyLine } from "./gtfs-utils.mjs";

const GTFS_URL =
  "https://rapid.nationalrtap.org/GTFSFileManagement/UserUploadFiles/14843/PATHGTFS.zip";
const CONFIG_URL =
  "https://www.panynj.gov/content/dam/path/trip-planner/trip-planner-config.json";
const ALERTS_URL = "https://www.panynj.gov/bin/portauthority/alerts?agency=PATH";
const ACCESSIBILITY_URL = "https://www.panynj.gov/path/en/accessibility.html";
const STATION_STATUS_URL =
  "https://www.panynj.gov/path/en/alerts/elevator-and-escalator.html";
const STATION_STATUS_MODEL_URL =
  "https://www.panynj.gov/content/path/en/alerts/elevator-and-escalator.model.json";
const DATA_OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "path-accessibility.json",
);
const ROUTE_OUTPUT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "path-routes.geojson",
);
const REQUIRED_FILES = new Set([
  "routes.txt",
  "shapes.txt",
  "stops.txt",
  "trips.txt",
]);
const WANTED_FILES = new Set([
  ...REQUIRED_FILES,
  "calendar.txt",
  "calendar_dates.txt",
  "feed_info.txt",
]);
const SIMPLIFICATION_TOLERANCE = 0.000015;
const PATH_SERVICE_NAMES = {
  BLU: "HOB-33",
  GRE: "HOB-WTC",
  RED: "NWK-WTC",
  YEL: "JSQ-33",
  blue: "HOB-33",
  green: "HOB-WTC",
  red: "NWK-WTC",
  yellow: "JSQ-33",
};
const PATH_ROUTE_OFFSETS = {
  BLU: 2.4,
  GRE: 2.4,
  RED: -2.4,
  YEL: -2.4,
};

const [archive, config, alertsText, stationStatusModel] = await Promise.all([
  fetchWithRetry(GTFS_URL).then(async (response) =>
    Buffer.from(await response.arrayBuffer()),
  ),
  fetchWithRetry(CONFIG_URL).then((response) => response.json()),
  fetchWithRetry(ALERTS_URL).then((response) => response.text()),
  fetchWithRetry(STATION_STATUS_MODEL_URL).then((response) => response.json()),
]);
const alerts = alertsText.trim() ? JSON.parse(alertsText) : [];

if (!Array.isArray(config.stations) || config.stations.length === 0) {
  throw new Error("PATH trip-planner configuration has no stations");
}
if (!Array.isArray(alerts)) {
  throw new Error("PATH alerts response is not an array");
}
if (!JSON.stringify(stationStatusModel).includes(new URL(CONFIG_URL).pathname)) {
  throw new Error(
    "PATH status page model no longer points to the trip-planner configuration",
  );
}

const files = readZipEntries(archive, WANTED_FILES);
for (const requiredFile of REQUIRED_FILES) {
  if (!files.has(requiredFile)) {
    throw new Error(`PATH GTFS is missing ${requiredFile}`);
  }
}

const feedInfo = files.has("feed_info.txt")
  ? parseCsv(files.get("feed_info.txt"))[0] || {}
  : {};
const routeRows = parseCsv(files.get("routes.txt"));
const shapeRows = parseCsv(files.get("shapes.txt"));
const stopRows = parseCsv(files.get("stops.txt"));
const tripRows = parseCsv(files.get("trips.txt"));
const parentStops = stopRows.filter(
  (stop) => stop.location_type === "1" || !stop.parent_station,
);
const activeVerticalTransitAlerts = alerts.filter(
  (alert) =>
    alert.state !== "Closed" &&
    /elevator|escalator/i.test(
      `${alert.Subject || ""} ${alert.SentMessage || ""} ${alert.TemplateName || ""}`,
    ),
);

const stations = config.stations.map((station) => {
  const gtfsStop = findGtfsStation(parentStops, station);
  if (!gtfsStop) {
    throw new Error(`Unable to match PATH station ${station.id} (${station.name})`);
  }
  const latitude = Number(gtfsStop.stop_lat);
  const longitude = Number(gtfsStop.stop_lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`PATH station ${station.id} has invalid GTFS coordinates`);
  }

  const stationAlerts = activeVerticalTransitAlerts.filter((alert) =>
    alertMatchesStation(alert, station),
  );
  const elevatorAlerts = stationAlerts.filter((alert) =>
    /elevator/i.test(
      `${alert.Subject || ""} ${alert.SentMessage || ""} ${alert.TemplateName || ""}`,
    ),
  );
  const escalatorAlerts = stationAlerts.filter((alert) =>
    /escalator/i.test(
      `${alert.Subject || ""} ${alert.SentMessage || ""} ${alert.TemplateName || ""}`,
    ),
  );
  const lineIds = Object.values(config.lines)
    .filter(
      (line) =>
        line.id !== "night-yellow" && line.stops.includes(station.id),
    )
    .map((line) => line.id);
  const lineLabels = [
    ...new Set(
      lineIds.map((lineId) => PATH_SERVICE_NAMES[lineId] || lineId),
    ),
  ];

  return {
    agency: "PATH",
    stationCode: station.id,
    gtfsStopId: gtfsStop.stop_id,
    name: station.name,
    branchId: lineIds.join(","),
    branchName: lineLabels.join(" / ") || "PATH",
    branchColor: lineIds[0]
      ? normalizeColor(config.routeColors[lineIds[0]]?.hex, "#4D92FB")
      : "#4D92FB",
    latitude,
    longitude,
    accessibilityStatus: station.accessible ? "Accessible" : "Not accessible",
    wheelchairBoarding: station.accessible ? 1 : 2,
    stationDetailUrl: ACCESSIBILITY_URL,
    elevators: station.hasElevatorAlerts
      ? [createAggregateEquipment(station.id, "elevator", elevatorAlerts)]
      : [],
    escalators: station.hasEscalatorAlerts
      ? [createAggregateEquipment(station.id, "escalator", escalatorAlerts)]
      : [],
    serviceAlert: stationAlerts.map(formatAlert).join(" "),
  };
});

validateStations(stations);

const routeFeatures = buildRouteFeatures(routeRows, tripRows, shapeRows);
if (routeFeatures.length === 0) {
  throw new Error("PATH GTFS produced no route geometry");
}

const serviceDates = getServiceDates(files);
const generatedAt = new Date().toISOString();
const accessibilitySnapshot = {
  metadata: {
    generatedAt,
    source:
      "Port Authority PATH elevator/escalator status page configuration and live alerts",
    configUrl: CONFIG_URL,
    alertsUrl: ALERTS_URL,
    accessibilityUrl: ACCESSIBILITY_URL,
    stationStatusUrl: STATION_STATUS_URL,
    stationStatusModelUrl: STATION_STATUS_MODEL_URL,
    gtfsUrl: GTFS_URL,
    stationCount: stations.length,
    accessibleStationCount: stations.filter(
      (station) => station.accessibilityStatus === "Accessible",
    ).length,
    activeVerticalTransitAlertCount: activeVerticalTransitAlerts.length,
    feedVersion: feedInfo.feed_version || null,
    validFrom: feedInfo.feed_start_date || serviceDates.validFrom,
    validTo: feedInfo.feed_end_date || serviceDates.validTo,
  },
  stations,
};
const routeCollection = {
  type: "FeatureCollection",
  metadata: {
    generatedAt,
    source: "PATH GTFS",
    sourceUrl: GTFS_URL,
    routeCount: new Set(
      routeFeatures.map((feature) => feature.properties.routeId),
    ).size,
    feedVersion: feedInfo.feed_version || null,
    validFrom: feedInfo.feed_start_date || serviceDates.validFrom,
    validTo: feedInfo.feed_end_date || serviceDates.validTo,
  },
  features: routeFeatures,
};

await Promise.all([
  mkdir(path.dirname(DATA_OUTPUT_PATH), { recursive: true }),
  mkdir(path.dirname(ROUTE_OUTPUT_PATH), { recursive: true }),
]);
await Promise.all([
  writeFile(
    DATA_OUTPUT_PATH,
    `${JSON.stringify(accessibilitySnapshot, null, 2)}\n`,
    "utf8",
  ),
  writeFile(ROUTE_OUTPUT_PATH, `${JSON.stringify(routeCollection)}\n`, "utf8"),
]);

console.log(
  `Wrote ${stations.length} PATH stations and ${routeFeatures.length} route shapes`,
);

function findGtfsStation(stops, station) {
  const aliases = new Set([
    normalizeStationName(station.name),
    ...getStationAliases(station.id).map(normalizeStationName),
  ]);
  return stops.find(
    (stop) =>
      aliases.has(normalizeStationName(stop.stop_name)) ||
      normalizeStationName(stop.stop_id).includes(
        normalizeStationName(station.id),
      ),
  );
}

function getStationAliases(stationId) {
  const aliases = {
    NWK: ["Newark Penn Station"],
    "09S": ["9 Street"],
    "14S": ["14 Street"],
    "23S": ["23 Street"],
    "33S": ["33 Street"],
  };
  return aliases[stationId] || [];
}

function normalizeStationName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bpenn station\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function alertMatchesStation(alert, station) {
  const text = `${alert.Subject || ""} ${alert.TemplateName || ""}`;
  const normalizedText = normalizeStationName(text);
  return (
    new RegExp(`(^|[^A-Z0-9])${escapeRegex(station.id)}([^A-Z0-9]|$)`, "i").test(
      text,
    ) || normalizedText.includes(normalizeStationName(station.name))
  );
}

function createAggregateEquipment(stationId, type, stationAlerts) {
  const latestAlert = stationAlerts[0];
  return {
    unitId: `${stationId}-${type}-service`,
    location: latestAlert
      ? formatAlert(latestAlert)
      : `Station ${type} service`,
    status: latestAlert ? "outage" : "operational",
    lastUpdated: latestAlert
      ? `${latestAlert.SentDate || ""} ${latestAlert.SentTime || ""}`.trim() || null
      : null,
  };
}

function formatAlert(alert) {
  return String(alert.SentMessage || alert.Subject || "Service alert")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRouteFeatures(routes, trips, shapes) {
  const routesById = new Map(routes.map((route) => [route.route_id, route]));
  const routesByShape = new Map();
  const pointsByShape = new Map();

  for (const trip of trips) {
    if (!trip.shape_id || !routesById.has(trip.route_id)) continue;
    const shapeRoutes = routesByShape.get(trip.shape_id) || new Set();
    shapeRoutes.add(trip.route_id);
    routesByShape.set(trip.shape_id, shapeRoutes);
  }
  for (const point of shapes) {
    const longitude = Number(point.shape_pt_lon);
    const latitude = Number(point.shape_pt_lat);
    const sequence = Number(point.shape_pt_sequence);
    if (
      !point.shape_id ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(sequence)
    ) {
      continue;
    }
    const shapePoints = pointsByShape.get(point.shape_id) || [];
    shapePoints.push({ coordinates: [longitude, latitude], sequence });
    pointsByShape.set(point.shape_id, shapePoints);
  }

  const seen = new Set();
  const features = [];
  for (const [shapeId, shapePoints] of pointsByShape) {
    const shapeRoutes = routesByShape.get(shapeId);
    if (!shapeRoutes) continue;
    const coordinates = simplifyLine(
      shapePoints
        .sort((left, right) => left.sequence - right.sequence)
        .map((point) => point.coordinates),
      SIMPLIFICATION_TOLERANCE,
    ).map(([longitude, latitude]) => [
      Number(longitude.toFixed(6)),
      Number(latitude.toFixed(6)),
    ]);
    if (coordinates.length < 2) continue;
    const geometryKey = JSON.stringify(coordinates);

    for (const routeId of shapeRoutes) {
      if (routeId === "ATW") continue;
      const route = routesById.get(routeId);
      const dedupeKey = `${routeId}:${geometryKey}`;
      if (!route || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      features.push({
        type: "Feature",
        properties: {
          agency: "PATH",
          color: normalizeColor(
            route.route_color ? `#${route.route_color}` : null,
            "#4D92FB",
          ),
          description:
            route.route_desc || PATH_SERVICE_NAMES[routeId] || "PATH",
          offset: PATH_ROUTE_OFFSETS[routeId] || 0,
          route: PATH_SERVICE_NAMES[routeId] || route.route_short_name || route.route_id,
          routeId,
          shapeId,
        },
        geometry: { type: "LineString", coordinates },
      });
    }
  }
  return features.sort(
    (left, right) =>
      left.properties.routeId.localeCompare(right.properties.routeId) ||
      left.properties.shapeId.localeCompare(right.properties.shapeId),
  );
}

function getServiceDates(gtfsFiles) {
  const dates = [];
  if (gtfsFiles.has("calendar.txt")) {
    for (const row of parseCsv(gtfsFiles.get("calendar.txt"))) {
      if (row.start_date) dates.push(row.start_date);
      if (row.end_date) dates.push(row.end_date);
    }
  }
  if (gtfsFiles.has("calendar_dates.txt")) {
    for (const row of parseCsv(gtfsFiles.get("calendar_dates.txt"))) {
      if (row.date) dates.push(row.date);
    }
  }
  dates.sort();
  return {
    validFrom: dates[0] || null,
    validTo: dates.at(-1) || null,
  };
}

function validateStations(items) {
  const ids = new Set(items.map((station) => station.stationCode));
  if (items.length !== 13 || ids.size !== items.length) {
    throw new Error(
      `Expected 13 unique PATH stations, received ${items.length} (${ids.size} unique)`,
    );
  }
  const accessibleCount = items.filter(
    (station) => station.accessibilityStatus === "Accessible",
  ).length;
  if (accessibleCount < 9 || accessibleCount > items.length) {
    throw new Error(
      `Expected at least 9 elevator-accessible PATH stations, received ${accessibleCount}`,
    );
  }
}

function normalizeColor(value, fallback) {
  const color = String(value || fallback).trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
