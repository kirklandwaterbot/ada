"use client";

import type { MtaAsset } from "@/lib/mta-assets";
import accessibilityStations from "../../data/accessibility-stations.json";
import { SubwayRouteIcons } from "@/components/subway-route-icons";
import { formatStationLineDisplay } from "@/lib/asset-display";
import { focusStationOnMap } from "@/lib/map-focus";
import { matchesNormalizedSearch } from "@/lib/search-normalization";
import { useMemo, useState } from "react";

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

type Station = typeof accessibilityStations.stations[number];
type StationFilterKey = "accessible" | "mixed" | "notAccessible" | "planned";

const STATION_FILTERS: Array<{
  key: StationFilterKey;
  label: string;
}> = [
  { key: "accessible", label: "Accessible" },
  { key: "mixed", label: "Partial accessibility" },
  { key: "notAccessible", label: "Not accessible" },
  { key: "planned", label: "Planned" },
];

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

  return (
    <section className="mt-10 grid gap-4 lg:grid-cols-3">
      <DashboardPanel eyebrow="Accessibility dashboard" title="Stations">
        <DashboardMetric label="Total stations" value={summary.totalStations} />
        <DashboardMetric
          label={`${ACCESSIBILITY_ICON} Accessible`}
          total={summary.totalStations}
          value={summary.accessible}
          tone="green"
        />
        <DashboardMetric
          label={`${ACCESSIBILITY_ICON} Partial`}
          total={summary.totalStations}
          value={summary.partiallyAccessible}
          tone="amber"
        />
        <DashboardMetric
          label={`${ACCESSIBILITY_ICON} Not accessible`}
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
          label="Listed in service"
          total={elevators.length}
          value={elevatorStatus.inService}
          tone="green"
        />
        <DashboardMetric
          label="Snapshot outage flags"
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
          label="Listed in service"
          total={escalators.length}
          value={escalatorStatus.inService}
          tone="green"
        />
        <DashboardMetric
          label="Snapshot outage flags"
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
          Station browser
        </div>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          All stations
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {accessibilityStations.stations.length.toLocaleString()} station rows from the accessibility workbook.
        </p>
        <StationBrowser />
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

function StationBrowser() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<StationFilterKey, boolean>>({
    accessible: true,
    mixed: true,
    notAccessible: true,
    planned: true,
  });

  const stations = useMemo(
    () =>
      accessibilityStations.stations.filter(
        (station) =>
          matchesStationFilters(station, filters) &&
          matchesNormalizedSearch(
            [
              station.station,
              station.borough,
              station.neighborhood,
              station.line,
              station.services.join(" "),
              station.accessibilityStatus,
              station.plannedAda ? "planned planned ada" : "",
            ],
            query,
          ),
      ),
    [filters, query],
  );

  return (
    <div className="mt-4">
      <label
        className="font-mono text-xs font-semibold uppercase text-zinc-400 dark:text-zinc-500"
        htmlFor="all-stations-search"
      >
        Search stations
      </label>
      <input
        className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[var(--accent-600)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        id="all-stations-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Harlem-148 St"
        type="search"
        value={query}
      />
      <fieldset className="mt-4 flex flex-wrap gap-2">
        <legend className="sr-only">Station accessibility filters</legend>
        {STATION_FILTERS.map((filter) => (
          <label
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            key={filter.key}
          >
            <input
              checked={filters[filter.key]}
              className="h-4 w-4 accent-[var(--accent-600)]"
              onChange={() =>
                setFilters((current) => ({
                  ...current,
                  [filter.key]: !current[filter.key],
                }))
              }
              type="checkbox"
            />
            {filter.label}
          </label>
        ))}
      </fieldset>
      <div className="mt-4 max-h-96 overflow-y-auto pr-2">
        <StationList stations={stations} />
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Showing {stations.length.toLocaleString()} of{" "}
        {accessibilityStations.stations.length.toLocaleString()} station rows.
      </p>
    </div>
  );
}

function StationList({ stations }: { stations: Station[] }) {
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
              onClick={() => focusStationOnMap(getPlannedStationFocusKey(station))}
              type="button"
            >
              {station.station}
            </button>
            <SubwayRouteIcons className="mt-0" routes={station.services} />
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <StationStatusBadge station={station} />
            {station.plannedAda ? (
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300">
                Planned
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function StationStatusBadge({ station }: { station: Station }) {
  return (
    <span
      className={[
        "rounded-full px-2 py-1 text-xs font-semibold",
        station.accessibilityStatus === "Accessible"
          ? "bg-green-50 text-green-700 ring-1 ring-green-600/20 dark:bg-green-500/15 dark:text-green-300"
          : station.accessibilityStatus === "Partially accessible"
            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300"
            : "bg-red-50 text-red-700 ring-1 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300",
      ].join(" ")}
    >
      {formatStationAccessibility(station)}
    </span>
  );
}

function matchesStationFilters(
  station: Station,
  filters: Record<StationFilterKey, boolean>,
) {
  if (station.plannedAda && filters.planned) {
    return true;
  }

  if (station.accessibilityStatus === "Accessible" && filters.accessible) {
    return true;
  }

  if (station.accessibilityStatus === "Partially accessible" && filters.mixed) {
    return true;
  }

  return station.accessibilityStatus === "Not accessible" && filters.notAccessible;
}

function getPlannedStationFocusKey(station: Station) {
  return [
    formatPlannedStationName(station.station),
    formatStationLineDisplay(station.line),
    station.services.join(","),
  ].join("|");
}

function formatPlannedStationName(value: string) {
  if (value === "14 St/6 Av" || value === "14 St/Sixth Av") {
    return "14 St - 6 Av";
  }

  if (value === "Court Sq-23 St") {
    return "Court Sq - 23 St";
  }

  if (value === "Borough Hall") {
    return "Borough Hall/Court St";
  }

  return value;
}

const ACCESSIBILITY_ICON = "\u267F";

function formatStationAccessibility(station: Station) {
  const detail = station.accessibilityRaw.match(/\(([^)]+)\)/)?.[1]?.trim();

  if (station.accessibilityStatus === "Partially accessible" && detail) {
    return `${ACCESSIBILITY_ICON} ${station.accessibilityStatus} (${detail})`;
  }

  return `${ACCESSIBILITY_ICON} ${station.accessibilityStatus}`;
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
