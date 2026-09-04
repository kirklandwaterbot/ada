"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import type { AssetMapFocusRequest } from "@/components/asset-map";
import { SiteIcon } from "@/components/site-icon";
import { StationStatusBadge } from "@/components/station-status-badge";
import { SubwayRouteIcons } from "@/components/subway-route-icons";
import type { MapFocusDetail } from "@/lib/map-focus";
import { matchesNormalizedSearch } from "@/lib/search-normalization";
import {
  type AssetMapMarker,
  type StationExplorerRecord,
} from "@/lib/station-explorer-data";
import {
  type Station,
} from "@/lib/stations";

const AssetMap = dynamic(
  () => import("@/components/asset-map").then((module) => module.AssetMap),
  {
    loading: () => (
      <div
        aria-live="polite"
        className="surface-card grid min-h-[580px] place-items-center p-8 text-center text-sm font-semibold text-[var(--muted-strong)]"
        role="status"
      >
        Loading the interactive system map…
      </div>
    ),
    ssr: false,
  },
);

type StatusFilter =
  | "all"
  | "accessible"
  | "not-accessible"
  | "partial"
  | "planned";
type SortKey = "name" | "ridership";
export type ExploreWorkspaceView = "explorer" | "map" | "split";
const INITIAL_RESULT_COUNT = 30;

const WORKSPACE_VIEW_OPTIONS: Array<{
  description: string;
  icon: string;
  label: string;
  value: ExploreWorkspaceView;
}> = [
  {
    description: "Hide the map and use the station list at full width",
    icon: "accessible",
    label: "Explorer",
    value: "explorer",
  },
  {
    description: "Show the station explorer and system map together",
    icon: "split_view",
    label: "Both",
    value: "split",
  },
  {
    description: "Hide the station list and use the map at full width",
    icon: "map",
    label: "Map",
    value: "map",
  },
];

export function StationExplorer({
  initialView,
  mapAssets,
  stationRecords,
}: {
  initialView?: ExploreWorkspaceView;
  mapAssets: AssetMapMarker[];
  stationRecords: StationExplorerRecord[];
}) {
  const [query, setQuery] = useState("");
  const [borough, setBorough] = useState("All");
  const [route, setRoute] = useState("All");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("ridership");
  const [workspaceView, setWorkspaceView] = useState<ExploreWorkspaceView>(
    initialView ?? "split",
  );
  const [mapFocusRequest, setMapFocusRequest] =
    useState<AssetMapFocusRequest | null>(null);
  const [visibleResultCount, setVisibleResultCount] = useState(
    INITIAL_RESULT_COUNT,
  );
  const focusRequestId = useRef(0);

  const boroughs = useMemo(
    () =>
      Array.from(
        new Set(stationRecords.map(({ station }) => station.borough)),
      ).sort(),
    [stationRecords],
  );
  const routes = useMemo(
    () =>
      Array.from(
        new Set(
          stationRecords.flatMap(({ station }) => station.services),
        ),
      ).sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true }),
      ),
    [stationRecords],
  );
  const suggestions = useMemo(
    () =>
      Array.from(
        new Set(
          stationRecords.flatMap(({ lineDisplay, station }) => [
            station.station,
            station.borough,
            station.neighborhood,
            lineDisplay,
          ]),
        ),
      )
        .filter(Boolean)
        .sort(),
    [stationRecords],
  );

  const filteredStations = useMemo(() => {
    const matches = stationRecords.filter(({ lineDisplay, station, tone }) => {
      const queryMatches = matchesNormalizedSearch(
        [
          station.station,
          station.line,
          lineDisplay,
          station.borough,
          station.neighborhood,
          station.services.join(" "),
          station.accessibilityStatus,
          station.plannedAda ? "planned ada construction" : "",
        ],
        query,
      );
      const boroughMatches = borough === "All" || station.borough === borough;
      const routeMatches = route === "All" || station.services.includes(route);
      const statusMatches = status === "all" || tone === status;

      return queryMatches && boroughMatches && routeMatches && statusMatches;
    });

    return matches.sort((left, right) =>
      sort === "name"
        ? left.station.station.localeCompare(right.station.station)
        : (right.station.ridership2024 ?? 0) - (left.station.ridership2024 ?? 0),
    );
  }, [borough, query, route, sort, stationRecords, status]);
  const visibleStations = filteredStations.slice(0, visibleResultCount);

  const hasFilters =
    query !== "" || borough !== "All" || route !== "All" || status !== "all";

  function clearFilters() {
    setQuery("");
    setBorough("All");
    setRoute("All");
    setStatus("all");
    setVisibleResultCount(INITIAL_RESULT_COUNT);
  }

  function selectWorkspaceView(nextView: ExploreWorkspaceView) {
    setWorkspaceView(nextView);

    const url = new URL(window.location.href);

    if (nextView === "split") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", nextView);
    }

    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function showOnMap(detail: MapFocusDetail) {
    if (workspaceView === "explorer") {
      selectWorkspaceView("split");
    }

    focusRequestId.current += 1;
    setMapFocusRequest({ detail, id: focusRequestId.current });
  }

  return (
    <div className="space-y-4">
      <section
        aria-label="Explorer workspace layout"
        className="surface-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
      >
        <div className="min-w-0 px-1">
          <p className="text-sm font-extrabold text-[var(--ink)]">Choose what to show</p>
          <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
            The station explorer and system map now share one workspace.
          </p>
        </div>
        <div
          aria-label="Workspace view"
          className="grid grid-cols-3 rounded-xl bg-[var(--soft)] p-1"
          role="group"
        >
          {WORKSPACE_VIEW_OPTIONS.map((option) => (
            <button
              aria-pressed={workspaceView === option.value}
              className={[
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition sm:min-w-28",
                workspaceView === option.value
                  ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              ].join(" ")}
              key={option.value}
              onClick={() => selectWorkspaceView(option.value)}
              title={option.description}
              type="button"
            >
              <SiteIcon className="text-[17px]" name={option.icon} />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <div
        className={[
          "grid gap-5",
          workspaceView === "split"
            ? "xl:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.55fr)]"
            : "grid-cols-1",
        ].join(" ")}
      >
      {workspaceView !== "map" ? (
        <section className="surface-card flex min-h-[620px] flex-col overflow-hidden xl:h-[calc(100vh-11rem)] xl:min-h-[680px]">
        <div className="border-b border-[var(--border)] p-4 sm:p-5">
          <div className="relative">
            <label className="sr-only" htmlFor="station-search">
              Search by station, subway line, neighborhood, or borough
            </label>
            <SiteIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-[var(--muted)]" name="search" />
            <input
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] pl-11 pr-10 text-sm font-medium text-[var(--ink)] shadow-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent-500)] focus:ring-4 focus:ring-[var(--accent-ring)]"
              id="station-search"
              list="station-search-suggestions"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Station, line, route, or borough"
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear station search"
                className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--ink)]"
                onClick={() => setQuery("")}
                type="button"
              >
                <SiteIcon className="text-[18px]" name="close" />
              </button>
            ) : null}
            <datalist id="station-search-suggestions">
              {suggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <FilterSelect
              label="Borough"
              onChange={setBorough}
              options={boroughs}
              value={borough}
            />
            <FilterSelect
              label="Route"
              onChange={setRoute}
              options={routes}
              value={route}
            />
            <FilterSelect
              className="col-span-2 sm:col-span-1"
              label="Sort"
              onChange={(value) => setSort(value as SortKey)}
              options={["ridership", "name"]}
              renderLabel={(value) => (value === "ridership" ? "Most used" : "A-Z")}
              showAll={false}
              value={sort}
            />
          </div>

          <fieldset className="mt-3">
            <legend className="sr-only">Accessibility status</legend>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(
                [
                  ["all", "All"],
                  ["accessible", "Accessible"],
                  ["partial", "Partial"],
                  ["planned", "Planned"],
                  ["not-accessible", "Not accessible"],
                ] as const
              ).map(([value, label]) => (
                <button
                  aria-pressed={status === value}
                  className={[
                    "shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition",
                    status === value
                      ? "border-[var(--nav-active)] bg-[var(--nav-active)] text-white"
                      : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted-strong)] hover:bg-[var(--soft)]",
                  ].join(" ")}
                  key={value}
                  onClick={() => setStatus(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p
              aria-atomic="true"
              aria-live="polite"
              className="text-xs font-semibold text-[var(--muted-strong)]"
            >
              <span className="font-mono font-bold text-[var(--ink)]">
                {filteredStations.length.toLocaleString()}
              </span>{" "}
              stations found
            </p>
            {hasFilters ? (
              <button
                className="text-xs font-bold text-[var(--accent-600)] hover:underline"
                onClick={clearFilters}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 divide-y divide-[var(--border)] overflow-y-auto">
          {visibleStations.length > 0 ? (
            <>
            {visibleStations.map(
              ({ equipment, focusDetail, ridershipLabel, slug, station }) => (
                 <StationResult
                   equipment={equipment}
                   focusDetail={focusDetail}
                   key={slug}
                   onShowOnMap={showOnMap}
                   ridershipLabel={ridershipLabel}
                   slug={slug}
                   station={station}
                 />
              ),
            )}
            {visibleStations.length < filteredStations.length ? (
              <div className="p-4 text-center sm:p-5">
                <p className="mb-3 text-xs font-semibold text-[var(--muted)]">
                  Showing {visibleStations.length.toLocaleString()} of{" "}
                  {filteredStations.length.toLocaleString()} matching stations
                </p>
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-4 text-sm font-bold text-[var(--accent-700)] shadow-sm transition hover:bg-[var(--soft)]"
                  onClick={() =>
                    setVisibleResultCount((count) => count + INITIAL_RESULT_COUNT)
                  }
                  type="button"
                >
                  Show more stations
                </button>
              </div>
            ) : null}
            </>
          ) : (
            <div className="grid min-h-72 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--soft)] text-[var(--muted)]">
                  <SiteIcon className="text-[26px]" name="search_off" />
                </span>
                <h2 className="mt-4 font-extrabold text-[var(--ink)]">No matching stations</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                  Try another station name, route, borough, or accessibility status.
                </p>
                <button
                  className="mt-4 text-sm font-bold text-[var(--accent-600)] hover:underline"
                  onClick={clearFilters}
                  type="button"
                >
                  Reset search
                </button>
              </div>
            </div>
          )}
        </div>
        </section>
      ) : null}

      {workspaceView !== "explorer" ? (
        <div
          className={
            workspaceView === "split" ? "xl:sticky xl:top-6 xl:self-start" : ""
          }
        >
          <AssetMap
            assets={mapAssets}
            embedded
            focusRequest={mapFocusRequest}
            layout={workspaceView === "map" ? "full" : "split"}
          />
        </div>
      ) : null}
      </div>
    </div>
  );
}

function StationResult({
  equipment,
  focusDetail,
  onShowOnMap,
  ridershipLabel,
  slug,
  station,
}: {
  equipment: StationExplorerRecord["equipment"];
  focusDetail: MapFocusDetail | null;
  onShowOnMap: (detail: MapFocusDetail) => void;
  ridershipLabel: string;
  slug: string;
  station: Station;
}) {
  return (
    <article
      className="group p-4 transition hover:bg-[var(--soft-blue)] sm:p-5"
      data-testid="station-result"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="text-base font-black tracking-[-0.02em] text-[var(--ink)] hover:text-[var(--accent-700)]"
              href={"/stations/" + slug}
            >
              {station.station}
            </Link>
            <SubwayRouteIcons className="mt-0" routes={station.services} />
          </div>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            {station.neighborhood} - {station.borough}
          </p>
        </div>
        <StationStatusBadge compact station={station} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--soft)] p-3 text-xs">
        <div>
          <p className="font-semibold text-[var(--muted)]">Annual ridership</p>
          <p className="mt-1 font-mono font-bold text-[var(--ink)]">
            {ridershipLabel}
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--muted)]">Equipment snapshot</p>
          <EquipmentFlag equipment={equipment} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {focusDetail ? (
          <button
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--muted-strong)] hover:text-[var(--accent-700)]"
            onClick={() => onShowOnMap(focusDetail)}
            type="button"
          >
            <SiteIcon className="text-[17px]" name="my_location" />
            Show on map
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <SiteIcon className="text-[17px]" name="wrong_location" />
            Map location unavailable
          </span>
        )}
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-600)] hover:underline"
          href={"/stations/" + slug}
        >
          Station details
          <SiteIcon className="text-[16px]" name="arrow_forward" />
        </Link>
      </div>
    </article>
  );
}

function EquipmentFlag({
  equipment,
}: {
  equipment: StationExplorerRecord["equipment"];
}) {
  if (equipment.outage > 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-300">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        {equipment.outage} snapshot outage {equipment.outage === 1 ? "flag" : "flags"}
      </span>
    );
  }

  if (equipment.work > 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {equipment.work} work/repair
      </span>
    );
  }

  if (equipment.total > 0) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        No snapshot outage flags
      </span>
    );
  }

  return <span className="mt-1 block font-bold text-[var(--muted)]">No assets matched</span>;
}

function FilterSelect({
  className = "",
  label,
  onChange,
  options,
  renderLabel = (value) => value,
  showAll = true,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  renderLabel?: (value: string) => string;
  showAll?: boolean;
  value: string;
}) {
  return (
    <label className={className}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 text-xs font-bold text-[var(--muted-strong)] outline-none transition focus:border-[var(--accent-500)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {showAll ? <option value="All">{label}: All</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {showAll ? label + ": " : ""}
            {renderLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
