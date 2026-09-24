import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry } from "./fetch-with-retry.mjs";

const AIRTRAIN_URL = "https://www.newarkairport.com/transportation/airtrain";
const ACCESSIBILITY_URL =
  "https://www.newarkairport.com/explore-ewr/accessibility-services/handicap-transportation";
const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const DATA_OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "ewr-airtrain-accessibility.json",
);
const ROUTE_OUTPUT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "ewr-airtrain-routes.geojson",
);
const AIRTRAIN_COLOR = "#C81858";
const EXPECTED_STATIONS = [
  {
    aliases: ["Newark Liberty Airport", "Newark Liberty International Airport"],
    code: "EWR-AIRPORT",
    name: "Newark RailLink",
  },
  { aliases: ["P4"], code: "EWR-P4", name: "EWR P4" },
  { aliases: ["Terminal C"], code: "EWR-TERMINAL-C", name: "EWR Terminal C" },
  { aliases: ["Terminal B"], code: "EWR-TERMINAL-B", name: "EWR Terminal B" },
  { aliases: ["P3"], code: "EWR-P3", name: "EWR P3" },
  {
    aliases: ["Terminal A"],
    code: "EWR-TERMINAL-A",
    name: "EWR Terminal A",
  },
];
const OVERPASS_QUERY = `[out:json][timeout:25];
(
  nwr[public_transport=station][network="AirTrain Newark"](around:7000,40.691,-74.184);
  rel[route=monorail][network="AirTrain Newark"](around:7000,40.691,-74.184);
  way(r);
);
out tags center geom;`;

const overpassOptions = {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "user-agent": "AccessNYC accessibility data sync",
  },
  body: new URLSearchParams({ data: OVERPASS_QUERY }).toString(),
};

const [airTrainResponse, accessibilityResponse, overpassResponse] =
  await Promise.all([
    fetchWithRetry(AIRTRAIN_URL),
    fetchWithRetry(ACCESSIBILITY_URL),
    fetchWithRetry(OVERPASS_URL, overpassOptions, { timeoutMs: 45_000 }),
  ]);
const [airTrainHtml, accessibilityHtml, overpass] = await Promise.all([
  airTrainResponse.text(),
  accessibilityResponse.text(),
  overpassResponse.json(),
]);

const officialText = normalizeHtmlText(`${airTrainHtml} ${accessibilityHtml}`);
if (!/all airtrain trains and stations are ada-compliant/i.test(officialText)) {
  throw new Error("Official EWR pages no longer confirm ADA compliance for all AirTrain stations");
}
if (!/stations feature elevators and escalators/i.test(officialText)) {
  throw new Error("Official EWR pages no longer confirm elevator and escalator service");
}
if (!Array.isArray(overpass.elements)) {
  throw new Error("OpenStreetMap Overpass response has no elements");
}

const stationElements = overpass.elements.filter(
  (element) =>
    ["node", "way", "relation"].includes(element.type) &&
    element.tags?.public_transport === "station" &&
    element.tags?.network === "AirTrain Newark" &&
    element.tags?.name,
);
const stations = EXPECTED_STATIONS.map((expected) => {
  const element = stationElements.find((candidate) =>
    expected.aliases.some(
      (alias) => normalizeName(candidate.tags.name) === normalizeName(alias),
    ),
  );
  if (!element) {
    throw new Error(`Unable to find current AirTrain station ${expected.name} in OpenStreetMap`);
  }
  const latitude = Number(element.lat ?? element.center?.lat);
  const longitude = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`AirTrain station ${expected.name} has invalid coordinates`);
  }

  return {
    agency: "EWR AirTrain",
    stationCode: expected.code,
    osmElement: `${element.type}/${element.id}`,
    name: expected.name,
    branchId: "AIRTRAIN",
    branchName: "AirTrain Newark",
    branchColor: AIRTRAIN_COLOR,
    latitude,
    longitude,
    accessibilityStatus: "Accessible",
    wheelchairBoarding: 1,
    stationDetailUrl: AIRTRAIN_URL,
    elevators: [createEquipment(expected.code, "elevator")],
    escalators: [createEquipment(expected.code, "escalator")],
    serviceAlert:
      expected.code === "EWR-TERMINAL-A"
        ? "Terminal A is reached from this station by a covered walkway or shuttle; AirTrain does not connect directly to the terminal."
        : "",
  };
});

const seenGeometry = new Set();
const routeFeatures = overpass.elements
  .filter(
    (element) =>
      element.type === "way" &&
      element.tags?.railway === "monorail" &&
      Array.isArray(element.geometry) &&
      element.geometry.length >= 2 &&
      !["yard", "siding"].includes(element.tags?.service),
  )
  .flatMap((element) => {
    const coordinates = element.geometry.map(({ lat, lon }) => [
      Number(Number(lon).toFixed(6)),
      Number(Number(lat).toFixed(6)),
    ]);
    const forwardKey = JSON.stringify(coordinates);
    const reverseKey = JSON.stringify([...coordinates].reverse());
    if (seenGeometry.has(forwardKey) || seenGeometry.has(reverseKey)) return [];
    seenGeometry.add(forwardKey);
    return [
      {
        type: "Feature",
        properties: {
          agency: "EWR AirTrain",
          color: AIRTRAIN_COLOR,
          description: "AirTrain Newark",
          route: "AirTrain",
          routeId: "AIRTRAIN",
          shapeId: `osm-way-${element.id}`,
        },
        geometry: { type: "LineString", coordinates },
      },
    ];
  });

if (routeFeatures.length === 0) {
  throw new Error("OpenStreetMap produced no AirTrain Newark route geometry");
}

const generatedAt = new Date().toISOString();
const accessibilitySnapshot = {
  metadata: {
    generatedAt,
    source: "Port Authority of New York and New Jersey and OpenStreetMap",
    airTrainUrl: AIRTRAIN_URL,
    accessibilityUrl: ACCESSIBILITY_URL,
    geometrySourceUrl: OSM_COPYRIGHT_URL,
    attribution: "© OpenStreetMap contributors",
    stationCount: stations.length,
    accessibleStationCount: stations.length,
    equipmentStatusNote:
      "The airport confirms station elevators and escalators but does not publish live unit-level status; listed equipment therefore uses unknown status.",
  },
  stations,
};
const routeCollection = {
  type: "FeatureCollection",
  metadata: {
    generatedAt,
    source: "OpenStreetMap",
    sourceUrl: OSM_COPYRIGHT_URL,
    attribution: "© OpenStreetMap contributors",
    routeCount: 1,
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
  `Wrote ${stations.length} EWR AirTrain stations and ${routeFeatures.length} route segments`,
);

function createEquipment(stationCode, type) {
  return {
    unitId: `${stationCode}-${type}-service`,
    location: `Station ${type} service`,
    status: "unknown",
    lastUpdated: null,
  };
}

function normalizeHtmlText(value) {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#8209;|&hyphen;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\binternational\b/g, "")
    .replace(/\btrain station\b/g, "airport")
    .replace(/\bstation\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
