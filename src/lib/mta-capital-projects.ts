import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { cache } from "react";
import {
  buildCapitalProjectDataset,
  getCapitalProjectSummaries,
} from "@/lib/mta-capital-normalizer.mjs";
import { fetchCapitalProjectSourceBundle } from "@/lib/mta-capital-source.mjs";
import type {
  CapitalProject,
  CapitalProjectDataset,
  CapitalProjectMetadata,
  CapitalProjectSummary,
} from "@/lib/mta-capital-types";

const LOCAL_SNAPSHOT_PATH = "data/mta-capital-elevator-escalator-projects.json";
const POSTGRES_PROJECTS_TABLE = "mta_capital_access_projects";
const POSTGRES_METADATA_TABLE = "mta_capital_access_sync_metadata";
const POSTGRES_STAGE_TABLE = "mta_capital_access_projects_stage";
const POSTGRES_SYNC_LOCK_ID = 947_004_072;
const INSERT_BATCH_SIZE = 100;

let postgresClient: NeonQueryFunction<false, false> | null = null;

export const getMtaCapitalProjectDataset = cache(
  async (): Promise<CapitalProjectDataset> => {
    const postgresDataset = await readPostgresDataset();
    if (postgresDataset) return postgresDataset;

    try {
      return await readLocalSnapshot();
    } catch {
      const bundle = await fetchCapitalProjectSourceBundle();
      return buildCapitalProjectDataset(bundle, "live_api");
    }
  },
);

export async function getMtaCapitalProjectBySlug(slug: string) {
  const dataset = await getMtaCapitalProjectDataset();
  return dataset.projects.find(
    (project) => project.slug.toLowerCase() === slug.toLowerCase(),
  );
}

export async function getMtaCapitalProjectSummaries(): Promise<{
  metadata: CapitalProjectMetadata;
  projects: CapitalProjectSummary[];
}> {
  const dataset = await getMtaCapitalProjectDataset();

  return {
    metadata: dataset.metadata,
    projects: getCapitalProjectSummaries(dataset.projects),
  };
}

export async function syncMtaCapitalProjectsToPostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const bundle = await fetchCapitalProjectSourceBundle();
  const dataset = buildCapitalProjectDataset(bundle, "database");
  const persistedProjectCount = await writePostgresDataset(dataset);

  if (persistedProjectCount !== dataset.projects.length) {
    throw new Error(
      `Capital project database validation failed: intended ${dataset.projects.length} projects but persisted ${persistedProjectCount}.`,
    );
  }

  return {
    checkedAt: dataset.metadata.checkedAt,
    legacyProjectCount: dataset.metadata.legacyProjectCount,
    modernProjectCount: dataset.metadata.modernProjectCount,
    projectCount: dataset.projects.length,
  };
}

async function readPostgresDataset(): Promise<CapitalProjectDataset | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const sql = getPostgresClient();
    const [projectResult, metadataResult] = await Promise.all([
      sql.query(
        `SELECT payload FROM ${quoteIdentifier(POSTGRES_PROJECTS_TABLE)} ORDER BY project_key`,
      ),
      sql.query(
        `SELECT key, value FROM ${quoteIdentifier(POSTGRES_METADATA_TABLE)} ORDER BY key`,
      ),
    ]);
    const projectRows = projectResult as unknown as Array<{
      payload: CapitalProject | string;
    }>;
    const metadataRows = metadataResult as unknown as Array<{
      key: string;
      value: string | null;
    }>;
    const projects = projectRows.map((row) => parseProjectPayload(row.payload));
    const metadata = Object.fromEntries(
      metadataRows.map((row) => [row.key, row.value]),
    );
    const dataset = {
      metadata: {
        checkedAt: metadata.checked_at ?? "",
        legacyProjectCount: Number(metadata.legacy_project_count),
        modernProjectCount: Number(metadata.modern_project_count),
        pageSourceMode: "database" as const,
        projectCount: Number(metadata.project_count),
        sourceCounts: JSON.parse(metadata.source_counts ?? "{}"),
      },
      projects,
    };

    return isValidStoredDataset(dataset) ? dataset : null;
  } catch {
    return null;
  }
}

async function writePostgresDataset(dataset: CapitalProjectDataset) {
  const sql = getPostgresClient();
  const projectsTable = quoteIdentifier(POSTGRES_PROJECTS_TABLE);
  const metadataTable = quoteIdentifier(POSTGRES_METADATA_TABLE);
  const stageTable = quoteIdentifier(POSTGRES_STAGE_TABLE);

  await Promise.all([
    sql.query(
      `CREATE TABLE IF NOT EXISTS ${projectsTable} (
        project_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL
      )`,
    ),
    sql.query(
      `CREATE TABLE IF NOT EXISTS ${metadataTable} (
        key TEXT PRIMARY KEY,
        value TEXT
      )`,
    ),
  ]);

  await Promise.all([
    sql.query(
      `CREATE INDEX IF NOT EXISTS idx_mta_capital_project_source
       ON ${projectsTable} ((payload->>'source'))`,
    ),
    sql.query(
      `CREATE INDEX IF NOT EXISTS idx_mta_capital_project_phase
       ON ${projectsTable} ((payload->>'phase'))`,
    ),
  ]);

  const projectBatches = chunk(dataset.projects, INSERT_BATCH_SIZE).map(
    (projects) => buildProjectInsert(projects),
  );
  const metadataEntries = Object.entries({
    checked_at: dataset.metadata.checkedAt,
    legacy_project_count: String(dataset.metadata.legacyProjectCount),
    modern_project_count: String(dataset.metadata.modernProjectCount),
    project_count: String(dataset.metadata.projectCount),
    source_counts: JSON.stringify(dataset.metadata.sourceCounts),
  });
  const metadataParams = metadataEntries.flatMap(([key, value]) => [key, value]);
  const metadataPlaceholders = metadataEntries
    .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`)
    .join(", ");

  await sql.transaction((transactionSql) => [
    transactionSql.query(`SELECT pg_advisory_xact_lock(${POSTGRES_SYNC_LOCK_ID})`),
    transactionSql.query(
      `CREATE TEMP TABLE ${stageTable}
       (LIKE ${projectsTable} INCLUDING ALL)
       ON COMMIT DROP`,
    ),
    ...projectBatches.map(({ params, query }) =>
      transactionSql.query(query, params),
    ),
    transactionSql.query(
      `DO $capital_sync$
       BEGIN
         IF (SELECT COUNT(*) FROM ${stageTable}) <> ${dataset.projects.length} THEN
           RAISE EXCEPTION 'Staged Capital Plan project count does not match the intended count.';
         END IF;
       END
       $capital_sync$`,
    ),
    transactionSql.query(`TRUNCATE TABLE ${projectsTable}`),
    transactionSql.query(
      `INSERT INTO ${projectsTable} (project_key, payload)
       SELECT project_key, payload FROM ${stageTable}`,
    ),
    transactionSql.query(`TRUNCATE TABLE ${metadataTable}`),
    transactionSql.query(
      `INSERT INTO ${metadataTable} (key, value)
       VALUES ${metadataPlaceholders}`,
      metadataParams,
    ),
  ]);

  const rows = (await sql.query(
    `SELECT COUNT(*)::int AS count FROM ${projectsTable}`,
  )) as Array<{ count: number }>;

  return Number(rows[0]?.count ?? 0);
}

function buildProjectInsert(projects: CapitalProject[]) {
  const params: string[] = [];
  const rows = projects.map((project) => {
    params.push(project.key, JSON.stringify(project));
    const offset = params.length - 1;
    return `($${offset}, $${offset + 1}::jsonb)`;
  });

  return {
    params,
    query: `INSERT INTO ${quoteIdentifier(POSTGRES_STAGE_TABLE)}
      (project_key, payload)
      VALUES ${rows.join(", ")}`,
  };
}

async function readLocalSnapshot(): Promise<CapitalProjectDataset> {
  const [{ readFile }, { resolve }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const contents = await readFile(resolve(LOCAL_SNAPSHOT_PATH), "utf8");
  const dataset = JSON.parse(contents) as CapitalProjectDataset;

  if (!isValidStoredDataset(dataset)) {
    throw new Error("The local Capital Plan project snapshot is invalid.");
  }

  return {
    ...dataset,
    metadata: {
      ...dataset.metadata,
      pageSourceMode: "local_snapshot",
    },
  };
}

function isValidStoredDataset(
  value: CapitalProjectDataset,
): value is CapitalProjectDataset {
  if (!value?.metadata || !Array.isArray(value.projects)) return false;
  if (value.projects.length === 0) return false;
  if (value.metadata.projectCount !== value.projects.length) return false;
  if (!value.metadata.checkedAt) return false;

  const keys = new Set(value.projects.map((project) => project.key));
  return keys.size === value.projects.length;
}

function parseProjectPayload(payload: CapitalProject | string) {
  return typeof payload === "string"
    ? (JSON.parse(payload) as CapitalProject)
    : payload;
}

function getPostgresClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  postgresClient ??= neon(databaseUrl);
  return postgresClient;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function chunk<T>(values: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}
