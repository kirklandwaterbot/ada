import Image from "next/image";
import Link from "next/link";
import { DataHealthNotice } from "@/components/data-health-notice";
import { PageHeader } from "@/components/page-header";
import { SiteIcon } from "@/components/site-icon";
import { StationStatusBadge } from "@/components/station-status-badge";
import { SubwayRouteIcons } from "@/components/subway-route-icons";
import {
  CSV_DOWNLOAD_URL,
  DATASET_PAGE_URL,
  formatTimestamp,
  getMtaAssetDataset,
} from "@/lib/mta-assets";
import {
  formatMtaPressReleaseDate,
  getLatestMtaAccessibilityPressRelease,
} from "@/lib/mta-press-releases";
import {
  formatRidership,
  getEquipmentCounts,
  getStationEquipmentSummary,
  getStationSlug,
  stationSummary,
  stations,
  type Station,
} from "@/lib/stations";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [datasetResult, featuredPressRelease] = await Promise.all([
    getMtaAssetDataset()
      .then((dataset) => ({ dataset, loadError: null }))
      .catch((error: unknown) => ({
        dataset: null,
        loadError:
          error instanceof Error
            ? error.message
            : "Unable to load MTA asset data.",
      })),
    getLatestMtaAccessibilityPressRelease().catch(() => null),
  ]);
  const { dataset, loadError } = datasetResult;

  if (!dataset || loadError) {
    return (
      <div className="page-enter">
        <PageHeader
          description="The station workbook is available, but the synchronized equipment inventory could not be loaded."
          eyebrow="System overview"
          title="Accessibility at a glance"
        />
        <div className="surface-card mt-8 border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {loadError ?? "Unable to load equipment data."}
        </div>
      </div>
    );
  }

  const assets = dataset.assets;
  const equipment = getEquipmentCounts(assets);
  const accessiblePercent =
    (stationSummary.accessible / stationSummary.totalStations) * 100;
  const partialPercent =
    (stationSummary.partiallyAccessible / stationSummary.totalStations) * 100;
  const remainingStations =
    stationSummary.totalStations -
    stationSummary.accessible -
    stationSummary.partiallyAccessible;
  const stationHealth = stations.map((station) => ({
    station,
    summary: getStationEquipmentSummary(station, assets),
  }));
  const alertStations = stationHealth
    .filter(({ summary }) => summary.outage > 0 || summary.work > 0)
    .sort(
      (left, right) =>
        right.summary.outage - left.summary.outage ||
        right.summary.work - left.summary.work ||
        (right.station.ridership2024 ?? 0) - (left.station.ridership2024 ?? 0),
    )
    .slice(0, 5);
  const directoryStations = [...stations]
    .filter((station) => (station.ridership2024 ?? 0) > 0)
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 5);
  const featuredProject = [...stations]
    .filter((station) => station.plannedAda)
    .sort((left, right) => (right.ridership2024 ?? 0) - (left.ridership2024 ?? 0))[0];

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        actions={
          <>
            <Link
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--nav-active)] px-4 text-sm font-bold text-white shadow-lg shadow-blue-950/15 transition hover:-translate-y-0.5 hover:bg-[#0b4b98]"
              href="/stations"
            >
              <SiteIcon className="text-[19px]" name="search" />
              Find a station
            </Link>
            <a
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-4 text-sm font-bold text-[var(--muted-strong)] shadow-sm transition hover:bg-[var(--soft)] hover:text-[var(--ink)]"
              href={CSV_DOWNLOAD_URL}
            >
              <SiteIcon className="text-[19px]" name="download" />
              Download data
            </a>
          </>
        }
        description="Track step-free access, planned ADA projects, and the daily synchronized elevator and escalator inventory across the subway system."
        eyebrow="System overview"
        title="Accessibility at a glance"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-[var(--soft-blue)] px-4 py-3 text-sm dark:border-blue-900/60">
        <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          Daily MTA inventory snapshot
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted-strong)]">
          <SiteIcon className="text-[17px]" name="sync" />
          Updated {formatTimestamp(dataset.metadata.lastSyncedAt)}
        </div>
      </div>

      <DataHealthNotice metadata={dataset.metadata} />

      <section aria-label="Key accessibility metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon="subway"
          label="Total stations"
          note="Across the station workbook"
          tone="blue"
          value={stationSummary.totalStations.toLocaleString()}
        />
        <MetricCard
          icon="accessible"
          label="Accessible"
          note={accessiblePercent.toFixed(1) + "% of all stations"}
          tone="green"
          value={stationSummary.accessible.toLocaleString()}
        />
        <MetricCard
          icon="construction"
          label="Planned upgrades"
          note="Listed for future ADA work"
          tone="amber"
          value={stationSummary.plannedAda.toLocaleString()}
        />
        <MetricCard
          icon="warning"
          label="Daily snapshot flags"
          note="Inventory records marked out of service"
          tone={equipment.outage > 0 ? "red" : "green"}
          value={equipment.outage.toLocaleString()}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-6">
          <div className="surface-card p-5 sm:p-6">
            <SectionHeading
              eyebrow="Network progress"
              title="Accessibility coverage"
            />
            <div className="mt-6 flex flex-col items-center gap-7 sm:flex-row xl:flex-col 2xl:flex-row">
              <div
                aria-label={accessiblePercent.toFixed(1) + "% of stations are accessible"}
                className="relative grid h-44 w-44 shrink-0 place-items-center rounded-full"
                role="img"
                style={{
                  background:
                    "conic-gradient(#0ea56b 0 " +
                    accessiblePercent +
                    "%, #f0b429 " +
                    accessiblePercent +
                    "% " +
                    (accessiblePercent + partialPercent) +
                    "%, #e7edf4 " +
                    (accessiblePercent + partialPercent) +
                    "% 100%)",
                }}
              >
                <div className="grid h-32 w-32 place-items-center rounded-full bg-[var(--panel)] text-center shadow-inner">
                  <div>
                    <p className="text-3xl font-black tracking-[-0.05em] text-[var(--ink)]">
                      {accessiblePercent.toFixed(1)}%
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                      Accessible
                    </p>
                  </div>
                </div>
              </div>
              <dl className="w-full space-y-3">
                <ProgressLegend
                  color="bg-emerald-500"
                  label="Accessible"
                  value={stationSummary.accessible}
                />
                <ProgressLegend
                  color="bg-amber-400"
                  label="Partially accessible"
                  value={stationSummary.partiallyAccessible}
                />
                <ProgressLegend
                  color="bg-slate-200 dark:bg-slate-600"
                  label="Remaining"
                  value={remainingStations}
                />
                <div className="border-t border-[var(--border)] pt-3">
                  <ProgressLegend
                    color="bg-blue-500"
                    label="Planned ADA work"
                    value={stationSummary.plannedAda}
                  />
                </div>
              </dl>
            </div>
          </div>

          {featuredPressRelease ? (
            <a
              className="group relative flex flex-col overflow-hidden rounded-[1.25rem] bg-[var(--nav-active)] text-white shadow-[0_20px_50px_rgb(10_61_126_/_0.24)] xl:flex-1"
              data-testid="project-spotlight"
              href={featuredPressRelease.url}
              rel="noreferrer"
              target="_blank"
            >
              {featuredPressRelease.imageUrl ? (
                <div className="relative aspect-[16/10] overflow-hidden bg-blue-950">
                  <Image
                    alt=""
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                    fill
                    sizes="(min-width: 1280px) 28vw, 100vw"
                    src={featuredPressRelease.imageUrl}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-blue-950/25 to-transparent" />
                </div>
              ) : (
                <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[38px] border-white/5" />
              )}
              <div className="relative flex flex-1 flex-col p-6">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-300/15 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-cyan-200">
                  <SiteIcon className="text-[15px]" name="accessible" />
                  Latest MTA project spotlight
                </span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-blue-200">
                  {formatMtaPressReleaseDate(featuredPressRelease.publishedAt)} / Official press release
                </p>
                <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.04em]">
                  {featuredPressRelease.title}
                </h2>
                <p className="mt-5 max-w-sm text-sm leading-6 text-blue-100">
                  Checked daily against MTA.info for the newest announcement focused on subway station accessibility, elevators, or ADA upgrades.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold xl:mt-auto xl:pt-5">
                  Read on MTA.info
                  <SiteIcon className="text-[18px] transition group-hover:translate-x-1" name="open_in_new" />
                </span>
              </div>
            </a>
          ) : featuredProject ? (
            <Link
              className="group relative flex flex-col overflow-hidden rounded-[1.25rem] bg-[var(--nav-active)] p-6 text-white shadow-[0_20px_50px_rgb(10_61_126_/_0.24)] xl:flex-1"
              data-testid="project-spotlight"
              href={"/stations/" + getStationSlug(featuredProject)}
            >
              <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[38px] border-white/5" />
              <div className="relative flex flex-1 flex-col">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-300/15 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-cyan-200">
                  <SiteIcon className="text-[15px]" name="construction" />
                  Project spotlight
                </span>
                <div className="mt-5 flex items-center gap-2">
                  <SubwayRouteIcons className="mt-0" routes={featuredProject.services} />
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">
                  {featuredProject.station}
                </h2>
                <p className="mt-1 text-sm font-medium text-blue-100">
                  {featuredProject.neighborhood}, {featuredProject.borough}
                </p>
                <p className="mt-5 max-w-sm text-sm leading-6 text-blue-100">
                  ADA work is listed for this station. Open the station profile for project context, equipment, and location details.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold xl:mt-auto xl:pt-5">
                  View station
                  <SiteIcon className="text-[18px] transition group-hover:translate-x-1" name="arrow_forward" />
                </span>
              </div>
            </Link>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <div className="surface-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <SectionHeading
                eyebrow="Status at a glance"
                title="Equipment attention"
              />
              <Link
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent-600)] hover:underline"
                href="/equipment"
              >
                View all equipment
                <SiteIcon className="text-[17px]" name="arrow_forward" />
              </Link>
            </div>
            {alertStations.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {alertStations.map(({ station, summary }) => (
                  <Link
                    className="group grid gap-3 px-5 py-4 transition hover:bg-[var(--soft-blue)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                    href={"/stations/" + getStationSlug(station)}
                    key={getStationSlug(station)}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
                        <SiteIcon className="text-[21px]" name={summary.outage > 0 ? "warning" : "build"} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-extrabold text-[var(--ink)] group-hover:text-[var(--accent-700)]">
                            {station.station}
                          </p>
                          <SubwayRouteIcons className="mt-0" routes={station.services} />
                        </div>
                        <p className="mt-1 text-xs font-medium text-[var(--muted)]">
                          {station.neighborhood} - {station.borough}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {summary.outage > 0 ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                          {summary.outage} snapshot outage {summary.outage === 1 ? "flag" : "flags"}
                        </span>
                      ) : null}
                      {summary.work > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          {summary.work} work/repair
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <SiteIcon className="text-[26px]" name="check_circle" />
                </span>
                <h3 className="mt-4 font-extrabold text-[var(--ink)]">No outage flags in this snapshot</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-strong)]">
                  This reflects the synchronized daily inventory and is not a substitute for official trip planning alerts.
                </p>
              </div>
            )}
            <div className="border-t border-[var(--border)] bg-[var(--soft)] px-5 py-3 text-xs leading-5 text-[var(--muted-strong)] sm:px-6">
              Status flags come from the daily asset inventory. Verify conditions with the MTA before travel.
            </div>
          </div>

          <div className="surface-card overflow-hidden xl:flex-1" data-testid="station-directory">
            <div className="flex flex-col gap-4 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <SectionHeading
                eyebrow="High-ridership stations"
                title="Station directory"
              />
              <Link
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent-600)] hover:underline"
                href="/stations"
              >
                Explore all {stationSummary.totalStations}
                <SiteIcon className="text-[17px]" name="arrow_forward" />
              </Link>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead className="bg-[var(--soft)] text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">
                  <tr>
                    <th className="px-6 py-3">Station</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">2024 ridership</th>
                    <th className="px-6 py-3 text-right">Milestone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {directoryStations.map((station) => (
                    <DirectoryRow key={getStationSlug(station)} station={station} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-[var(--border)] md:hidden">
              {directoryStations.map((station) => (
                <DirectoryCard key={getStationSlug(station)} station={station} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 text-xs leading-5 text-[var(--muted-strong)] sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl">
          Independent accessibility dashboard. Not affiliated with or endorsed by the MTA, New York State, or New York City.
        </p>
        <a
          className="inline-flex shrink-0 items-center gap-1.5 font-bold text-[var(--accent-600)] hover:underline"
          href={DATASET_PAGE_URL}
          rel="noreferrer"
          target="_blank"
        >
          Official source dataset
          <SiteIcon className="text-[16px]" name="open_in_new" />
        </a>
      </footer>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  note,
  tone,
  value,
}: {
  icon: string;
  label: string;
  note: string;
  tone: "amber" | "blue" | "green" | "red";
  value: string;
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
  };

  return (
    <article className="surface-card group p-5 transition duration-300 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_20px_50px_rgb(15_35_64_/_0.1)]">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">
          {label}
        </p>
        <span className={["grid h-10 w-10 place-items-center rounded-xl", tones[tone]].join(" ")}>
          <SiteIcon className="text-[22px]" name={icon} />
        </span>
      </div>
      <p className="mt-5 text-4xl font-black tracking-[-0.055em] text-[var(--ink)]">{value}</p>
      <p className="mt-2 text-xs font-medium leading-5 text-[var(--muted-strong)]">{note}</p>
    </article>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-600)]">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-black tracking-[-0.025em] text-[var(--ink)] sm:text-xl">
        {title}
      </h2>
    </div>
  );
}

function ProgressLegend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={["h-2.5 w-2.5 rounded-full", color].join(" ")} />
      <dt className="flex-1 font-semibold text-[var(--muted-strong)]">{label}</dt>
      <dd className="font-mono font-bold text-[var(--ink)]">{value.toLocaleString()}</dd>
    </div>
  );
}

function DirectoryRow({ station }: { station: Station }) {
  return (
    <tr className="transition hover:bg-[var(--soft-blue)]">
      <td className="px-6 py-4">
        <Link className="group" href={"/stations/" + getStationSlug(station)}>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[var(--ink)] group-hover:text-[var(--accent-700)]">
              {station.station}
            </span>
            <SubwayRouteIcons className="mt-0" routes={station.services} />
          </div>
          <span className="mt-1 block text-xs font-medium text-[var(--muted)]">
            {station.neighborhood}, {station.borough}
          </span>
        </Link>
      </td>
      <td className="px-4 py-4">
        <StationStatusBadge compact station={station} />
      </td>
      <td className="px-4 py-4 font-mono text-sm font-bold text-[var(--muted-strong)]">
        {formatRidership(station.ridership2024)}
      </td>
      <td className="px-6 py-4 text-right text-xs font-semibold text-[var(--muted-strong)]">
        {getMilestone(station)}
      </td>
    </tr>
  );
}

function DirectoryCard({ station }: { station: Station }) {
  return (
    <Link
      className="block p-5 transition hover:bg-[var(--soft-blue)]"
      href={"/stations/" + getStationSlug(station)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-[var(--ink)]">{station.station}</span>
            <SubwayRouteIcons className="mt-0" routes={station.services} />
          </div>
          <p className="mt-1 text-xs font-medium text-[var(--muted)]">
            {station.neighborhood}, {station.borough}
          </p>
        </div>
        <StationStatusBadge compact station={station} />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs font-semibold text-[var(--muted-strong)]">
        <span>{formatRidership(station.ridership2024)} annual riders</span>
        <span>{getMilestone(station)}</span>
      </div>
    </Link>
  );
}

function getMilestone(station: Station) {
  if (station.dateMadeAccessible) {
    return station.dateMadeAccessible;
  }

  if (station.plannedAda) {
    return "Planned ADA";
  }

  return "No date listed";
}
