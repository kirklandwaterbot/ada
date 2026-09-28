import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runDataSync } from "./run-data-sync.mjs";

const silentLogger = { error() {}, log() {}, warn() {} };

test("restores a valid snapshot after a failed stage and continues", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "ada-data-sync-"));
  t.after(() => rm(cwd, { force: true, recursive: true }));
  await writeFile(path.join(cwd, "cached.json"), '{"value":"stable"}\n');

  const ran = [];
  const summary = await runDataSync({
    cwd,
    logger: silentLogger,
    stages: [
      { name: "fragile", script: "fragile.mjs", outputs: ["cached.json"] },
      { name: "healthy", script: "healthy.mjs", outputs: ["healthy.json"] },
    ],
    runStage: async (stage) => {
      ran.push(stage.name);
      if (stage.name === "fragile") {
        await writeFile(path.join(cwd, "cached.json"), "partial");
        return { ok: false, detail: "upstream timed out" };
      }
      await writeFile(path.join(cwd, "healthy.json"), '{"value":"fresh"}\n');
      return { ok: true };
    },
  });

  assert.deepEqual(ran, ["fragile", "healthy"]);
  assert.deepEqual(summary, {
    cached: 1,
    failed: 0,
    results: [
      { name: "fragile", status: "cached", detail: "upstream timed out" },
      { name: "healthy", status: "updated" },
    ],
    updated: 1,
  });
  assert.equal(await readFile(path.join(cwd, "cached.json"), "utf8"), '{"value":"stable"}\n');
});

test("marks a failed stage as blocking when no valid snapshot exists", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "ada-data-sync-"));
  t.after(() => rm(cwd, { force: true, recursive: true }));

  const summary = await runDataSync({
    cwd,
    logger: silentLogger,
    stages: [{ name: "missing", script: "missing.mjs", outputs: ["missing.json"] }],
    runStage: async () => ({ ok: false, detail: "source unavailable" }),
  });

  assert.equal(summary.failed, 1);
  assert.equal(summary.cached, 0);
  assert.equal(summary.results[0].status, "failed");
});

test("rejects a successful stage that writes invalid output", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "ada-data-sync-"));
  t.after(() => rm(cwd, { force: true, recursive: true }));
  await writeFile(path.join(cwd, "snapshot.geojson"), '{"type":"FeatureCollection","features":[{}]}\n');

  const summary = await runDataSync({
    cwd,
    logger: silentLogger,
    stages: [
      { name: "invalid", script: "invalid.mjs", outputs: ["snapshot.geojson"] },
    ],
    runStage: async () => {
      await writeFile(path.join(cwd, "snapshot.geojson"), '{"type":"FeatureCollection","features":[]}\n');
      return { ok: true };
    },
  });

  assert.equal(summary.cached, 1);
  assert.match(summary.results[0].detail, /invalid output/);
  assert.match(await readFile(path.join(cwd, "snapshot.geojson"), "utf8"), /features.*\[\{\}\]/);
});
