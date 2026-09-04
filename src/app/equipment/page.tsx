import type { Metadata } from "next";
import { AssetDataTable } from "@/components/asset-data-table";
import { DataHealthNotice } from "@/components/data-health-notice";
import { PageHeader } from "@/components/page-header";
import { SiteIcon } from "@/components/site-icon";
import {
  CSV_DOWNLOAD_URL,
  DATASET_PAGE_URL,
  formatTimestamp,
  getMtaAssetDataset,
} from "@/lib/mta-assets";
import { getEquipmentCounts } from "@/lib/stations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Equipment inventory",
  description:
    "Search and filter the synchronized MTA subway elevator and escalator inventory.",
};

export default async function EquipmentPage() {
  const dataset = await getMtaAssetDataset();
  const counts = getEquipmentCounts(dataset.assets);

  return (
    <div className="page-enter space-y-7">
      <PageHeader
        actions={
          <>
            <a
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--nav-active)] px-4 text-sm font-bold text-white shadow-lg shadow-blue-950/15 transition hover:-translate-y-0.5"
              href={CSV_DOWNLOAD_URL}
            >
              <SiteIcon className="text-[19px]" name="download" />
              Download CSV
            </a>
            <a
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-4 text-sm font-bold text-[var(--muted-strong)] shadow-sm transition hover:bg-[var(--soft)]"
              href={DATASET_PAGE_URL}
              rel="noreferrer"
              target="_blank"
            >
              Official dataset
              <SiteIcon className="text-[17px]" name="open_in_new" />
            </a>
          </>
        }
        description="Search every synchronized elevator and escalator record, combine field-level filters, and inspect ADA, installation, ownership, and service details."
        eyebrow="Equipment inventory"
        title="Every asset, one searchable view"
      />

      <DataHealthNotice metadata={dataset.metadata} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <EquipmentMetric icon="database" label="Assets" value={counts.total} />
        <EquipmentMetric icon="elevator" label="Elevators" value={counts.elevators} />
        <EquipmentMetric icon="escalator" label="Escalators" value={counts.escalators} />
        <EquipmentMetric
          icon="check_circle"
          label="Listed in service"
          tone="green"
          value={counts.operational}
        />
        <EquipmentMetric
          icon="warning"
          label="Snapshot outage flags"
          tone={counts.outage > 0 ? "red" : "green"}
          value={counts.outage}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-xs font-medium text-[var(--muted-strong)]">
        <span className="inline-flex items-center gap-2">
          <SiteIcon className="text-[17px] text-[var(--accent-600)]" name="sync" />
          Last synchronized {formatTimestamp(dataset.metadata.lastSyncedAt)}
        </span>
        <span>Daily inventory snapshot - verify travel conditions with the MTA</span>
      </div>

      <AssetDataTable />
    </div>
  );
}

function EquipmentMetric({
  icon,
  label,
  tone = "blue",
  value,
}: {
  icon: string;
  label: string;
  tone?: "blue" | "green" | "red";
  value: number;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
    green:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
  };

  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span className={["grid h-10 w-10 place-items-center rounded-xl", tones[tone]].join(" ")}>
        <SiteIcon className="text-[21px]" name={icon} />
      </span>
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-black tracking-[-0.04em] text-[var(--ink)]">
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
