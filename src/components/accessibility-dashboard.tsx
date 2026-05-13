 "use client";

import type { MtaAsset } from "@/lib/mta-assets";
import accessibilityStations from "../../data/accessibility-stations.json";
import { SubwayRouteIcons } from "@/components/subway-route-icons";
import { formatStationLineDisplay } from "@/lib/asset-display";
import { focusPlannedStationOnMap } from "@/lib/map-focus";

type AccessibilitySummary = {
  accessible: number;
  escalatorsRows: number;
  notAccessible: number;
  partiallyAccessible: number;
  plannedAda: number;
  sheet5Rows: number;
  sirAccessible: number;
  sirPlannedAda: number;
  statenIslandStations: number;
  totalStations: number;
};

export function AccessibilityDashboard({
  assets,
  summary,
}: {
  assets: MtaAsset[];
  summary: AccessibilitySummary;
}) {
  const elevators = assets.filter(
    (asset) => asset.elevator_or_escalator === "Elevator",
  );
  const escalators = assets.filter(
    (asset) => asset.elevator_or_escalator === "Escalator",
  );
  const elevatorStatus = getEquipmentStatusCounts(elevators);
  const escalatorStatus = getEquipmentStatusCounts(escalators);
  const plannedStations = accessibilityStations.stations.filter(
    (station) => station.plannedAda,
  );
  return (
    <section className="mt-10 grid gap-4 lg:grid-cols-3">
      <DashboardPanel eyebrow="Accessibility dashboard" title="Stations">
        <DashboardMetric label="Total stations" value={summary.totalStations} />
        <DashboardMetric
          label="♿ Accessible"
          total={summary.totalStations}
          value={summary.accessible}
          tone="green"
        />
        <DashboardMetric
          label="♿ Partial"
          total={summary.totalStations}
          value={summary.partiallyAccessible}
          tone="amber"
        />
        <DashboardMetric
          label="♿ Not accessible"
          total={summary.totalStations}
          value={summary.notAccessible}
          tone="red"
        />
        <DashboardMetric
          label="Planned ADA"
          total={summary.totalStations}
          value={summary.plannedAda}
          tone="green"
        />
      </DashboardPanel>

      <DashboardPanel eyebrow="Elevator dashboard" title="Elevators">
        <DashboardMetric label="Total elevators" value={elevators.length} />
        <DashboardMetric
          label="In service"
          total={elevators.length}
          value={elevatorStatus.inService}
          tone="green"
        />
        <DashboardMetric
          label="Out of service"
          total={elevators.length}
          value={elevatorStatus.outOfService}
          tone="red"
        />
        <DashboardMetric
          label="Work/repair"
          total={elevators.length}
          value={elevatorStatus.workOrRepair}
          tone="amber"
        />
      </DashboardPanel>

      <DashboardPanel eyebrow="Escalator dashboard" title="Escalators">
        <DashboardMetric label="Total escalators" value={escalators.length} />
        <DashboardMetric
          label="In service"
          total={escalators.length}
          value={escalatorStatus.inService}
          tone="green"
        />
        <DashboardMetric
          label="Out of service"
          total={escalators.length}
          value={escalatorStatus.outOfService}
          tone="red"
        />
        <DashboardMetric
          label="Work/repair"
          total={escalators.length}
          value={escalatorStatus.workOrRepair}
          tone="amber"
        />
      </DashboardPanel>

      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10 lg:col-span-3">
        <div className="font-mono text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
          Planned ADA stations
        </div>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          ✅ Planned to be ♿ accessible
        </h2>
        <div className="mt-4 max-h-72 overflow-y-auto pr-2">
          <StationList stations={plannedStations} />
        </div>
      </div>
    </section>
  );
}

function getEquipmentStatusCounts(assets: MtaAsset[]) {
  return assets.reduce(
    (counts, asset) => {
      const statusCode = asset.service_status_code?.toUpperCase() ?? "";
      const statusText = [
        asset.service_status,
        asset.notes,
        asset.alternative_route,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        /\b(construction|repair|rehab|rehabilitation|modernization|temporar|closed|closure)\b/.test(
          statusText,
        )
      ) {
        counts.workOrRepair += 1;
      }

      if (statusCode === "IFIS") {
        counts.inService += 1;
      } else if (
        statusCode === "RNOS" ||
        /\b(out of service|removed|non function)/i.test(statusText)
      ) {
        counts.outOfService += 1;
      } else {
        counts.unknown += 1;
      }

      return counts;
    },
    {
      inService: 0,
      outOfService: 0,
      unknown: 0,
      workOrRepair: 0,
    },
  );
}

function StationList({
  stations,
}: {
  stations: typeof accessibilityStations.stations;
}) {
  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {stations.map((station) => (
        <div
          className="flex items-center justify-between gap-3 py-2"
          key={`${station.station}-${station.line}-${station.services.join("-")}`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2 leading-none">
            <button
              className="truncate text-left text-sm font-semibold leading-5 text-zinc-800 underline-offset-4 transition hover:text-[var(--accent-600)] hover:underline dark:text-zinc-100"
              onClick={() => focusPlannedStationOnMap(getPlannedStationFocusKey(station))}
              type="button"
            >
              {station.station}
            </button>
            <SubwayRouteIcons className="mt-0" routes={station.services} />
          </div>
          <span
            className={[
              "shrink-0 rounded-full px-2 py-1 text-xs font-semibold",
              station.accessibilityStatus === "Accessible"
                ? "bg-green-50 text-green-700 ring-1 ring-green-600/20 dark:bg-green-500/15 dark:text-green-300"
                : station.plannedAda
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-red-50 text-red-700 ring-1 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300",
            ].join(" ")}
          >
            {station.plannedAda
              ? "✅ Planned"
              : formatStationAccessibility(station)}
          </span>
        </div>
      ))}
    </div>
  );
}

function getPlannedStationFocusKey(
  station: typeof accessibilityStations.stations[number],
) {
  return [
    formatPlannedStationName(station.station),
    formatStationLineDisplay(station.line),
    station.services.join(","),
  ].join("|");
}

function formatPlannedStationName(value: string) {
  return value === "14 St/6 Av" || value === "14 St/Sixth Av"
    ? "14 St - 6 Av"
    : value;
}

function formatStationAccessibility(
  station: typeof accessibilityStations.stations[number],
) {
  const detail = station.accessibilityRaw.match(/\(([^)]+)\)/)?.[1]?.trim();

  if (station.accessibilityStatus === "Partially accessible" && detail) {
    return `♿ ${station.accessibilityStatus} (${detail})`;
  }

  return `♿ ${station.accessibilityStatus}`;
}

function DashboardPanel({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10">
      <div className="font-mono text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function DashboardMetric({
  label,
  tone = "zinc",
  total,
  value,
}: {
  label: string;
  tone?: "amber" | "green" | "red" | "zinc";
  total?: number;
  value: number;
}) {
  const toneClass = {
    amber: "text-amber-700 dark:text-amber-300",
    green: "text-green-700 dark:text-green-300",
    red: "text-red-700 dark:text-red-300",
    zinc: "text-zinc-900 dark:text-zinc-100",
  }[tone];
  const percentage =
    typeof total === "number" && total > 0 ? (value / total) * 100 : null;

  return (
    <div>
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${toneClass}`}>
        {value.toLocaleString()}
      </div>
      {percentage !== null ? (
        <div className={`mt-0.5 text-xs font-semibold ${toneClass}`}>
          {formatPercentage(percentage)}
        </div>
      ) : null}
    </div>
  );
}

function formatPercentage(value: number) {
  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}%`;
}
