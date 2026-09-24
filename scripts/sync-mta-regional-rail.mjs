import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { fetchWithRetry } from "./fetch-with-retry.mjs";

const INFRASTRUCTURE_URL =
  "https://backend-unified.mylirr.org/infrastructure?language=en";
const EQUIPMENT_STATUS_URL = "https://backend-unified.mylirr.org/eestatus";
const EQUIPMENT_STATUS_PAGE_URL =
  "https://www.mta.info/elevator-escalator-status";
const ACCESSIBLE_STATIONS_URL = "https://www.mta.info/accessibility/stations";
const TERMS_URL = "https://www.mta.info/developers/terms-and-conditions";
const DATA_OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "mta-regional-rail-accessibility.json",
);
const ROUTE_OUTPUT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "mta-regional-rail-routes.geojson",
);
const SIMPLIFICATION_TOLERANCE = 0.00004;
const MAX_ROUTE_SEGMENT_KM = 20;
const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const MNR_OSM_ROUTES = [
  {
    color: "#0039A6",
    description: "Harlem Line",
    relationId: 1158719,
    route: "Harlem",
    routeId: "2",
  },
  {
    color: "#E00034",
    description: "Waterbury Branch",
    relationId: 4582213,
    route: "Waterbury",
    routeId: "6",
  },
];
const BELMONT_PARK_SPUR = {
  type: "Feature",
  properties: {
    agency: "LIRR",
    color: "#60269E",
    description: "Belmont Park Branch",
    route: "Belmont",
    routeId: "BT",
    shapeId: "osm-belmont-park-branch",
    source: "OpenStreetMap",
    sourceUrl: OSM_COPYRIGHT_URL,
  },
  geometry: {
    type: "LineString",
    coordinates: [
      [-73.728181, 40.712594],
      [-73.728366, 40.713201],
      [-73.7285, 40.713943],
      [-73.728847, 40.717256],
      [-73.728926, 40.71751],
      [-73.729078, 40.717821],
      [-73.729286, 40.718107],
      [-73.72947, 40.718275],
      [-73.729703, 40.718428],
      [-73.730048, 40.718577],
      [-73.730357, 40.718652],
      [-73.730721, 40.718685],
      [-73.73112, 40.718656],
      [-73.731559, 40.718578],
    ],
  },
};
const BELMONT_PARK_SERVICE_STATION_CODES = new Set([
  "BRT",
  "GCT",
  "JAM",
  "NYK",
  "WDD",
]);
const REQUIRED_GTFS_FILES = new Set([
  "routes.txt",
  "shapes.txt",
  "stop_times.txt",
  "stops.txt",
  "trips.txt",
]);
const GTFS_FILES = new Set(["feed_info.txt", ...REQUIRED_GTFS_FILES]);
const FEEDS = [
  {
    agency: "LIRR",
    name: "Long Island Rail Road",
    url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip",
  },
  {
    agency: "MNR",
    name: "Metro-North Railroad",
    url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip",
  },
];
const ACCESSIBILITY_BRANCH_IDS = {
  LIRR: {
    "Babylon Branch": "BY",
    "City Terminal Zone": "CI",
    "Far Rockaway Branch": "FR",
    "Hempstead Branch": "HM",
    "Long Beach Branch": "LB",
    "Montauk Branch": "MK",
    "Oyster Bay Branch": "OB",
    "Port Jefferson Branch": "PJ",
    "Port Washington Branch": "PW",
    "Ronkonkoma Branch": "RK",
    "Special Events Station": "BT",
    "West Hempstead Branch": "WH",
  },
  MNR: {
    "Harlem Line": "HA",
    "Hudson Line": "HU",
    "All East-of-Hudson Lines": "CI",
    "New Haven Line": "NH",
  },
};

const generatedAt = new Date().toISOString();
const existingRouteCollection = await readExistingRouteCollection();
const sourcePayloads = await Promise.all([
    fetchWithRetry(INFRASTRUCTURE_URL, {
      headers: { "accept-version": "3.0" },
    }).then((response) => response.json()),
    fetchWithRetry(EQUIPMENT_STATUS_URL).then((response) => response.json()),
    fetchWithRetry(ACCESSIBLE_STATIONS_URL).then((response) => response.text()),
    ...FEEDS.map((feed) =>
      fetchWithRetry(feed.url).then(async (response) =>
        Buffer.from(await response.arrayBuffer()),
      ),
    ),
    ...MNR_OSM_ROUTES.map((route) =>
      fetchWithRetry(
        OVERPASS_URL,
        {
          body: new URLSearchParams({
            data: `[out:json][timeout:60];rel(id:${route.relationId});way(r)["railway"="rail"];out tags geom;`,
          }).toString(),
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "user-agent": "Access-NYC-data-sync/1.0",
          },
          method: "POST",
        },
        { maxAttempts: 2, timeoutMs: 20_000 },
      )
        .then((response) => response.json())
        .catch((error) => {
          const fallbackFeatures = (existingRouteCollection?.features || []).filter(
            (feature) =>
              feature.properties?.agency === "MNR" &&
              feature.properties?.routeId === route.routeId &&
              feature.properties?.source === "OpenStreetMap",
          );
          if (fallbackFeatures.length === 0) throw error;
          console.warn(
            `Using ${fallbackFeatures.length} cached OpenStreetMap features for ${route.description}: ${error.message}`,
          );
          return { fallbackFeatures };
        }),
    ),
  ]);
const [infrastructure, equipmentByStation, accessibleStationsHtml] = sourcePayloads;
const archives = sourcePayloads.slice(3, 3 + FEEDS.length);
const osmPayloads = sourcePayloads.slice(3 + FEEDS.length);
const accessibleStations = parseAccessibleStations(accessibleStationsHtml);

if (!Array.isArray(infrastructure.stations) || infrastructure.stations.length === 0) {
  throw new Error("MTA regional infrastructure response has no stations");
}

const branchByKey = new Map(
  (infrastructure.branches || []).map((branch) => [
    `${branch.railroad}:${branch.branch_id}`,
    branch,
  ]),
);
const feedResults = FEEDS.map((feed, index) =>
  parseGtfsFeed(feed, archives[index], branchByKey),
);
const stopsByAgency = new Map(
  feedResults.map((feed) => [
    feed.agency,
    new Map(
      feed.stops.flatMap((stop) => {
        const entries = [];
        if (stop.stop_id) entries.push([stop.stop_id, stop]);
        if (stop.stop_code) entries.push([stop.stop_code, stop]);
        return entries;
      }),
    ),
  ]),
);

const stations = infrastructure.stations
  .filter(
    (station) =>
      (station.railroad === "LIRR" || station.railroad === "MNR") &&
      !/employees/i.test(station.name || "") &&
      (station.exclude !== true ||
        accessibleStations[station.railroad].has(
          normalizeStationName(station.name),
        )),
  )
  .map((station) => {
    const gtfsStop = stopsByAgency
      .get(station.railroad)
      ?.get(String(station.gtfs_stop_id));
    const latitude = finiteCoordinate(station.latitude, gtfsStop?.stop_lat);
    const longitude = finiteCoordinate(station.longitude, gtfsStop?.stop_lon);
    const branch = branchByKey.get(
      `${station.railroad}:${station.branch_id}`,
    );
    const equipment = equipmentByStation[station.code] || {};
    const elevators = normalizeEquipment(equipment.elevators);
    const escalators = normalizeEquipment(equipment.escalators);
    const officialAccessibility = accessibleStations[station.railroad].get(
      normalizeStationName(station.name),
    );
    const branchIds = new Set([station.branch_id]);
    for (const branchId of officialAccessibility?.branchIds || []) {
      branchIds.add(branchId);
    }
    const serviceRouteIds = new Set(gtfsStop?.serviceRouteIds || []);
    if (
      station.railroad === "LIRR" &&
      BELMONT_PARK_SERVICE_STATION_CODES.has(station.code)
    ) {
      branchIds.add("BT");
      serviceRouteIds.add("BT");
    }

    if (latitude === null || longitude === null) {
      throw new Error(
        `Regional station ${station.railroad}:${station.code} has invalid coordinates`,
      );
    }

    return {
      agency: station.railroad,
      stationCode: station.code,
      gtfsStopId: String(station.gtfs_stop_id ?? ""),
      name:
        station.railroad === "LIRR" && station.code === "GCT"
          ? "Grand Central Madison"
          : station.name,
      branchId: [...branchIds].filter(Boolean).sort().join(","),
      branchName: branch?.full_name || station.branch || "Regional rail",
      branchColor: normalizeColor(branch?.background_color, "#64748B"),
      serviceRouteIds: [...serviceRouteIds].sort(compareRouteIds),
      latitude,
      longitude,
      accessibilityStatus: officialAccessibility
        ? "Accessible"
        : "Not accessible",
      accessMethods: officialAccessibility
        ? elevators.length > 0
          ? ["Elevator access"]
          : ["Ramp access"]
        : [],
      wheelchairBoarding: numericValue(gtfsStop?.wheelchair_boarding),
      stationDetailUrl: station.stationDetailURL || null,
      elevators,
      escalators,
    };
  })
  .sort(
    (left, right) =>
      left.agency.localeCompare(right.agency) || left.name.localeCompare(right.name),
  );

validateStations(stations, accessibleStations);

const accessibilitySnapshot = {
  metadata: {
    generatedAt,
    source:
      "MTA accessible-stations list with regional rail infrastructure and equipment status",
    infrastructureUrl: INFRASTRUCTURE_URL,
    equipmentStatusUrl: EQUIPMENT_STATUS_URL,
    equipmentStatusPageUrl: EQUIPMENT_STATUS_PAGE_URL,
    accessibleStationsUrl: ACCESSIBLE_STATIONS_URL,
    accessibleStationsUpdated: parsePageUpdatedDate(accessibleStationsHtml),
    termsUrl: TERMS_URL,
    stationCount: stations.length,
    agencies: Object.fromEntries(
      FEEDS.map((feed) => [
        feed.agency,
        stations.filter((station) => station.agency === feed.agency).length,
      ]),
    ),
    officialAccessibleStations: Object.fromEntries(
      Object.entries(accessibleStations).map(([agency, items]) => [
        agency,
        items.size,
      ]),
    ),
    feeds: feedResults.map(({ agency, feedVersion, name, url, validFrom, validTo }) => ({
      agency,
      name,
      url,
      feedVersion,
      validFrom,
      validTo,
    })),
  },
  stations,
};

const belmontParkServiceFeatures = buildBelmontParkServiceFeatures(
  feedResults,
  stations,
);
const routeFeatures = [
  ...feedResults.flatMap((feed) =>
    feed.features.filter(
      (feature) =>
        feed.agency !== "MNR" ||
        !MNR_OSM_ROUTES.some(
          (route) => route.routeId === feature.properties.routeId,
        ),
    ),
  ),
  ...belmontParkServiceFeatures,
  ...MNR_OSM_ROUTES.flatMap((route, index) =>
    Array.isArray(osmPayloads[index]?.fallbackFeatures)
      ? osmPayloads[index].fallbackFeatures
      : buildOsmRailFeatures(route, osmPayloads[index]),
  ),
];
const waterburyBranchFeatures = routeFeatures.filter(
  (feature) =>
    feature.properties.agency === "MNR" &&
    feature.properties.routeId === "6" &&
    feature.properties.source === "OpenStreetMap",
);
const waterburyConnector = buildWaterburyServiceConnector(
  feedResults,
  stations,
  waterburyBranchFeatures,
);
if (waterburyConnector) routeFeatures.push(waterburyConnector);
if (routeFeatures.length === 0) {
  throw new Error("MTA regional GTFS feeds produced no route geometry");
}

const routeCollection = {
  type: "FeatureCollection",
  metadata: {
    generatedAt,
    source: "MTA Long Island Rail Road and Metro-North Railroad GTFS",
    termsUrl: TERMS_URL,
    supplementalSources: [
      {
        name: "OpenStreetMap contributors",
        url: OSM_COPYRIGHT_URL,
        use: "Belmont Park, Harlem, and Waterbury track geometry",
      },
    ],
    usedCachedOsmGeometry: osmPayloads.some((payload) =>
      Array.isArray(payload?.fallbackFeatures),
    ),
    feeds: feedResults.map(({ agency, feedVersion, name, url, validFrom, validTo }) => ({
      agency,
      name,
      url,
      feedVersion,
      validFrom,
      validTo,
    })),
    routeCount: new Set(
      routeFeatures.map(
        (feature) => `${feature.properties.agency}:${feature.properties.routeId}`,
      ),
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
  `Wrote ${stations.length} LIRR/Metro-North stations and ${routeFeatures.length} route shapes`,
);

function parseGtfsFeed(feed, archive, branches) {
  const files = readZipEntries(archive, GTFS_FILES);
  for (const requiredFile of REQUIRED_GTFS_FILES) {
    if (!files.has(requiredFile)) {
      throw new Error(`${feed.name} GTFS is missing ${requiredFile}`);
    }
  }

  const feedInfo = files.has("feed_info.txt")
    ? parseCsv(files.get("feed_info.txt"))[0] || {}
    : {};
  const routes = parseCsv(files.get("routes.txt"));
  const stops = parseCsv(files.get("stops.txt"));
  const shapeRows = parseCsv(files.get("shapes.txt"));
  const stopTimeRows = parseCsv(files.get("stop_times.txt"));
  const tripRows = parseCsv(files.get("trips.txt"));
  const routesById = new Map(routes.map((route) => [route.route_id, route]));
  const routeByTripId = new Map(
    tripRows.map((trip) => [trip.trip_id, trip.route_id]),
  );
  const serviceRouteIdsByStopId = new Map();
  const routesByShape = new Map();
  const pointsByShape = new Map();

  for (const stopTime of stopTimeRows) {
    const routeId = routeByTripId.get(stopTime.trip_id);
    if (!routeId || !stopTime.stop_id) continue;
    const routeIds = serviceRouteIdsByStopId.get(stopTime.stop_id) || new Set();
    routeIds.add(routeId);
    serviceRouteIdsByStopId.set(stopTime.stop_id, routeIds);
  }

  for (const stop of stops) {
    if (!stop.parent_station) continue;
    const childRouteIds = serviceRouteIdsByStopId.get(stop.stop_id);
    if (!childRouteIds) continue;
    const parentRouteIds =
      serviceRouteIdsByStopId.get(stop.parent_station) || new Set();
    for (const routeId of childRouteIds) parentRouteIds.add(routeId);
    serviceRouteIdsByStopId.set(stop.parent_station, parentRouteIds);
  }

  const stopsWithServiceRoutes = stops.map((stop) => ({
    ...stop,
    serviceRouteIds: [...(serviceRouteIdsByStopId.get(stop.stop_id) || [])].sort(
      compareRouteIds,
    ),
  }));

  for (const trip of tripRows) {
    if (!trip.shape_id || !routesById.has(trip.route_id)) continue;
    const shapeRoutes = routesByShape.get(trip.shape_id) || new Set();
    shapeRoutes.add(trip.route_id);
    routesByShape.set(trip.shape_id, shapeRoutes);
  }

  for (const point of shapeRows) {
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
    const lineSegments = splitLineAtLongJumps(coordinates, MAX_ROUTE_SEGMENT_KM);
    for (const routeId of shapeRoutes) {
      const route = routesById.get(routeId);
      const branch = branches.get(`${feed.agency}:${routeId}`);
      if (!route) continue;

      for (const [segmentIndex, segmentCoordinates] of lineSegments.entries()) {
        const geometryKey = JSON.stringify(segmentCoordinates);
        const dedupeKey = `${feed.agency}:${routeId}:${geometryKey}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        features.push({
          type: "Feature",
          properties: {
            agency: feed.agency,
            color: normalizeColor(
              route.route_color ? `#${route.route_color}` : branch?.background_color,
              feed.agency === "LIRR" ? "#006EC7" : "#0039A6",
            ),
            description: route.route_long_name || branch?.full_name || feed.name,
            route: route.route_short_name || branch?.full_name || routeId,
            routeId,
            shapeId:
              lineSegments.length === 1 ? shapeId : `${shapeId}:${segmentIndex + 1}`,
          },
          geometry: { type: "LineString", coordinates: segmentCoordinates },
        });
      }
    }
  }

  features.sort(
    (left, right) =>
      left.properties.routeId.localeCompare(right.properties.routeId) ||
      left.properties.shapeId.localeCompare(right.properties.shapeId),
  );

  return {
    ...feed,
    feedVersion: feedInfo.feed_version || null,
    validFrom: feedInfo.feed_start_date || null,
    validTo: feedInfo.feed_end_date || null,
    stops: stopsWithServiceRoutes,
    features,
  };
}

function compareRouteIds(left, right) {
  const numericDifference = Number(left) - Number(right);
  return Number.isFinite(numericDifference) && numericDifference !== 0
    ? numericDifference
    : String(left).localeCompare(String(right));
}

async function readExistingRouteCollection() {
  try {
    return JSON.parse(await readFile(ROUTE_OUTPUT_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function splitLineAtLongJumps(coordinates, maximumDistanceKm) {
  const segments = [];
  let current = [coordinates[0]];

  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const coordinate = coordinates[index];
    if (distanceKm(previous, coordinate) > maximumDistanceKm) {
      if (current.length >= 2) segments.push(current);
      current = [coordinate];
    } else {
      current.push(coordinate);
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function buildOsmRailFeatures(route, payload) {
  const ways = Array.isArray(payload?.elements)
    ? payload.elements.filter(
        (element) =>
          element.type === "way" &&
          Array.isArray(element.geometry) &&
          !["crossover", "siding", "yard"].includes(element.tags?.service),
      )
    : [];
  if (ways.length === 0) {
    throw new Error(
      `OpenStreetMap relation ${route.relationId} produced no rail geometry`,
    );
  }

  const seen = new Set();
  return ways.flatMap((way) => {
    const coordinates = way.geometry
      .map(({ lat, lon }) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))])
      .filter(([longitude, latitude]) =>
        Number.isFinite(longitude) && Number.isFinite(latitude),
      );
    if (coordinates.length < 2) return [];

    const forwardKey = JSON.stringify(coordinates);
    const reverseKey = JSON.stringify([...coordinates].reverse());
    const geometryKey = forwardKey < reverseKey ? forwardKey : reverseKey;
    if (seen.has(geometryKey)) return [];
    seen.add(geometryKey);

    return [{
      type: "Feature",
      properties: {
        agency: "MNR",
        color: route.color,
        description: route.description,
        route: route.route,
        routeId: route.routeId,
        shapeId: `osm-${route.relationId}-${way.id}`,
        source: "OpenStreetMap",
        sourceUrl: OSM_COPYRIGHT_URL,
      },
      geometry: { type: "LineString", coordinates },
    }];
  });
}

function buildBelmontParkServiceFeatures(feedResults, stations) {
  const lirrFeatures =
    feedResults.find((feed) => feed.agency === "LIRR")?.features || [];
  const stationsByCode = new Map(
    stations
      .filter((station) => station.agency === "LIRR")
      .map((station) => [station.stationCode, station]),
  );
  const jamaica = stationsByCode.get("JAM");
  const woodside = stationsByCode.get("WDD");
  const terminalDefinitions = [
    { code: "NYK", id: "penn", label: "Penn Station" },
    { code: "GCT", id: "grand-central", label: "Grand Central Madison" },
  ];

  if (!jamaica || !woodside || lirrFeatures.length === 0) {
    throw new Error("Unable to build Belmont Park service via Jamaica and Woodside");
  }

  const spurCoordinates = BELMONT_PARK_SPUR.geometry.coordinates;
  const spurEndpoints = [spurCoordinates[0], spurCoordinates.at(-1)];

  return terminalDefinitions.map((terminalDefinition) => {
    const terminal = stationsByCode.get(terminalDefinition.code);
    if (!terminal) {
      throw new Error(
        `Unable to build Belmont Park service from ${terminalDefinition.label}`,
      );
    }

    const terminalCoordinate = [terminal.longitude, terminal.latitude];
    const jamaicaCoordinate = [jamaica.longitude, jamaica.latitude];
    const woodsideCoordinate = [woodside.longitude, woodside.latitude];
    const candidates = lirrFeatures
      .map((feature) => {
        const coordinates = feature.geometry.coordinates;
        const terminalMatch = nearestPointOnLine(coordinates, terminalCoordinate);
        const jamaicaMatch = nearestPointOnLine(coordinates, jamaicaCoordinate);
        const woodsideMatch = nearestPointOnLine(coordinates, woodsideCoordinate);
        const junctionMatches = spurEndpoints.map((endpoint, endpointIndex) => ({
          endpoint,
          endpointIndex,
          match: nearestPointOnLine(coordinates, endpoint),
        }));
        const junction = junctionMatches.sort(
          (left, right) => left.match.distanceKm - right.match.distanceKm,
        )[0];
        return {
          feature,
          jamaicaMatch,
          junction,
          score:
            terminalMatch.distanceKm +
            jamaicaMatch.distanceKm +
            woodsideMatch.distanceKm +
            junction.match.distanceKm,
          terminalMatch,
          woodsideMatch,
        };
      })
      .filter(
        (candidate) =>
          candidate.terminalMatch.distanceKm < 0.75 &&
          candidate.woodsideMatch.distanceKm < 0.75 &&
          candidate.jamaicaMatch.distanceKm < 0.75 &&
          candidate.junction.match.distanceKm < 0.75,
      )
      .sort((left, right) => left.score - right.score);
    const selected = candidates[0];
    if (!selected) {
      throw new Error(
        `No continuous LIRR GTFS shape connects ${terminalDefinition.label}, Woodside, Jamaica, and the Belmont Park spur`,
      );
    }

    const trunkCoordinates = sliceLineBetweenMatches(
      selected.feature.geometry.coordinates,
      selected.terminalMatch,
      selected.junction.match,
    );
    const orientedSpur =
      selected.junction.endpointIndex === 0
        ? spurCoordinates
        : [...spurCoordinates].reverse();
    const coordinates = [...trunkCoordinates];
    // The raw spur endpoint sits a few metres off the centerline of the GTFS
    // trunk. Retaining both points creates a conspicuous perpendicular notch
    // at high zoom, so replace that endpoint with the projected switch point.
    coordinates.push(...orientedSpur.slice(1));

    return {
      type: "Feature",
      properties: {
        ...BELMONT_PARK_SPUR.properties,
        description: `Belmont Park Branch via ${terminalDefinition.label}`,
        shapeId: `mta-gtfs-belmont-park-${terminalDefinition.id}`,
        source: "MTA LIRR GTFS and OpenStreetMap",
      },
      geometry: { type: "LineString", coordinates },
    };
  });
}

function nearestPointOnLine(coordinates, target) {
  let best = {
    coordinate: null,
    distanceKm: Number.POSITIVE_INFINITY,
    position: -1,
  };

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const longitudeDelta = end[0] - start[0];
    const latitudeDelta = end[1] - start[1];
    const lengthSquared = longitudeDelta ** 2 + latitudeDelta ** 2;
    const projection =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((target[0] - start[0]) * longitudeDelta +
                (target[1] - start[1]) * latitudeDelta) /
                lengthSquared,
            ),
          );
    const coordinate = [
      start[0] + longitudeDelta * projection,
      start[1] + latitudeDelta * projection,
    ];
    const candidateDistance = distanceKm(coordinate, target);
    if (candidateDistance < best.distanceKm) {
      best = {
        coordinate,
        distanceKm: candidateDistance,
        position: index + projection,
      };
    }
  }

  return best;
}

function sliceLineBetweenMatches(coordinates, start, end) {
  const reverse = start.position > end.position;
  const first = reverse ? end : start;
  const last = reverse ? start : end;
  const sliced = [first.coordinate];
  for (
    let index = Math.floor(first.position) + 1;
    index <= Math.floor(last.position);
    index += 1
  ) {
    sliced.push(coordinates[index]);
  }
  sliced.push(last.coordinate);

  const deduped = sliced.filter(
    (coordinate, index) =>
      index === 0 || distanceKm(sliced[index - 1], coordinate) > 0.001,
  );
  return reverse ? deduped.reverse() : deduped;
}

function buildWaterburyServiceConnector(feedResults, stations, branchFeatures) {
  const bridgeport = stations.find(
    (station) => station.agency === "MNR" && station.name === "Bridgeport",
  );
  const newHavenFeatures = feedResults
    .find((feed) => feed.agency === "MNR")
    ?.features.filter((feature) => feature.properties.routeId === "3") || [];
  const branchCoordinates = branchFeatures.flatMap(
    (feature) => feature.geometry.coordinates,
  );
  if (!bridgeport || newHavenFeatures.length === 0 || branchCoordinates.length === 0) {
    return null;
  }

  const bridgeportCoordinate = [bridgeport.longitude, bridgeport.latitude];
  const candidates = newHavenFeatures.map((feature) => {
    const bridgeportMatch = nearestCoordinate(
      feature.geometry.coordinates,
      bridgeportCoordinate,
    );
    const branchMatch = nearestCoordinatePair(
      feature.geometry.coordinates,
      branchCoordinates,
    );
    return {
      branchMatch,
      bridgeportMatch,
      feature,
      score: bridgeportMatch.distanceKm + branchMatch.distanceKm,
    };
  });
  const best = candidates.sort((left, right) => left.score - right.score)[0];
  if (
    !best ||
    best.bridgeportMatch.distanceKm > 1 ||
    best.branchMatch.distanceKm > 2
  ) {
    throw new Error("Unable to connect the Waterbury Branch to Bridgeport");
  }

  const coordinates = best.feature.geometry.coordinates;
  const startIndex = best.bridgeportMatch.index;
  const branchIndex = best.branchMatch.leftIndex;
  const connector =
    startIndex <= branchIndex
      ? coordinates.slice(startIndex, branchIndex + 1)
      : coordinates.slice(branchIndex, startIndex + 1).reverse();
  const lastCoordinate = connector[connector.length - 1];
  if (distanceKm(lastCoordinate, best.branchMatch.rightCoordinate) > 0.001) {
    connector.push(best.branchMatch.rightCoordinate);
  }

  return {
    type: "Feature",
    properties: {
      agency: "MNR",
      color: "#E00034",
      description: "Waterbury Branch Bridgeport connector",
      route: "Waterbury",
      routeId: "6",
      shapeId: "mta-gtfs-waterbury-bridgeport-connector",
      source: "MTA Metro-North GTFS",
      sourceUrl: FEEDS.find((feed) => feed.agency === "MNR")?.url,
    },
    geometry: { type: "LineString", coordinates: connector },
  };
}

function nearestCoordinate(coordinates, target) {
  return coordinates.reduce(
    (best, coordinate, index) => {
      const candidateDistance = distanceKm(coordinate, target);
      return candidateDistance < best.distanceKm
        ? { coordinate, distanceKm: candidateDistance, index }
        : best;
    },
    { coordinate: null, distanceKm: Number.POSITIVE_INFINITY, index: -1 },
  );
}

function nearestCoordinatePair(leftCoordinates, rightCoordinates) {
  return leftCoordinates.reduce(
    (best, leftCoordinate, leftIndex) => {
      const rightMatch = nearestCoordinate(rightCoordinates, leftCoordinate);
      return rightMatch.distanceKm < best.distanceKm
        ? {
            distanceKm: rightMatch.distanceKm,
            leftIndex,
            rightCoordinate: rightMatch.coordinate,
          }
        : best;
    },
    {
      distanceKm: Number.POSITIVE_INFINITY,
      leftIndex: -1,
      rightCoordinate: null,
    },
  );
}

function distanceKm([longitudeA, latitudeA], [longitudeB, latitudeB]) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const leftLatitude = toRadians(latitudeA);
  const rightLatitude = toRadians(latitudeB);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function parseAccessibleStations(html) {
  const result = { LIRR: new Map(), MNR: new Map() };
  const sections = {
    LIRR: sliceHtmlSection(html, "long-island-rail-road", "metro-north-railroad"),
    MNR: sliceHtmlSection(html, "metro-north-railroad"),
  };

  for (const [agency, section] of Object.entries(sections)) {
    const branchIds = ACCESSIBILITY_BRANCH_IDS[agency];
    for (const match of section.matchAll(
      /<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi,
    )) {
      const branchName = htmlToText(match[1]);
      const branchId = branchIds[branchName];
      if (!branchId) continue;

      for (const item of match[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
        const name = htmlToText(item[1]);
        const key = normalizeStationName(name);
        const current = result[agency].get(key) || {
          names: new Set(),
          branchIds: new Set(),
          branchNames: new Set(),
        };
        current.names.add(name);
        current.branchIds.add(branchId);
        current.branchNames.add(branchName);
        result[agency].set(key, current);
      }
    }
  }

  if (result.LIRR.size < 110 || result.MNR.size < 70) {
    throw new Error(
      `MTA accessible-stations page produced implausible counts: ${result.LIRR.size} LIRR, ${result.MNR.size} MNR`,
    );
  }
  return result;
}

function sliceHtmlSection(html, id, nextId) {
  const start = html.indexOf(`id="${id}"`);
  const end = nextId ? html.indexOf(`id="${nextId}"`, start + 1) : html.length;
  if (start < 0 || end < 0) {
    throw new Error(`MTA accessible-stations page is missing section ${id}`);
  }
  return html.slice(start, end);
}

function parsePageUpdatedDate(html) {
  return htmlToText(html).match(/Updated\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/)?.[1] || null;
}

function htmlToText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStationName(value) {
  return htmlToText(value)
    .toLowerCase()
    .replace(/\bgrand central madison\b/g, "grand central")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bavenue\b/g, "av")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bmount\b/g, "mt")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bbnl\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEquipment(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    unitId: String(item.unitId || ""),
    location: item.location || "Location unavailable",
    status: normalizeEquipmentStatus(item.status),
    lastUpdated: item.lastUpdated || null,
  }));
}

function normalizeEquipmentStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status.includes("long term")) return "long_term_outage";
  if (status === "not working" || status.includes("outage")) return "outage";
  if (status === "working") return "operational";
  return "unknown";
}

function validateStations(items, officialAccessibility) {
  const ids = new Set();
  for (const station of items) {
    const id = `${station.agency}:${station.stationCode}`;
    if (ids.has(id)) throw new Error(`Duplicate regional station ${id}`);
    ids.add(id);
  }
  for (const agency of FEEDS.map((feed) => feed.agency)) {
    if (!items.some((station) => station.agency === agency)) {
      throw new Error(`Regional station snapshot is missing ${agency}`);
    }
    const localStationNames = new Set(
      items
        .filter((station) => station.agency === agency)
        .map((station) => normalizeStationName(station.name)),
    );
    const unmatchedOfficialStations = [
      ...officialAccessibility[agency].entries(),
    ].filter(([name]) => !localStationNames.has(name));
    if (unmatchedOfficialStations.length > 0) {
      throw new Error(
        `Unable to match official ${agency} accessible stations: ${unmatchedOfficialStations
          .flatMap(([, station]) => [...station.names])
          .join(", ")}`,
      );
    }
  }
}

function finiteCoordinate(primary, fallback) {
  const primaryNumber = Number(primary);
  if (Number.isFinite(primaryNumber)) return primaryNumber;
  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) ? fallbackNumber : null;
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeColor(value, fallback) {
  const color = String(value || fallback).trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
}

function readZipEntries(buffer, wantedFiles) {
  const endSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  let endOffset = -1;

  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Invalid GTFS ZIP: end record not found");

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let centralOffset = buffer.readUInt32LE(endOffset + 16);
  const result = new Map();

  for (let entry = 0; entry < entryCount; entry += 1) {
    if (buffer.readUInt32LE(centralOffset) !== centralSignature) {
      throw new Error("Invalid GTFS ZIP: central directory entry not found");
    }
    const compressionMethod = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer
      .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
      .toString("utf8");

    if (wantedFiles.has(fileName)) {
      if (buffer.readUInt32LE(localOffset) !== localSignature) {
        throw new Error(`Invalid GTFS ZIP: local entry missing for ${fileName}`);
      }
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      const contents =
        compressionMethod === 0
          ? compressed
          : compressionMethod === 8
            ? inflateRawSync(compressed)
            : null;
      if (!contents) {
        throw new Error(
          `Unsupported ZIP compression method ${compressionMethod} for ${fileName}`,
        );
      }
      result.set(fileName, contents.toString("utf8"));
    }
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return result;
}

function parseCsv(source) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "") : header,
  );
  return dataRows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  const squareTolerance = tolerance * tolerance;
  const markers = new Uint8Array(points.length);
  const stack = [[0, points.length - 1]];
  markers[0] = 1;
  markers[points.length - 1] = 1;

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maximumDistance = squareTolerance;
    let splitIndex = 0;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squareSegmentDistance(points[index], points[first], points[last]);
      if (distance > maximumDistance) {
        splitIndex = index;
        maximumDistance = distance;
      }
    }
    if (splitIndex > 0) {
      markers[splitIndex] = 1;
      stack.push([first, splitIndex], [splitIndex, last]);
    }
  }
  return points.filter((_, index) => markers[index] === 1);
}

function squareSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let deltaX = end[0] - x;
  let deltaY = end[1] - y;
  if (deltaX !== 0 || deltaY !== 0) {
    const projection =
      ((point[0] - x) * deltaX + (point[1] - y) * deltaY) /
      (deltaX * deltaX + deltaY * deltaY);
    if (projection > 1) {
      x = end[0];
      y = end[1];
    } else if (projection > 0) {
      x += deltaX * projection;
      y += deltaY * projection;
    }
  }
  deltaX = point[0] - x;
  deltaY = point[1] - y;
  return deltaX * deltaX + deltaY * deltaY;
}
