import { inflateRawSync } from "node:zlib";

export function readZipEntries(buffer, wantedFiles) {
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

export function parseCsv(source) {
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
  if (!headerRow) return [];
  const headers = headerRow.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "") : header,
  );
  return dataRows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  );
}

export function simplifyLine(points, tolerance) {
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
