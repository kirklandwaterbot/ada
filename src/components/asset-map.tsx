"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Moon, Sun, X } from "lucide-react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  formatStationLineDisplay,
  getSubwayRouteIconPath,
  type AssetMapStatus,
} from "@/lib/asset-display";
import { MAP_FOCUS_EVENT, type MapFocusDetail } from "@/lib/map-focus";
import { normalizeSearchText } from "@/lib/search-normalization";
import type { AssetMapMarker } from "@/lib/station-explorer-data";
import plannedAdaStations from "../../data/planned-ada-station-coordinates.json";
import accessibleStations from "../../data/accessible-station-coordinates.json";

type MapMode = "combined" | "elevators" | "escalators";
type MapTheme = "light" | "dark";
type MapLayerKey = AssetMapStatus | "planned" | "stations";
type AssetMapLayout = "full" | "split";

export type AssetMapFocusRequest = {
  detail: MapFocusDetail;
  id: number;
};

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
const MAP_RESULT_PAGE_SIZE = 40;
const STATUS_COLORS: Record<AssetMapStatus, string> = {
  accessible: "#16a34a",
  equipment: "#3b82f6",
  not_accessible: "#dc2626",
  work: "#eab308",
};
const PLANNED_ELEVATOR_COLOR = "#ec4899";
const ACCESSIBLE_STATION_COLOR = "#22c55e";
const PARTIAL_ACCESSIBLE_STATION_COLOR = "#f59e0b";
const STATUS_LABELS: Record<AssetMapStatus, string> = {
  accessible: "♿ ADA accessible",
  equipment: "Escalator equipment",
  not_accessible: "♿ Not ADA accessible",
  work: "Under construction or repair",
};
const MAP_OPTIONS: Array<{ label: string; value: MapMode }> = [
  { label: "Combined", value: "combined" },
  { label: "Elevators", value: "elevators" },
  { label: "Escalators", value: "escalators" },
];
const popupIconRoots = new WeakMap<mapboxgl.Popup, Root>();

export function AssetMap({
  assets,
  embedded = false,
  focusRequest = null,
  layout = "full",
}: {
  assets: AssetMapMarker[];
  embedded?: boolean;
  focusRequest?: AssetMapFocusRequest | null;
  layout?: AssetMapLayout;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [mode, setMode] = useState<MapMode>(() => readStoredMapMode());
  const [mapTheme, setMapTheme] = useState<MapTheme>(() => readStoredMapTheme());
  const [layers, setLayers] = useState<Record<MapLayerKey, boolean>>({
    accessible: true,
    equipment: true,
    not_accessible: true,
    planned: true,
    stations: true,
    work: true,
  });
  const [mapResultLimit, setMapResultLimit] = useState(MAP_RESULT_PAGE_SIZE);
  const [mapResultAnnouncement, setMapResultAnnouncement] = useState("");
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    window.localStorage.setItem(MAP_MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(MAP_THEME_STORAGE_KEY, mapTheme);
  }, [mapTheme]);

  const allFeatures = useMemo(() => {
    return assets.map(
      (asset): AssetFeature => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [asset.longitude, asset.latitude],
        },
        properties: {
          ada: asset.ada,
          code: asset.code,
          color: STATUS_COLORS[asset.status],
          line: asset.line,
          routes: asset.routes,
          status: asset.status,
          statusLabel: STATUS_LABELS[asset.status],
          station: asset.station,
          type: asset.type,
        },
      }),
    );
  }, [assets]);

  const modeFeatures = useMemo(() => {
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
  const features = useMemo(
    () => modeFeatures.filter((feature) => layers[feature.properties.status]),
    [layers, modeFeatures],
  );
  const allPlannedFeatures = useMemo(() => {
    const liveAssetStationRoutes = new Set(
      allFeatures
        .filter(
          (feature) =>
            feature.properties.status === "accessible" ||
            feature.properties.status === "not_accessible",
        )
        .flatMap((feature) =>
          feature.properties.routes
            .split(",")
            .filter(Boolean)
            .map(
              (route) =>
                normalizeSearchText(feature.properties.station) +
                "|" +
                normalizeMapRoute(route),
            ),
        ),
    );

    return plannedAdaStations.stations
      .filter((station) => {
        const stationKey = normalizeSearchText(
          formatPlannedStationName(station.station),
        );

        return !station.services.some((route) =>
          liveAssetStationRoutes.has(stationKey + "|" + normalizeMapRoute(route)),
        );
      })
      .map((station): PlannedFeature => ({
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
  }, [allFeatures]);

  const plannedFeatures = useMemo(() => {
    if (mode === "escalators" || !layers.planned) {
      return [];
    }

    return allPlannedFeatures;
  }, [allPlannedFeatures, layers.planned, mode]);
  const allAccessibleStationFeatures = useMemo(() => {
    return accessibleStations.stations.map((station): AccessibleStationFeature => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [station.longitude, station.latitude],
      },
      properties: {
        color: station.statusLabel.startsWith("Partially accessible")
          ? PARTIAL_ACCESSIBLE_STATION_COLOR
          : ACCESSIBLE_STATION_COLOR,
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
    if (mode !== "combined" || !layers.stations) {
      return [];
    }

    return allAccessibleStationFeatures;
  }, [allAccessibleStationFeatures, layers.stations, mode]);

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
  const mapResultFeatures = useMemo(
    () => [
      ...features,
      ...plannedFeatures,
      ...accessibleStationFeatures,
    ],
    [accessibleStationFeatures, features, plannedFeatures],
  );
  const visibleMapResults = mapResultFeatures.slice(0, mapResultLimit);
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
    return modeFeatures.reduce(
      (total, feature) => {
        total[feature.properties.status] += 1;
        return total;
      },
      { accessible: 0, equipment: 0, not_accessible: 0, work: 0 } satisfies Record<
        AssetMapStatus,
        number
      >,
    );
  }, [modeFeatures]);

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

      map.on("mouseenter", "asset-points", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        const coordinates =
          feature?.geometry.type === "Point" ? feature.geometry.coordinates : null;
        const properties = feature?.properties as
          | AssetFeatureProperties
          | undefined;

        if (coordinates && properties) {
          showAssetPopup(
            map,
            popupRef.current,
            coordinates as [number, number],
            properties,
          );
        }
      });
      map.on("mouseenter", "planned-elevator-points", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        const coordinates =
          feature?.geometry.type === "Point" ? feature.geometry.coordinates : null;
        const properties = feature?.properties as
          | PlannedFeatureProperties
          | undefined;

        if (coordinates && properties) {
          showPlannedPopup(
            map,
            popupRef.current,
            coordinates as [number, number],
            properties,
          );
        }
      });
      map.on("mouseenter", "accessible-station-points", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        const coordinates =
          feature?.geometry.type === "Point" ? feature.geometry.coordinates : null;
        const properties = feature?.properties as
          | AccessibleStationFeatureProperties
          | undefined;

        if (coordinates && properties) {
          showAccessibleStationPopup(
            map,
            popupRef.current,
            coordinates as [number, number],
            properties,
          );
        }
      });

      map.on("mouseleave", "asset-points", () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
      });
      map.on("mouseleave", "planned-elevator-points", () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
      });
      map.on("mouseleave", "accessible-station-points", () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
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
    const animationFrame = window.requestAnimationFrame(() => {
      mapRef.current?.resize();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [layout]);

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
        setLayers((current) => ({
          ...current,
          [feature.properties.status]: true,
        }));
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
        setLayers((current) => ({ ...current, planned: true }));
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
      setLayers((current) => ({ ...current, stations: true }));
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

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !focusRequest) {
      return;
    }

    let animationFrame: number | null = null;
    const dispatchFocusRequest = () => {
      animationFrame = window.requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent<MapFocusDetail>(MAP_FOCUS_EVENT, {
            detail: focusRequest.detail,
          }),
        );
      });
    };

    if (map.isStyleLoaded()) {
      dispatchFocusRequest();
    } else {
      map.once("load", dispatchFocusRequest);
    }

    return () => {
      map.off("load", dispatchFocusRequest);

      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [focusRequest]);

  function focusMapResult(feature: MappableFeature) {
    const map = mapRef.current;
    const popup = popupRef.current;

    if (!map || !popup) {
      return;
    }

    focusMapFeature(map, feature);

    if ("code" in feature.properties) {
      showAssetPopup(
        map,
        popup,
        feature.geometry.coordinates as [number, number],
        feature.properties,
      );
    } else if (feature.properties.type === "Planned elevator") {
      showPlannedPopup(
        map,
        popup,
        feature.geometry.coordinates as [number, number],
        feature.properties,
      );
    } else {
      showAccessibleStationPopup(
        map,
        popup,
        feature.geometry.coordinates as [number, number],
        feature.properties,
      );
    }

    setMapResultAnnouncement(
      `${feature.properties.station}: ${feature.properties.statusLabel} selected on the map.`,
    );
  }

  return (
    <section
      className={[
        "scroll-mt-6",
        embedded ? "surface-card overflow-hidden" : "mt-10",
      ].join(" ")}
      id="asset-map-section"
    >
      <div
        className={[
          "flex flex-col gap-4",
          embedded
            ? "border-b border-[var(--border)] p-4 sm:p-5"
            : "mb-4",
        ].join(" ")}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-600)]">
              Interactive map
            </p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--ink)]">
              {embedded ? "System accessibility map" : "Asset map"}
            </h2>
            <p className="mt-1 text-xs font-medium text-[var(--muted)]">
              Daily inventory markers are not a real-time outage feed. Use the
              accessible results list below or select a marker for details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex w-fit rounded-xl bg-[var(--soft)] p-1">
              {MAP_OPTIONS.map((option) => (
                <button
                  aria-pressed={mode === option.value}
                  className={[
                    "rounded-lg px-3 py-2 text-xs font-bold transition",
                    mode === option.value
                      ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--ink)]",
                  ].join(" ")}
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="inline-flex w-fit rounded-xl bg-[var(--soft)] p-1">
              {(["light", "dark"] as const).map((theme) => (
                <button
                  aria-label={"Use " + theme + " map"}
                  aria-pressed={mapTheme === theme}
                  className={[
                    "inline-flex h-9 w-10 items-center justify-center rounded-lg transition",
                    mapTheme === theme
                      ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                      : "text-[var(--muted)] hover:text-[var(--ink)]",
                  ].join(" ")}
                  key={theme}
                  onClick={() => setMapTheme(theme)}
                  title={theme[0].toUpperCase() + theme.slice(1) + " map"}
                  type="button"
                >
                  <MapThemeIcon theme={theme} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Map layers">
          <MapLayerToggle
            active={layers.accessible}
            color={STATUS_COLORS.accessible}
            label="ADA assets"
            onToggle={() =>
              setLayers((current) => ({ ...current, accessible: !current.accessible }))
            }
            value={counts.accessible}
          />
          <MapLayerToggle
            active={layers.not_accessible}
            color={STATUS_COLORS.not_accessible}
            label="Non-ADA assets"
            onToggle={() =>
              setLayers((current) => ({
                ...current,
                not_accessible: !current.not_accessible,
              }))
            }
            value={counts.not_accessible}
          />
          <MapLayerToggle
            active={layers.equipment}
            color={STATUS_COLORS.equipment}
            label="Escalator assets"
            onToggle={() =>
              setLayers((current) => ({ ...current, equipment: !current.equipment }))
            }
            value={counts.equipment}
          />
          <MapLayerToggle
            active={layers.work}
            color={STATUS_COLORS.work}
            label="Work / repair"
            onToggle={() =>
              setLayers((current) => ({ ...current, work: !current.work }))
            }
            value={counts.work}
          />
          <MapLayerToggle
            active={layers.planned}
            color={PLANNED_ELEVATOR_COLOR}
            label="Planned"
            onToggle={() =>
              setLayers((current) => ({ ...current, planned: !current.planned }))
            }
            value={allPlannedFeatures.length}
          />
          <MapLayerToggle
            active={layers.stations}
            color={ACCESSIBLE_STATION_COLOR}
            label="Station access markers"
            onToggle={() =>
              setLayers((current) => ({ ...current, stations: !current.stations }))
            }
            value={allAccessibleStationFeatures.length}
          />
        </div>
      </div>

      {token ? (
        <div
          className={[
            "overflow-hidden bg-[var(--panel)]",
            embedded
              ? ""
              : "rounded-2xl border border-[var(--border)] shadow-[0_16px_40px_rgb(15_35_64_/_0.06)]",
          ].join(" ")}
        >
          <div
            aria-describedby="map-results-description"
            aria-label="Interactive subway accessibility map"
            className={
              embedded
                ? layout === "full"
                  ? "h-[620px] w-full xl:h-[calc(100vh-19rem)] xl:min-h-[580px] xl:max-h-[900px]"
                  : "h-[580px] w-full xl:h-[calc(100vh-22rem)] xl:min-h-[520px] xl:max-h-[760px]"
                : "h-[560px] w-full"
            }
            ref={containerRef}
            role="region"
          />
        </div>
      ) : (
        <div className={embedded ? "p-5" : ""}>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to enable the interactive system map.
          </div>
        </div>
      )}

      <div className="border-t border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
        <details>
          <summary className="cursor-pointer text-sm font-extrabold text-[var(--ink)] marker:text-[var(--accent-600)]">
            Browse {mapResultFeatures.length.toLocaleString()} enabled map markers
          </summary>
          <p
            className="mt-2 text-xs leading-5 text-[var(--muted-strong)]"
            id="map-results-description"
          >
            This keyboard-accessible list mirrors the current equipment mode and
            enabled map layers. Statuses come from the daily inventory snapshot.
          </p>
          <p aria-atomic="true" aria-live="polite" className="sr-only">
            {mapResultFeatures.length.toLocaleString()} map markers match the current
            controls. {mapResultAnnouncement}
          </p>

          {visibleMapResults.length > 0 ? (
            <ul className="mt-3 max-h-80 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
              {visibleMapResults.map((feature) => (
                <li key={getMapResultKey(feature)}>
                  <button
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--soft-blue)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!token}
                    onClick={() => focusMapResult(feature)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[var(--ink)]">
                        {feature.properties.station}
                      </span>
                      <span className="block truncate text-xs text-[var(--muted-strong)]">
                        {feature.properties.line}
                        {feature.properties.routes
                          ? ` · Routes ${feature.properties.routes.replaceAll(",", ", ")}`
                          : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] font-bold text-[var(--muted-strong)]">
                      {feature.properties.statusLabel}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl bg-[var(--soft)] p-4 text-sm font-semibold text-[var(--muted-strong)]">
              No markers match the enabled layers.
            </p>
          )}

          {visibleMapResults.length < mapResultFeatures.length ? (
            <button
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] px-4 text-sm font-bold text-[var(--accent-700)] shadow-sm transition hover:bg-[var(--soft)]"
              onClick={() =>
                setMapResultLimit((limit) => limit + MAP_RESULT_PAGE_SIZE)
              }
              type="button"
            >
              Show more map results
            </button>
          ) : null}
        </details>
      </div>
    </section>
  );
}

function MapThemeIcon({ theme }: { theme: "dark" | "light" }) {
  const Icon = theme === "dark" ? Moon : Sun;

  return <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />;
}

function MapLayerToggle({
  active,
  color,
  label,
  onToggle,
  value,
}: {
  active: boolean;
  color: string;
  label: string;
  onToggle: () => void;
  value: number;
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition",
        active
          ? "border-[var(--border-strong)] bg-[var(--panel)] text-[var(--ink)] shadow-sm"
          : "border-transparent bg-[var(--soft)] text-[var(--muted)] opacity-60",
      ].join(" ")}
      onClick={onToggle}
      type="button"
    >
      <span
        className="h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900"
        style={{ backgroundColor: color }}
      />
      {label}
      <span className="font-mono text-[10px] text-[var(--muted)]">
        {value.toLocaleString()}
      </span>
    </button>
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
    essential: false,
    zoom: 15.5,
  });
}

function getMapResultKey(feature: MappableFeature) {
  return "code" in feature.properties
    ? `asset-${feature.properties.code}`
    : `${feature.properties.type}-${feature.properties.key}`;
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
  if (!popup) {
    return;
  }

  popupIconRoots.get(popup)?.unmount();
  popupIconRoots.delete(popup);
  popup.setLngLat(coordinates).setHTML(html).addTo(map);

  const closeButton = popup
    .getElement()
    ?.querySelector<HTMLButtonElement>("[data-popup-close]");

  if (!closeButton) {
    return;
  }

  const iconRoot = createRoot(closeButton);
  popupIconRoots.set(popup, iconRoot);
  iconRoot.render(
    <X aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />,
  );
  closeButton.addEventListener(
    "click",
    () => {
      iconRoot.unmount();
      popupIconRoots.delete(popup);
      popup.remove();
    },
    { once: true },
  );
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
      <div class="asset-popup-title">${escapeHtml(properties.station)}</div>
      ${routeBadges ? `<div class="mt-1 flex flex-wrap gap-1">${routeBadges}</div>` : ""}
      <div class="asset-popup-meta">${escapeHtml(properties.line)}</div>
      <div class="asset-popup-detail">
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
      <div class="asset-popup-title">${escapeHtml(properties.station)}</div>
      ${routeBadges ? `<div class="mt-1 flex flex-wrap gap-1">${routeBadges}</div>` : ""}
      <div class="asset-popup-meta">${escapeHtml(properties.line)}</div>
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
      <div class="asset-popup-title">${escapeHtml(properties.station)}</div>
      ${routeBadges ? `<div class="mt-1 flex flex-wrap gap-1">${routeBadges}</div>` : ""}
      <div class="asset-popup-meta">${escapeHtml(properties.line)}</div>
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
      class="asset-popup-close"
      data-popup-close
      type="button"
    >
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

function normalizeMapRoute(value: string) {
  return value.trim().toUpperCase().replace("6X", "6").replace("7X", "7");
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
