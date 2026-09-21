"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ListFilter } from "lucide-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  AssetMapFocusRequest,
  AssetMapVisibilityFilters,
  MapTheme,
} from "@/components/asset-map";
import { SiteIcon } from "@/components/site-icon";
import { StationStatusBadge } from "@/components/station-status-badge";
import { SubwayRouteIcons } from "@/components/subway-route-icons";
import {
  matchesNormalizedSearch,
  normalizeSearchText,
} from "@/lib/search-normalization";
import type {
  AssetMapMarker,
  StationExplorerRecord,
} from "@/lib/station-explorer-data";
import { getStationSearchAliases } from "@/lib/stations";
import accessibleStations from "../../data/accessible-station-coordinates.json";

const AssetMap = dynamic(
  () => import("@/components/asset-map").then((module) => module.AssetMap),
  {
    loading: () => (
      <div
        aria-live="polite"
        className="grid h-full min-h-[34rem] place-items-center bg-[#111820] text-sm font-bold text-slate-300"
        role="status"
      >
        Loading the accessibility map…
      </div>
    ),
    ssr: false,
  },
);

type StatusFilter = StationExplorerRecord["tone"] | "all";

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Accessible", value: "accessible" },
  { label: "Partial", value: "partial" },
  { label: "Planned", value: "planned" },
  { label: "Not accessible", value: "not-accessible" },
];

const MAP_THEME_CHANGE_EVENT = "mta-access-assets-map-theme-change";
const MAP_THEME_STORAGE_KEY = "mta-access-assets-map-theme";
const DEFAULT_MAP_FILTERS: AssetMapVisibilityFilters = {
  elevatorStations: true,
  elevators: true,
  escalators: true,
  partialStations: true,
  plannedStations: true,
  rampStations: true,
  repairs: true,
};
const MAP_FILTER_OPTIONS: Array<{
  color: string;
  key: keyof AssetMapVisibilityFilters;
  label: string;
}> = [
  {
    color: "#06b6d4",
    key: "rampStations",
    label: "Accessible via ramp / level entrance",
  },
  {
    color: "#22c55e",
    key: "elevatorStations",
    label: "Accessible via elevator",
  },
  {
    color: "#f59e0b",
    key: "partialStations",
    label: "Partially accessible",
  },
  {
    color: "#ec4899",
    key: "plannedStations",
    label: "Planned ADA stations",
  },
  { color: "#16a34a", key: "elevators", label: "Elevator equipment" },
  { color: "#3b82f6", key: "escalators", label: "Escalator equipment" },
  {
    color: "#eab308",
    key: "repairs",
    label: "Under repair / modernization",
  },
];
const TOOL_CLASS =
  "group relative grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-[#111820]/95 text-slate-200 shadow-[0_12px_30px_rgb(0_0_0_/_0.28)] backdrop-blur-xl transition hover:border-sky-400/60 hover:bg-[#172331] hover:text-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/35";

export function MapFirstHome({
  mapAssets,
  pressRelease,
  stationRecords,
  updatedAt,
}: {
  mapAssets: AssetMapMarker[];
  pressRelease: {
    formattedDate: string;
    title: string;
    url: string;
  };
  stationRecords: StationExplorerRecord[];
  updatedAt: string;
}) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mapFilters, setMapFilters] = useState(DEFAULT_MAP_FILTERS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [mapFocusRequest, setMapFocusRequest] =
    useState<AssetMapFocusRequest | null>(null);
  const focusRequestId = useRef(0);
  const mapTheme = useSyncExternalStore(
    subscribeToMapTheme,
    readStoredMapTheme,
    getServerMapTheme,
  );

  const counts = useMemo(
    () =>
      stationRecords.reduce(
        (total, record) => {
          total[record.tone] += 1;
          return total;
        },
        {
          accessible: 0,
          "not-accessible": 0,
          partial: 0,
          planned: 0,
        } satisfies Record<StationExplorerRecord["tone"], number>,
      ),
    [stationRecords],
  );
  const mapFilterCounts = useMemo(
    () => {
      const fullAccessMarkers = accessibleStations.stations.filter(
        (station) => !station.statusLabel.startsWith("Partially accessible"),
      );
      const repairAssets = mapAssets.filter((asset) => asset.status === "work");
      const repairStationNames = new Set(
        repairAssets.map((asset) => normalizeSearchText(asset.station)),
      );
      const repairStationMarkers = accessibleStations.stations.filter((station) =>
        repairStationNames.has(normalizeSearchText(station.station)),
      );

      return {
        elevatorStations: fullAccessMarkers.filter(
          (station) => station.accessMethod === "elevator",
        ).length,
        elevators: mapAssets.filter((asset) => asset.type === "Elevator").length,
        escalators: mapAssets.filter((asset) => asset.type === "Escalator").length,
        partialStations: accessibleStations.stations.filter((station) =>
          station.statusLabel.startsWith("Partially accessible"),
        ).length,
        plannedStations: counts.planned,
        rampStations: fullAccessMarkers.filter(
          (station) => station.accessMethod !== "elevator",
        ).length,
        repairs: repairAssets.length + repairStationMarkers.length,
      };
    },
    [counts, mapAssets],
  );
  const enabledMapFilterCount = Object.values(mapFilters).filter(Boolean).length;

  const suggestions = useMemo(
    () =>
      Array.from(
        new Set(
          stationRecords.flatMap(({ lineDisplay, station }) => [
            station.station,
            ...getStationSearchAliases(station),
            station.neighborhood,
            station.borough,
            lineDisplay,
          ]),
        ),
      )
        .filter(Boolean)
        .sort(),
    [stationRecords],
  );

  const filteredStations = useMemo(() => {
    return stationRecords
      .filter(({ lineDisplay, station, tone }) => {
        const statusMatches = status === "all" || status === tone;
        const queryMatches = matchesNormalizedSearch(
          [
            station.station,
            ...getStationSearchAliases(station),
            station.line,
            lineDisplay,
            station.borough,
            station.neighborhood,
            station.services.join(" "),
          ],
          query,
        );

        return statusMatches && queryMatches;
      })
      .sort(
        (left, right) =>
          (right.station.ridership2024 ?? 0) -
          (left.station.ridership2024 ?? 0),
      );
  }, [query, stationRecords, status]);

  const showResults = query.trim() !== "" || status !== "all";
  const visibleStations = showResults ? filteredStations.slice(0, 12) : [];

  function focusStation(record: StationExplorerRecord) {
    if (!record.focusDetail) return;

    focusRequestId.current += 1;
    setMapFocusRequest({
      detail: record.focusDetail,
      id: focusRequestId.current,
    });
    setSearchOpen(false);
  }

  function toggleMapFilter(key: keyof AssetMapVisibilityFilters) {
    setMapFilters((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="relative h-[100svh] min-h-[34rem] w-full overflow-hidden bg-[#111820] text-white">
      <AssetMap
        assets={mapAssets}
        focusRequest={mapFocusRequest}
        mapTheme={mapTheme}
        minimal
        presentation="canvas"
        visibilityFilters={mapFilters}
      />

      <div className="pointer-events-none absolute inset-0 z-20">
        <header className="pointer-events-auto absolute left-3 top-3 w-[min(22rem,calc(100%-5.25rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#111820]/95 shadow-[0_16px_45px_rgb(0_0_0_/_0.32)] backdrop-blur-xl sm:left-4 sm:top-4">
          <Link
            aria-label="Access NYC home"
            className="flex items-center gap-3 px-3.5 py-3"
            href="/"
          >
            <Image
              alt=""
              className="h-10 w-10 shrink-0 object-contain p-0.5"
              height={40}
              loading="eager"
              src="/MTA.png"
              width={40}
            />
            <span className="min-w-0">
              <span className="block text-sm font-black tracking-[-0.02em]">
                Access NYC
              </span>
              <span className="block truncate text-xs font-semibold text-slate-400">
                Subway accessibility atlas
              </span>
            </span>
          </Link>
          <h1 className="border-t border-white/10 bg-sky-400 px-3.5 py-2.5 text-sm font-black leading-5 text-slate-950 sm:text-base">
            Where are NYC&apos;s accessible subway stations?
          </h1>
        </header>

        <nav
          aria-label="Map tools"
          className="pointer-events-auto absolute left-3 top-[8.9rem] flex flex-col gap-2 sm:left-4 sm:top-[9.2rem]"
        >
          <button
            aria-expanded={searchOpen}
            aria-label={searchOpen ? "Close station search" : "Search stations"}
            className={`${TOOL_CLASS} ${searchOpen ? "border-sky-400 bg-sky-400 text-slate-950 hover:bg-sky-300 hover:text-slate-950" : ""}`}
            onClick={() => {
              setFiltersOpen(false);
              setSearchOpen((open) => !open);
            }}
            title="Search stations"
            type="button"
          >
            <SiteIcon
              className="text-[23px]"
              name={searchOpen ? "close" : "search"}
            />
            <ToolTip label={searchOpen ? "Close search" : "Search"} />
          </button>

          <Link
            aria-label="Stations"
            className={TOOL_CLASS}
            href="/stations?view=explorer"
            title="Stations"
          >
            <SiteIcon className="text-[23px]" name="subway" />
            <ToolTip label="Stations" />
          </Link>

          <Link
            aria-label="Equipment"
            className={TOOL_CLASS}
            href="/equipment"
            title="Equipment"
          >
            <SiteIcon className="text-[23px]" name="elevator" />
            <ToolTip label="Equipment" />
          </Link>

          <Link
            aria-label="Projects"
            className={TOOL_CLASS}
            href="/projects"
            title="Projects"
          >
            <SiteIcon className="text-[23px]" name="construction" />
            <ToolTip label="Projects" />
          </Link>

          <a
            aria-label={`Latest MTA accessibility release: ${pressRelease.title}`}
            className={TOOL_CLASS}
            data-testid="project-spotlight"
            href={pressRelease.url}
            rel="noreferrer"
            target="_blank"
            title={`${pressRelease.title} — ${pressRelease.formattedDate}`}
          >
            <SiteIcon className="text-[23px]" name="news" />
            <span className="sr-only">
              Latest MTA accessibility release, {pressRelease.formattedDate}
            </span>
            <ToolTip label="MTA release" />
          </a>

          <div className="relative">
            <button
              aria-controls="atlas-map-filters"
              aria-expanded={filtersOpen}
              aria-label={filtersOpen ? "Close map filters" : "Filter map"}
              className={`${TOOL_CLASS} ${filtersOpen ? "border-sky-400 bg-sky-400 text-slate-950 hover:bg-sky-300 hover:text-slate-950" : ""}`}
              onClick={() => {
                setSearchOpen(false);
                setFiltersOpen((open) => !open);
              }}
              title="Filter map"
              type="button"
            >
              <ListFilter aria-hidden="true" className="h-[23px] w-[23px]" />
              <ToolTip label="Map filters" />
            </button>

            {filtersOpen ? (
              <section
                aria-label="Map filters"
                className="absolute bottom-0 left-full ml-2 w-[min(19rem,calc(100vw-5.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#111820]/[0.97] shadow-[0_22px_70px_rgb(0_0_0_/_0.42)] backdrop-blur-xl"
                id="atlas-map-filters"
              >
                <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">
                      Filter map
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      {enabledMapFilterCount} of {MAP_FILTER_OPTIONS.length} map
                      filters active
                    </p>
                  </div>
                  <button
                    aria-label="Close map filters"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => setFiltersOpen(false)}
                    type="button"
                  >
                    <SiteIcon className="text-[18px]" name="close" />
                  </button>
                </div>

                <div
                  aria-label="Map marker and repair filters"
                  className="space-y-1 p-2"
                  role="group"
                >
                  {MAP_FILTER_OPTIONS.map((filter) => (
                    <MapFilterToggle
                      active={mapFilters[filter.key]}
                      color={filter.color}
                      count={mapFilterCounts[filter.key]}
                      key={filter.key}
                      label={filter.label}
                      onToggle={() => toggleMapFilter(filter.key)}
                    />
                  ))}
                </div>

                <div className="flex gap-2 border-t border-white/10 p-3">
                  <button
                    className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-white/30 hover:bg-white/10"
                    onClick={() => setMapFilters(DEFAULT_MAP_FILTERS)}
                    type="button"
                  >
                    Show all
                  </button>
                  <button
                    className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-white/30 hover:bg-white/10"
                    onClick={() =>
                      setMapFilters({
                        elevatorStations: false,
                        elevators: false,
                        escalators: false,
                        partialStations: false,
                        plannedStations: false,
                        rampStations: false,
                        repairs: false,
                      })
                    }
                    type="button"
                  >
                    Hide all
                  </button>
                </div>
              </section>
            ) : null}
          </div>

          <button
            aria-label={`Use ${mapTheme === "dark" ? "light" : "dark"} map`}
            className={TOOL_CLASS}
            onClick={() =>
              setStoredMapTheme(mapTheme === "dark" ? "light" : "dark")
            }
            title={`Use ${mapTheme === "dark" ? "light" : "dark"} map`}
            type="button"
          >
            <SiteIcon
              className="text-[23px]"
              name={mapTheme === "dark" ? "light_mode" : "dark_mode"}
            />
            <ToolTip label="Map theme" />
          </button>
        </nav>

        {searchOpen ? (
          <section
            aria-label="Station search"
            className="pointer-events-auto absolute bottom-3 left-[4.4rem] right-3 top-[8.9rem] overflow-y-auto rounded-2xl border border-white/10 bg-[#111820]/[0.97] shadow-[0_22px_70px_rgb(0_0_0_/_0.42)] backdrop-blur-xl sm:bottom-4 sm:left-[4.75rem] sm:right-auto sm:top-[9.2rem] sm:w-[min(24rem,calc(100%-5.75rem))]"
            data-testid="station-directory"
          >
            <div className="sticky top-0 z-10 border-b border-white/10 bg-[#111820]/95 p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">
                    Find a station
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-300">
                    Search by station, route, or neighborhood.
                  </p>
                </div>
                <button
                  aria-label="Close station search"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
                  onClick={() => setSearchOpen(false)}
                  type="button"
                >
                  <SiteIcon className="text-[20px]" name="close" />
                </button>
              </div>

              <div className="relative mt-3">
                <SiteIcon
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-slate-400"
                  name="search"
                />
                <input
                  autoComplete="off"
                  autoFocus
                  className="h-12 w-full rounded-xl border border-white/15 bg-black/25 pl-11 pr-10 text-sm font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 focus:ring-4 focus:ring-sky-400/15"
                  id="atlas-station-search"
                  list="atlas-station-suggestions"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Station, route, or neighborhood"
                  type="search"
                  value={query}
                />
                {query ? (
                  <button
                    aria-label="Clear station search"
                    className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => setQuery("")}
                    type="button"
                  >
                    <SiteIcon className="text-[18px]" name="close" />
                  </button>
                ) : null}
                <datalist id="atlas-station-suggestions">
                  {suggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    aria-pressed={status === filter.value}
                    className={[
                      "shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition",
                      status === filter.value
                        ? "border-sky-400 bg-sky-400 text-slate-950"
                        : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:text-white",
                    ].join(" ")}
                    key={filter.value}
                    onClick={() => setStatus(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {showResults ? (
              <div>
                <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                  <p className="font-bold text-slate-300">
                    {filteredStations.length.toLocaleString()} stations found
                  </p>
                  <Link
                    className="font-bold text-sky-300 hover:text-sky-200"
                    href="/stations?view=explorer"
                  >
                    Full explorer
                  </Link>
                </div>
                <div className="divide-y divide-white/10 border-t border-white/10">
                  {visibleStations.length > 0 ? (
                    visibleStations.map((record) => (
                      <article
                        className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 transition hover:bg-white/[0.04]"
                        key={record.slug}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              className="truncate text-sm font-extrabold text-white hover:text-sky-300"
                              href={`/stations/${record.slug}`}
                            >
                              {record.station.station}
                            </Link>
                            <SubwayRouteIcons
                              className="mt-0"
                              routes={record.station.services}
                            />
                          </div>
                          <p className="mt-1 truncate text-xs font-medium text-slate-400">
                            {record.station.neighborhood} · {record.station.borough}
                          </p>
                          <div className="mt-2">
                            <StationStatusBadge compact station={record.station} />
                          </div>
                        </div>
                        <button
                          aria-label={`Show ${record.station.station} on map`}
                          className="grid h-10 w-10 place-items-center self-center rounded-xl border border-white/15 bg-white/5 text-sky-300 transition hover:border-sky-400 hover:bg-sky-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!record.focusDetail}
                          onClick={() => focusStation(record)}
                          type="button"
                        >
                          <SiteIcon className="text-[20px]" name="location_on" />
                        </button>
                      </article>
                    ))
                  ) : (
                    <div className="px-6 py-10 text-center">
                      <SiteIcon
                        className="text-3xl text-slate-500"
                        name="search_off"
                      />
                      <p className="mt-3 text-sm font-bold text-white">
                        No matching stations
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        Try another station, route, neighborhood, or status.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  System at a glance
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <AtlasMetric
                    color="bg-emerald-400"
                    label="Accessible"
                    value={counts.accessible}
                  />
                  <AtlasMetric
                    color="bg-amber-400"
                    label="Partial"
                    value={counts.partial}
                  />
                  <AtlasMetric
                    color="bg-pink-400"
                    label="Planned"
                    value={counts.planned}
                  />
                  <AtlasMetric
                    color="bg-red-400"
                    label="Not accessible"
                    value={counts["not-accessible"]}
                  />
                </div>
                <Link
                  className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-sky-300 hover:text-sky-200"
                  href="/stations?view=explorer"
                >
                  Browse every station
                  <SiteIcon className="text-[17px]" name="arrow_forward" />
                </Link>
              </div>
            )}
          </section>
        ) : null}

        <p className="pointer-events-auto absolute bottom-3 right-3 max-w-[calc(100%-5.25rem)] rounded-full border border-white/10 bg-[#111820]/90 px-3 py-2 text-[10px] font-bold text-slate-300 shadow-lg backdrop-blur-xl sm:bottom-4 sm:right-4 sm:text-[11px]">
          Official MTA routes · inventory updated {updatedAt}
        </p>
      </div>
    </div>
  );
}

function ToolTip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-lg border border-white/10 bg-[#111820]/95 px-2.5 py-1.5 text-xs font-bold text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">
      {label}
    </span>
  );
}

function MapFilterToggle({
  active,
  color,
  count,
  label,
  onToggle,
}: {
  active: boolean;
  color: string;
  count: number;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
        active
          ? "bg-white/[0.08] text-white"
          : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300",
      ].join(" ")}
      onClick={onToggle}
      type="button"
    >
      <span
        className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/80"
        style={{ backgroundColor: active ? color : "transparent" }}
      />
      <span className="min-w-0 flex-1 text-xs font-bold">{label}</span>
      <span className="font-mono text-[10px] text-slate-400">
        {count.toLocaleString()}
      </span>
    </button>
  );
}

function AtlasMetric({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </div>
      <p className="mt-2 font-mono text-xl font-black text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function readStoredMapTheme(): MapTheme {
  if (typeof window === "undefined") return "dark";

  const storedTheme = window.localStorage.getItem(MAP_THEME_STORAGE_KEY);
  return storedTheme === "light" || storedTheme === "dark"
    ? storedTheme
    : "dark";
}

function getServerMapTheme(): MapTheme {
  return "dark";
}

function setStoredMapTheme(theme: MapTheme) {
  window.localStorage.setItem(MAP_THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event(MAP_THEME_CHANGE_EVENT));
}

function subscribeToMapTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(MAP_THEME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(MAP_THEME_CHANGE_EVENT, onStoreChange);
  };
}
