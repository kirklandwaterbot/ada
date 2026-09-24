import type { Metadata } from "next";
import { AssetDataTable } from "@/components/asset-data-table";
import { PageHeader } from "@/components/page-header";
import { RegionalEquipmentExplorer } from "@/components/regional-equipment-explorer";
import { SiteIcon } from "@/components/site-icon";
import {
  CSV_DOWNLOAD_URL,
  DATASET_PAGE_URL,
  formatTimestamp,
  getMtaAssetDataset,
} from "@/lib/mta-assets";
import { getEquipmentCounts } from "@/lib/stations";
import {
  getRegionalEquipmentCounts,
  regionalEquipmentRecords,
} from "@/lib/regional-transit-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Equipment inventory",
  description:
    "Search elevator and escalator records across NYCTA, PATH, LIRR, Metro-North, NJ Transit, CTrail, and AirTrain.",
};

export default async function EquipmentPage() {
  const dataset = await getMtaAssetDataset().catch(() => null);
  const nyctaCounts = getEquipmentCounts(dataset?.assets ?? []);
  const regionalCounts = getRegionalEquipmentCounts();
  const counts = {
    elevators: nyctaCounts.elevators + regionalCounts.elevators,
    escalators: nyctaCounts.escalators + regionalCounts.escalators,
    operational: nyctaCounts.operational + regionalCounts.operational,
    outage:
      nyctaCounts.outage +
      regionalCounts.outage +
      regionalCounts.long_term_outage,
    total: nyctaCounts.total + regionalCounts.total,
  };

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
              NYCTA CSV
            </a>
            <a
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-4 text-sm font-bold text-[var(--muted-strong)] shadow-sm transition hover:bg-[var(--soft)]"
              href={DATASET_PAGE_URL}
              rel="noreferrer"
              target="_blank"
            >
              NYCTA dataset
              <SiteIcon className="text-[17px]" name="open_in_new" />
            </a>
          </>
        }
        description="Search synchronized equipment across subway, PATH, commuter rail, light rail, CTrail, and AirTrain. Operator source detail and live-status coverage vary by system."
        eyebrow="Regional equipment inventory"
        title="Elevators and escalators across every system"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <EquipmentMetric icon="database" label="Assets" value={counts.total} />
        <EquipmentMetric icon="elevator" label="Elevators" value={counts.elevators} />
        <EquipmentMetric icon="escalator" label="Escalators" value={counts.escalators} />
        <EquipmentMetric
          icon="check_circle"
          label="Currently in service"
          tone="green"
          value={counts.operational}
        />
        <EquipmentMetric
          icon="warning"
          label="Current outages"
          tone={counts.outage > 0 ? "red" : "green"}
          value={counts.outage}
        />
        <EquipmentMetric
          icon="schedule"
          label="MTA future outages"
          tone="amber"
          value={dataset?.metadata.futureOutageCount ?? 0}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-xs font-medium text-[var(--muted-strong)]">
        <span className="inline-flex items-center gap-2">
          <SiteIcon className="text-[17px] text-[var(--accent-600)]" name="sync" />
          {dataset
            ? `MTA synchronized ${formatTimestamp(dataset.metadata.lastSyncedAt)}`
            : "MTA detailed inventory is temporarily unavailable"}
        </span>
        <span>Verify current conditions with the operating agency before traveling</span>
      </div>

      <RegionalEquipmentExplorer records={regionalEquipmentRecords} />

      <section className="space-y-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--accent-600)]">
            NYCTA detailed inventory
          </p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--ink)]">
            Subway asset records and scheduled outages
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
            The MTA source includes the deepest field-level inventory, including
            installation details and current and future outage schedules.
          </p>
        </div>
      {dataset ? (
        <AssetDataTable />
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          The detailed NYCTA asset feed could not be loaded. Regional equipment
          records above remain available.
        </div>
      )}
      </section>
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
  tone?: "amber" | "blue" | "green" | "red";
  value: number;
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
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
