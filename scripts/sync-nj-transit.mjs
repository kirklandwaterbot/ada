import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry } from "./fetch-with-retry.mjs";
import { parseCsv, readZipEntries, simplifyLine } from "./gtfs-utils.mjs";

const GTFS_URL = "https://www.njtransit.com/rail_data.zip";
const ACCESSIBILITY_API_URL = "https://www.njtransit.com/api/graphql/graphql";
const ACCESSIBILITY_URL =
  "https://www.njtransit.com/accessibility/train-accessibility";
const LIGHT_RAIL_ACCESSIBILITY_URL =
  "https://www.njtransit.com/accessibility/light-rail-accessibility";
const ELEVATOR_STATUS_URL = "https://www.njtransit.com/elevator-status";
const DATA_OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "nj-transit-accessibility.json",
);
const ROUTE_OUTPUT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "nj-transit-routes.geojson",
);
const METRO_MEMORY_GEOMETRY_PATH = path.join(
  process.cwd(),
  "data",
  "metro-memory-transit-geometry.json",
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
const LIGHT_RAIL_ROUTE_IDS = new Set(["4", "13", "17"]);
const METRO_LIGHT_RAIL_SERVICE_IDS = new Map([
  ["HBLR 8th Street–Hoboken", "HBLR-8H"],
  ["HBLR Bayonne Flyer", "HBLR-8H"],
  ["HBLR West Side–Tonnelle", "HBLR-WST"],
  ["HBLR Hoboken–Tonnelle", "HBLR-HT"],
  ["Newark Light Rail", "NLR-NCS"],
  ["Broad Street Extension", "NLR-BSE"],
]);
const MAIN_LINE_ROUTE_ID = "5-main";
const BERGEN_COUNTY_ROUTE_ID = "5-bergen";
const MAIN_LINE_ONLY_STATIONS = new Set(
  [
    "Glen Rock Main Line",
    "Hawthorne",
    "Paterson",
    "Clifton",
    "Passaic",
    "Delawanna",
    "Lyndhurst",
  ].map(normalizeStationName),
);
const BERGEN_COUNTY_ONLY_STATIONS = new Set(
  [
    "Glen Rock Boro Hall",
    "Radburn",
    "Broadway",
    "Plauderville",
    "Garfield",
    "Wesmont",
    "Rutherford",
  ].map(normalizeStationName),
);
const PORT_JERVIS_STATIONS = new Set(
  [
    "Hoboken",
    "Secaucus Junction",
    "Secaucus Lower Level",
    "Secaucus Upper Level",
    "Ramsey Route 17",
    "Mahwah",
    "Suffern",
    "Sloatsburg",
    "Tuxedo",
    "Harriman",
    "Salisbury Mills-Cornwall",
    "Campbell Hall",
    "Middletown NY",
    "Otisville",
    "Port Jervis",
  ].map(normalizeStationName),
);
const NJT_ROUTE_OVERRIDES = new Map([
  [
    MAIN_LINE_ROUTE_ID,
    {
      route_id: MAIN_LINE_ROUTE_ID,
      route_short_name: "Main",
      route_long_name: "Main Line",
      route_color: "FFCF01",
    },
  ],
  [
    BERGEN_COUNTY_ROUTE_ID,
    {
      route_id: BERGEN_COUNTY_ROUTE_ID,
      route_short_name: "Bergen County",
      route_long_name: "Bergen County Line",
      route_color: "B9C9DF",
    },
  ],
  [
    "6",
    {
      route_id: "6",
      route_short_name: "Port Jervis",
      route_long_name: "Port Jervis Line",
      route_color: "FF7900",
    },
  ],
]);
const LIGHT_RAIL_SERVICE_ROUTES = new Map([
  [
    "HBLR-8H",
    {
      route_id: "HBLR-8H",
      route_short_name: "8th Street–Hoboken",
      route_long_name: "8th Street–Hoboken",
      route_color: "009EDA",
    },
  ],
  [
    "HBLR-WST",
    {
      route_id: "HBLR-WST",
      route_short_name: "West Side Avenue–Tonnelle Avenue",
      route_long_name: "West Side Avenue–Tonnelle Avenue",
      route_color: "FFDD00",
    },
  ],
  [
    "HBLR-HT",
    {
      route_id: "HBLR-HT",
      route_short_name: "Hoboken–Tonnelle Avenue",
      route_long_name: "Hoboken–Tonnelle Avenue",
      route_color: "008C4E",
    },
  ],
  [
    "NLR-NCS",
    {
      route_id: "NLR-NCS",
      route_short_name: "Grove Street–Newark Penn",
      route_long_name: "Grove Street–Newark Penn",
      route_color: "00A7E5",
    },
  ],
  [
    "NLR-BSE",
    {
      route_id: "NLR-BSE",
      route_short_name: "Broad Street–Newark Penn",
      route_long_name: "Broad Street–Newark Penn",
      route_color: "FECE05",
    },
  ],
]);
const NEWARK_LIGHT_RAIL_INACCESSIBLE = new Set(
  ["Military Park", "Norfolk Street", "Park Avenue Newark", "Warren Street"].map(
    normalizeStationName,
  ),
);
const MINI_HIGH_PLATFORM_STATIONS = new Set(
  ["East Orange", "Madison", "Morristown", "South Orange"].map(
    normalizeStationName,
  ),
);
const ELEVATOR_STATION_ALIASES = new Map(
  [
    ["Newark Airport Rail Station", "Newark Liberty International Airport"],
    ["Philadelphia 30th Street Station", "30th Street Philadelphia"],
    ["8th Street Station (Bayonne)", "8th Street"],
    ["9th Street - Congress Street (HBLR)", "9th Street"],
    ["22nd Street Station (Bayonne)", "22nd Street"],
    ["34th Street Station (Bayonne)", "34th Street"],
    ["45th Street Station (Bayonne)", "45th Street"],
    ["Bergenline Avenue Station", "Bergenline Ave"],
    ["Bloomfield Avenue Station (Newark)", "Bloomfield Avenue"],
    ["Danforth Avenue Station Jersey City", "Danforth Avenue"],
    ["Garfield Avenue Station (HBLR)", "Garfield Avenue"],
    ["Port Imperial Station Weehawken", "Port Imperial"],
    ["Tonnelle Avenue Station North Bergen", "Tonnelle Avenue"],
  ].map(([source, target]) => [
    normalizeStationName(source),
    normalizeStationName(target),
  ]),
);
const ACCESSIBLE_RAIL_STATIONS = new Set(
  [
    "30th Street Philadelphia",
    "Absecon",
    "Aberdeen-Matawan",
    "Asbury Park",
    "Atlantic City",
    "Atco",
    "Bay Street",
    "Boonton",
    "Campbell Hall",
    "Cherry Hill",
    "Denville",
    "Dover",
    "East Orange",
    "Edison",
    "Egg Harbor City",
    "Egg Harbor",
    "Elberon",
    "Elizabeth",
    "Essex Street",
    "Gladstone",
    "Glen Rock Boro Hall",
    "Hackettstown",
    "Hamilton",
    "Hammonton",
    "Harriman",
    "Hazlet",
    "Hoboken",
    "Linden",
    "Lindenwold",
    "Long Branch",
    "Lyndhurst",
    "Lyons",
    "Madison",
    "Meadowlands Rail Station",
    "Metuchen",
    "Metropark",
    "Middletown New Jersey",
    "Middletown New York",
    "Middletown Nj",
    "Middletown Ny",
    "Montclair Heights",
    "Montclair State University",
    "Msu",
    "Montvale",
    "Morristown",
    "Mount Arlington",
    "Mount Olive",
    "Mountain View",
    "Nanuet",
    "New Brunswick",
    "New York Penn Station",
    "Newark Broad Street",
    "Newark Liberty International Airport",
    "Newark Airport Railroad Station",
    "Newark Penn Station",
    "North Elizabeth",
    "Paterson",
    "Pennsauken Transit Center",
    "Plainfield",
    "Point Pleasant Beach",
    "Point Pleasant",
    "Port Jervis",
    "Princeton",
    "Princeton Junction",
    "Princeton Jct.",
    "Rahway",
    "Ramsey",
    "Ramsey Route 17",
    "Red Bank",
    "Ridgewood",
    "Rutherford",
    "Salisbury Mills-Cornwall",
    "Secaucus Junction",
    "Somerville",
    "South Amboy",
    "South Orange",
    "Spring Valley",
    "Summit",
    "Towaco",
    "Trenton Transit Center",
    "Union",
    "Wayne Route 23",
    "Wayne/Route 23 Transit Center [rr]",
    "Wesmont",
    "Westfield",
    "Westwood",
    "Woodbridge",
  ].map(normalizeStationName),
);
const [archive, accessibilityPayload, elevatorHtml, metroMemoryGeometry] =
  await Promise.all([
  fetchWithRetry(GTFS_URL, {}, {
    consume: async (response) => Buffer.from(await response.arrayBuffer()),
    timeoutMs: 60_000,
  }),
  fetchWithRetry(ACCESSIBILITY_API_URL, {
    body: JSON.stringify({
      query: "{ getTripPlannerLocationsHome { title accessible } }",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }, {
    consume: (response) => response.json(),
  }),
  fetchWithRetry(ELEVATOR_STATUS_URL, {}, {
    consume: (response) => response.text(),
  }),
  readFile(METRO_MEMORY_GEOMETRY_PATH, "utf8").then(JSON.parse),
]);
const officialLocations =
  accessibilityPayload?.data?.getTripPlannerLocationsHome;
if (!Array.isArray(officialLocations) || officialLocations.length === 0) {
  throw new Error("NJ Transit accessibility response has no locations");
}

const files = readZipEntries(archive, WANTED_FILES);
for (const requiredFile of REQUIRED_FILES) {
  if (!files.has(requiredFile)) {
    throw new Error(`NJ Transit GTFS is missing ${requiredFile}`);
  }
}

const feedInfo = files.has("feed_info.txt")
  ? parseCsv(files.get("feed_info.txt"))[0] || {}
  : {};
const routes = parseCsv(files.get("routes.txt"));
const shapes = parseCsv(files.get("shapes.txt"));
const stopTimes = parseCsv(files.get("stop_times.txt"));
const stops = parseCsv(files.get("stops.txt"));
const trips = parseCsv(files.get("trips.txt"));
const routesById = new Map([
  ...routes.map((route) => [route.route_id, route]),
  ...NJT_ROUTE_OVERRIDES,
]);
const routeIdsByStop = buildRouteIdsByStop(stopTimes, trips, stops);
const lightRailServiceIdsByStop = buildLightRailServiceIdsByStop(
  stopTimes,
  trips,
  stops,
);
const officialAccessibility = buildAccessibilityIndex(officialLocations);
const elevatorEquipment = parseElevatorEquipment(elevatorHtml);

const stationRows = stops
  .flatMap((stop) => {
    if (
      ["COMMUNIPAW JUNCTION", "TONNELLE - WESTSIDE DEKALB JCT"].includes(
        stop.stop_name,
      )
    ) {
      return [];
    }
    const routeIds = [...(routeIdsByStop.get(stop.stop_id) || [])]
      .filter((routeId) => routesById.has(routeId))
      .sort((left, right) => {
        const leftRoute = routesById.get(left);
        const rightRoute = routesById.get(right);
        return (leftRoute?.route_long_name || left).localeCompare(
          rightRoute?.route_long_name || right,
        );
      });
    if (routeIds.length === 0) return [];

    const latitude = Number(stop.stop_lat);
    const longitude = Number(stop.stop_lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

    const accessibility = findOfficialAccessibility(
      stop.stop_name,
      officialAccessibility,
    );
    const servedRoutes = routeIds
      .map((routeId) => routesById.get(routeId))
      .filter(Boolean)
      .sort((left, right) =>
        (left.route_long_name || left.route_short_name).localeCompare(
          right.route_long_name || right.route_short_name,
        ),
      );

    return [{
      agency: "NJ Transit",
      stationCode: String(stop.stop_code || stop.stop_id),
      gtfsStopId: stop.stop_id,
      name: formatStationName(stop.stop_name),
      branchId: routeIds.join(","),
      branchName: [
        ...new Set(
          servedRoutes.map(
            (route) => route.route_long_name || route.route_short_name || route.route_id,
          ),
        ),
      ].join(" / "),
      branchColor: normalizeColor(
        servedRoutes[0]?.route_color
          ? `#${servedRoutes[0].route_color}`
          : null,
        "#003DA5",
      ),
      serviceRouteIds: [
        ...(lightRailServiceIdsByStop.get(stop.stop_id) || []),
      ].sort(),
      latitude,
      longitude,
      accessibilityStatus: accessibility
        ? accessibility.accessible
          ? "Accessible"
          : "Not accessible"
        : "Unknown",
      wheelchairBoarding: accessibility
        ? accessibility.accessible
          ? 1
          : 2
        : null,
      stationDetailUrl: ACCESSIBILITY_URL,
      elevators: [],
      escalators: [],
    }];
  });
const stations = mergeStations(stationRows)
  .map((station) => applyVerifiedAccessibility(station, elevatorEquipment))
  .sort((left, right) => left.name.localeCompare(right.name));
const matchedAccessibilityCount = stations.filter(
  (station) => station.accessibilityStatus !== "Unknown",
).length;

validateStations(stations, matchedAccessibilityCount);
const gtfsRouteFeatures = buildRouteFeatures(
  routes,
  trips,
  shapes,
  stops,
  stopTimes,
);
const gtfsLightRailServiceIds = new Set(
  gtfsRouteFeatures
    .map((feature) => feature.properties.routeId)
    .filter((routeId) => LIGHT_RAIL_SERVICE_ROUTES.has(routeId)),
);
const routeFeatures = [
  ...gtfsRouteFeatures.filter(
    (feature) => !["4", "13"].includes(feature.properties.routeId),
  ),
  ...(metroMemoryGeometry.lightRailFeatures || [])
    .map(normalizeMetroLightRailRouteFeature)
    .filter(
      (feature) =>
        !gtfsLightRailServiceIds.has(feature.properties.routeId),
    ),
];
if (routeFeatures.length === 0) {
  throw new Error("NJ Transit GTFS produced no route geometry");
}

const generatedAt = new Date().toISOString();
const elevatorStations = stations.filter((station) => station.elevators.length > 0);
const elevatorCount = stations.reduce(
  (total, station) => total + station.elevators.length,
  0,
);
const elevatorOutageCount = stations.reduce(
  (total, station) =>
    total + station.elevators.filter((elevator) => elevator.status === "outage").length,
  0,
);
const lightRailElevatorStations = stations.filter((station) =>
  station.elevators.some((elevator) => elevator.system === "light_rail"),
);
const accessibilitySnapshot = {
  metadata: {
    generatedAt,
    source:
      "NJ Transit rail GTFS, official accessibility guidance, and verified station rules",
    gtfsUrl: GTFS_URL,
    accessibilityApiUrl: ACCESSIBILITY_API_URL,
    accessibilityUrl: ACCESSIBILITY_URL,
    elevatorStatusUrl: ELEVATOR_STATUS_URL,
    stationCount: stations.length,
    matchedAccessibilityCount,
    accessibleStationCount: stations.filter(
      (station) => station.accessibilityStatus === "Accessible",
    ).length,
    elevatorCount,
    elevatorStationCount: elevatorStations.length,
    elevatorOutageCount,
    lightRailElevatorCount: lightRailElevatorStations.reduce(
      (total, station) =>
        total +
        station.elevators.filter((elevator) => elevator.system === "light_rail")
          .length,
      0,
    ),
    lightRailElevatorStationCount: lightRailElevatorStations.length,
    lightRailElevatorOutageCount: lightRailElevatorStations.reduce(
      (total, station) =>
        total +
        station.elevators.filter(
          (elevator) =>
            elevator.system === "light_rail" && elevator.status === "outage",
        ).length,
      0,
    ),
    feedVersion: feedInfo.feed_version || null,
    validFrom: feedInfo.feed_start_date || null,
    validTo: feedInfo.feed_end_date || null,
  },
  stations,
};
const routeCollection = {
  type: "FeatureCollection",
  metadata: {
    generatedAt,
    source: "NJ Transit rail GTFS",
    sourceUrl: GTFS_URL,
    supplementalSource:
      "Official NJ Transit GTFS service shapes with Metro Memory fallback geometry",
    routeCount: new Set(
      routeFeatures.map((feature) => feature.properties.routeId),
    ).size,
    feedVersion: feedInfo.feed_version || null,
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
  `Wrote ${stations.length} NJ Transit stations (${matchedAccessibilityCount} accessibility matches) and ${routeFeatures.length} route shapes`,
);

function buildRouteIdsByStop(stopTimeRows, tripRows, stopRows) {
  const routeByTrip = new Map(
    tripRows.map((trip) => [trip.trip_id, trip.route_id]),
  );
  const stopNameById = new Map(
    stopRows.map((stop) => [stop.stop_id, normalizeStationName(stop.stop_name)]),
  );
  const result = new Map();
  for (const stopTime of stopTimeRows) {
    const routeId = routeByTrip.get(stopTime.trip_id);
    if (!routeId || !stopTime.stop_id) continue;
    const routeIds = result.get(stopTime.stop_id) || new Set();
    routeIds.add(routeId);
    result.set(stopTime.stop_id, routeIds);
  }

  for (const [stopId, routeIds] of result) {
    const stopName = stopNameById.get(stopId) || "";
    if (routeIds.delete("5")) {
      if (MAIN_LINE_ONLY_STATIONS.has(stopName)) {
        routeIds.add(MAIN_LINE_ROUTE_ID);
      } else if (BERGEN_COUNTY_ONLY_STATIONS.has(stopName)) {
        routeIds.add(BERGEN_COUNTY_ROUTE_ID);
      } else {
        routeIds.add(MAIN_LINE_ROUTE_ID);
        routeIds.add(BERGEN_COUNTY_ROUTE_ID);
      }
    }
    if (routeIds.has("6") && !PORT_JERVIS_STATIONS.has(stopName)) {
      routeIds.delete("6");
    }
  }

  return result;
}

function mergeStations(items) {
  const stationsByName = new Map();
  for (const station of items) {
    const key = normalizeStationName(station.name);
    const current = stationsByName.get(key);
    if (!current) {
      stationsByName.set(key, station);
      continue;
    }
    const branchNames = new Set(
      `${current.branchName} / ${station.branchName}`.split(" / "),
    );
    const branchIds = new Set(
      `${current.branchId},${station.branchId}`.split(",").filter(Boolean),
    );
    const serviceRouteIds = new Set([
      ...(current.serviceRouteIds || []),
      ...(station.serviceRouteIds || []),
    ]);
    current.stationCode = `${current.stationCode}+${station.stationCode}`;
    current.gtfsStopId = `${current.gtfsStopId},${station.gtfsStopId}`;
    current.branchId = [...branchIds].sort().join(",");
    current.branchName = [...branchNames].sort().join(" / ");
    current.serviceRouteIds = [...serviceRouteIds].sort();
    if (current.accessibilityStatus === "Unknown") {
      current.accessibilityStatus = station.accessibilityStatus;
      current.wheelchairBoarding = station.wheelchairBoarding;
    }
  }
  return [...stationsByName.values()];
}

function buildLightRailServiceIdsByStop(stopTimeRows, tripRows, stopRows) {
  const stopsById = new Map(
    stopRows.map((stop) => [stop.stop_id, stop.stop_name]),
  );
  const stopTimesByTrip = new Map();
  for (const stopTime of stopTimeRows) {
    const items = stopTimesByTrip.get(stopTime.trip_id) || [];
    items.push(stopTime);
    stopTimesByTrip.set(stopTime.trip_id, items);
  }

  const serviceIdsByStop = new Map();
  for (const trip of tripRows) {
    if (trip.route_id !== "4" && trip.route_id !== "13") continue;
    const tripStopTimes = (stopTimesByTrip.get(trip.trip_id) || []).sort(
      (left, right) => Number(left.stop_sequence) - Number(right.stop_sequence),
    );
    if (tripStopTimes.length < 2) continue;
    const endpoints = [
      stopsById.get(tripStopTimes[0].stop_id) || "",
      stopsById.get(tripStopTimes.at(-1).stop_id) || "",
    ];
    const serviceId = classifyLightRailService(trip.route_id, endpoints);
    if (!serviceId) continue;

    for (const stopTime of tripStopTimes) {
      const serviceIds = serviceIdsByStop.get(stopTime.stop_id) || new Set();
      serviceIds.add(serviceId);
      serviceIdsByStop.set(stopTime.stop_id, serviceIds);
    }
  }
  return serviceIdsByStop;
}

function buildLightRailServiceIdsByShape(stopTimeRows, tripRows, stopRows) {
  const stopsById = new Map(
    stopRows.map((stop) => [stop.stop_id, stop.stop_name]),
  );
  const stopTimesByTrip = new Map();
  for (const stopTime of stopTimeRows) {
    const items = stopTimesByTrip.get(stopTime.trip_id) || [];
    items.push(stopTime);
    stopTimesByTrip.set(stopTime.trip_id, items);
  }

  const serviceIdsByShape = new Map();
  for (const trip of tripRows) {
    if (!trip.shape_id || (trip.route_id !== "4" && trip.route_id !== "13")) {
      continue;
    }
    const tripStopTimes = (stopTimesByTrip.get(trip.trip_id) || []).sort(
      (left, right) => Number(left.stop_sequence) - Number(right.stop_sequence),
    );
    if (tripStopTimes.length < 2) continue;
    const endpoints = [
      stopsById.get(tripStopTimes[0].stop_id) || "",
      stopsById.get(tripStopTimes.at(-1).stop_id) || "",
    ];
    const serviceId = classifyLightRailService(trip.route_id, endpoints);
    if (!serviceId) continue;

    const serviceIds = serviceIdsByShape.get(trip.shape_id) || new Set();
    serviceIds.add(serviceId);
    serviceIdsByShape.set(trip.shape_id, serviceIds);
  }
  return serviceIdsByShape;
}

function classifyLightRailService(routeId, endpoints) {
  const hasEndpoint = (pattern) =>
    endpoints.some((endpoint) => endpoint.includes(pattern));

  if (routeId === "4") {
    if (hasEndpoint("TONNELLE AVENUE") && hasEndpoint("WEST SIDE AVENUE")) {
      return "HBLR-WST";
    }
    if (hasEndpoint("TONNELLE AVENUE") && hasEndpoint("HOBOKEN TERMINAL")) {
      return "HBLR-HT";
    }
    if (hasEndpoint("8TH STREET") && hasEndpoint("HOBOKEN TERMINAL")) {
      return "HBLR-8H";
    }
  }

  if (routeId === "13") {
    if (hasEndpoint("PENN STATION") && hasEndpoint("GROVE STREET")) {
      return "NLR-NCS";
    }
    if (hasEndpoint("PENN STATION") && hasEndpoint("BROAD STREET")) {
      return "NLR-BSE";
    }
  }

  return null;
}

function normalizeMetroLightRailRouteFeature(feature) {
  const description = String(feature.properties?.description || "");
  const routeId = METRO_LIGHT_RAIL_SERVICE_IDS.get(description);
  if (!routeId) {
    throw new Error(
      `Unrecognized Metro Memory light-rail service: ${description || "(missing description)"}`,
    );
  }

  return {
    ...feature,
    properties: {
      ...feature.properties,
      routeId,
    },
  };
}

function applyVerifiedAccessibility(station, elevatorEquipment) {
  const routeIds = new Set(station.branchId.split(","));
  const normalizedName = normalizeStationName(station.name);
  const isHudsonBergen = routeIds.has("4");
  const isNewarkLightRail = routeIds.has("13");
  const isRiverLine = routeIds.has("17");
  const isLightRail = isHudsonBergen || isNewarkLightRail || isRiverLine;
  const isCommuterRail = [...routeIds].some(
    (routeId) => !LIGHT_RAIL_ROUTE_IDS.has(routeId),
  );
  const accessible =
    isHudsonBergen ||
    (isNewarkLightRail && !NEWARK_LIGHT_RAIL_INACCESSIBLE.has(normalizedName)) ||
    isRiverLine ||
    (isCommuterRail && ACCESSIBLE_RAIL_STATIONS.has(normalizedName));

  station.accessibilityStatus = accessible ? "Accessible" : "Not accessible";
  station.wheelchairBoarding = accessible ? 1 : 2;
  station.stationDetailUrl = isLightRail
    ? LIGHT_RAIL_ACCESSIBILITY_URL
    : ACCESSIBILITY_URL;
  station.elevators = elevatorEquipment.get(normalizedName) || [];
  station.accessMethods = accessible
    ? MINI_HIGH_PLATFORM_STATIONS.has(normalizedName)
      ? ["Mini-high platform", "Elevator access"]
      : isLightRail
        ? [
            "Level boarding",
            station.elevators.length > 0
              ? "Elevator access"
              : "Ramp / street-level access",
          ]
        : station.elevators.length > 0
          ? ["Elevator access"]
          : ["Accessible boarding"]
    : [];
  return station;
}

function parseElevatorEquipment(html) {
  const equipmentByStation = new Map();
  const sections = [
    {
      label: "Rail",
      prefix: "NJT-RAIL",
      system: "rail",
      minimumStations: 25,
    },
    {
      label: "Light Rail",
      prefix: "NJT-LR",
      system: "light_rail",
      minimumStations: 10,
    },
  ];

  for (const section of sections) {
    const labelPattern = section.label.replace(" ", "\\s+");
    const tableBody = html.match(
      new RegExp(`<dt>\\s*${labelPattern}\\s*<\\/dt>[\\s\\S]*?<tbody>([\\s\\S]*?)<\\/tbody>`, "i"),
    )?.[1];
    if (!tableBody) {
      throw new Error(
        `NJ Transit elevator-status page has no ${section.label} table`,
      );
    }

    const sectionStations = new Set();
    for (const row of tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (cell) => htmlToText(cell[1]),
      );
      if (cells.length < 3) continue;

      const sourceKey = normalizeStationName(cells[0]);
      const stationKey = ELEVATOR_STATION_ALIASES.get(sourceKey) || sourceKey;
      const equipment = equipmentByStation.get(stationKey) || [];
      const unitOrdinal = equipment.length + 1;
      equipment.push({
        unitId: `${section.prefix}-${slugify(cells[0])}-${unitOrdinal}`,
        system: section.system,
        location: cells[1] || "Station elevator",
        status: /out of service/i.test(cells[2]) ? "outage" : "operational",
        lastUpdated: null,
      });
      equipmentByStation.set(stationKey, equipment);
      sectionStations.add(stationKey);
    }

    if (sectionStations.size < section.minimumStations) {
      throw new Error(
        `NJ Transit elevator-status page produced only ${sectionStations.size} ${section.label} elevator stations`,
      );
    }
  }

  return equipmentByStation;
}

function buildAccessibilityIndex(locations) {
  return locations.flatMap((location) => {
    if (typeof location?.title !== "string") return [];
    return [{
      ...location,
      normalized: normalizeStationName(location.title),
    }];
  });
}

function findOfficialAccessibility(name, locations) {
  const normalized = normalizeStationName(name);
  const exact = locations.find((location) => location.normalized === normalized);
  if (exact) return exact;

  const aliases = {
    "30 street phl": "30 street philadelphia",
    "burlington towne ctr": "burlington towne centre",
    hohokus: "ho ho kus",
    "middletown nj": "middletown new jersey",
    "middletown ny": "middletown new york",
    "mlk drive": "martin luther king drive jersey city",
    "newark airport rail": "ewr newark airport",
    "njpac centre street": "njpac center street",
    "penn arrival": "newark penn",
    "penn departure": "newark penn",
    "penn new york": "new york penn",
    "port imperial hblr": "port imperial weehawken",
    "secaucus lower level": "secaucus junction",
    "secaucus upper level": "secaucus junction",
  };
  const alias = aliases[normalized] || normalized;
  return locations.find(
    (location) =>
      location.normalized === alias ||
      (alias.length >= 6 &&
        (location.normalized.includes(alias) || alias.includes(location.normalized))),
  );
}

function normalizeStationName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, "$1")
    .replace(/\bst\.?\b/g, "street")
    .replace(/\bphl\.?\b/g, "philadelphia")
    .replace(/\bn\.\s*y\.\b/g, "new york")
    .replace(/\bn\.\s*j\.\b/g, "new jersey")
    .replace(/\b(?:light rail|rail|path)\b/g, " ")
    .replace(/\b(?:station|terminal|transit center|transportation center)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatStationName(value) {
  const specialNames = {
    "30TH ST. PHL.": "30th Street Philadelphia",
    "EDISON STATION": "Edison",
    "MEADOWLANDS RAIL STATION": "Meadowlands",
    "NEWARK AIRPORT RAIL STATION": "Newark Liberty International Airport",
    "NEWARK AIRPORT RAILROAD STATION": "Newark Liberty International Airport",
    "PENN STATION NEW YORK": "New York Penn Station",
    "PENN STATION LIGHT RAIL ARRIVAL": "Newark Penn Station Light Rail",
    "PENN STATION LIGHT RAIL DEPARTURE": "Newark Penn Station Light Rail",
    "RAMSEY ROUTE 17 STATION": "Ramsey Route 17",
    "SECAUCUS LOWER LEVEL": "Secaucus Junction",
    "SECAUCUS UPPER LEVEL": "Secaucus Junction",
  };
  const formatted = specialNames[value] || String(value || "")
    .toLowerCase()
    .replace(/(^|[\s/()-])([a-z])/g, (_, prefix, letter) =>
      `${prefix}${letter.toUpperCase()}`,
    );
  return formatted
    .replace(/\s+Light Rail Sta(?:tion)?$/i, "")
    .replace(/^Port Imperial Hblr Station$/i, "Port Imperial");
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

function buildRouteFeatures(
  routeRows,
  tripRows,
  shapeRows,
  stopRows,
  stopTimeRows,
) {
  const routeById = new Map([
    ...routeRows.map((route) => [route.route_id, route]),
    ...NJT_ROUTE_OVERRIDES,
    ...LIGHT_RAIL_SERVICE_ROUTES,
  ]);
  const rawRouteIds = new Set(routeRows.map((route) => route.route_id));
  const routeIdsByShape = new Map();
  const lightRailServiceIdsByShape = buildLightRailServiceIdsByShape(
    stopTimeRows,
    tripRows,
    stopRows,
  );
  const pointsByShape = new Map();
  const mainLineStationCoordinates = findStopCoordinatesForNames(
    stopRows,
    MAIN_LINE_ONLY_STATIONS,
  );
  const bergenCountyStationCoordinates = findStopCoordinatesForNames(
    stopRows,
    BERGEN_COUNTY_ONLY_STATIONS,
  );

  for (const trip of tripRows) {
    if (!trip.shape_id || !rawRouteIds.has(trip.route_id)) continue;
    const routeIds = routeIdsByShape.get(trip.shape_id) || new Set();
    const lightRailServiceIds = lightRailServiceIdsByShape.get(trip.shape_id);
    if (lightRailServiceIds?.size) {
      for (const serviceId of lightRailServiceIds) routeIds.add(serviceId);
    } else {
      routeIds.add(trip.route_id);
    }
    routeIdsByShape.set(trip.shape_id, routeIds);
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
    const points = pointsByShape.get(point.shape_id) || [];
    points.push({ coordinates: [longitude, latitude], sequence });
    pointsByShape.set(point.shape_id, points);
  }

  const representativeShapes = new Map();
  for (const [shapeId, points] of pointsByShape) {
    const routeIds = routeIdsByShape.get(shapeId);
    if (!routeIds) continue;
    const shapeCoordinates = points
      .sort((left, right) => left.sequence - right.sequence)
      .map((point) => point.coordinates);

    for (const rawRouteId of routeIds) {
      for (const routeId of getPhysicalRouteIdsForShape(
        rawRouteId,
        shapeCoordinates,
        mainLineStationCoordinates,
        bergenCountyStationCoordinates,
      )) {
        const physicalCoordinates = shapeCoordinates;
        if (!physicalCoordinates) continue;
        const coordinates = simplifyLine(
          physicalCoordinates,
          SIMPLIFICATION_TOLERANCE,
        ).map(([longitude, latitude]) => [
          Number(longitude.toFixed(6)),
          Number(latitude.toFixed(6)),
        ]);
        if (coordinates.length < 2) continue;
        const signature = `${routeId}:${endpointSignature(coordinates)}`;
        const previous = representativeShapes.get(signature);
        if (!previous || coordinates.length > previous.coordinates.length) {
          representativeShapes.set(signature, { coordinates, routeId, shapeId });
        }
      }
    }
  }

  return [...representativeShapes.values()]
    .map(({ coordinates, routeId, shapeId }) => {
      const route = routeById.get(routeId);
      return {
        type: "Feature",
        properties: {
          agency: "NJ Transit",
          color: normalizeColor(
            route.route_color ? `#${route.route_color}` : null,
            "#003DA5",
          ),
          description: route.route_long_name || route.route_short_name,
          route: route.route_short_name || route.route_long_name || routeId,
          routeId,
          shapeId,
          source: "NJ Transit GTFS",
        },
        geometry: { type: "LineString", coordinates },
      };
    })
    .sort(
      (left, right) =>
        left.properties.routeId.localeCompare(right.properties.routeId) ||
        left.properties.shapeId.localeCompare(right.properties.shapeId),
    );
}

function getPhysicalRouteIdsForShape(
  routeId,
  coordinates,
  mainLineStations,
  bergenCountyStations,
) {
  if (routeId !== "5") return [routeId];
  const mainLineScore = countNearbyStations(coordinates, mainLineStations);
  const bergenCountyScore = countNearbyStations(
    coordinates,
    bergenCountyStations,
  );
  if (mainLineScore === 0 && bergenCountyScore === 0) {
    return [MAIN_LINE_ROUTE_ID, BERGEN_COUNTY_ROUTE_ID];
  }
  return mainLineScore >= bergenCountyScore
    ? [MAIN_LINE_ROUTE_ID]
    : [BERGEN_COUNTY_ROUTE_ID];
}

function findStopCoordinatesForNames(stopRows, stationNames) {
  return stopRows
    .filter((stop) => stationNames.has(normalizeStationName(stop.stop_name)))
    .map((stop) => [Number(stop.stop_lon), Number(stop.stop_lat)])
    .filter((coordinates) => coordinates.every(Number.isFinite));
}

function countNearbyStations(coordinates, stationCoordinates) {
  const maximumDistanceSquared = 0.006 ** 2;
  return stationCoordinates.filter(
    (station) =>
      findClosestCoordinate(coordinates, station).distanceSquared <=
      maximumDistanceSquared,
  ).length;
}

function findClosestCoordinate(coordinates, target) {
  return coordinates.reduce(
    (closest, coordinate, index) => {
      const distanceSquared =
        (coordinate[0] - target[0]) ** 2 + (coordinate[1] - target[1]) ** 2;
      return distanceSquared < closest.distanceSquared
        ? { distanceSquared, index }
        : closest;
    },
    { distanceSquared: Number.POSITIVE_INFINITY, index: -1 },
  );
}

function endpointSignature(coordinates) {
  const endpoints = [coordinates[0], coordinates.at(-1)]
    .map(([longitude, latitude]) =>
      `${longitude.toFixed(3)},${latitude.toFixed(3)}`,
    )
    .sort();
  return endpoints.join("|");
}

function validateStations(items, accessibilityMatches) {
  const ids = new Set(items.map((station) => station.stationCode));
  if (items.length < 150 || ids.size !== items.length) {
    throw new Error(
      `Expected at least 150 unique NJ Transit stations, received ${items.length} (${ids.size} unique)`,
    );
  }
  if (accessibilityMatches / items.length < 0.8) {
    throw new Error(
      `Matched only ${accessibilityMatches} of ${items.length} NJ Transit accessibility records`,
    );
  }
  const lightRailStationsWithoutServices = items.filter(
    (station) =>
      station.branchId
        .split(",")
        .some((routeId) => routeId === "4" || routeId === "13") &&
      station.serviceRouteIds.length === 0,
  );
  if (lightRailStationsWithoutServices.length > 0) {
    throw new Error(
      `Unable to resolve HBLR/Newark Light Rail services for: ${lightRailStationsWithoutServices
        .map((station) => station.name)
        .join(", ")}`,
    );
  }
}

function normalizeColor(value, fallback) {
  const color = String(value || fallback).trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
}
