"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { MtaAsset } from "@/lib/mta-assets";
import {
  formatStationLineDisplay,
  formatAssetCellValue,
  formatStationDescription,
  formatSubwayLine,
  getAssetCoordinates,
  getAssetMapStatus,
  getAssetRoutes,
  getSubwayRouteIconPath,
  type AssetMapStatus,
} from "@/lib/asset-display";
import { MAP_FOCUS_EVENT, type MapFocusDetail } from "@/lib/map-focus";
import plannedAdaStations from "../../data/planned-ada-station-coordinates.json";
import accessibleStations from "../../data/accessible-station-coordinates.json";

type MapMode = "combined" | "elevators" | "escalators";
type MapTheme = "light" | "dark";

type PlannedFeatureProperties = {
  color: string;
  key: string;
  line: string;
  note: string;
  routes: string;
  station: string;
  statusLabel: string;
  type: "Planned elevator";
};

type AccessibleStationFeatureProperties = {
  color: string;
  key: string;
  line: string;
  routes: string;
  station: string;
  statusLabel: string;
  type: "Accessible station";
};

type AssetFeatureProperties = {
  ada: string;
  code: string;
  color: string;
  line: string;
  routes: string;
  status: AssetMapStatus;
  statusLabel: string;
  station: string;
  type: string;
};
type AssetFeature = GeoJSON.Feature<GeoJSON.Point, AssetFeatureProperties>;
type PlannedFeature = GeoJSON.Feature<GeoJSON.Point, PlannedFeatureProperties>;
type AccessibleStationFeature = GeoJSON.Feature<
  GeoJSON.Point,
  AccessibleStationFeatureProperties
>;
type MappableFeature = AssetFeature | PlannedFeature | AccessibleStationFeature;

const MAP_MODE_STORAGE_KEY = "mta-access-assets-map-mode";
const MAP_THEME_STORAGE_KEY = "mta-access-assets-map-theme";
const STATUS_COLORS: Record<AssetMapStatus, string> = {
  accessible: "#16a34a",
  not_accessible: "#dc2626",
  work: "#eab308",
};
const PLANNED_ELEVATOR_COLOR = "#ec4899";
const ACCESSIBLE_STATION_COLOR = "#22c55e";
const STATUS_LABELS: Record<AssetMapStatus, string> = {
  accessible: "♿ ADA accessible",
  not_accessible: "♿ Not ADA accessible",
  work: "Under construction or repair",
};
const MAP_OPTIONS: Array<{ label: string; value: MapMode }> = [
  { label: "Combined", value: "combined" },
  { label: "Elevators", value: "elevators" },
  { label: "Escalators", value: "escalators" },
];

export function AssetMap({ assets }: { assets: MtaAsset[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [mode, setMode] = useState<MapMode>(() => readStoredMapMode());
  const [mapTheme, setMapTheme] = useState<MapTheme>(() => readStoredMapTheme());
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    window.localStorage.setItem(MAP_MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, mapTheme);
  }, [mapTheme]);

  const allFeatures = useMemo(() => {
    return assets
      .map((asset): AssetFeature | null => {
        const coordinates = getAssetCoordinates(asset);

        if (!coordinates) {
          return null;
        }

        const status = getAssetMapStatus(asset);

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [coordinates.longitude, coordinates.latitude],
          },
          properties: {
            ada: asset.ada_compliant || "-",
            code: asset.equipment_code,
            color: STATUS_COLORS[status],
            line: formatAssetCellValue(asset, "subway_line") || formatSubwayLine(asset.subway_line),
            routes: getAssetRoutes(asset).join(","),
            status,
            statusLabel: STATUS_LABELS[status],
            station: formatStationDescription(
              asset.station_description,
              asset.station_name,
            ),
            type: asset.elevator_or_escalator || "-",
          },
        };
      })
      .filter((feature): feature is AssetFeature => Boolean(feature));
  }, [assets]);

  const features = useMemo(() => {
    const allowedType =
      mode === "elevators"
        ? "Elevator"
        : mode === "escalators"
          ? "Escalator"
          : null;

    return allFeatures.filter((feature) =>
      allowedType ? feature.properties.type === allowedType : true,
    );
  }, [allFeatures, mode]);
  const allPlannedFeatures = useMemo(() => {
    return plannedAdaStations.stations.map((station): PlannedFeature => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [station.longitude, station.latitude],
      },
      properties: {
        color: PLANNED_ELEVATOR_COLOR,
        key: getPlannedFeatureKey(
          formatPlannedStationName(station.station),
          formatStationLineDisplay(station.line),
          station.services.join(","),
        ),
        line: formatStationLineDisplay(station.line),
        note: station.plannedAdaNote,
        routes: station.services.join(","),
        station: formatPlannedStationName(station.station),
        statusLabel: "Planned ADA elevator",
        type: "Planned elevator",
      },
    }));
  }, []);

  const plannedFeatures = useMemo(() => {
    if (mode === "escalators") {
      return [];
    }

    return allPlannedFeatures;
  }, [allPlannedFeatures, mode]);
  const allAccessibleStationFeatures = useMemo(() => {
    return accessibleStations.stations.map((station): AccessibleStationFeature => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [station.longitude, station.latitude],
      },
      properties: {
        color: ACCESSIBLE_STATION_COLOR,
        key: getPlannedFeatureKey(
          formatPlannedStationName(station.station),
          formatStationLineDisplay(station.line),
          station.services.join(","),
        ),
        line: formatStationLineDisplay(station.line),
        routes: station.services.join(","),
        station: formatPlannedStationName(station.station),
        statusLabel: station.statusLabel,
        type: "Accessible station",
      },
    }));
  }, []);
  const accessibleStationFeatures = useMemo(() => {
    if (mode !== "combined") {
      return [];
    }

    return allAccessibleStationFeatures;
  }, [allAccessibleStationFeatures, mode]);

  const collection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [...features],
    }),
    [features],
  );
  const plannedCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [...plannedFeatures],
    }),
    [plannedFeatures],
  );
  const accessibleStationCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [...accessibleStationFeatures],
    }),
    [accessibleStationFeatures],
  );
  const collectionRef = useRef(collection);
  const plannedCollectionRef = useRef(plannedCollection);
  const accessibleStationCollectionRef = useRef(accessibleStationCollection);
  const allFeaturesRef = useRef(allFeatures);
  const allPlannedFeaturesRef = useRef(allPlannedFeatures);
  const allAccessibleStationFeaturesRef = useRef(allAccessibleStationFeatures);
  const featuresRef = useRef(features);
  const plannedFeaturesRef = useRef(plannedFeatures);
  const accessibleStationFeaturesRef = useRef(accessibleStationFeatures);

  useEffect(() => {
    collectionRef.current = collection;
    plannedCollectionRef.current = plannedCollection;
    accessibleStationCollectionRef.current = accessibleStationCollection;
    allFeaturesRef.current = allFeatures;
    allPlannedFeaturesRef.current = allPlannedFeatures;
    allAccessibleStationFeaturesRef.current = allAccessibleStationFeatures;
    featuresRef.current = features;
    plannedFeaturesRef.current = plannedFeatures;
    accessibleStationFeaturesRef.current = accessibleStationFeatures;
  }, [
    accessibleStationCollection,
    accessibleStationFeatures,
    allAccessibleStationFeatures,
    allFeatures,
    allPlannedFeatures,
    collection,
    features,
    plannedCollection,
    plannedFeatures,
  ]);

  const counts = useMemo(() => {
    return features.reduce(
      (total, feature) => {
        total[feature.properties.status] += 1;
        return total;
      },
      { accessible: 0, not_accessible: 0, work: 0 } satisfies Record<
        AssetMapStatus,
        number
      >,
    );
  }, [features]);

  useEffect(() => {
    if (!containerRef.current || !token || mapRef.current) {
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      center: [-73.95, 40.73],
      container: containerRef.current,
      style:
        mapTheme === "dark"
          ? "mapbox://styles/mapbox/dark-v11"
          : "mapbox://styles/mapbox/light-v11",
      zoom: 10,
    });

    mapRef.current = map;
    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "asset-popup",
      offset: 12,
    });

    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("assets", {
        type: "geojson",
        data: collectionRef.current,
      });
      map.addSource("planned-elevators", {
        type: "geojson",
        data: plannedCollectionRef.current,
      });
      map.addSource("accessible-stations", {
        type: "geojson",
        data: accessibleStationCollectionRef.current,
      });

      map.addLayer({
        id: "asset-points",
        type: "circle",
        source: "assets",
        paint: {
          "circle-color": ["get", "color"],
          "circle-opacity": 0.88,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            4,
            13,
            7,
            16,
            11,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.8,
        },
      });
      map.addLayer({
        id: "planned-elevator-points",
        type: "circle",
        source: "planned-elevators",
        paint: {
          "circle-color": ["get", "color"],
          "circle-opacity": 0.9,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            5,
            13,
            8,
            16,
            12,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.2,
        },
      });
      map.addLayer({
        id: "accessible-station-points",
        type: "circle",
        source: "accessible-stations",
        paint: {
          "circle-color": ["get", "color"],
          "circle-opacity": 0.84,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            4,
            13,
            7,
            16,
            11,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      map.on("mouseenter", "asset-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseenter", "planned-elevator-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseenter", "accessible-station-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "asset-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseleave", "planned-elevator-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseleave", "accessible-station-points", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "asset-points", (event) => {
        const feature = event.features?.[0];
        const coordinates = feature?.geometry.type === "Point"
          ? feature.geometry.coordinates
          : null;
        const properties = feature?.properties as
          | AssetFeatureProperties
          | undefined;

        if (!coordinates || !properties) {
          return;
        }

        showAssetPopup(map, popupRef.current, coordinates as [number, number], properties);
      });
      map.on("click", "planned-elevator-points", (event) => {
        const feature = event.features?.[0];
        const coordinates = feature?.geometry.type === "Point"
          ? feature.geometry.coordinates
          : null;
        const properties = feature?.properties as
          | PlannedFeatureProperties
          | undefined;

        if (!coordinates || !properties) {
          return;
        }

        showPlannedPopup(map, popupRef.current, coordinates as [number, number], properties);
      });
      map.on("click", "accessible-station-points", (event) => {
        const feature = event.features?.[0];
        const coordinates = feature?.geometry.type === "Point"
          ? feature.geometry.coordinates
          : null;
        const properties = feature?.properties as
          | AccessibleStationFeatureProperties
          | undefined;

        if (!coordinates || !properties) {
          return;
        }

        showAccessibleStationPopup(
          map,
          popupRef.current,
          coordinates as [number, number],
          properties,
        );
      });

      fitMapToFeatures(map, [
        ...featuresRef.current,
        ...plannedFeaturesRef.current,
        ...accessibleStationFeaturesRef.current,
      ]);
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, [mapTheme, token]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const source = map.getSource("assets") as GeoJSONSource | undefined;
    const plannedSource = map.getSource("planned-elevators") as
      | GeoJSONSource
      | undefined;
    const accessibleStationSource = map.getSource("accessible-stations") as
      | GeoJSONSource
      | undefined;
    source?.setData(collection);
    plannedSource?.setData(plannedCollection);
    accessibleStationSource?.setData(accessibleStationCollection);
    fitMapToFeatures(map, [
      ...features,
      ...plannedFeatures,
      ...accessibleStationFeatures,
    ]);
  }, [
    accessibleStationCollection,
    accessibleStationFeatures,
    collection,
    features,
    plannedCollection,
    plannedFeatures,
  ]);

  useEffect(() => {
    function handleMapFocus(event: Event) {
      const detail = (event as CustomEvent<MapFocusDetail>).detail;
      const map = mapRef.current;

      if (!map || !popupRef.current || !detail) {
        return;
      }

      document.getElementById("asset-map-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      if (detail.kind === "asset") {
        const feature = allFeaturesRef.current.find(
          (item) => item.properties.code === detail.code,
        );

        if (!feature) {
          return;
        }

        setMode("combined");
        focusMapFeature(map, feature);
        showAssetPopup(
          map,
          popupRef.current,
          feature.geometry.coordinates as [number, number],
          feature.properties,
        );
        return;
      }

      const plannedFeature = allPlannedFeaturesRef.current.find(
        (item) => item.properties.key === detail.key,
      );

      if (plannedFeature) {
        setMode("combined");
        focusMapFeature(map, plannedFeature);
        showPlannedPopup(
          map,
          popupRef.current,
          plannedFeature.geometry.coordinates as [number, number],
          plannedFeature.properties,
        );
        return;
      }

      const accessibleStationFeature = allAccessibleStationFeaturesRef.current.find(
        (item) => item.properties.key === detail.key,
      );

      if (!accessibleStationFeature) {
        return;
      }

      setMode("combined");
      focusMapFeature(map, accessibleStationFeature);
      showAccessibleStationPopup(
        map,
        popupRef.current,
        accessibleStationFeature.geometry.coordinates as [number, number],
        accessibleStationFeature.properties,
      );
    }

    window.addEventListener(MAP_FOCUS_EVENT, handleMapFocus);

    return () => {
      window.removeEventListener(MAP_FOCUS_EVENT, handleMapFocus);
    };
  }, []);

  return (
    <section className="mt-10 scroll-mt-6" id="asset-map-section">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Asset map
          </h2>
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            <MapLegend color={STATUS_COLORS.accessible} label="♿ ADA accessible" value={counts.accessible} />
            <MapLegend color={STATUS_COLORS.not_accessible} label="♿ Not ADA accessible" value={counts.not_accessible} />
            <MapLegend color={STATUS_COLORS.work} label="Work/repair" value={counts.work} />
            <MapLegend
              color={PLANNED_ELEVATOR_COLOR}
              label="Planned elevators"
              value={plannedFeatures.length}
            />
            <MapLegend
              color={ACCESSIBLE_STATION_COLOR}
              label="Accessible stations"
              value={accessibleStationFeatures.length}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex w-fit rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
            {MAP_OPTIONS.map((option) => (
              <button
                className={[
                  "rounded-md px-3 py-1.5 text-sm font-semibold transition",
                  mode === option.value
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                ].join(" ")}
                key={option.value}
                onClick={() => setMode(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="inline-flex w-fit rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
            {(["light", "dark"] as const).map((theme) => (
              <button
                aria-label={`Use ${theme} map`}
                className={[
                  "inline-flex h-8 w-9 items-center justify-center rounded-md text-sm font-semibold transition",
                  mapTheme === theme
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                ].join(" ")}
                key={theme}
                onClick={() => setMapTheme(theme)}
                title={`${theme[0].toUpperCase()}${theme.slice(1)} map`}
                type="button"
              >
                <MapThemeIcon theme={theme} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {token ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10">
          <div className="h-[520px] w-full" ref={containerRef} />
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Add NEXT_PUBLIC_MAPBOX_TOKEN to enable the asset map.
        </div>
      )}
    </section>
  );
}

function MapThemeIcon({ theme }: { theme: "dark" | "light" }) {
  const path =
    theme === "dark"
      ? "M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Z"
      : "M480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650 155-751l57-57 101 101-57 57Zm492 498L647-253l57-57 101 101-57 57Zm-98-552 101-101 57 57-101 101-57-57ZM154-209l101-101 57 57-101 101-57-57Z";

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
      viewBox="0 -960 960 960"
    >
      <path d={path} />
    </svg>
  );
}

function MapLegend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-950"
        style={{ backgroundColor: color }}
      />
      {label}: {value.toLocaleString()}
    </span>
  );
}

function fitMapToFeatures(map: mapboxgl.Map, features: MappableFeature[]) {
  if (features.length === 0) {
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();

  for (const feature of features) {
    bounds.extend(feature.geometry.coordinates as [number, number]);
  }

  map.fitBounds(bounds, {
    duration: 500,
    maxZoom: 13,
    padding: 54,
  });
}

function focusMapFeature(map: mapboxgl.Map, feature: MappableFeature) {
  map.flyTo({
    center: feature.geometry.coordinates as [number, number],
    duration: 650,
    essential: true,
    zoom: 15.5,
  });
}

function showAssetPopup(
  map: mapboxgl.Map,
  popup: mapboxgl.Popup | null,
  coordinates: [number, number],
  properties: AssetFeatureProperties,
) {
  showPopup(map, popup, coordinates, getPopupHtml(properties));
}

function showPlannedPopup(
  map: mapboxgl.Map,
  popup: mapboxgl.Popup | null,
  coordinates: [number, number],
  properties: PlannedFeatureProperties,
) {
  showPopup(map, popup, coordinates, getPlannedPopupHtml(properties));
}

function showAccessibleStationPopup(
  map: mapboxgl.Map,
  popup: mapboxgl.Popup | null,
  coordinates: [number, number],
  properties: AccessibleStationFeatureProperties,
) {
  showPopup(map, popup, coordinates, getAccessibleStationPopupHtml(properties));
}

function showPopup(
  map: mapboxgl.Map,
  popup: mapboxgl.Popup | null,
  coordinates: [number, number],
  html: string,
) {
  popup?.setLngLat(coordinates).setHTML(html).addTo(map);
  popup
    ?.getElement()
    ?.querySelector("[data-popup-close]")
    ?.addEventListener("click", () => popup.remove(), { once: true });
}

function getPopupHtml(properties: AssetFeatureProperties) {
  const routeBadges = properties.routes
    .split(",")
    .filter(Boolean)
    .map(routeBadgeHtml)
    .join("");

  return `
    <div class="space-y-1 pr-6">
      ${popupCloseButtonHtml()}
      <div class="font-semibold text-zinc-900">${escapeHtml(properties.station)}</div>
      ${routeBadges ? `<div class="mt-1 flex flex-wrap gap-1">${routeBadges}</div>` : ""}
      <div class="text-xs text-zinc-500">${escapeHtml(properties.line)}</div>
      <div class="mt-2 text-xs text-zinc-700">
        ${escapeHtml(properties.type)} ${escapeHtml(properties.code)}
      </div>
      <div class="text-xs font-semibold" style="color:${escapeHtml(properties.color)}">
        ${escapeHtml(properties.statusLabel)}
      </div>
    </div>
  `;
}

function getPlannedPopupHtml(properties: PlannedFeatureProperties) {
  const routeBadges = properties.routes
    .split(",")
    .filter(Boolean)
    .map(routeBadgeHtml)
    .join("");

  return `
    <div class="space-y-1 pr-6">
      ${popupCloseButtonHtml()}
      <div class="font-semibold text-zinc-900">${escapeHtml(properties.station)}</div>
      ${routeBadges ? `<div class="mt-1 flex flex-wrap gap-1">${routeBadges}</div>` : ""}
      <div class="text-xs text-zinc-500">${escapeHtml(properties.line)}</div>
      <div class="text-xs font-semibold" style="color:${escapeHtml(properties.color)}">
        ${escapeHtml(properties.statusLabel)}
      </div>
    </div>
  `;
}

function getAccessibleStationPopupHtml(
  properties: AccessibleStationFeatureProperties,
) {
  const routeBadges = properties.routes
    .split(",")
    .filter(Boolean)
    .map(routeBadgeHtml)
    .join("");

  return `
    <div class="space-y-1 pr-6">
      ${popupCloseButtonHtml()}
      <div class="font-semibold text-zinc-900">${escapeHtml(properties.station)}</div>
      ${routeBadges ? `<div class="mt-1 flex flex-wrap gap-1">${routeBadges}</div>` : ""}
      <div class="text-xs text-zinc-500">${escapeHtml(properties.line)}</div>
      <div class="text-xs font-semibold" style="color:${escapeHtml(properties.color)}">
        ${escapeHtml(properties.statusLabel)}
      </div>
    </div>
  `;
}

function popupCloseButtonHtml() {
  return `
    <button
      aria-label="Close popup"
      class="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
      data-popup-close
      type="button"
    >
      <svg
        aria-hidden="true"
        class="h-[18px] w-[18px]"
        fill="currentColor"
        viewBox="0 -960 960 960"
      >
        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
      </svg>
    </button>
  `;
}

function getPlannedFeatureKey(station: string, line: string, routes: string) {
  return [station, line, routes].join("|");
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

function readStoredMapMode(): MapMode {
  if (typeof window === "undefined") {
    return "combined";
  }

  const storedMode = window.localStorage.getItem(MAP_MODE_STORAGE_KEY);

  return storedMode === "elevators" ||
    storedMode === "escalators" ||
    storedMode === "combined"
    ? storedMode
    : "combined";
}

function readStoredMapTheme(): MapTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(MAP_THEME_STORAGE_KEY);

  return storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : "light";
}

function routeBadgeHtml(route: string) {
  return `
    <img
      alt="${escapeHtml(route)} train"
      height="20"
      src="${escapeHtml(getSubwayRouteIconPath(route))}"
      style="display:inline-block;height:20px;width:20px"
      title="${escapeHtml(route)} train"
      width="20"
    />
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
