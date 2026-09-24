import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const metroMemoryRoot = path.resolve(
  process.argv[2] || path.join(process.cwd(), "..", "metro-memory"),
);
const metroDataRoot = path.join(
  metroMemoryRoot,
  "src",
  "app",
  "(game)",
  "north-america",
  "usa",
  "nyc",
  "data",
);
const [routePayload, stationPayload] = await Promise.all([
  readFile(path.join(metroDataRoot, "nyc.json"), "utf8").then(JSON.parse),
  readFile(path.join(metroDataRoot, "features.json"), "utf8").then(JSON.parse),
]);

const lineDefinitions = new Map([
  ["NJTLR8thStHoboken", ["NJ Transit", "HBLR-8H", "HBLR 8th Street–Hoboken"]],
  ["NJTLRWestSideTonnelle", ["NJ Transit", "HBLR-WST", "HBLR West Side–Tonnelle"]],
  ["NJTLRHobokenTonnelle", ["NJ Transit", "HBLR-HT", "HBLR Hoboken–Tonnelle"]],
  ["NJTLRBayonneFlyer", ["NJ Transit", "HBLR-8H", "HBLR Bayonne Flyer"]],
  ["NJTLRNewark", ["NJ Transit", "NLR-NCS", "Newark Light Rail"]],
  ["NJTLRNewarkBroad", ["NJ Transit", "NLR-BSE", "Broad Street Extension"]],
  ["AirTrainJFKHowardBeach", ["JFK AirTrain", "HOWARD", "Howard Beach"]],
  ["AirTrainJFKJamaica", ["JFK AirTrain", "JAMAICA", "Jamaica"]],
  ["AirTrainJFKAllTerminals", ["JFK AirTrain", "TERMINALS", "All Terminals Loop"]],
]);

const importedFeatures = routePayload.features.flatMap((feature, index) => {
  const sourceLine = feature.properties?.line;
  const definition = lineDefinitions.get(sourceLine);
  if (!definition) return [];
  const [agency, routeId, description] = definition;
  return [{
    ...feature,
    properties: {
      agency,
      color: feature.properties.color,
      description,
      route: description,
      routeId,
      shapeId: `metro-memory-${sourceLine}-${index}`,
      source: "Metro Memory",
    },
  }];
});
const lightRailFeatures = importedFeatures.filter(
  (feature) => feature.properties.agency === "NJ Transit",
);
const jfkRouteFeatures = completeJfkRouteFeatures(
  importedFeatures.filter(
    (feature) => feature.properties.agency === "JFK AirTrain",
  ),
);

const jfkSourceLines = new Set([
  "AirTrainJFKHowardBeach",
  "AirTrainJFKJamaica",
  "AirTrainJFKAllTerminals",
]);
const stationByName = new Map();
for (const feature of stationPayload.features) {
  const sourceLine = feature.properties?.line;
  if (!jfkSourceLines.has(sourceLine) || feature.geometry?.type !== "Point") continue;
  const definition = lineDefinitions.get(sourceLine);
  const sourceName = String(feature.properties.name).replace(/^JFK\s+/i, "").trim();
  const name = /^Terminal\b/i.test(sourceName) ? `JFK ${sourceName}` : sourceName;
  const current = stationByName.get(name) || {
    coordinates: feature.geometry.coordinates,
    routeIds: new Set(),
  };
  current.routeIds.add(definition[1]);
  stationByName.set(name, current);
}

const generatedAt = new Date().toISOString();
const jfkStations = [...stationByName]
  .map(([name, station], index) => ({
    accessMethods: ["Elevator", "Escalator", "Level boarding"],
    accessibilityStatus: "Accessible",
    agency: "JFK AirTrain",
    branchColor: "#EF3941",
    branchId: [...station.routeIds].sort().join(","),
    branchName: [...station.routeIds]
      .map((routeId) =>
        routeId === "HOWARD"
          ? "Howard Beach"
          : routeId === "JAMAICA"
            ? "Jamaica"
            : "All Terminals Loop",
      )
      .join(" / "),
    elevators: [],
    escalators: [],
    latitude: station.coordinates[1],
    longitude: station.coordinates[0],
    name,
    stationCode: `JFK-${index + 1}`,
    stationDetailUrl: "https://www.jfkairport.com/transportation/airtrain",
    wheelchairBoarding: 1,
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

const seedOutput = path.join(process.cwd(), "data", "metro-memory-transit-geometry.json");
const jfkDataOutput = path.join(process.cwd(), "data", "jfk-airtrain-accessibility.json");
const jfkRouteOutput = path.join(process.cwd(), "public", "data", "jfk-airtrain-routes.geojson");
await Promise.all([
  mkdir(path.dirname(seedOutput), { recursive: true }),
  mkdir(path.dirname(jfkRouteOutput), { recursive: true }),
]);
await Promise.all([
  writeFile(
    seedOutput,
    `${JSON.stringify({ generatedAt, lightRailFeatures }, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    jfkDataOutput,
    `${JSON.stringify({
      metadata: {
        accessibilityUrl: "https://www.jfkairport.com/transportation/airtrain",
        generatedAt,
        source: "Port Authority accessibility guidance and Metro Memory map data",
        stationCount: jfkStations.length,
      },
      stations: jfkStations,
    }, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    jfkRouteOutput,
    `${JSON.stringify({
      type: "FeatureCollection",
      metadata: {
        generatedAt,
        routeCount: 3,
        source: "Metro Memory",
      },
      features: jfkRouteFeatures,
    })}\n`,
    "utf8",
  ),
]);

console.log(
  `Imported ${lightRailFeatures.length} NJ Transit light-rail features, ${jfkRouteFeatures.length} JFK AirTrain features, and ${jfkStations.length} JFK stations`,
);

function completeJfkRouteFeatures(features) {
  const howard = features.find((feature) => feature.properties.routeId === "HOWARD");
  const jamaica = features.find((feature) => feature.properties.routeId === "JAMAICA");
  if (!howard || !jamaica) return features;

  // Both paid airport services share the track from Federal Circle through
  // the terminal loop. Metro Memory's Howard Beach feature ends at Federal
  // Circle, while its Jamaica geometry contains that shared airport segment.
  const sharedAirportParts = toLineParts(jamaica.geometry).filter((part) =>
    part.every(([, latitude]) => latitude <= 40.661),
  );
  const completedHowardParts = dedupeLineParts([
    ...toLineParts(howard.geometry),
    ...sharedAirportParts,
  ]);

  return features.map((feature) =>
    feature === howard
      ? {
          ...feature,
          geometry: {
            type: "MultiLineString",
            coordinates: completedHowardParts,
          },
        }
      : feature,
  );
}

function toLineParts(geometry) {
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return geometry.type === "LineString" ? [geometry.coordinates] : [];
}

function dedupeLineParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const forward = JSON.stringify(part);
    const reverse = JSON.stringify([...part].reverse());
    const key = forward < reverse ? forward : reverse;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
