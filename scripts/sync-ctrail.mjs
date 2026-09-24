import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry } from "./fetch-with-retry.mjs";
import { parseCsv, readZipEntries, simplifyLine } from "./gtfs-utils.mjs";

const HARTFORD_GTFS_URL = "https://ctrides.com/hlgtfs.zip";
const SHORE_LINE_EAST_GTFS_URL =
  "https://content.amtrak.com/content/gtfs/GTFS.zip";
const MNR_GTFS_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip";
const SHORE_LINE_EAST_SCHEDULE_URL = "https://shorelineeast.com/schedules/";
const ELEVATOR_STATUS_URL = "https://elevatorstatus.ctrail.com/";
const CTRAIL_URL = "https://portal.ct.gov/CTrail";
const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const SHORE_LINE_EAST_RELATION_ID = 4433102;
const SHORE_LINE_EAST_ROUTE_ID = "42948";
const SHORE_LINE_EAST_THROUGH_STATIONS = new Set([
  "Stamford",
  "Bridgeport",
  "Stratford",
  "Milford",
  "West Haven",
]);
const SHORE_LINE_EAST_TRACK_BOUNDS = "41.20,-72.95,41.37,-72.05";
const SHORE_LINE_EAST_THROUGH_BOUNDS = {
  east: -72.88,
  north: 41.37,
  south: 40.98,
  west: -73.56,
};
const DATA_OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "ctrail-accessibility.json",
);
const ROUTE_OUTPUT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "ctrail-routes.geojson",
);
const REQUIRED_FILES = new Set([
  "routes.txt",
  "shapes.txt",
  "stop_times.txt",
  "stops.txt",
  "trips.txt",
]);
const WANTED_FILES = new Set(["feed_info.txt", ...REQUIRED_FILES]);
const SIMPLIFICATION_TOLERANCE = 0.00004;

const [hartfordArchive, shoreLineEastArchive, mnrArchive, elevatorHtml, osmPayload] =
  await Promise.all([
    fetchWithRetry(HARTFORD_GTFS_URL, {}, {
      consume: async (response) => Buffer.from(await response.arrayBuffer()),
      timeoutMs: 60_000,
    }),
    fetchWithRetry(SHORE_LINE_EAST_GTFS_URL, {}, {
      consume: async (response) => Buffer.from(await response.arrayBuffer()),
      timeoutMs: 60_000,
    }),
    fetchWithRetry(MNR_GTFS_URL, {}, {
      consume: async (response) => Buffer.from(await response.arrayBuffer()),
      timeoutMs: 60_000,
    }),
    fetchWithRetry(ELEVATOR_STATUS_URL, {}, {
      consume: (response) => response.text(),
    }),
    fetchWithRetry(OVERPASS_URL, {
      body: new URLSearchParams({
        data: `[out:json][timeout:60];(way(r:${SHORE_LINE_EAST_RELATION_ID})["railway"="rail"];way["railway"="rail"]["usage"="main"]["name"="Northeast Corridor"](${SHORE_LINE_EAST_TRACK_BOUNDS}););out tags geom;`,
      }).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "Access-NYC-data-sync/1.0",
      },
      method: "POST",
    }, {
      consume: (response) => response.json(),
      timeoutMs: 60_000,
    }).catch((error) => loadCachedOsmGeometry(error)),
  ]);
const hartford = parseGtfs(hartfordArchive, "Hartford Line");
const shoreLineEast = parseGtfs(shoreLineEastArchive, "Shore Line East");
const mnr = parseGtfs(mnrArchive, "Metro-North");
const mnrStops = mnr.stops;
const elevatorEquipment = parseElevatorEquipment(elevatorHtml);

const stationRecords = new Map();
for (const stop of hartford.stops) {
  addStation(stationRecords, {
    branchColor: "#EA0D2A",
    branchId: "HART",
    branchName: "Hartford Line",
    code: `HART:${stop.stop_code || stop.stop_id}`,
    detailUrl: "https://www.hartfordline.com/",
    name: canonicalStationName(stop.stop_name, stop.stop_id),
    stop,
    wheelchairBoarding: numericValue(stop.wheelchair_boarding),
  });
}

const shoreLineEastTrips = new Set(
  shoreLineEast.trips
    .filter((trip) => trip.route_id === SHORE_LINE_EAST_ROUTE_ID)
    .map((trip) => trip.trip_id),
);
const shoreLineEastStopIds = new Set(
  shoreLineEast.stopTimes
    .filter((stopTime) => shoreLineEastTrips.has(stopTime.trip_id))
    .map((stopTime) => stopTime.stop_id),
);
for (const stop of shoreLineEast.stops.filter((item) =>
  shoreLineEastStopIds.has(item.stop_id),
)) {
  const name = canonicalStationName(stop.stop_name, stop.stop_id);
  if (SHORE_LINE_EAST_THROUGH_STATIONS.has(name)) continue;
  addStation(stationRecords, {
    branchColor: "#ED0A28",
    branchId: "SLE",
    branchName: "Shore Line East",
    code: `SLE:${stop.stop_code || stop.stop_id}`,
    detailUrl: "https://shorelineeast.com/",
    name,
    stop,
    wheelchairBoarding: 1,
  });
}

for (const stop of mnrStops.filter((item) =>
  SHORE_LINE_EAST_THROUGH_STATIONS.has(
    canonicalStationName(item.stop_name, item.stop_id),
  ),
)) {
  addStation(stationRecords, {
    branchColor: "#ED0A28",
    branchId: "SLE",
    branchName: "Shore Line East",
    code: `SLE-THRU:${stop.stop_code || stop.stop_id}`,
    detailUrl: "https://shorelineeast.com/",
    name: canonicalStationName(stop.stop_name, stop.stop_id),
    stop,
    wheelchairBoarding: numericValue(stop.wheelchair_boarding) || 1,
  });
}

const stations = [...stationRecords.values()]
  .map((station) => {
    const equipment = elevatorEquipment.get(normalizeStationName(station.name)) || [];
    return {
      agency: "CTrail",
      stationCode: [...station.codes].sort().join("+"),
      gtfsStopId: [...station.gtfsStopIds].sort().join(","),
      name: station.name,
      branchId: [...station.branchIds].sort().join(","),
      branchName: [...station.branchNames].sort().join(" / "),
      branchColor: station.branchColor,
      latitude: station.latitude,
      longitude: station.longitude,
      accessibilityStatus:
        station.wheelchairBoarding === 2 ? "Not accessible" : "Accessible",
      accessMethods:
        station.wheelchairBoarding === 2
          ? []
          : equipment.length > 0
            ? ["Elevator access"]
            : ["Step-free access (no CTrail elevator listed)"],
      wheelchairBoarding: station.wheelchairBoarding,
      stationDetailUrl: station.detailUrl,
      elevators: equipment,
      escalators: [],
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

validateStations(stations);
const routeFeatures = [
  ...buildGtfsRouteFeatures(hartford, "HART", "Hartford Line", "#EA0D2A"),
  ...buildShoreLineEastThroughFeatures(mnr),
  ...(Array.isArray(osmPayload?.fallbackFeatures)
    ? osmPayload.fallbackFeatures
    : buildOsmRailFeatures(osmPayload)),
];
if (routeFeatures.length === 0) {
  throw new Error("CTrail sources produced no route geometry");
}

const generatedAt = new Date().toISOString();
const accessibilitySnapshot = {
  metadata: {
    generatedAt,
    source: "CTrail and Amtrak GTFS with CTrail elevator status",
    ctrailUrl: CTRAIL_URL,
    hartfordGtfsUrl: HARTFORD_GTFS_URL,
    shoreLineEastGtfsUrl: SHORE_LINE_EAST_GTFS_URL,
    mnrCoordinateGtfsUrl: MNR_GTFS_URL,
    shoreLineEastScheduleUrl: SHORE_LINE_EAST_SCHEDULE_URL,
    elevatorStatusUrl: ELEVATOR_STATUS_URL,
    stationCount: stations.length,
    accessibleStationCount: stations.filter(
      (station) => station.accessibilityStatus === "Accessible",
    ).length,
    equipmentStationCount: stations.filter(
      (station) => station.elevators.length > 0,
    ).length,
    stationWithoutListedElevatorCount: stations.filter(
      (station) => station.elevators.length === 0,
    ).length,
    activeElevatorOutageCount: stations.reduce(
      (total, station) =>
        total +
        station.elevators.filter((equipment) => equipment.status === "outage")
          .length,
      0,
    ),
    feeds: [hartford.feedInfo, shoreLineEast.feedInfo],
  },
  stations,
};
const routeCollection = {
  type: "FeatureCollection",
  metadata: {
    generatedAt,
    source:
      "CTrail Hartford Line GTFS, Metro-North GTFS, and OpenStreetMap Shore Line East geometry",
    attribution: "© OpenStreetMap contributors",
    attributionUrl: OSM_COPYRIGHT_URL,
    usedCachedOsmGeometry: Array.isArray(osmPayload?.fallbackFeatures),
    routeCount: new Set(
      routeFeatures.map((feature) => feature.properties.routeId),
    ).size,
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
  `Wrote ${stations.length} CTrail stations and ${routeFeatures.length} route segments`,
);

function parseGtfs(archive, name) {
  const files = readZipEntries(archive, WANTED_FILES);
  for (const requiredFile of REQUIRED_FILES) {
    if (!files.has(requiredFile)) {
      throw new Error(`${name} GTFS is missing ${requiredFile}`);
    }
  }
  const feedInfo = files.has("feed_info.txt")
    ? parseCsv(files.get("feed_info.txt"))[0] || {}
    : {};
  return {
    feedInfo: {
      name,
      feedVersion: feedInfo.feed_version || null,
      validFrom: feedInfo.feed_start_date || null,
      validTo: feedInfo.feed_end_date || null,
    },
    routes: parseCsv(files.get("routes.txt")),
    shapes: parseCsv(files.get("shapes.txt")),
    stopTimes: parseCsv(files.get("stop_times.txt")),
    stops: parseCsv(files.get("stops.txt")),
    trips: parseCsv(files.get("trips.txt")),
  };
}

function addStation(records, candidate) {
  const key = normalizeStationName(candidate.name);
  const latitude = Number(candidate.stop.stop_lat);
  const longitude = Number(candidate.stop.stop_lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const current = records.get(key);
  if (!current) {
    records.set(key, {
      branchColor: candidate.branchColor,
      branchIds: new Set([candidate.branchId]),
      branchNames: new Set([candidate.branchName]),
      codes: new Set([candidate.code]),
      detailUrl: candidate.detailUrl,
      gtfsStopIds: new Set([candidate.stop.stop_id]),
      latitude,
      longitude,
      name: candidate.name,
      wheelchairBoarding: candidate.wheelchairBoarding,
    });
    return;
  }

  current.branchIds.add(candidate.branchId);
  current.branchNames.add(candidate.branchName);
  current.codes.add(candidate.code);
  current.gtfsStopIds.add(candidate.stop.stop_id);
  current.wheelchairBoarding = Math.max(
    current.wheelchairBoarding || 0,
    candidate.wheelchairBoarding || 0,
  );
  if (candidate.branchId === "HART") current.detailUrl = candidate.detailUrl;
}

function parseElevatorEquipment(html) {
  const tableBody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  const equipmentByStation = new Map();
  let currentStation = "";
  let equipmentIndex = 0;

  for (const rowMatch of tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Object.fromEntries(
      [...rowMatch[1].matchAll(/<td[^>]*data-label="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (match) => [match[1], htmlToText(match[2])],
      ),
    );
    if (cells.Station) currentStation = canonicalStationName(cells.Station);
    if (!currentStation || !cells.Status) continue;

    const key = normalizeStationName(currentStation);
    const equipment = equipmentByStation.get(key) || [];
    equipmentIndex += 1;
    equipment.push({
      unitId: `CTRAIL-${slugify(currentStation)}-${equipmentIndex}`,
      location: cells.Location || "Station elevator",
      status: /out of service/i.test(cells.Status) ? "outage" : "operational",
      lastUpdated: null,
      note: cells.Note || null,
    });
    equipmentByStation.set(key, equipment);
  }
  return equipmentByStation;
}

function buildGtfsRouteFeatures(feed, routeId, routeName, fallbackColor) {
  const route = feed.routes.find((item) => item.route_id === routeId) || {};
  const shapeIds = new Set(
    feed.trips
      .filter((trip) => trip.route_id === routeId && trip.shape_id)
      .map((trip) => trip.shape_id),
  );
  const pointsByShape = new Map();
  for (const point of feed.shapes) {
    if (!shapeIds.has(point.shape_id)) continue;
    const longitude = Number(point.shape_pt_lon);
    const latitude = Number(point.shape_pt_lat);
    const sequence = Number(point.shape_pt_sequence);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const points = pointsByShape.get(point.shape_id) || [];
    points.push({ coordinates: [longitude, latitude], sequence });
    pointsByShape.set(point.shape_id, points);
  }

  const seen = new Set();
  return [...pointsByShape]
    .flatMap(([shapeId, points]) => {
      const coordinates = simplifyLine(
        points
          .sort((left, right) => left.sequence - right.sequence)
          .map((point) => point.coordinates),
        SIMPLIFICATION_TOLERANCE,
      ).map(([longitude, latitude]) => [
        Number(longitude.toFixed(6)),
        Number(latitude.toFixed(6)),
      ]);
      if (coordinates.length < 2) return [];
      const forwardKey = JSON.stringify(coordinates);
      const reverseKey = JSON.stringify([...coordinates].reverse());
      const geometryKey = forwardKey < reverseKey ? forwardKey : reverseKey;
      if (seen.has(geometryKey)) return [];
      seen.add(geometryKey);
      return [{
        type: "Feature",
        properties: {
          agency: "CTrail",
          color: normalizeColor(
            route.route_color ? `#${route.route_color}` : null,
            fallbackColor,
          ),
          description: routeName,
          route: routeName,
          routeId,
          shapeId,
        },
        geometry: { type: "LineString", coordinates },
      }];
    });
}

function buildShoreLineEastThroughFeatures(feed) {
  return buildGtfsRouteFeatures(
    feed,
    "3",
    "Shore Line East",
    "#ED0A28",
  ).flatMap((feature) => {
    const coordinates = feature.geometry.coordinates.filter(
      ([longitude, latitude]) =>
        longitude >= SHORE_LINE_EAST_THROUGH_BOUNDS.west &&
        longitude <= SHORE_LINE_EAST_THROUGH_BOUNDS.east &&
        latitude >= SHORE_LINE_EAST_THROUGH_BOUNDS.south &&
        latitude <= SHORE_LINE_EAST_THROUGH_BOUNDS.north,
    );
    if (coordinates.length < 2) return [];

    return [{
      ...feature,
      properties: {
        ...feature.properties,
        color: "#ED0A28",
        routeId: "SLE",
        shapeId: `mnr-through-${feature.properties.shapeId}`,
        source: "Metro-North Railroad GTFS",
        sourceUrl: MNR_GTFS_URL,
      },
      geometry: { ...feature.geometry, coordinates },
    }];
  });
}

function buildOsmRailFeatures(payload) {
  const ways = Array.isArray(payload?.elements)
    ? payload.elements.filter(
        (element) =>
          element.type === "way" &&
          Array.isArray(element.geometry) &&
          !["crossover", "siding", "yard"].includes(element.tags?.service),
      )
    : [];
  if (ways.length === 0) {
    throw new Error("Shore Line East OSM relation produced no rail geometry");
  }
  const seen = new Set();
  return ways.flatMap((way) => {
    const coordinates = way.geometry.map(({ lat, lon }) => [
      Number(lon.toFixed(6)),
      Number(lat.toFixed(6)),
    ]);
    if (coordinates.length < 2) return [];
    const forwardKey = JSON.stringify(coordinates);
    const reverseKey = JSON.stringify([...coordinates].reverse());
    const geometryKey = forwardKey < reverseKey ? forwardKey : reverseKey;
    if (seen.has(geometryKey)) return [];
    seen.add(geometryKey);
    return [{
      type: "Feature",
      properties: {
        agency: "CTrail",
        color: "#ED0A28",
        description: "Shore Line East",
        route: "Shore Line East",
        routeId: "SLE",
        shapeId: `osm-${SHORE_LINE_EAST_RELATION_ID}-${way.id}`,
        source: "OpenStreetMap",
        sourceUrl: OSM_COPYRIGHT_URL,
      },
      geometry: { type: "LineString", coordinates },
    }];
  });
}

async function loadCachedOsmGeometry(requestError) {
  try {
    const existing = JSON.parse(await readFile(ROUTE_OUTPUT_PATH, "utf8"));
    const fallbackFeatures = Array.isArray(existing?.features)
      ? existing.features.filter(
          (feature) =>
            feature?.properties?.routeId === "SLE" &&
            feature?.properties?.source === "OpenStreetMap",
        )
      : [];
    if (fallbackFeatures.length === 0) throw new Error("No cached OSM geometry");
    console.warn(
      `OpenStreetMap request failed; reusing ${fallbackFeatures.length} cached Shore Line East track segments.`,
    );
    return { fallbackFeatures };
  } catch {
    throw requestError;
  }
}

function canonicalStationName(value, stopId = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "NEW HAVEN" && stopId === "STS") {
    return "New Haven State Street";
  }
  if (normalized === "NEW HAVEN" || normalized === "NEW HAVEN UNION STATION") {
    return "New Haven Union Station";
  }
  if (normalized === "STATE STREET STATION") {
    return "New Haven State Street";
  }
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s/()-])([a-z])/g, (_, prefix, letter) =>
      `${prefix}${letter.toUpperCase()}`,
    )
    .replace(/ Amtrak Station$/i, "")
    .replace(/^Hartford$/i, "Hartford Union Station")
    .replace(/^Springfield$/i, "Springfield Union Station");
}

function normalizeStationName(value) {
  return canonicalStationName(value)
    .toLowerCase()
    .replace(/\b(?:amtrak|station)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeStationName(value).replace(/\s+/g, "-").toUpperCase();
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeColor(value, fallback) {
  const color = String(value || fallback).trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
}

function validateStations(items) {
  const ids = new Set(items.map((station) => station.stationCode));
  if (items.length < 15 || ids.size !== items.length) {
    throw new Error(
      `Expected at least 15 unique CTrail stations, received ${items.length} (${ids.size} unique)`,
    );
  }
  if (!items.some((station) => station.branchId.includes("HART"))) {
    throw new Error("CTrail snapshot is missing Hartford Line stations");
  }
  if (!items.some((station) => station.branchId.includes("SLE"))) {
    throw new Error("CTrail snapshot is missing Shore Line East stations");
  }
  const expectedShoreLineEastStations = new Set([
    "New London",
    "Old Saybrook",
    "Westbrook",
    "Clinton",
    "Madison",
    "Guilford",
    "Branford",
    "New Haven State Street",
    "New Haven Union Station",
    ...SHORE_LINE_EAST_THROUGH_STATIONS,
  ]);
  const actualShoreLineEastStations = new Set(
    items
      .filter((station) => station.branchId.split(",").includes("SLE"))
      .map((station) => station.name),
  );
  const missingShoreLineEastStations = [...expectedShoreLineEastStations].filter(
    (station) => !actualShoreLineEastStations.has(station),
  );
  if (missingShoreLineEastStations.length > 0) {
    throw new Error(
      `CTrail snapshot is missing Shore Line East stations: ${missingShoreLineEastStations.join(", ")}`,
    );
  }
}
