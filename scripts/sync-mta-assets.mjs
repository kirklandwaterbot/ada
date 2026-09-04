import initSqlJs from "sql.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { fetchWithRetry } from "./fetch-with-retry.mjs";

const datasetId = "94fv-bak7";
const datasetPageUrl = `https://data.ny.gov/d/${datasetId}`;
const csvUrl = `https://data.ny.gov/api/views/${datasetId}/rows.csv?accessType=DOWNLOAD`;
const jsonUrl = `https://data.ny.gov/resource/${datasetId}.json?$limit=5000&$order=equipment_code`;
const countUrl = `https://data.ny.gov/resource/${datasetId}.json?$select=count(*)`;

const csvPath = resolve("data/mta-subway-elevator-escalator-assets.csv");
const jsonPath = resolve("data/mta-subway-elevator-escalator-assets.json");
const dbPath = resolve("data/mta-subway-elevator-escalator-assets.sqlite");
const metadataPath = resolve("data/sync-metadata.json");

async function fetchText(url) {
  const response = await fetchWithRetry(url, {
    headers: { "User-Agent": "mta-access-assets/0.1" },
  });

  return response.text();
}

async function getExpectedRowCount() {
  try {
    const text = await fetchText(countUrl);
    const payload = JSON.parse(text);
    const first = Array.isArray(payload) ? payload[0] : undefined;
    const value = first?.count;

    return typeof value === "string" ? Number(value) : null;
  } catch {
    return null;
  }
}

function normalizeValue(value) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function getColumns(rows) {
  const columns = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }

  return Array.from(columns).sort((a, b) => {
    if (a === "equipment_code") return -1;
    if (b === "equipment_code") return 1;
    return a.localeCompare(b);
  });
}

async function buildSqliteDatabase(rows, metadata) {
  const SQL = await initSqlJs({
    locateFile: (file) => resolve("node_modules/sql.js/dist", file),
  });
  const db = new SQL.Database();
  const columns = getColumns(rows);
  const columnSql = columns
    .map((column) => `${quoteIdentifier(column)} TEXT`)
    .join(", ");

  db.run("CREATE TABLE sync_metadata (key TEXT PRIMARY KEY, value TEXT)");
  db.run(`CREATE TABLE assets (${columnSql})`);
  db.run("CREATE INDEX idx_assets_equipment_code ON assets (equipment_code)");
  db.run("CREATE INDEX idx_assets_borough ON assets (borough)");
  db.run("CREATE INDEX idx_assets_type ON assets (elevator_or_escalator)");

  const metaStatement = db.prepare(
    "INSERT INTO sync_metadata (key, value) VALUES (?, ?)",
  );
  for (const [key, value] of Object.entries(metadata)) {
    metaStatement.run([key, normalizeValue(value)]);
  }
  metaStatement.free();

  const placeholders = columns.map(() => "?").join(", ");
  const insertStatement = db.prepare(
    `INSERT INTO assets (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`,
  );

  for (const row of rows) {
    insertStatement.run(columns.map((column) => normalizeValue(row[column])));
  }
  insertStatement.free();

  const databaseFile = Buffer.from(db.export());
  db.close();

  return databaseFile;
}

const syncedAt = new Date().toISOString();
const [csvText, jsonText, expectedRowCount] = await Promise.all([
  fetchText(csvUrl),
  fetchText(jsonUrl),
  getExpectedRowCount(),
]);
const rows = JSON.parse(jsonText);
const actualRowCount = Array.isArray(rows) ? rows.length : 0;
const rowCountMatches =
  typeof expectedRowCount === "number" ? expectedRowCount === actualRowCount : null;

if (!Array.isArray(rows) || actualRowCount === 0) {
  throw new Error("Refusing to replace the local snapshot with an empty dataset.");
}

if (rowCountMatches === false) {
  throw new Error(
    `Refusing to replace the local snapshot: expected ${expectedRowCount} rows but loaded ${actualRowCount}.`,
  );
}

const equipmentCodes = new Set(rows.map((row) => row.equipment_code));

if (equipmentCodes.size !== actualRowCount || equipmentCodes.has(undefined)) {
  throw new Error(
    "Refusing to replace the local snapshot because equipment codes are missing or duplicated.",
  );
}

const metadata = {
  dataset_id: datasetId,
  dataset_page_url: datasetPageUrl,
  csv_download_url: csvUrl,
  json_api_url: jsonUrl,
  count_api_url: countUrl,
  upstream_source: "live_api",
  synced_at: syncedAt,
  local_snapshot_written_at: syncedAt,
  csv_bytes: Buffer.byteLength(csvText, "utf8"),
  row_count_loaded: actualRowCount,
  row_count_expected: expectedRowCount,
  row_count_matches: rowCountMatches,
};

const sqliteFile = await buildSqliteDatabase(rows, metadata);

await mkdir(dirname(dbPath), { recursive: true });
await Promise.all([
  writeFile(csvPath, csvText, "utf8"),
  writeFile(jsonPath, jsonText, "utf8"),
  writeFile(dbPath, sqliteFile),
  writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8"),
]);

console.log(`Downloaded CSV to ${csvPath}`);
console.log(`Downloaded JSON to ${jsonPath}`);
console.log(`Created SQLite database at ${dbPath}`);
console.log(`Loaded ${actualRowCount} rows`);
console.log(
  `Socrata count check: ${expectedRowCount ?? "unavailable"} expected / ${actualRowCount} loaded`,
);
