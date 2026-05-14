import initSqlJs from "sql.js";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import accessibilityStations from "../../data/accessibility-stations.json";
import { getAssetRoutes } from "@/lib/asset-display";
import { matchesNormalizedSearch } from "@/lib/search-normalization";

export const DATASET_ID = "94fv-bak7";
export const SOCRATA_API_URL = `https://data.ny.gov/resource/${DATASET_ID}.json`;
export const CSV_DOWNLOAD_URL =
  `https://data.ny.gov/api/views/${DATASET_ID}/rows.csv?accessType=DOWNLOAD`;
export const COUNT_API_URL =
  `https://data.ny.gov/resource/${DATASET_ID}.json?$select=count(*)`;
export const DATASET_PAGE_URL = `https://data.ny.gov/d/${DATASET_ID}`;
export const SQLITE_DB_PATH = "data/mta-subway-elevator-escalator-assets.sqlite";
const POSTGRES_ASSETS_TABLE = "mta_subway_access_assets";
const POSTGRES_METADATA_TABLE = "mta_subway_access_sync_metadata";
const EXCLUDED_ASSET_CODES = new Set([
  "EL147",
  "EL256X",
  "EL359X",
  "EL400",
  "EL459",
  "EL790X",
]);
const PRIORITY_COLUMNS = [
  "station_description",
  "subway_line",
  "station_neighborhood",
  "borough",
  "station_accessibility_status",
  "station_planned_ada",
  "equipment_code",
  "ada_compliant",
  "elevator_or_escalator",
  "original_installation_date",
  "latest_installation_date",
];

export type MtaAsset = {
  equipment_code: string;
  elevator_or_escalator: "Elevator" | "Escalator" | string;
  asset_class: string;
  station_mrn?: string;
  station_name?: string;
  station_description?: string;
  station_complex_mrn?: string;
  station_complex_description?: string;
  station_accessibility_status?: string;
  station_accessibility_raw?: string;
  station_line?: string;
  station_neighborhood?: string;
  station_planned_ada?: string;
  station_planned_ada_note?: string;
  station_services?: string;
  subway_line?: string;
  borough?: string;
  x_coordinate?: string;
  y_coordinate?: string;
  original_installation_date?: string;
  latest_installation_date?: string;
  service_status_code?: string;
  service_status?: string;
  service_life?: string;
  nyct_owned?: string;
  maintained_by?: string;
  installer?: string;
  revenue_machine?: string;
  ada_compliant?: string;
  street_access?: string;
  exposed_to_weather?: string;
  notes?: string;
  alternative_route?: string;
  georeference?: string;
} & Record<string, string | undefined>;

export type AssetStats = {
  total: number;
  elevators: number;
  escalators: number;
  stations: number;
  boroughs: string[];
};

export type DataSourceMode = "sql" | "live_api" | "local_snapshot";

export type DataValidation = {
  expectedRowCount: number | null;
  loadedRowCount: number;
  rowCountMatches: boolean | null;
};

export type DataMetadata = {
  countApiUrl: string;
  csvDownloadUrl: string;
  datasetId: string;
  datasetPageUrl: string;
  jsonApiUrl: string;
  lastSyncedAt: string | null;
  localSnapshotWrittenAt: string | null;
  pageSourceMode: DataSourceMode;
  sqlitePath: string;
  upstreamSource: "live_api" | "local_snapshot" | "unknown";
  validation: DataValidation;
};

export type MtaAssetDataset = {
  assets: MtaAsset[];
  columns: string[];
  metadata: DataMetadata;
  stats: AssetStats;
};

type RawMetadata = Record<string, string | null>;
type AccessibleStation = (typeof accessibilityStations.stations)[number];

let postgresClient: NeonQueryFunction<false, false> | null = null;

export async function getMtaAssetDataset(): Promise<MtaAssetDataset> {
  const postgresDataset = await readPostgresDataset();

  if (postgresDataset) {
    return postgresDataset;
  }

  const sqlDataset = await readSqliteDataset();

  if (sqlDataset) {
    return sqlDataset;
  }

  const fallback = await readFallbackDataset();
  const stats = getAssetStats(fallback.assets);

  return {
    ...fallback,
    stats,
  };
}

export async function getMtaAssets(): Promise<MtaAsset[]> {
  const dataset = await getMtaAssetDataset();
  return dataset.assets;
}

export function getAccessibilityStationSummary() {
  return accessibilityStations.summary;
}

export async function syncMtaAssetsToPostgres() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const [assets, expectedRowCount] = await Promise.all([
    fetchLiveAssets(),
    fetchExpectedRowCount(),
  ]);
  const syncedAt = new Date().toISOString();
  const loadedRowCount = assets.length;
  const rowCountMatches =
    typeof expectedRowCount === "number"
      ? expectedRowCount === loadedRowCount
      : null;
  const metadata: RawMetadata = {
    count_api_url: COUNT_API_URL,
    csv_download_url: CSV_DOWNLOAD_URL,
    dataset_id: DATASET_ID,
    dataset_page_url: DATASET_PAGE_URL,
    json_api_url: SOCRATA_API_URL,
    local_snapshot_written_at: syncedAt,
    row_count_expected:
      typeof expectedRowCount === "number" ? String(expectedRowCount) : null,
    row_count_loaded: String(loadedRowCount),
    row_count_matches:
      typeof rowCountMatches === "boolean" ? String(rowCountMatches) : null,
    synced_at: syncedAt,
    upstream_source: "live_api",
  };

  await writePostgresDataset(assets, metadata);

  return {
    loadedRowCount,
    metadata: normalizeMetadata(metadata, "sql", loadedRowCount),
    rowCountMatches,
  };
}

async function readPostgresDataset(): Promise<MtaAssetDataset | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const sql = getPostgresClient();
    const metadataRows = (await sql.query(
      `SELECT key, value FROM ${quoteIdentifier(POSTGRES_METADATA_TABLE)} ORDER BY key`,
    )) as Array<{ key: string; value: string | null }>;
    const assetRows = (await sql.query(
      `SELECT * FROM ${quoteIdentifier(POSTGRES_ASSETS_TABLE)} ORDER BY equipment_code`,
    )) as Array<Record<string, string | null>>;
    const assets = enrichAssetsWithAccessibility(assetRows.map((row) => rowToAsset(row)));
    const columns = getColumns(assets);

    return {
      assets,
      columns,
      metadata: normalizeMetadata(
        Object.fromEntries(
          metadataRows.map((row) => [row.key, row.value]),
        ) as RawMetadata,
        "sql",
        assets.length,
      ),
      stats: getAssetStats(assets),
    };
  } catch {
    return null;
  }
}

async function writePostgresDataset(
  assets: MtaAsset[],
  metadata: RawMetadata,
) {
  const sql = getPostgresClient();
  const columns = getColumns(assets);

  await sql.query(
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(POSTGRES_METADATA_TABLE)} (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
  );
  await sql.query(
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(POSTGRES_ASSETS_TABLE)} (
      equipment_code TEXT PRIMARY KEY
    )`,
  );

  for (const column of columns) {
    await sql.query(
      `ALTER TABLE ${quoteIdentifier(POSTGRES_ASSETS_TABLE)}
       ADD COLUMN IF NOT EXISTS ${quoteIdentifier(column)} TEXT`,
    );
  }

  await sql.query(
    `CREATE INDEX IF NOT EXISTS idx_mta_access_assets_borough
     ON ${quoteIdentifier(POSTGRES_ASSETS_TABLE)} (borough)`,
  );
  await sql.query(
    `CREATE INDEX IF NOT EXISTS idx_mta_access_assets_type
     ON ${quoteIdentifier(POSTGRES_ASSETS_TABLE)} (elevator_or_escalator)`,
  );
  await sql.query(`TRUNCATE TABLE ${quoteIdentifier(POSTGRES_ASSETS_TABLE)}`);

  const columnList = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updateList = columns
    .filter((column) => column !== "equipment_code")
    .map(
      (column) =>
        `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`,
    )
    .join(", ");

  for (const asset of assets) {
    await sql.query(
      `INSERT INTO ${quoteIdentifier(POSTGRES_ASSETS_TABLE)}
       (${columnList})
       VALUES (${placeholders})
       ON CONFLICT (equipment_code) DO UPDATE SET ${updateList}`,
      columns.map((column) => normalizeValue(asset[column])),
    );
  }

  await sql.query(`TRUNCATE TABLE ${quoteIdentifier(POSTGRES_METADATA_TABLE)}`);

  for (const [key, value] of Object.entries(metadata)) {
    await sql.query(
      `INSERT INTO ${quoteIdentifier(POSTGRES_METADATA_TABLE)} (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, normalizeValue(value)],
    );
  }
}

async function readSqliteDataset(): Promise<MtaAssetDataset | null> {
  try {
    const [{ readFile }, { resolve }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const dbFile = await readFile(resolve(SQLITE_DB_PATH));
    const SQL = await initSqlJs({
      locateFile: (file) => resolve("node_modules/sql.js/dist", file),
    });
    const db = new SQL.Database(dbFile);

    try {
      const metadata = mapMetadata(
        db.exec("SELECT key, value FROM sync_metadata ORDER BY key"),
      );
      const result = db.exec("SELECT * FROM assets ORDER BY equipment_code");
      const first = result[0];
      const assets = enrichAssetsWithAccessibility(
        first ? rowsToObjects(first.columns, first.values) : [],
      );

      return {
        assets,
        columns: getColumns(assets),
        metadata: normalizeMetadata(metadata, "sql", assets.length),
        stats: getAssetStats(assets),
      };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function readFallbackDataset(): Promise<
  Omit<MtaAssetDataset, "stats">
> {
  try {
    const assets = enrichAssetsWithAccessibility(await fetchLiveAssets());
    const expectedRowCount = await fetchExpectedRowCount();

    return {
      assets,
      columns: getColumns(assets),
      metadata: {
        countApiUrl: COUNT_API_URL,
        csvDownloadUrl: CSV_DOWNLOAD_URL,
        datasetId: DATASET_ID,
        datasetPageUrl: DATASET_PAGE_URL,
        jsonApiUrl: SOCRATA_API_URL,
        lastSyncedAt: null,
        localSnapshotWrittenAt: null,
        pageSourceMode: "live_api",
        sqlitePath: SQLITE_DB_PATH,
        upstreamSource: "live_api",
        validation: {
          expectedRowCount,
          loadedRowCount: assets.length,
          rowCountMatches:
            typeof expectedRowCount === "number"
              ? expectedRowCount === assets.length
              : null,
        },
      },
    };
  } catch {
    const assets = enrichAssetsWithAccessibility(await readLocalAssetSnapshot());

    return {
      assets,
      columns: getColumns(assets),
      metadata: {
        countApiUrl: COUNT_API_URL,
        csvDownloadUrl: CSV_DOWNLOAD_URL,
        datasetId: DATASET_ID,
        datasetPageUrl: DATASET_PAGE_URL,
        jsonApiUrl: SOCRATA_API_URL,
        lastSyncedAt: null,
        localSnapshotWrittenAt: null,
        pageSourceMode: "local_snapshot",
        sqlitePath: SQLITE_DB_PATH,
        upstreamSource: "local_snapshot",
        validation: {
          expectedRowCount: null,
          loadedRowCount: assets.length,
          rowCountMatches: null,
        },
      },
    };
  }
}

async function fetchLiveAssets(): Promise<MtaAsset[]> {
  const url = new URL(SOCRATA_API_URL);
  url.searchParams.set("$limit", "50000");
  url.searchParams.set("$order", "equipment_code");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) {
    throw new Error(`data.ny.gov returned ${response.status}`);
  }

  return response.json();
}

async function fetchExpectedRowCount(): Promise<number | null> {
  try {
    const response = await fetch(COUNT_API_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as Array<{ count?: string }>;
    const count = payload[0]?.count;

    return typeof count === "string" ? Number(count) : null;
  } catch {
    return null;
  }
}

async function readLocalAssetSnapshot(): Promise<MtaAsset[]> {
  const [{ readFile }, { resolve }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const file = await readFile(
    resolve("data/mta-subway-elevator-escalator-assets.json"),
    "utf8",
  );

  return JSON.parse(file) as MtaAsset[];
}

function rowsToObjects(columns: string[], values: unknown[][]): MtaAsset[] {
  return values.map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [
        column,
        typeof row[index] === "string" ? row[index] : undefined,
      ]),
    ),
  ) as MtaAsset[];
}

function rowToAsset(row: Record<string, string | null>): MtaAsset {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value ?? undefined]),
  ) as MtaAsset;
}

function enrichAssetsWithAccessibility(assets: MtaAsset[]): MtaAsset[] {
  return assets.filter(isPublicAsset).map((asset) => {
    const assetWithFallbacks = enrichAssetWithFallbackContext(
      normalizeAssetAccessibility(asset),
    );
    const matches = findAccessibleStationMatches(assetWithFallbacks);
    const station = pickAccessibleStation(assetWithFallbacks, matches);

    if (!station) {
      return enrichAssetWithAdaFallback(assetWithFallbacks);
    }

    const profileStations = getStationProfileMatches(
      assetWithFallbacks,
      station,
      matches,
    );

    return {
      ...assetWithFallbacks,
      borough: assetWithFallbacks.borough || station.borough,
      station_accessibility_raw: station.accessibilityRaw,
      station_accessibility_status: station.accessibilityStatus,
      station_line: uniqueValues(profileStations.map((item) => item.line)).join(","),
      station_neighborhood: station.neighborhood,
      station_planned_ada: station.plannedAda ? "✅" : "",
      station_planned_ada_note: station.plannedAdaNote,
      station_services: sortStationServices(
        uniqueValues(profileStations.flatMap((item) => item.services)),
      ).join(","),
    };
  });
}

function normalizeAssetAccessibility(asset: MtaAsset): MtaAsset {
  if (
    asset.elevator_or_escalator === "Escalator" &&
    !asset.ada_compliant
  ) {
    return {
      ...asset,
      ada_compliant: "NO",
    };
  }

  return asset;
}

function enrichAssetWithAdaFallback(asset: MtaAsset): MtaAsset {
  if (asset.ada_compliant !== "YES" || asset.revenue_machine !== "YES") {
    return asset;
  }

  return {
    ...asset,
    station_accessibility_raw: "♿",
    station_accessibility_status: "Accessible",
    station_neighborhood:
      asset.station_neighborhood || getKnownAssetNeighborhood(asset),
  };
}

function getKnownAssetNeighborhood(asset: MtaAsset) {
  const stationName = asset.station_name?.toUpperCase() ?? "";
  const stationKey = normalizeStationKey(asset.station_description);

  if (stationKey === "lexington av 53 st") return "Midtown";
  if (stationKey === "south ferry") return "Battery Park";
  if (stationKey === "new utrecht av") return "Borough Park";
  if (stationKey === "8th av" || stationKey === "8th ave") return "Sunset Park";
  if (stationKey === "metropolitan av") return "Williamsburg";
  if (stationName.includes("NEWDORP")) return "New Dorp";

  return asset.station_neighborhood;
}

function isPublicAsset(asset: MtaAsset) {
  return (
    asset.revenue_machine !== "NO" &&
    !EXCLUDED_ASSET_CODES.has(asset.equipment_code?.toUpperCase() ?? "")
  );
}

function enrichAssetWithFallbackContext(asset: MtaAsset): MtaAsset {
  if (asset.station_description || asset.station_name) {
    return asset;
  }

  const knownStation = getKnownMissingStation(asset);

  if (knownStation) {
    return {
      ...asset,
      borough: asset.borough || knownStation.borough,
      station_description: knownStation.station,
      station_line: knownStation.line,
      station_services: knownStation.services.join(","),
      subway_line: asset.subway_line || knownStation.line,
    };
  }

  return asset;
}

function getKnownMissingStation(asset: MtaAsset) {
  const equipmentCode = asset.equipment_code?.toUpperCase();

  if (equipmentCode === "EL787" || equipmentCode === "EL788") {
    return accessibilityStations.stations.find(
      (station) => station.stationKey === "new dorp",
    );
  }

  return null;
}

function findAccessibleStationMatches(asset: MtaAsset) {
  const stationKeys = getAssetStationKeys(asset);

  if (stationKeys.length === 0) {
    return [];
  }

  return accessibilityStations.stations.filter(
    (station) => stationKeys.includes(station.stationKey),
  );
}

function pickAccessibleStation(
  asset: MtaAsset,
  matches: AccessibleStation[],
): AccessibleStation | null {
  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0] ?? null;
  }

  const assetRoutes = new Set(getAssetRoutes(asset));
  const routeMatch = matches.find((station) =>
    station.services.some((service) => assetRoutes.has(service)),
  );

  const assetLine = asset.subway_line?.toLowerCase() ?? "";
  const lineMatch = matches.find((station) =>
    assetLine.includes(station.line.toLowerCase().replaceAll(" ", "")),
  );

  if (routeMatch && lineMatch) {
    return routeMatch === lineMatch ? routeMatch : lineMatch;
  }

  if (routeMatch) {
    return routeMatch;
  }

  return lineMatch ?? matches[0] ?? null;
}

function getStationProfileMatches(
  asset: MtaAsset,
  station: AccessibleStation,
  matches: AccessibleStation[],
) {
  const stationName = asset.station_name?.toUpperCase() ?? "";

  if (stationName.includes("42ST-BRYANTPK")) {
    const bryantParkMatches = accessibilityStations.stations.filter((match) =>
      match.stationKey === "42 st bryant park 5 av" ||
      match.stationKey === "42 st bryant park fifth av",
    );

    return bryantParkMatches.length > 0 ? bryantParkMatches : [station];
  }

  if (
    stationName.includes("FULTONST") &&
    asset.station_complex_mrn === "628"
  ) {
    const manhattanFultonMatches = matches.filter(
      (match) =>
        match.borough === "Manhattan" &&
        !match.services.includes("G") &&
        match.line !== "Crosstown Line",
    );

    return manhattanFultonMatches.length > 0
      ? manhattanFultonMatches
      : [station];
  }

  if (!usesComplexStationProfile(asset)) {
    return [station];
  }

  const complexMatches = matches.filter(
    (match) => match.stationKey === station.stationKey,
  );

  return complexMatches.length > 0 ? complexMatches : [station];
}

function usesComplexStationProfile(asset: MtaAsset) {
  const stationName = asset.station_name?.toUpperCase() ?? "";

  if (
    stationName.includes("BWAY-LAFAYETTEST") ||
    stationName.includes("BLEECKERST") ||
    stationName.includes("WORLDTRADECENTER")
  ) {
    return false;
  }

  return Boolean(asset.station_complex_description) ||
    stationName.includes("34ST-PENNSTATION");
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const cleanValue = value.trim();

    if (!cleanValue || seen.has(cleanValue)) {
      continue;
    }

    seen.add(cleanValue);
    unique.push(cleanValue);
  }

  return unique;
}

const STATION_SERVICE_ORDER = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "6X",
  "7",
  "7X",
  "S",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "FX",
  "G",
  "J",
  "L",
  "M",
  "N",
  "Q",
  "SF",
  "R",
  "W",
  "SR",
  "SIR",
  "SIRX",
  "Z",
];
const STATION_SERVICE_SORT_INDEX = new Map(
  STATION_SERVICE_ORDER.map((service, index) => [service, index]),
);

function sortStationServices(services: string[]) {
  return [...services].sort((a, b) => {
    const routeA = STATION_SERVICE_SORT_INDEX.get(a);
    const routeB = STATION_SERVICE_SORT_INDEX.get(b);

    if (typeof routeA === "number" || typeof routeB === "number") {
      if (typeof routeA !== "number") return 1;
      if (typeof routeB !== "number") return -1;
      return routeA - routeB;
    }

    return a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function getAssetStationKeys(asset: MtaAsset) {
  const keys = new Set<string>();
  const stationDescriptionKey = normalizeStationKey(
    asset.station_description || asset.station_name,
  );
  const stationNameKey = normalizeStationKey(asset.station_name);
  const stationAlias = getAssetStationAlias(asset);

  if (stationDescriptionKey) keys.add(stationDescriptionKey);
  if (stationNameKey) keys.add(stationNameKey);
  if (stationAlias) keys.add(stationAlias);

  for (const key of Array.from(keys)) {
    const alias = STATION_KEY_ALIASES[key];

    if (alias) {
      keys.add(alias);
    }
  }

  return Array.from(keys);
}

const STATION_KEY_ALIASES: Record<string, string> = {
  "42st port authority bus terminal": "42 st port authority bus terminal",
  "42 st bryant pk": "42 st bryant park 5 av",
  "14 st 6 av": "14 st",
  "14 st sixth av": "14 st",
  "74 st broadway": "jackson heights roosevelt av 74 st",
  "atlantic av barclays ctr": "atlantic av barclays center",
  "av h": "avenue h",
  "bleecker st": "broadway lafayette st bleecker st",
  "borough hall": "borough hall court st",
  "brooklyn bridge city hall": "brooklyn bridge city hall chambers st",
  "court st": "borough hall court st",
  "e 149 st": "east 149 st",
  "e 180 st": "east 180 st",
  "jay st metro tech": "jay st metrotech",
  "lexington av 51 st": "51 st",
  "smith 9 sts": "smith ninth sts",
  "w 4 st wash sq": "west 4 st washington sq",
  "whitehall st south ferry": "south ferry whitehall st",
  "world trade center": "chambers st world trade center park place cortlandt st",
};

function getAssetStationAlias(asset: MtaAsset) {
  const stationName = asset.station_name?.toUpperCase() ?? "";
  const subwayLine = asset.subway_line?.toUpperCase() ?? "";

  if (stationName.includes("14ST-8AV") || stationName.includes("8AV-CNR-L")) {
    return "14 st eighth av";
  }

  if (stationName.includes("14ST-6AV")) {
    return "14 st 6 av";
  }

  if (stationName.includes("14ST-7AV") || stationName.includes("6AV-CNR-L")) {
    return "14 st sixth av";
  }

  if (stationName.includes("CORTLANDTST-7AV")) {
    return "wtc cortlandt";
  }

  if (stationName.includes("CORTLANDTST-BWY")) {
    return "chambers st world trade center park place cortlandt st";
  }

  if (
    stationName.includes("51ST-LEX") ||
    (asset.station_description === "51 St - Station" &&
      subwayLine.includes("LEXINGTON"))
  ) {
    return "lexington av 51 st";
  }

  if (
    stationName.includes("BWAY-LAFAYETTEST") ||
    stationName.includes("BLEECKERST")
  ) {
    return "broadway lafayette st bleecker st";
  }

  if (
    stationName.includes("COURTSQ-23ST") ||
    asset.station_description === "Court Sq-23 St - Station"
  ) {
    return "court sq 23 st";
  }

  if (
    stationName.includes("COURTSQ") ||
    asset.station_description === "Court Sq - Station"
  ) {
    return "court sq";
  }

  if (
    stationName.includes("COURTST") ||
    asset.station_description === "Court St - Station"
  ) {
    return "borough hall court st";
  }

  if (
    stationName.includes("JACKSONHTS-ROOSEVELTAV") ||
    stationName.includes("74ST-BROADWAY")
  ) {
    return "jackson heights roosevelt av 74 st";
  }

  if (
    stationName.includes("SOUTHFERRY") ||
    stationName.includes("WHITEHALLST-SOUTHFERRY")
  ) {
    return "south ferry whitehall st";
  }

  return null;
}

function normalizeStationKey(value?: string) {
  return (value ?? "")
    .trim()
    .replace(/\s+-\s+Station$/i, "")
    .toLowerCase()
    .replace(/\b42st\b/g, "42 st")
    .replaceAll("&", "and")
    .replaceAll("/", " ")
    .replaceAll("-", " ")
    .replace(/\bb'?way\b/g, "broadway")
    .replace(/\bavenue\b/g, "av")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bctr\b/g, "center")
    .replace(/\bhts\b/g, "heights")
    .replace(/\bpk\b/g, "park")
    .replace(/\bsq\b/g, "sq")
    .replace(/\btpke\b/g, "turnpike")
    .replace(/\bmetro tech\b/g, "metrotech")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPostgresClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  postgresClient ??= neon(databaseUrl);

  return postgresClient;
}

function normalizeValue(value: unknown) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function mapMetadata(result: Array<{ columns: string[]; values: unknown[][] }>) {
  const metadata: RawMetadata = {};
  const rows = result[0]?.values ?? [];

  for (const row of rows) {
    const key = typeof row[0] === "string" ? row[0] : null;
    const value = typeof row[1] === "string" ? row[1] : null;

    if (key) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function normalizeMetadata(
  metadata: RawMetadata,
  pageSourceMode: DataSourceMode,
  loadedRowCount: number,
): DataMetadata {
  const expectedRowCount = parseNullableNumber(metadata.row_count_expected);
  const rowCountMatches = parseNullableBoolean(metadata.row_count_matches);

  return {
    countApiUrl: metadata.count_api_url ?? COUNT_API_URL,
    csvDownloadUrl: metadata.csv_download_url ?? CSV_DOWNLOAD_URL,
    datasetId: metadata.dataset_id ?? DATASET_ID,
    datasetPageUrl: metadata.dataset_page_url ?? DATASET_PAGE_URL,
    jsonApiUrl: metadata.json_api_url ?? SOCRATA_API_URL,
    lastSyncedAt: metadata.synced_at ?? null,
    localSnapshotWrittenAt: metadata.local_snapshot_written_at ?? null,
    pageSourceMode,
    sqlitePath: SQLITE_DB_PATH,
    upstreamSource:
      metadata.upstream_source === "live_api" ||
      metadata.upstream_source === "local_snapshot"
        ? metadata.upstream_source
        : "unknown",
    validation: {
      expectedRowCount,
      loadedRowCount,
      rowCountMatches,
    },
  };
}

function parseNullableNumber(value: string | null | undefined) {
  if (!value || value === "null") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableBoolean(value: string | null | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function getColumns(assets: MtaAsset[]) {
  const columns = new Set<string>();

  for (const asset of assets) {
    Object.keys(asset).forEach((column) => columns.add(column));
  }

  return Array.from(columns).filter(isVisibleColumn).sort((a, b) => {
    const priorityA = PRIORITY_COLUMNS.indexOf(a);
    const priorityB = PRIORITY_COLUMNS.indexOf(b);

    if (priorityA !== -1 || priorityB !== -1) {
      if (priorityA === -1) return 1;
      if (priorityB === -1) return -1;
      return priorityA - priorityB;
    }

    return a.localeCompare(b);
  });
}

function isVisibleColumn(column: string) {
  return (
    column !== "station_services" &&
    column !== "station_planned_ada" &&
    column !== "station_planned_ada_note"
  );
}

export function getAssetStats(assets: MtaAsset[]): AssetStats {
  const stations = new Set(
    assets.map((asset) => asset.station_description).filter(Boolean),
  );
  const boroughs = Array.from(
    new Set(assets.map((asset) => asset.borough).filter(Boolean) as string[]),
  ).sort();

  return {
    total: assets.length,
    elevators: assets.filter((asset) => asset.elevator_or_escalator === "Elevator")
      .length,
    escalators: assets.filter((asset) => asset.elevator_or_escalator === "Escalator")
      .length,
    stations: stations.size,
    boroughs,
  };
}

export function filterAssets(
  assets: MtaAsset[],
  filters: { query?: string; borough?: string; type?: string },
) {
  const query = filters.query?.trim() ?? "";

  return assets.filter((asset) => {
    const matchesQuery = matchesNormalizedSearch(Object.values(asset), query);

    const matchesBorough =
      !filters.borough || filters.borough === "All"
        ? true
        : asset.borough === filters.borough;

    const matchesType =
      !filters.type || filters.type === "All"
        ? true
        : asset.elevator_or_escalator === filters.type;

    return matchesQuery && matchesBorough && matchesType;
  });
}

export function formatDatasetDate(value?: string) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatTimestamp(value: string | null) {
  if (!value) return "Unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
