import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteIcon } from "@/components/site-icon";
import { StationStatusBadge } from "@/components/station-status-badge";
import { SubwayRouteIcons } from "@/components/subway-route-icons";
import {
  formatAssetCellValue,
  getAssetCoordinates,
} from "@/lib/asset-display";
import {
  DATASET_PAGE_URL,
  formatDatasetDate,
  formatTimestamp,
  getMtaAssetDataset,
  type MtaAsset,
} from "@/lib/mta-assets";
import {
  getAvailabilityHistory,
  type AvailabilityPoint,
} from "@/lib/mta-availability";
import {
  formatRidership,
  getEquipmentCounts,
  getEquipmentState,
  getStationAssets,
  getStationBySlug,
  getStationCoordinate,
  type EquipmentState,
  type Station,
} from "@/lib/stations";

export const dynamic = "force-dynamic";

type StationPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: StationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const station = getStationBySlug(slug);

  return station
    ? {
        title: station.station,
        description:
          "Accessibility, project, location, equipment, and reliability details for " +
          station.station +
          ".",
      }
    : { title: "Station not found" };
}

export default async function StationDetailPage({ params }: StationPageProps) {
  const { slug } = await params;
  const station = getStationBySlug(slug);

  if (!station) {
    notFound();
  }

  const dataset = await getMtaAssetDataset();
  const stationAssets = getStationAssets(station, dataset.assets);
  const equipment = getEquipmentCounts(stationAssets);
  const coordinate = getStationCoordinate(station);
  const history = await getAvailabilityHistory(
    stationAssets.map((asset) => asset.equipment_code),
  );
  const latestHistory = history.at(-1);

  return (
    <div className="page-enter space-y-7">
      <nav aria-label="Breadcrumb">
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--muted-strong)] transition hover:text-[var(--accent-700)]"
          href="/stations"
        >
          <SiteIcon className="text-[18px]" name="arrow_back" />
          Explore system
        </Link>
      </nav>

      <header className="relative overflow-hidden rounded-[1.5rem] bg-[var(--nav-active)] px-5 py-7 text-white shadow-[0_24px_60px_rgb(10_61_126_/_0.24)] sm:px-8 sm:py-9">
        <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full border-[56px] border-white/5" />
        <div className="absolute -bottom-28 right-44 h-56 w-56 rounded-full border-[42px] border-cyan-300/5" />
        <div className="relative">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-200">
                Station profile
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black tracking-[-0.05em] sm:text-5xl">
                  {station.station}
                </h1>
                <SubwayRouteIcons className="mt-0" routes={station.services} />
              </div>
              <p className="mt-3 text-sm font-semibold text-blue-100 sm:text-base">
                {station.neighborhood} - {station.borough} - {station.line}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StationStatusBadge station={station} />
              {coordinate ? (
                <a
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-bold text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15"
                  href={
                    "https://www.openstreetmap.org/?mlat=" +
                    coordinate.latitude +
                    "&mlon=" +
                    coordinate.longitude +
                    "#map=17/" +
                    coordinate.latitude +
                    "/" +
                    coordinate.longitude
                  }
                  rel="noreferrer"
                  target="_blank"
                >
                  <SiteIcon className="text-[18px]" name="location_on" />
                  Open location
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section aria-label="Station facts" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FactCard
          icon="accessible"
          label="Accessibility"
          value={station.accessibilityStatus}
        />
        <FactCard
          icon="elevator"
          label="Matched equipment"
          value={equipment.total.toLocaleString()}
        />
        <FactCard
          icon="groups"
          label="2024 ridership"
          value={formatRidership(station.ridership2024)}
        />
        <FactCard
          icon="monitoring"
          label="Latest peak availability"
          value={
            latestHistory?.availability !== null &&
            latestHistory?.availability !== undefined
              ? latestHistory.availability.toFixed(1) + "%"
              : "Not available"
          }
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-6">
          <div className="surface-card overflow-hidden">
            <SectionHeader
              description="Daily inventory status for equipment matched to this station."
              icon="elevator"
              title="ADA features and equipment"
            />
            {stationAssets.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {stationAssets.map((asset) => (
                  <EquipmentCard asset={asset} key={asset.equipment_code} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="info"
                text="No elevator or escalator assets in the synchronized inventory could be matched to this station profile."
                title="No equipment records matched"
              />
            )}
          </div>

          <div className="surface-card overflow-hidden">
            <SectionHeader
              description="Monthly AM and PM peak availability from the official NYCT historical dataset."
              icon="monitoring"
              title="Reliability history"
            />
            {history.length > 0 ? (
              <AvailabilityChart points={history} />
            ) : (
              <EmptyState
                icon="query_stats"
                text="The historical dataset did not return matching monthly records for this station's equipment codes."
                title="Historical availability unavailable"
              />
            )}
            <div className="border-t border-[var(--border)] bg-[var(--soft)] px-5 py-3 text-xs leading-5 text-[var(--muted-strong)] sm:px-6">
              Monthly reliability is historical, not a live outage feed. Daily snapshot flags are shown in the equipment cards above.
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="surface-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                <SiteIcon className="text-[23px]" name="location_on" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Location
                </p>
                <h2 className="mt-0.5 font-black text-[var(--ink)]">Station coordinates</h2>
              </div>
            </div>
            {coordinate ? (
              <>
                <dl className="mt-5 grid grid-cols-2 gap-3">
                  <Coordinate label="Latitude" value={coordinate.latitude} />
                  <Coordinate label="Longitude" value={coordinate.longitude} />
                </dl>
                <a
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--nav-active)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0b4b98]"
                  href={
                    "https://www.openstreetmap.org/?mlat=" +
                    coordinate.latitude +
                    "&mlon=" +
                    coordinate.longitude +
                    "#map=17/" +
                    coordinate.latitude +
                    "/" +
                    coordinate.longitude
                  }
                  rel="noreferrer"
                  target="_blank"
                >
                  Open in OpenStreetMap
                  <SiteIcon className="text-[17px]" name="open_in_new" />
                </a>
              </>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[var(--muted-strong)]">
                Station-level coordinates are not available in the connected coordinate files. Asset coordinates may still appear below.
              </p>
            )}
          </div>

          <div className="surface-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                <SiteIcon className="text-[23px]" name="construction" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Project timeline
                </p>
                <h2 className="mt-0.5 font-black text-[var(--ink)]">Accessibility milestones</h2>
              </div>
            </div>
            <Timeline station={station} />
          </div>

          <div className="surface-card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <SiteIcon className="text-[23px]" name="health_and_safety" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Snapshot health
                </p>
                <h2 className="mt-0.5 font-black text-[var(--ink)]">Equipment status</h2>
              </div>
            </div>
            <dl className="mt-5 space-y-3">
              <StatusRow color="bg-emerald-500" label="Listed in service" value={equipment.operational} />
              <StatusRow color="bg-red-500" label="Snapshot outage flags" value={equipment.outage} />
              <StatusRow color="bg-amber-400" label="Work / repair" value={equipment.work} />
              <StatusRow color="bg-slate-400" label="Unknown" value={equipment.unknown} />
            </dl>
            <p className="mt-4 border-t border-[var(--border)] pt-4 text-xs leading-5 text-[var(--muted-strong)]">
              Inventory synchronized {formatTimestamp(dataset.metadata.lastSyncedAt)}.
            </p>
          </div>
        </aside>
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 text-xs leading-5 text-[var(--muted-strong)] sm:flex-row sm:items-center sm:justify-between">
        <p>Verify elevator availability and service changes with the MTA before beginning a trip.</p>
        <a
          className="inline-flex shrink-0 items-center gap-1.5 font-bold text-[var(--accent-600)] hover:underline"
          href={DATASET_PAGE_URL}
          rel="noreferrer"
          target="_blank"
        >
          View official inventory
          <SiteIcon className="text-[16px]" name="open_in_new" />
        </a>
      </div>
    </div>
  );
}

function FactCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="surface-card flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--soft-blue)] text-[var(--accent-600)]">
        <SiteIcon className="text-[23px]" name={icon} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-0.5 truncate text-lg font-black tracking-[-0.025em] text-[var(--ink)]">
          {value}
        </p>
      </div>
    </div>
  );
}

function SectionHeader({
  description,
  icon,
  title,
}: {
  description: string;
  icon: string;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--border)] p-5 sm:p-6">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--soft-blue)] text-[var(--accent-600)]">
        <SiteIcon className="text-[23px]" name={icon} />
      </span>
      <div>
        <h2 className="text-lg font-black tracking-[-0.025em] text-[var(--ink)]">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--muted-strong)]">{description}</p>
      </div>
    </div>
  );
}

function EquipmentCard({ asset }: { asset: MtaAsset }) {
  const state = getEquipmentState(asset);
  const coordinates = getAssetCoordinates(asset);
  const statePresentation = getStatePresentation(state);

  return (
    <article className="p-5 transition hover:bg-[var(--soft-blue)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--soft)] text-[var(--muted-strong)]">
            <SiteIcon
              className="text-[21px]"
              name={asset.elevator_or_escalator === "Elevator" ? "elevator" : "escalator"}
            />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-[var(--ink)]">{asset.equipment_code}</h3>
              <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted-strong)]">
                {asset.elevator_or_escalator}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {formatAssetCellValue(asset, "asset_class")} - Installed {formatDatasetDate(asset.latest_installation_date)}
            </p>
          </div>
        </div>
        <span className={["inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold", statePresentation.className].join(" ")}>
          <span className={["h-1.5 w-1.5 rounded-full", statePresentation.dot].join(" ")} />
          {statePresentation.label}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DetailBlock
          icon="door_open"
          label="Feature location"
          value={asset.notes || "Location description not listed."}
        />
        <DetailBlock
          icon="alt_route"
          label="Alternative route"
          value={asset.alternative_route || "No alternative route listed."}
        />
      </div>

      {coordinates ? (
        <a
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-600)] hover:underline"
          href={
            "https://www.openstreetmap.org/?mlat=" +
            coordinates.latitude +
            "&mlon=" +
            coordinates.longitude +
            "#map=18/" +
            coordinates.latitude +
            "/" +
            coordinates.longitude
          }
          rel="noreferrer"
          target="_blank"
        >
          <SiteIcon className="text-[16px]" name="location_on" />
          {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
        </a>
      ) : null}
    </article>
  );
}

function DetailBlock({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--soft)] p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">
        <SiteIcon className="text-[15px]" name={icon} />
        {label}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-strong)]">{value}</p>
    </div>
  );
}

function AvailabilityChart({ points }: { points: AvailabilityPoint[] }) {
  const availablePoints = points.filter(
    (point): point is AvailabilityPoint & { availability: number } =>
      point.availability !== null,
  );
  const average =
    availablePoints.length > 0
      ? availablePoints.reduce((sum, point) => sum + point.availability, 0) /
        availablePoints.length
      : null;

  return (
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">
            12-month average
          </p>
          <p className="mt-1 text-3xl font-black tracking-[-0.05em] text-[var(--ink)]">
            {average === null ? "Unavailable" : average.toFixed(1) + "%"}
          </p>
        </div>
        <p className="text-xs font-semibold text-[var(--muted-strong)]">
          Average of AM and PM peak availability
        </p>
      </div>
      <div className="mt-6 space-y-3">
        {points.map((point) => {
          const width =
            point.availability === null
              ? 0
              : Math.max(2, Math.min(100, point.availability));

          return (
            <div className="grid grid-cols-[48px_minmax(0,1fr)_54px] items-center gap-3" key={point.month}>
              <span className="font-mono text-[10px] font-bold text-[var(--muted)]">{point.label}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--soft)]">
                <div
                  className={[
                    "h-full rounded-full",
                    point.availability !== null && point.availability >= 95
                      ? "bg-emerald-500"
                      : point.availability !== null && point.availability >= 85
                        ? "bg-amber-400"
                        : "bg-red-500",
                  ].join(" ")}
                  style={{ width: width + "%" }}
                />
              </div>
              <span className="text-right font-mono text-[10px] font-bold text-[var(--ink)]">
                {point.availability === null ? "--" : point.availability.toFixed(1) + "%"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Timeline({ station }: { station: Station }) {
  const steps = station.dateMadeAccessible
    ? [
        {
          label: "Accessibility milestone",
          note: "Made accessible " + station.dateMadeAccessible,
          state: "complete",
        },
        {
          label: "Recorded accessibility",
          note: station.accessibilityStatus + " in the connected station workbook.",
          state: "current",
        },
        {
          label: "Future work",
          note: station.plannedAda
            ? "Additional ADA work is listed."
            : "No additional ADA project is listed in this source.",
          state: "future",
        },
      ]
    : station.plannedAda
      ? [
          {
            label: "Project identified",
            note: "Station is listed for planned ADA work.",
            state: "complete",
          },
          {
            label: "Planning context",
            note:
              station.plannedAdaNote ||
              "Scope details are not included in the connected workbook.",
            state: "current",
          },
          {
            label: "Target completion",
            note: "A completion date is not published in the connected dataset.",
            state: "future",
          },
        ]
      : [
          {
            label: "Recorded accessibility",
            note: station.accessibilityStatus + " in the connected station workbook.",
            state: "current",
          },
          {
            label: "Planned ADA work",
            note: "No planned project is listed in this source.",
            state: "future",
          },
        ];

  return (
    <ol className="mt-6 space-y-0">
      {steps.map((step, index) => (
        <li className="relative grid grid-cols-[24px_1fr] gap-3 pb-6 last:pb-0" key={step.label}>
          {index < steps.length - 1 ? (
            <span className="absolute bottom-0 left-[11px] top-5 w-px bg-[var(--border-strong)]" />
          ) : null}
          <span
            className={[
              "relative z-10 mt-0.5 grid h-6 w-6 place-items-center rounded-full border-4 border-[var(--panel)]",
              step.state === "complete"
                ? "bg-emerald-500"
                : step.state === "current"
                  ? "bg-[var(--accent-500)]"
                  : "bg-slate-300 dark:bg-slate-600",
            ].join(" ")}
          />
          <div>
            <p className="text-sm font-extrabold text-[var(--ink)]">{step.label}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-strong)]">{step.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Coordinate({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[var(--soft)] p-3">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-mono text-xs font-bold text-[var(--ink)]">{value.toFixed(6)}</dd>
    </div>
  );
}

function StatusRow({
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
      <dd className="font-mono font-bold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function EmptyState({
  icon,
  text,
  title,
}: {
  icon: string;
  text: string;
  title: string;
}) {
  return (
    <div className="p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--soft)] text-[var(--muted)]">
        <SiteIcon className="text-[25px]" name={icon} />
      </span>
      <h3 className="mt-4 font-extrabold text-[var(--ink)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted-strong)]">{text}</p>
    </div>
  );
}

function getStatePresentation(state: EquipmentState) {
  const presentations = {
    operational: {
      className:
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      dot: "bg-emerald-500",
      label: "Listed in service",
    },
    outage: {
      className: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
      dot: "bg-red-500",
      label: "Snapshot outage flag",
    },
    unknown: {
      className:
        "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
      dot: "bg-slate-400",
      label: "Unknown",
    },
    work: {
      className:
        "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      dot: "bg-amber-400",
      label: "Work / repair",
    },
  };

  return presentations[state];
}
