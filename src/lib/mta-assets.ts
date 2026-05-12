import initSqlJs from "sql.js";

export const DATASET_ID = "94fv-bak7";
export const SOCRATA_API_URL = `https://data.ny.gov/resource/${DATASET_ID}.json`;
export const CSV_DOWNLOAD_URL =
  `https://data.ny.gov/api/views/${DATASET_ID}/rows.csv?accessType=DOWNLOAD`;
export const COUNT_API_URL =
  `https://data.ny.gov/resource/${DATASET_ID}.json?$select=count(*)`;
export const DATASET_PAGE_URL = `https://data.ny.gov/d/${DATASET_ID}`;
export const SQLITE_DB_PATH = "data/mta-subway-elevator-escalator-assets.sqlite";

export type MtaAsset = {
  equipment_code: string;
  elevator_or_escalator: "Elevator" | "Escalator" | string;
  asset_class: string;
  station_mrn?: string;
  station_name?: string;
  station_description?: string;
  station_complex_mrn?: string;
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

export async function getMtaAssetDataset(): Promise<MtaAssetDataset> {
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
      const assets = first ? rowsToObjects(first.columns, first.values) : [];

      return {
        assets,
        columns: first?.columns ?? [],
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
    const assets = await fetchLiveAssets();
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
    const assets = await readLocalAssetSnapshot();

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

  return Array.from(columns).sort((a, b) => {
    if (a === "equipment_code") return -1;
    if (b === "equipment_code") return 1;
    return a.localeCompare(b);
  });
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
  const query = filters.query?.trim().toLowerCase();

  return assets.filter((asset) => {
    const matchesQuery = !query
      ? true
      : Object.values(asset)
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query));

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
