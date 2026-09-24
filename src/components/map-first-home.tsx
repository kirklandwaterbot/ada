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
import { TransitRouteIcons } from "@/components/transit-route-icons";
import {
  ADA_PROJECT_STATUS_META,
  type AdaProjectFilterKey,
} from "@/lib/ada-project-status";
import {
  matchesNormalizedSearch,
  normalizeSearchText,
} from "@/lib/search-normalization";
import {
  normalizeStoredBoolean,
  normalizeStoredString,
  usePersistentState,
} from "@/hooks/use-persistent-state";
import { ASSET_MAP_STATUS_COLORS } from "@/lib/asset-display";
import type {
  AssetMapMarker,
  StationExplorerRecord,
} from "@/lib/station-explorer-data";
import { getStationSearchAliases } from "@/lib/stations";
import {
  ALL_TRANSIT_ROUTE_KEYS,
  DEFAULT_ENABLED_TRANSIT_ROUTES,
  TRANSIT_FILTER_SYSTEMS,
  type TransitFilterAgency,
  type TransitFilterSection,
  type TransitFilterSystem,
} from "@/lib/transit-filter-catalog";
import accessibleStations from "../../data/accessible-station-coordinates.json";
import adaProjectStatuses from "../../data/ada-project-statuses.json";
import ctrailAccessibility from "../../data/ctrail-accessibility.json";
import ewrAirTrainAccessibility from "../../data/ewr-airtrain-accessibility.json";
import jfkAirTrainAccessibility from "../../data/jfk-airtrain-accessibility.json";
import regionalRailAccessibility from "../../data/mta-regional-rail-accessibility.json";
import njTransitAccessibility from "../../data/nj-transit-accessibility.json";
import pathAccessibility from "../../data/path-accessibility.json";

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
const HOME_STORAGE_KEYS = {
  filtersOpen: "access-nyc:home-filters-open:v1",
  mapFilters: "access-nyc:home-map-filters:v1",
  mastheadOpen: "access-nyc:home-masthead-open:v1",
  query: "access-nyc:home-query:v1",
  searchOpen: "access-nyc:home-search-open:v1",
  status: "access-nyc:home-status:v1",
} as const;
const DEFAULT_MAP_FILTERS: AssetMapVisibilityFilters = {
  airTrainStations: true,
  ctrailStations: true,
  elevatorStations: true,
  elevators: true,
  escalators: true,
  enabledTransitRoutes: DEFAULT_ENABLED_TRANSIT_ROUTES,
  lirrStations: true,
  metroNorthStations: true,
  njTransitStations: true,
  pathStations: true,
  partialStations: true,
  plannedAccessibleUpgrades: true,
  plannedDesignStudy: true,
  plannedFunded: true,
  plannedNewStations: true,
  plannedUnderConstruction: true,
  rampStations: true,
  repairs: true,
};
const SHOW_ALL_MAP_FILTERS: AssetMapVisibilityFilters = {
  ...DEFAULT_MAP_FILTERS,
  enabledTransitRoutes: ALL_TRANSIT_ROUTE_KEYS,
};
type MapMarkerFilterKey =
  | AdaProjectFilterKey
  | "elevatorStations"
  | "elevators"
  | "escalators"
  | "partialStations"
  | "rampStations"
  | "repairs";

const MAP_FILTER_OPTIONS: Array<{
  color: string;
  key: MapMarkerFilterKey;
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
    color: ADA_PROJECT_STATUS_META.under_construction.color,
    key: ADA_PROJECT_STATUS_META.under_construction.filterKey,
    label: ADA_PROJECT_STATUS_META.under_construction.label,
  },
  {
    color: ADA_PROJECT_STATUS_META.funded_planned.color,
    key: ADA_PROJECT_STATUS_META.funded_planned.filterKey,
    label: ADA_PROJECT_STATUS_META.funded_planned.label,
  },
  {
    color: ADA_PROJECT_STATUS_META.design_study.color,
    key: ADA_PROJECT_STATUS_META.design_study.filterKey,
    label: ADA_PROJECT_STATUS_META.design_study.label,
  },
  {
    color: ADA_PROJECT_STATUS_META.planned_new_station.color,
    key: ADA_PROJECT_STATUS_META.planned_new_station.filterKey,
    label: ADA_PROJECT_STATUS_META.planned_new_station.label,
  },
  {
    color: ADA_PROJECT_STATUS_META.upgrade_to_accessible_station.color,
    key: ADA_PROJECT_STATUS_META.upgrade_to_accessible_station.filterKey,
    label: ADA_PROJECT_STATUS_META.upgrade_to_accessible_station.label,
  },
  {
    color: ASSET_MAP_STATUS_COLORS.accessible,
    key: "elevators",
    label: "Elevator equipment",
  },
  {
    color: ASSET_MAP_STATUS_COLORS.equipment,
    key: "escalators",
    label: "Escalator equipment",
  },
  {
    color: ASSET_MAP_STATUS_COLORS.work,
    key: "repairs",
    label: "Outages / repair / modernization",
  },
];
const TOOL_CLASS =
  "group relative grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-[#111820]/95 text-slate-200 shadow-[0_12px_30px_rgb(0_0_0_/_0.28)] backdrop-blur-xl transition hover:border-sky-400/60 hover:bg-[#172331] hover:text-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/35";

export function MapFirstHome({
  mapAssets,
  pressRelease,
  stationRecords,
}: {
  mapAssets: AssetMapMarker[];
  pressRelease: {
    formattedDate: string;
    title: string;
    url: string;
  };
  stationRecords: StationExplorerRecord[];
}) {
  const [query, setQuery] = usePersistentState(
    HOME_STORAGE_KEYS.query,
    "",
    normalizeStoredString,
  );
  const [filtersOpen, setFiltersOpen] = usePersistentState(
    HOME_STORAGE_KEYS.filtersOpen,
    false,
    normalizeStoredBoolean,
  );
  const [mapFilters, setMapFilters] = usePersistentState(
    HOME_STORAGE_KEYS.mapFilters,
    DEFAULT_MAP_FILTERS,
    normalizeStoredMapFilters,
  );
  const [mastheadOpen, setMastheadOpen] = usePersistentState(
    HOME_STORAGE_KEYS.mastheadOpen,
    true,
    normalizeStoredBoolean,
  );
  const [searchOpen, setSearchOpen] = usePersistentState(
    HOME_STORAGE_KEYS.searchOpen,
    false,
    normalizeStoredBoolean,
  );
  const [status, setStatus] = usePersistentState<StatusFilter>(
    HOME_STORAGE_KEYS.status,
    "all",
    normalizeStoredStatus,
  );
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
        lirrStations: regionalRailAccessibility.metadata.agencies.LIRR,
        metroNorthStations: regionalRailAccessibility.metadata.agencies.MNR,
        pathStations: pathAccessibility.metadata.stationCount,
        airTrainStations:
          ewrAirTrainAccessibility.metadata.stationCount +
          jfkAirTrainAccessibility.metadata.stationCount,
        njTransitStations: njTransitAccessibility.metadata.stationCount,
        ctrailStations: ctrailAccessibility.metadata.stationCount,
        partialStations: accessibleStations.stations.filter((station) =>
          station.statusLabel.startsWith("Partially accessible"),
        ).length,
        plannedAccessibleUpgrades:
          adaProjectStatuses.statusCounts.upgrade_to_accessible_station,
        plannedDesignStudy: adaProjectStatuses.statusCounts.design_study,
        plannedFunded: adaProjectStatuses.statusCounts.funded_planned,
        plannedNewStations: adaProjectStatuses.statusCounts.planned_new_station,
        plannedUnderConstruction:
          adaProjectStatuses.statusCounts.under_construction,
        rampStations: fullAccessMarkers.filter(
          (station) => station.accessMethod !== "elevator",
        ).length,
        repairs: repairAssets.length + repairStationMarkers.length,
      };
    },
    [mapAssets],
  );
  const enabledMapFilterCount =
    MAP_FILTER_OPTIONS.filter((filter) => mapFilters[filter.key]).length +
    mapFilters.enabledTransitRoutes.length;
  const totalMapFilterCount =
    MAP_FILTER_OPTIONS.length + ALL_TRANSIT_ROUTE_KEYS.length;

  const suggestions = useMemo(
    () =>
      Array.from(
        new Set(
          stationRecords.flatMap(({ lineDisplay, locationLabel, station }) => [
            station.station,
            ...getStationSearchAliases(station),
            ...station.agencies,
            locationLabel,
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
      .filter(({ lineDisplay, locationLabel, station, tone }) => {
        const statusMatches = status === "all" || status === tone;
        const queryMatches = matchesNormalizedSearch(
          [
            station.station,
            ...getStationSearchAliases(station),
            station.line,
            lineDisplay,
            ...station.agencies,
            locationLabel,
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

  function toggleMapFilter(key: MapMarkerFilterKey) {
    setMapFilters((current) => ({ ...current, [key]: !current[key] }));
  }

  function setTransitRoutes(routeKeys: string[], enabled: boolean) {
    setMapFilters((current) => {
      const next = new Set(current.enabledTransitRoutes);
      for (const routeKey of routeKeys) {
        if (enabled) next.add(routeKey);
        else next.delete(routeKey);
      }
      return { ...current, enabledTransitRoutes: [...next] };
    });
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
        <header
          className={`pointer-events-auto absolute left-3 top-3 w-[min(22rem,calc(100%-5.25rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#111820]/95 shadow-[0_16px_45px_rgb(0_0_0_/_0.32)] backdrop-blur-xl sm:left-4 sm:top-4 ${mastheadOpen ? "" : "hidden"}`}
          id="access-nyc-masthead"
        >
          <Link
            aria-label="Access NYC home"
            className="flex items-center gap-3 py-3 pl-3.5 pr-12"
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
                Subway, PATH, AirTrain & regional rail accessibility atlas
              </span>
            </span>
          </Link>
          <button
            aria-controls="access-nyc-masthead"
            aria-expanded={mastheadOpen}
            aria-label="Collapse Access NYC header"
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/20 text-slate-300 transition hover:border-sky-400/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/35"
            onClick={() => setMastheadOpen(false)}
            title="Collapse Access NYC header"
            type="button"
          >
            <SiteIcon className="text-[20px]" name="close" />
          </button>
        </header>

        {!mastheadOpen ? (
          <button
            aria-controls="access-nyc-masthead"
            aria-expanded={mastheadOpen}
            aria-label="Expand Access NYC header"
            className={`${TOOL_CLASS} pointer-events-auto absolute left-3 top-3 sm:left-4 sm:top-4`}
            onClick={() => setMastheadOpen(true)}
            title="Expand Access NYC header"
            type="button"
          >
            <Image
              alt=""
              className="h-8 w-8 object-contain"
              height={32}
              src="/MTA.png"
              width={32}
            />
            <ToolTip label="Access NYC" />
          </button>
        ) : null}

        <nav
          aria-label="Map tools"
          className={`pointer-events-auto absolute left-3 flex flex-col gap-2 sm:left-4 ${mastheadOpen ? "top-[5.5rem] sm:top-[5.75rem]" : "top-[4.25rem] sm:top-[4.5rem]"}`}
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
                className="fixed bottom-3 left-[4.4rem] right-3 max-h-[calc(100svh-1.5rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#111820]/[0.97] shadow-[0_22px_70px_rgb(0_0_0_/_0.42)] backdrop-blur-xl sm:right-auto sm:w-[min(19rem,calc(100vw-5.5rem))]"
                id="atlas-map-filters"
              >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#111820] p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">
                      Filter map
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      {enabledMapFilterCount} of {totalMapFilterCount} map
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

                <div className="space-y-3 p-2">
                  <div aria-label="Transit systems" className="space-y-2" role="group">
                    <p className="px-2 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Transit systems
                    </p>
                    <TransitGroupControls
                      enabledRoutes={mapFilters.enabledTransitRoutes}
                      label="All transit routes"
                      onSetRoutes={setTransitRoutes}
                      routeKeys={ALL_TRANSIT_ROUTE_KEYS}
                    />
                    {TRANSIT_FILTER_SYSTEMS.map((system) => (
                      <TransitSystemFilter
                        enabledRoutes={mapFilters.enabledTransitRoutes}
                        key={system.id}
                        onSetRoutes={setTransitRoutes}
                        system={system}
                      />
                    ))}
                  </div>

                  <div
                    aria-label="Accessibility and equipment"
                    className="space-y-1 border-t border-white/10 pt-3"
                    role="group"
                  >
                    <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Accessibility & equipment
                    </p>
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
                </div>

                <div className="flex gap-2 border-t border-white/10 p-3">
                  <button
                    className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-white/30 hover:bg-white/10"
                    onClick={() => setMapFilters(SHOW_ALL_MAP_FILTERS)}
                    type="button"
                  >
                    Select all filters
                  </button>
                  <button
                    className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-white/30 hover:bg-white/10"
                    onClick={() =>
                      setMapFilters({
                        airTrainStations: false,
                        ctrailStations: false,
                        elevatorStations: false,
                        elevators: false,
                        escalators: false,
                        enabledTransitRoutes: [],
                        lirrStations: false,
                        metroNorthStations: false,
                        njTransitStations: false,
                        pathStations: false,
                        partialStations: false,
                        plannedAccessibleUpgrades: false,
                        plannedDesignStudy: false,
                        plannedFunded: false,
                        plannedNewStations: false,
                        plannedUnderConstruction: false,
                        rampStations: false,
                        repairs: false,
                      })
                    }
                    type="button"
                  >
                    Select none filters
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
            className={`pointer-events-auto absolute bottom-3 left-[4.4rem] right-3 overflow-y-auto rounded-2xl border border-white/10 bg-[#111820]/[0.97] shadow-[0_22px_70px_rgb(0_0_0_/_0.42)] backdrop-blur-xl sm:bottom-4 sm:left-[4.75rem] sm:right-auto sm:w-[min(24rem,calc(100%-5.75rem))] ${mastheadOpen ? "top-[5.5rem] sm:top-[5.75rem]" : "top-3 sm:top-4"}`}
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
                            <TransitRouteIcons
                              agency={record.station.agency}
                              className="mt-0"
                              regionalBadges={record.regionalBadges}
                              routes={record.station.services}
                            />
                          </div>
                          <p className="mt-1 truncate text-xs font-medium text-slate-400">
                            {record.locationLabel}
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

function TransitSystemFilter({
  enabledRoutes,
  onSetRoutes,
  system,
}: {
  enabledRoutes: string[];
  onSetRoutes: (routeKeys: string[], enabled: boolean) => void;
  system: TransitFilterSystem;
}) {
  const routeKeys = system.agencies.flatMap(getAgencyRouteKeys);

  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.025]" open>
      <summary className="cursor-pointer select-none px-3 py-2.5 text-xs font-black text-white marker:text-sky-400">
        {system.label}
        <span className="ml-2 font-mono text-[10px] text-slate-400">
          {countEnabled(routeKeys, enabledRoutes)}/{routeKeys.length}
        </span>
      </summary>
      <div className="space-y-2 border-t border-white/10 p-2">
        <TransitGroupControls
          enabledRoutes={enabledRoutes}
          label={system.label}
          onSetRoutes={onSetRoutes}
          routeKeys={routeKeys}
        />
        {system.agencies.map((agency) => (
          <TransitAgencyFilter
            agency={agency}
            enabledRoutes={enabledRoutes}
            key={agency.id}
            onSetRoutes={onSetRoutes}
          />
        ))}
      </div>
    </details>
  );
}

function TransitAgencyFilter({
  agency,
  enabledRoutes,
  onSetRoutes,
}: {
  agency: TransitFilterAgency;
  enabledRoutes: string[];
  onSetRoutes: (routeKeys: string[], enabled: boolean) => void;
}) {
  const routeKeys = getAgencyRouteKeys(agency);

  return (
    <details className="overflow-hidden rounded-lg border border-white/[0.08] bg-black/15">
      <summary className="cursor-pointer select-none px-3 py-2.5 marker:text-slate-500">
        <span className="inline-flex w-[calc(100%_-_0.75rem)] items-center justify-between gap-2 align-middle">
          <span className="inline-flex min-w-0 items-center">
            <span className="truncate text-xs font-black text-white">
              {agency.label}
            </span>
          </span>
          <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-300">
            {countEnabled(routeKeys, enabledRoutes)}/{routeKeys.length}
          </span>
        </span>
      </summary>
      <div className="space-y-2 border-t border-white/[0.07] p-2">
        <TransitGroupControls
          enabledRoutes={enabledRoutes}
          label={agency.label}
          onSetRoutes={onSetRoutes}
          routeKeys={routeKeys}
        />
        {agency.sections.map((section) => (
          <TransitSectionFilter
            enabledRoutes={enabledRoutes}
            key={section.id}
            onSetRoutes={onSetRoutes}
            section={section}
          />
        ))}
      </div>
    </details>
  );
}

function TransitSectionFilter({
  enabledRoutes,
  onSetRoutes,
  section,
}: {
  enabledRoutes: string[];
  onSetRoutes: (routeKeys: string[], enabled: boolean) => void;
  section: TransitFilterSection;
}) {
  const routeKeys = section.routes.map((route) => route.key);

  return (
    <div>
      <TransitGroupControls
        enabledRoutes={enabledRoutes}
        label={section.label}
        onSetRoutes={onSetRoutes}
        routeKeys={routeKeys}
      />
      <div className="mt-1 grid grid-cols-1 gap-1 pl-2">
        {section.routes.map((route) => (
          <MapFilterToggle
            active={enabledRoutes.includes(route.key)}
            color={route.color}
            compact
            detail={route.lineName}
            emphasizeColor
            imagePaths={route.imagePaths}
            key={route.key}
            label={route.label}
            onToggle={() =>
              onSetRoutes([route.key], !enabledRoutes.includes(route.key))
            }
          />
        ))}
      </div>
    </div>
  );
}

function TransitGroupControls({
  enabledRoutes,
  label,
  onSetRoutes,
  routeKeys,
}: {
  enabledRoutes: string[];
  label: string;
  onSetRoutes: (routeKeys: string[], enabled: boolean) => void;
  routeKeys: string[];
}) {
  const enabledCount = countEnabled(routeKeys, enabledRoutes);
  const allEnabled = enabledCount === routeKeys.length;
  const noneEnabled = enabledCount === 0;

  return (
    <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-400">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="mr-1 shrink-0 font-mono">
        {enabledCount}/{routeKeys.length}
      </span>
      <button
        aria-label={`Select all ${label}`}
        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-300 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white disabled:cursor-default disabled:opacity-40"
        disabled={allEnabled}
        onClick={() => onSetRoutes(routeKeys, true)}
        type="button"
      >
        All
      </button>
      <button
        aria-label={`Select none ${label}`}
        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-300 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white disabled:cursor-default disabled:opacity-40"
        disabled={noneEnabled}
        onClick={() => onSetRoutes(routeKeys, false)}
        type="button"
      >
        None
      </button>
    </div>
  );
}

function getAgencyRouteKeys(agency: TransitFilterAgency) {
  return agency.sections.flatMap((section) =>
    section.routes.map((route) => route.key),
  );
}

function countEnabled(routeKeys: string[], enabledRoutes: string[]) {
  const enabled = new Set(enabledRoutes);
  return routeKeys.filter((routeKey) => enabled.has(routeKey)).length;
}

function MapFilterToggle({
  active,
  color,
  compact = false,
  count,
  detail,
  emphasizeColor = false,
  imagePaths,
  label,
  onToggle,
}: {
  active: boolean;
  color: string;
  compact?: boolean;
  count?: number;
  detail?: string;
  emphasizeColor?: boolean;
  imagePaths?: string[];
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        compact
          ? `flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${emphasizeColor ? "border" : ""}`
          : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
        active
          ? "bg-white/[0.08] text-white"
          : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300",
      ].join(" ")}
      onClick={onToggle}
      style={
        emphasizeColor
          ? {
              backgroundColor: withHexAlpha(color, active ? "24" : "0D"),
              borderColor: withHexAlpha(color, active ? "CC" : "55"),
              boxShadow:
                imagePaths && imagePaths.length > 0
                  ? undefined
                  : `inset 3px 0 0 ${color}`,
            }
          : undefined
      }
      type="button"
    >
      {imagePaths && imagePaths.length > 0 ? (
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {imagePaths.map((imagePath) => (
            <Image
              alt=""
              className="h-6 w-6 object-contain"
              height={24}
              key={imagePath}
              src={imagePath}
              width={24}
            />
          ))}
        </span>
      ) : (
        <span
          className={
            emphasizeColor
              ? "h-6 w-2 shrink-0 rounded-full ring-1 ring-white/40"
              : "h-3 w-3 shrink-0 rounded-full ring-2 ring-white/80"
          }
          style={{
            backgroundColor: active || emphasizeColor ? color : "transparent",
            opacity: active ? 1 : emphasizeColor ? 0.55 : 1,
          }}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-black leading-4">{label}</span>
        {detail ? (
          <span
            className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.11em]"
            style={{ color }}
          >
            {detail}
          </span>
        ) : null}
      </span>
      {typeof count === "number" ? (
        <span className="font-mono text-[10px] text-slate-400">
          {count.toLocaleString()}
        </span>
      ) : null}
    </button>
  );
}

function withHexAlpha(color: string, alpha: string) {
  return /^#[0-9A-F]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

function normalizeStoredMapFilters(
  storedValue: unknown,
  fallback: AssetMapVisibilityFilters,
): AssetMapVisibilityFilters {
  if (!storedValue || typeof storedValue !== "object") return fallback;
  const stored = storedValue as Partial<AssetMapVisibilityFilters>;
  const validRouteKeys = new Set(ALL_TRANSIT_ROUTE_KEYS);
  const legacyRouteKeys = new Map([
    ["NJ Transit:3", "NJ Transit:2"],
    ["NJ Transit:12", "NJ Transit:11"],
  ]);
  const enabledTransitRoutes = Array.isArray(stored.enabledTransitRoutes)
    ? [
        ...new Set(
          stored.enabledTransitRoutes
            .filter((routeKey): routeKey is string => typeof routeKey === "string")
            .map((routeKey) => legacyRouteKeys.get(routeKey) || routeKey)
            .filter((routeKey) => validRouteKeys.has(routeKey)),
        ),
      ]
    : fallback.enabledTransitRoutes;
  const storedBoolean = (
    key: Exclude<keyof AssetMapVisibilityFilters, "enabledTransitRoutes">,
  ) =>
    typeof stored[key] === "boolean"
      ? (stored[key] as boolean)
      : fallback[key];

  return {
    airTrainStations: storedBoolean("airTrainStations"),
    ctrailStations: storedBoolean("ctrailStations"),
    elevatorStations: storedBoolean("elevatorStations"),
    elevators: storedBoolean("elevators"),
    escalators: storedBoolean("escalators"),
    enabledTransitRoutes,
    lirrStations: storedBoolean("lirrStations"),
    metroNorthStations: storedBoolean("metroNorthStations"),
    njTransitStations: storedBoolean("njTransitStations"),
    pathStations: storedBoolean("pathStations"),
    partialStations: storedBoolean("partialStations"),
    plannedAccessibleUpgrades: storedBoolean("plannedAccessibleUpgrades"),
    plannedDesignStudy: storedBoolean("plannedDesignStudy"),
    plannedFunded: storedBoolean("plannedFunded"),
    plannedNewStations: storedBoolean("plannedNewStations"),
    plannedUnderConstruction: storedBoolean("plannedUnderConstruction"),
    rampStations: storedBoolean("rampStations"),
    repairs: storedBoolean("repairs"),
  };
}

function normalizeStoredStatus(
  storedValue: unknown,
  fallback: StatusFilter,
): StatusFilter {
  return STATUS_FILTERS.some((filter) => filter.value === storedValue)
    ? (storedValue as StatusFilter)
    : fallback;
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
