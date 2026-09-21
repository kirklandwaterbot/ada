import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const DEFAULT_GTFS_URL =
  "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";
const DEFAULT_OUTPUT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "nyc-subway-routes.geojson",
);
const SIMPLIFICATION_TOLERANCE = 0.000015;
const REQUIRED_FILES = new Set([
  "feed_info.txt",
  "routes.txt",
  "shapes.txt",
  "trips.txt",
]);

const sourceUrl = process.argv[2] || DEFAULT_GTFS_URL;
const outputPath = path.resolve(process.argv[3] || DEFAULT_OUTPUT_PATH);

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Unable to download MTA subway GTFS: HTTP ${response.status}`);
}

const archive = Buffer.from(await response.arrayBuffer());
const files = readZipEntries(archive, REQUIRED_FILES);

for (const requiredFile of REQUIRED_FILES) {
  if (!files.has(requiredFile)) {
    throw new Error(`MTA subway GTFS is missing ${requiredFile}`);
  }
}

const feedInfo = parseCsv(files.get("feed_info.txt"))[0];
const routeRows = parseCsv(files.get("routes.txt"));
const shapeRows = parseCsv(files.get("shapes.txt"));
const tripRows = parseCsv(files.get("trips.txt"));
const routes = new Map(routeRows.map((route) => [route.route_id, route]));
const routeOrder = new Map(
  routeRows.map((route, index) => [route.route_id, index]),
);
const routesByShape = new Map();
const pointsByShape = new Map();

for (const trip of tripRows) {
  if (!trip.shape_id || !routes.has(trip.route_id)) continue;

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

const seenGeometries = new Set();
const features = [];

for (const [shapeId, shapePoints] of pointsByShape) {
  const shapeRoutes = routesByShape.get(shapeId);
  if (!shapeRoutes || shapeRoutes.size === 0) continue;

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
    const route = routes.get(routeId);
    const deduplicationKey = `${routeId}:${geometryKey}`;
    if (!route || seenGeometries.has(deduplicationKey)) continue;

    seenGeometries.add(deduplicationKey);
    features.push({
      type: "Feature",
      properties: {
        color: `#${route.route_color || "7C858C"}`.toUpperCase(),
        description: route.route_long_name,
        route: route.route_short_name || route.route_id,
        routeId,
        shapeId,
      },
      geometry: {
        type: "LineString",
        coordinates,
      },
    });
  }
}

features.sort((left, right) => {
  const routeDelta =
    (routeOrder.get(left.properties.routeId) ?? Number.MAX_SAFE_INTEGER) -
    (routeOrder.get(right.properties.routeId) ?? Number.MAX_SAFE_INTEGER);
  return routeDelta || left.properties.shapeId.localeCompare(right.properties.shapeId);
});

const featureCollection = {
  type: "FeatureCollection",
  metadata: {
    source: "MTA New York City Transit GTFS",
    sourceUrl,
    termsUrl: "https://www.mta.info/developers/terms-and-conditions",
    feedVersion: feedInfo?.feed_version || null,
    validFrom: feedInfo?.feed_start_date || null,
    validTo: feedInfo?.feed_end_date || null,
    routeCount: new Set(features.map((feature) => feature.properties.routeId)).size,
  },
  features,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(featureCollection)}\n`, "utf8");

console.log(
  `Wrote ${features.length} present-day MTA route shapes to ${outputPath}`,
);

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
      const compressed = buffer.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );
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
      const distance = squareSegmentDistance(
        points[index],
        points[first],
        points[last],
      );
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
