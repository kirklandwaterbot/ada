import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildCapitalProjectDataset } from "../src/lib/mta-capital-normalizer.mjs";
import { fetchCapitalProjectSourceBundle } from "../src/lib/mta-capital-source.mjs";

const snapshotPath = resolve(
  "data/mta-capital-elevator-escalator-projects.json",
);
const temporaryPath = `${snapshotPath}.tmp`;

const bundle = await fetchCapitalProjectSourceBundle();
const dataset = buildCapitalProjectDataset(bundle, "local_snapshot");
const contents = `${JSON.stringify(dataset, null, 2)}\n`;

await mkdir(dirname(snapshotPath), { recursive: true });
await writeFile(temporaryPath, contents, "utf8");
await rename(temporaryPath, snapshotPath);

console.log(`Wrote Capital Plan snapshot to ${snapshotPath}`);
console.log(
  `Loaded ${dataset.metadata.projectCount} projects (${dataset.metadata.modernProjectCount} modern, ${dataset.metadata.legacyProjectCount} legacy)`,
);
console.log(`Checked official sources at ${dataset.metadata.checkedAt}`);
