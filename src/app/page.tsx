import {
  CSV_DOWNLOAD_URL,
  DATASET_PAGE_URL,
  type DataMetadata,
  formatTimestamp,
  getMtaAssetDataset,
  type MtaAsset,
} from "@/lib/mta-assets";
import { AssetDataTable } from "@/components/asset-data-table";
import { CopySourceLink } from "@/components/copy-source-link";
import { SettingsButton } from "@/components/settings-panel";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function Home() {
  let assets: MtaAsset[] = [];
  let metadata: DataMetadata | null = null;
  let loadError: string | null = null;

  try {
    const dataset = await getMtaAssetDataset();
    assets = dataset.assets;
    metadata = dataset.metadata;
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Unable to load MTA asset data.";
  }

  const stats = {
    total: metadata?.validation.loadedRowCount ?? assets.length,
    elevators: assets.filter((asset) => asset.elevator_or_escalator === "Elevator")
      .length,
    escalators: assets.filter((asset) => asset.elevator_or_escalator === "Escalator")
      .length,
    stations: new Set(
      assets.map((asset) => asset.station_description).filter(Boolean),
    ).size,
  };
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="fixed inset-0 flex justify-center sm:px-8">
        <div className="flex w-full max-w-7xl lg:px-8">
          <div className="w-full bg-white dark:bg-black" />
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col px-4 pb-16 pt-9 sm:px-8 lg:px-20">
        <section className="max-w-5xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-900 shadow-lg shadow-zinc-800/10 ring-1 ring-zinc-900/5 dark:bg-zinc-100 dark:ring-white/10">
                <Image
                  alt="MTA logo"
                  className="h-full w-full object-cover"
                  height={96}
                  priority
                  src="/MTA.png"
                  width={96}
                />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold uppercase text-[var(--accent-600)]">
                  data.ny.gov / weekly inventory
                </p>
                <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-5xl">
                  Subway access assets
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 sm:justify-end">
              <SettingsButton />
              <a
                className="inline-flex items-center justify-center rounded-md bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                href={CSV_DOWNLOAD_URL}
              >
                Download CSV
              </a>
              <a
                className="inline-flex items-center justify-center rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900 ring-1 ring-zinc-900/5 transition hover:bg-zinc-100 dark:bg-zinc-800/70 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-zinc-800"
                href={DATASET_PAGE_URL}
                rel="noreferrer"
                target="_blank"
              >
                Source Dataset
              </a>
            </div>
          </div>

          <p className="mt-6 max-w-3xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            A searchable public view of active MTA subway elevator and escalator
            inventory, designed so people can browse the data without digging
            through export menus.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Assets" value={stats.total.toLocaleString()} />
            <Metric label="Elevators" value={stats.elevators.toLocaleString()} />
            <Metric label="Escalators" value={stats.escalators.toLocaleString()} />
            <Metric label="Stations" value={stats.stations.toLocaleString()} />
          </div>

          {metadata ? <DataSourcePanel metadata={metadata} /> : null}
        </section>

        <section className="mt-10">
          {loadError ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {loadError}
            </div>
          ) : (
            <AssetDataTable />
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white px-4 py-4 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10">
      <div className="font-mono text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}

function DataSourcePanel({ metadata }: { metadata: DataMetadata }) {
  const rowCountText =
    metadata.validation.expectedRowCount === null
      ? "Unavailable"
      : metadata.validation.expectedRowCount.toLocaleString();
  const validationLabel =
    metadata.validation.rowCountMatches === true
      ? "Matches"
      : metadata.validation.rowCountMatches === false
        ? "Mismatch"
        : "Not checked";

  return (
    <div className="mt-8 rounded-2xl border border-zinc-100 bg-white p-5 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Data source
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            SQLite-backed local copy built from the New York State Socrata dataset.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-[var(--accent-50)] px-3 py-1 text-xs font-semibold uppercase text-[var(--accent-700)] dark:bg-[rgb(var(--accent-600-rgb)_/_0.24)] dark:text-zinc-100">
          {metadata.pageSourceMode === "sql"
            ? `SQL database / ${formatSourceMode(metadata.upstreamSource)}`
            : formatSourceMode(metadata.pageSourceMode)}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <SourceFact label="Dataset ID" value={metadata.datasetId} />
        <SourceFact
          label="Total rows loaded"
          value={metadata.validation.loadedRowCount.toLocaleString()}
        />
        <SourceFact label="data.ny.gov row count" value={rowCountText} />
        <SourceFact label="Row count validation" value={validationLabel} />
        <SourceFact label="Last synced" value={formatTimestamp(metadata.lastSyncedAt)} />
        <SourceFact
          label="Local sync timestamp"
          value={formatTimestamp(metadata.localSnapshotWrittenAt)}
        />
        <SourceFact label="Page data source" value={formatSourceMode(metadata.pageSourceMode)} />
        <SourceFact label="Upstream source" value={formatSourceMode(metadata.upstreamSource)} />
      </dl>

      <div className="mt-5 grid gap-3 text-sm lg:grid-cols-2">
        <CopySourceLink href={metadata.datasetPageUrl} label="Source URL" />
        <CopySourceLink href={metadata.jsonApiUrl} label="Live API URL" />
      </div>
    </div>
  );
}

function SourceFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium text-zinc-800 dark:text-zinc-100">
        {value}
      </dd>
    </div>
  );
}

function formatSourceMode(source: string) {
  return source.replaceAll("_", " ");
}
