import { spawn } from "node:child_process";
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_SYNC_STAGES = [
  {
    name: "MTA subway assets and status",
    script: "scripts/sync-mta-assets.mjs",
    outputs: [
      "data/mta-subway-elevator-escalator-assets.csv",
      "data/mta-subway-elevator-escalator-assets.json",
      "data/mta-subway-elevator-escalator-assets.sqlite",
      "data/mta-equipment-status.json",
      "data/sync-metadata.json",
    ],
  },
  {
    name: "MTA capital projects",
    script: "scripts/sync-mta-capital-projects.mjs",
    outputs: ["data/mta-capital-elevator-escalator-projects.json"],
  },
  {
    name: "NYC subway routes",
    script: "scripts/generate-subway-routes.mjs",
    outputs: ["public/data/nyc-subway-routes.geojson"],
  },
  {
    name: "ADA project statuses",
    script: "scripts/generate-ada-project-statuses.mjs",
    outputs: ["data/ada-project-statuses.json"],
  },
  {
    name: "MTA regional rail",
    script: "scripts/sync-mta-regional-rail.mjs",
    outputs: [
      "data/mta-regional-rail-accessibility.json",
      "public/data/mta-regional-rail-routes.geojson",
    ],
  },
  {
    name: "PATH",
    script: "scripts/sync-path.mjs",
    outputs: [
      "data/path-accessibility.json",
      "public/data/path-routes.geojson",
    ],
  },
  {
    name: "EWR AirTrain",
    script: "scripts/sync-ewr-airtrain.mjs",
    outputs: [
      "data/ewr-airtrain-accessibility.json",
      "public/data/ewr-airtrain-routes.geojson",
    ],
  },
  {
    name: "NJ Transit",
    script: "scripts/sync-nj-transit.mjs",
    outputs: [
      "data/nj-transit-accessibility.json",
      "public/data/nj-transit-routes.geojson",
    ],
  },
  {
    name: "CTrail",
    script: "scripts/sync-ctrail.mjs",
    outputs: [
      "data/ctrail-accessibility.json",
      "public/data/ctrail-routes.geojson",
    ],
  },
];

export async function runDataSync({
  cwd = process.cwd(),
  logger = console,
  runStage = runNodeStage,
  stages = DATA_SYNC_STAGES,
} = {}) {
  const results = [];

  for (const stage of stages) {
    logger.log(`\n=== ${stage.name} ===`);
    const snapshot = await snapshotOutputs(cwd, stage.outputs);
    let failure;

    try {
      const result = await runStage(stage, cwd);
      if (!result?.ok) {
        failure = result?.detail || "stage exited unsuccessfully";
      } else {
        const invalidOutputs = await findInvalidOutputs(cwd, stage.outputs);
        if (invalidOutputs.length > 0) {
          failure = `stage produced invalid output: ${invalidOutputs.join(", ")}`;
        }
      }
    } catch (error) {
      failure = describeError(error);
    }

    if (!failure) {
      results.push({ name: stage.name, status: "updated" });
      continue;
    }

    await restoreOutputs(cwd, snapshot);
    const invalidCache = await findInvalidOutputs(cwd, stage.outputs);
    if (invalidCache.length === 0) {
      const message = `${stage.name} failed; restored last-known-good data. ${failure}`;
      logger.warn(toWorkflowWarning(message));
      results.push({ name: stage.name, status: "cached", detail: failure });
    } else {
      const message = `${stage.name} failed and has no valid fallback for: ${invalidCache.join(", ")}. ${failure}`;
      logger.error(toWorkflowError(message));
      results.push({ name: stage.name, status: "failed", detail: failure });
    }
  }

  const updated = results.filter((result) => result.status === "updated").length;
  const cached = results.filter((result) => result.status === "cached").length;
  const failed = results.filter((result) => result.status === "failed").length;
  logger.log(
    `\nData sync summary: ${updated} updated, ${cached} used last-known-good data, ${failed} failed without a valid fallback.`,
  );

  return { cached, failed, results, updated };
}

async function runNodeStage(stage, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.resolve(cwd, stage.script)], {
      cwd,
      stdio: "inherit",
    });
    child.on("error", (error) => resolve({ ok: false, detail: describeError(error) }));
    child.on("exit", (code, signal) => {
      resolve({
        ok: code === 0,
        detail: signal ? `terminated by ${signal}` : `exited with code ${code}`,
      });
    });
  });
}

async function snapshotOutputs(cwd, outputs) {
  return Promise.all(
    outputs.map(async (relativePath) => ({
      contents: await readOptionalFile(path.resolve(cwd, relativePath)),
      relativePath,
    })),
  );
}

async function restoreOutputs(cwd, snapshot) {
  await Promise.all(
    snapshot.map(async ({ contents, relativePath }) => {
      const absolutePath = path.resolve(cwd, relativePath);
      if (contents === null) {
        await rm(absolutePath, { force: true });
        return;
      }
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );
}

async function findInvalidOutputs(cwd, outputs) {
  const validity = await Promise.all(
    outputs.map(async (relativePath) => ({
      relativePath,
      valid: isValidOutput(relativePath, await readOptionalFile(path.resolve(cwd, relativePath))),
    })),
  );
  return validity.filter(({ valid }) => !valid).map(({ relativePath }) => relativePath);
}

function isValidOutput(relativePath, contents) {
  if (!contents || contents.length === 0) return false;
  const extension = path.extname(relativePath).toLowerCase();

  if (extension === ".json" || extension === ".geojson") {
    try {
      const parsed = JSON.parse(contents.toString("utf8"));
      if (parsed === null || typeof parsed !== "object") return false;
      if (extension === ".geojson") {
        return parsed.type === "FeatureCollection" && parsed.features?.length > 0;
      }
      return !Array.isArray(parsed) || parsed.length > 0;
    } catch {
      return false;
    }
  }

  if (extension === ".csv") {
    return contents.toString("utf8").trim().split(/\r?\n/).length > 1;
  }

  if (extension === ".sqlite") {
    return contents.subarray(0, 16).toString("utf8") === "SQLite format 3\0";
  }

  return true;
}

async function readOptionalFile(absolutePath) {
  try {
    return await readFile(absolutePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function describeError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function escapeWorkflowMessage(message) {
  return String(message)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function toWorkflowWarning(message) {
  return process.env.GITHUB_ACTIONS === "true"
    ? `::warning title=Data sync used cached snapshot::${escapeWorkflowMessage(message)}`
    : `Warning: ${message}`;
}

function toWorkflowError(message) {
  return process.env.GITHUB_ACTIONS === "true"
    ? `::error title=Data sync has no valid snapshot::${escapeWorkflowMessage(message)}`
    : `Error: ${message}`;
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const summary = await runDataSync();
  if (summary.failed > 0) process.exitCode = 1;
}
