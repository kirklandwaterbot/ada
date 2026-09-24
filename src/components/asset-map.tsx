"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { X } from "lucide-react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  ASSET_MAP_STATUS_COLORS,
  formatStationLineDisplay,
  getSubwayRouteIconPath,
  type AssetMapStatus,
} from "@/lib/asset-display";
import {
  ADA_PROJECT_STATUS_META,
  type AdaProjectStatus,
} from "@/lib/ada-project-status";
import { MAP_FOCUS_EVENT, type MapFocusDetail } from "@/lib/map-focus";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { normalizeSearchText } from "@/lib/search-normalization";
import {
  getRegionalTransitBranding,
  type RegionalTransitBadge,
  type RegionalTransitAgency,
} from "@/lib/regional-transit-branding";
import {
  getRegionalStationServices,
  type RegionalStationService,
} from "@/lib/regional-station-merge";
import {
  regionalStations,
  type RegionalAccessibilityStatus as RegionalRailAccessibilityStatus,
  type RegionalEquipmentUnit as RegionalRailEquipment,
  type RegionalStation as RegionalRailStation,
} from "@/lib/regional-transit-data";
import type { AssetMapMarker } from "@/lib/station-explorer-data";
import {
  DEFAULT_ENABLED_TRANSIT_ROUTES,
  getEnabledTransitRouteIds,
  getTransitRouteKeysForServices,
  TRANSIT_ROUTE_FILTERS,
} from "@/lib/transit-filter-catalog";
import adaProjectStatuses from "../../data/ada-project-statuses.json";
import accessibleStations from "../../data/accessible-station-coordinates.json";

type MapMode = "combined" | "elevators" | "escalators";
export type MapTheme = "light" | "dark";
export type AssetMapVisibilityFilters = {
  airTrainStations: boolean;
  ctrailStations: boolean;
  elevatorStations: boolean;
  elevators: boolean;
  escalators: boolean;
  enabledTransitRoutes: string[];
  lirrStations: boolean;
  metroNorthStations: boolean;
  njTransitStations: boolean;
  pathStations: boolean;
  partialStations: boolean;
  plannedAccessibleUpgrades: boolean;
  plannedDesignStudy: boolean;
  plannedFunded: boolean;
  plannedNewStations: boolean;
  plannedUnderConstruction: boolean;
  rampStations: boolean;
  repairs: boolean;
};
type MapLayerKey = AssetMapStatus | "planned" | "stations";
type AssetMapLayout = "full" | "split";
type AssetMapPresentation = "canvas" | "card";

export type AssetMapFocusRequest = {
  detail: MapFocusDetail;
  id: number;
};

type PlannedFeatureProperties = {
  agency: string;
  color: string;
  key: string;
  line: string;
  note: string;
  projectPhase: string;
  projectStatus: AdaProjectStatus;
  projectTitle: string;
  routes: string;
  sourceUrl: string;
  station: string;
  statusLabel: string;
  transitRouteKeys: string;
  type: "ADA project";
};

type AccessibleStationFeatureProperties = {
  accessLabel: string;
  accessMethod: AccessibleStationAccessMethod;
  color: string;
  key: string;
  line: string;
  routes: string;
  station: string;
  statusLabel: string;
  type: "Accessible station";
  underRepair: boolean;
};

type AccessibleStationAccessMethod =
  | "accessible_entrance"
  | "elevator"
  | "ramp"
  | "street_level";

type AssetFeatureProperties = {
  ada: string;
  code: string;
  color: string;
  currentOutage: boolean;
  currentOutageDetails: string;
  equipmentCodesAtLocation: string;
  futureOutage: boolean;
  futureOutageDetails: string;
  line: string;
  routes: string;
  status: AssetMapStatus;
  statusLabel: string;
  station: string;
  type: string;
};
type RegionalRailFeatureProperties = {
  accessMethods: string;
  accessibilityStatus: RegionalRailAccessibilityStatus;
  agency: RegionalTransitAgency;
  agencies: string;
  branch: string;
  color: string;
  equipmentSummary: string;
  hasOutage: boolean;
  key: string;
  line: string;
  lineBadges: string;
  routes: string;
  serviceAlert: string;
  station: string;
  stationDetailUrl: string;
  statusLabel: string;
  transitRouteKeys: string;
  type: "Transit station";
};
type AssetFeature = GeoJSON.Feature<GeoJSON.Point, AssetFeatureProperties>;
type PlannedFeature = GeoJSON.Feature<GeoJSON.Point, PlannedFeatureProperties>;
type AccessibleStationFeature = GeoJSON.Feature<
  GeoJSON.Point,
  AccessibleStationFeatureProperties
>;
type RegionalRailFeature = GeoJSON.Feature<
  GeoJSON.Point,
  RegionalRailFeatureProperties
>;
type MappableFeature =
  | AssetFeature
  | PlannedFeature
  | AccessibleStationFeature
  | RegionalRailFeature;

const MAP_MODE_STORAGE_KEY = "mta-access-assets-map-mode:v2";
const MAP_LAYERS_STORAGE_KEY = "mta-access-assets-map-layers:v1";
const MAP_RESULT_PAGE_SIZE = 40;
const SUBWAY_ROUTE_DATA_URL = "/data/nyc-subway-routes.geojson";
const REGIONAL_RAIL_ROUTE_DATA_URL = "/data/mta-regional-rail-routes.geojson";
const PATH_ROUTE_DATA_URL = "/data/path-routes.geojson";
const AIRTRAIN_ROUTE_DATA_URL = "/data/ewr-airtrain-routes.geojson";
const JFK_AIRTRAIN_ROUTE_DATA_URL = "/data/jfk-airtrain-routes.geojson";
const NJ_TRANSIT_ROUTE_DATA_URL = "/data/nj-transit-routes.geojson";
const CTRAIL_ROUTE_DATA_URL = "/data/ctrail-routes.geojson";
const REGIONAL_RAIL_STATIONS = regionalStations;
const DEFAULT_VISIBILITY_FILTERS: AssetMapVisibilityFilters = {
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
const DEFAULT_MAP_LAYERS: Record<MapLayerKey, boolean> = {
  accessible: true,
  equipment: true,
  not_accessible: true,
  planned: true,
  stations: true,
  work: true,
};
const ACCESSIBLE_STATION_COLOR = "#22c55e";
const RAMP_ACCESSIBLE_STATION_COLOR = "#06b6d4";
const PARTIAL_ACCESSIBLE_STATION_COLOR = "#f59e0b";
const REGIONAL_ACCESSIBILITY_COLORS: Record<
  RegionalRailAccessibilityStatus,
  string
> = {
  Accessible: "#22c55e",
  "Partially accessible": "#f59e0b",
  "Not accessible": "#64748b",
  Unknown: "#94a3b8",
};
const ACCESS_METHOD_LABELS: Record<AccessibleStationAccessMethod, string> = {
  accessible_entrance: "Step-free accessible entrance",
  elevator: "Elevator access",
  ramp: "Ramp access",
  street_level: "Street-level access",
};
const STATUS_LABELS: Record<AssetMapStatus, string> = {
  accessible: "♿ ADA accessible",
  equipment: "Escalator equipment",
  not_accessible: "♿ Not ADA accessible",
  work: "Under repair / modernization",
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
  mapTheme,
  minimal = false,
  presentation = "card",
  visibilityFilters = DEFAULT_VISIBILITY_FILTERS,
}: {
  assets: AssetMapMarker[];
  embedded?: boolean;
  focusRequest?: AssetMapFocusRequest | null;
  layout?: AssetMapLayout;
  mapTheme: MapTheme;
  minimal?: boolean;
  presentation?: AssetMapPresentation;
  visibilityFilters?: AssetMapVisibilityFilters;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const popupCloseTimerRef = useRef<number | null>(null);
  const [mode, setMode] = usePersistentState<MapMode>(
    MAP_MODE_STORAGE_KEY,
    "combined",
    normalizeStoredMapMode,
  );
  const [layers, setLayers] = usePersistentState(
    MAP_LAYERS_STORAGE_KEY,
    DEFAULT_MAP_LAYERS,
    normalizeStoredMapLayers,
  );
  const [mapResultLimit, setMapResultLimit] = useState(MAP_RESULT_PAGE_SIZE);
  const [mapResultAnnouncement, setMapResultAnnouncement] = useState("");
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const canvas = presentation === "canvas";

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
          color: ASSET_MAP_STATUS_COLORS[asset.status],
          currentOutage: asset.currentOutage,
          currentOutageDetails: asset.currentOutageDetails,
          equipmentCodesAtLocation: asset.equipmentCodesAtLocation,
          futureOutage: asset.futureOutage,
          futureOutageDetails: asset.futureOutageDetails,
          line: asset.line,
          routes: asset.routes,
          status: asset.status,
          statusLabel: asset.currentOutage
            ? "Current outage"
            : asset.futureOutage
              ? "In service · future outage scheduled"
              : STATUS_LABELS[asset.status],
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

    return allFeatures.filter((feature) => {
      if (!hasEnabledNyctaRoute(feature.properties.routes, visibilityFilters)) {
        return false;
      }

      if (
        feature.properties.status === "work" &&
        !visibilityFilters.repairs
      ) {
        return false;
      }

      if (allowedType && feature.properties.type !== allowedType) {
        return false;
      }

      if (feature.properties.type === "Elevator") {
        return visibilityFilters.elevators;
      }

      if (feature.properties.type === "Escalator") {
        return visibilityFilters.escalators;
      }

      return true;
    });
  }, [
    allFeatures,
    mode,
    visibilityFilters,
  ]);
  const features = useMemo(
    () => modeFeatures.filter((feature) => layers[feature.properties.status]),
    [layers, modeFeatures],
  );
  const allPlannedFeatures = useMemo(() => {
    return adaProjectStatuses.stations.map((station): PlannedFeature => {
      const projectStatus = station.projectStatus as AdaProjectStatus;
      const statusMeta = ADA_PROJECT_STATUS_META[projectStatus];

      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [station.longitude, station.latitude],
        },
        properties: {
          agency: station.agency,
          color: statusMeta.color,
          key: getPlannedFeatureKey(
            formatPlannedStationName(station.station),
            formatStationLineDisplay(station.line),
            station.services.join(","),
          ),
          line: formatStationLineDisplay(station.line),
          note: station.note,
          projectPhase: station.projectPhase,
          projectStatus,
          projectTitle: station.projectTitle,
          routes: station.services.join(","),
          sourceUrl: station.sourceUrl,
          station: formatPlannedStationName(station.station),
          statusLabel: statusMeta.label,
          transitRouteKeys: station.transitRouteKeys.join(","),
          type: "ADA project",
        },
      };
    });
  }, []);

  const plannedFeatures = useMemo(() => {
    if (mode === "escalators" || !layers.planned) {
      return [];
    }

    return allPlannedFeatures.filter(
      (feature) =>
        isAdaProjectVisible(feature.properties.projectStatus, visibilityFilters) &&
        hasEnabledProjectRoute(
          feature.properties.transitRouteKeys,
          visibilityFilters,
        ),
    );
  }, [
    allPlannedFeatures,
    layers.planned,
    mode,
    visibilityFilters,
  ]);
  const allAccessibleStationFeatures = useMemo(() => {
    return accessibleStations.stations.map(
      (station): AccessibleStationFeature => {
        const accessMethod = station.accessMethod as AccessibleStationAccessMethod;
        const isPartial = station.statusLabel.startsWith("Partially accessible");
        const underRepair = allFeatures.some(
          (feature) =>
            feature.properties.status === "work" &&
            normalizeSearchText(feature.properties.station) ===
              normalizeSearchText(formatPlannedStationName(station.station)),
        );

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [station.longitude, station.latitude],
          },
          properties: {
            accessLabel: ACCESS_METHOD_LABELS[accessMethod],
            accessMethod,
            color: isPartial
              ? PARTIAL_ACCESSIBLE_STATION_COLOR
              : isRampOrLevelAccess(accessMethod)
                ? RAMP_ACCESSIBLE_STATION_COLOR
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
            underRepair,
          },
        };
      },
    );
  }, [allFeatures]);
  const accessibleStationFeatures = useMemo(() => {
    if (mode !== "combined" || !layers.stations) {
      return [];
    }

    return allAccessibleStationFeatures.filter((feature) => {
      if (!hasEnabledNyctaRoute(feature.properties.routes, visibilityFilters)) {
        return false;
      }

      const isPartial = feature.properties.statusLabel.startsWith(
        "Partially accessible",
      );

      if (isPartial) {
        return (
          visibilityFilters.partialStations &&
          (!feature.properties.underRepair || visibilityFilters.repairs)
        );
      }

      const accessTypeVisible = isRampOrLevelAccess(
        feature.properties.accessMethod,
      )
        ? visibilityFilters.rampStations
        : visibilityFilters.elevatorStations;

      return (
        accessTypeVisible &&
        (!feature.properties.underRepair || visibilityFilters.repairs)
      );
    });
  }, [
    allAccessibleStationFeatures,
    layers.stations,
    mode,
    visibilityFilters,
  ]);
  const allRegionalRailFeatures = useMemo(
    () =>
      REGIONAL_RAIL_STATIONS.map((station): RegionalRailFeature => {
        const services = getRegionalStationServices(station);
        const equipment = [...station.elevators, ...station.escalators];
        const hasOutage = equipment.some(
          (item) =>
            item.status === "outage" || item.status === "long_term_outage",
        );

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [station.longitude, station.latitude],
          },
          properties: {
            accessMethods: (station.accessMethods || []).join(" · "),
            accessibilityStatus: station.accessibilityStatus,
            agency: station.agency,
            agencies: [...new Set(services.map((service) => service.agency))].join(","),
            branch: services.map((service) => service.branchName).join(" / "),
            color: REGIONAL_ACCESSIBILITY_COLORS[station.accessibilityStatus],
            equipmentSummary: formatRegionalEquipmentSummary(station),
            hasOutage,
            key: `${station.agency}:${station.stationCode}`,
            line: services
              .map((service) => `${service.agency} · ${service.branchName}`)
              .join(" / "),
            lineBadges: JSON.stringify(getRegionalLineBadges(services)),
            routes: "",
            serviceAlert: station.serviceAlert || "",
            station: station.name,
            stationDetailUrl: station.stationDetailUrl || "",
            statusLabel: station.accessibilityStatus,
            transitRouteKeys: getStationTransitRouteKeys(station).join(","),
            type: "Transit station",
          },
        };
      }),
    [],
  );
  const regionalRailFeatures = useMemo(() => {
    if (mode !== "combined") return [];

    return allRegionalRailFeatures.filter((feature) => {
      const hasEnabledLine = feature.properties.transitRouteKeys
        .split(",")
        .some((key) => visibilityFilters.enabledTransitRoutes.includes(key));
      if (!hasEnabledLine) return false;

      return feature.properties.agencies
        .split(",")
        .some((agency) =>
          isRegionalAgencyVisible(
            agency as RegionalTransitAgency,
            visibilityFilters,
          ),
        );
    });
  }, [
    allRegionalRailFeatures,
    mode,
    visibilityFilters,
  ]);

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
  const regionalRailCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [...regionalRailFeatures],
    }),
    [regionalRailFeatures],
  );
  const mapResultFeatures = useMemo(
    () => [
      ...features,
      ...plannedFeatures,
      ...accessibleStationFeatures,
      ...regionalRailFeatures,
    ],
    [accessibleStationFeatures, features, plannedFeatures, regionalRailFeatures],
  );
  const visibleMapResults = mapResultFeatures.slice(0, mapResultLimit);
  const collectionRef = useRef(collection);
  const plannedCollectionRef = useRef(plannedCollection);
  const accessibleStationCollectionRef = useRef(accessibleStationCollection);
  const regionalRailCollectionRef = useRef(regionalRailCollection);
  const allFeaturesRef = useRef(allFeatures);
  const allPlannedFeaturesRef = useRef(allPlannedFeatures);
  const allAccessibleStationFeaturesRef = useRef(allAccessibleStationFeatures);
  const allRegionalRailFeaturesRef = useRef(allRegionalRailFeatures);
  const featuresRef = useRef(features);
  const plannedFeaturesRef = useRef(plannedFeatures);
  const accessibleStationFeaturesRef = useRef(accessibleStationFeatures);
  const regionalRailFeaturesRef = useRef(regionalRailFeatures);
  const visibilityFiltersRef = useRef(visibilityFilters);

  useEffect(() => {
    collectionRef.current = collection;
    plannedCollectionRef.current = plannedCollection;
    accessibleStationCollectionRef.current = accessibleStationCollection;
    regionalRailCollectionRef.current = regionalRailCollection;
    allFeaturesRef.current = allFeatures;
    allPlannedFeaturesRef.current = allPlannedFeatures;
    allAccessibleStationFeaturesRef.current = allAccessibleStationFeatures;
    allRegionalRailFeaturesRef.current = allRegionalRailFeatures;
    featuresRef.current = features;
    plannedFeaturesRef.current = plannedFeatures;
    accessibleStationFeaturesRef.current = accessibleStationFeatures;
    regionalRailFeaturesRef.current = regionalRailFeatures;
    visibilityFiltersRef.current = visibilityFilters;
  }, [
    accessibleStationCollection,
    accessibleStationFeatures,
    allAccessibleStationFeatures,
    allFeatures,
    allPlannedFeatures,
    allRegionalRailFeatures,
    collection,
    features,
    plannedCollection,
    plannedFeatures,
    regionalRailCollection,
    regionalRailFeatures,
    visibilityFilters,
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
    const cancelPopupClose = () => {
      if (popupCloseTimerRef.current !== null) {
        window.clearTimeout(popupCloseTimerRef.current);
        popupCloseTimerRef.current = null;
      }
    };
    const schedulePopupClose = () => {
      cancelPopupClose();
      popupCloseTimerRef.current = window.setTimeout(() => {
        popupRef.current?.remove();
        popupCloseTimerRef.current = null;
      }, 5_000);
    };
    const keepPopupInteractive = () => {
      cancelPopupClose();
      const popupElement = popupRef.current?.getElement();
      if (!popupElement) return;
      popupElement.onmouseenter = cancelPopupClose;
      popupElement.onmouseleave = schedulePopupClose;
    };

    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("subway-routes", {
        type: "geojson",
        data: SUBWAY_ROUTE_DATA_URL,
      });
      map.addSource("regional-rail-routes", {
        type: "geojson",
        data: REGIONAL_RAIL_ROUTE_DATA_URL,
      });
      map.addSource("path-routes", {
        type: "geojson",
        data: PATH_ROUTE_DATA_URL,
      });
      map.addSource("airtrain-routes", {
        type: "geojson",
        data: AIRTRAIN_ROUTE_DATA_URL,
      });
      map.addSource("jfk-airtrain-routes", {
        type: "geojson",
        data: JFK_AIRTRAIN_ROUTE_DATA_URL,
      });
      map.addSource("nj-transit-routes", {
        type: "geojson",
        data: NJ_TRANSIT_ROUTE_DATA_URL,
      });
      map.addSource("ctrail-routes", {
        type: "geojson",
        data: CTRAIL_ROUTE_DATA_URL,
      });
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
      map.addSource("regional-rail-stations", {
        type: "geojson",
        data: regionalRailCollectionRef.current,
      });

      map.addLayer({
        id: "subway-route-casing",
        type: "line",
        source: "subway-routes",
        filter: getRouteIdFilter(visibilityFiltersRef.current, "NYCTA"),
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": mapTheme === "dark" ? "#020617" : "#ffffff",
          "line-opacity": 0.78,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            2.6,
            10,
            3.8,
            13,
            5.4,
            16,
            8.2,
          ],
        },
      });
      map.addLayer({
        id: "subway-route-lines",
        type: "line",
        source: "subway-routes",
        filter: getRouteIdFilter(visibilityFiltersRef.current, "NYCTA"),
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["get", "color"],
          "line-opacity": 0.88,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            1.5,
            10,
            2.4,
            13,
            3.6,
            16,
            6,
          ],
        },
      });
      map.addLayer({
        id: "regional-rail-route-casing",
        type: "line",
        source: "regional-rail-routes",
        filter: getRegionalRailRouteFilter(visibilityFiltersRef.current),
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": mapTheme === "dark" ? "#020617" : "#ffffff",
          "line-opacity": 0.7,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            2.4,
            10,
            3.4,
            14,
            5.4,
          ],
        },
      });
      map.addLayer({
        id: "regional-rail-route-lines",
        type: "line",
        source: "regional-rail-routes",
        filter: getRegionalRailRouteFilter(visibilityFiltersRef.current),
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["get", "color"],
          "line-opacity": 0.82,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            1.25,
            10,
            2,
            14,
            3.5,
          ],
        },
      });
      map.addLayer({
        id: "path-route-casing",
        type: "line",
        source: "path-routes",
        filter: getRouteIdFilter(visibilityFiltersRef.current, "PATH"),
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: getPathRouteVisibility(visibilityFiltersRef.current),
        },
        paint: {
          "line-color": mapTheme === "dark" ? "#020617" : "#ffffff",
          "line-offset": ["get", "offset"],
          "line-opacity": 0.78,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            2.8,
            12,
            4.4,
            16,
            7.2,
          ],
        },
      });
      map.addLayer({
        id: "path-route-lines",
        type: "line",
        source: "path-routes",
        filter: getRouteIdFilter(visibilityFiltersRef.current, "PATH"),
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: getPathRouteVisibility(visibilityFiltersRef.current),
        },
        paint: {
          "line-color": ["get", "color"],
          "line-offset": ["get", "offset"],
          "line-opacity": 0.9,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            1.6,
            12,
            2.8,
            16,
            5.2,
          ],
        },
      });
      map.addLayer({
        id: "airtrain-route-casing",
        type: "line",
        source: "airtrain-routes",
        filter: getRouteIdFilter(visibilityFiltersRef.current, "EWR AirTrain"),
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: getAirTrainRouteVisibility(visibilityFiltersRef.current),
        },
        paint: {
          "line-color": mapTheme === "dark" ? "#020617" : "#ffffff",
          "line-opacity": 0.78,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            2.8,
            13,
            4.4,
            17,
            7.2,
          ],
        },
      });
      map.addLayer({
        id: "airtrain-route-lines",
        type: "line",
        source: "airtrain-routes",
        filter: getRouteIdFilter(visibilityFiltersRef.current, "EWR AirTrain"),
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: getAirTrainRouteVisibility(visibilityFiltersRef.current),
        },
        paint: {
          "line-color": ["get", "color"],
          "line-opacity": 0.92,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1.6,
            13,
            2.8,
            17,
            5.2,
          ],
        },
      });
      addToggleableRouteLayers(
        map,
        "jfk-airtrain",
        "jfk-airtrain-routes",
        mapTheme,
        getAirTrainRouteVisibility(visibilityFiltersRef.current),
        getRouteIdFilter(visibilityFiltersRef.current, "JFK AirTrain"),
      );
      addToggleableRouteLayers(
        map,
        "nj-transit",
        "nj-transit-routes",
        mapTheme,
        getNjTransitRouteVisibility(visibilityFiltersRef.current),
        getRouteIdFilter(visibilityFiltersRef.current, "NJ Transit"),
      );
      addToggleableRouteLayers(
        map,
        "ctrail",
        "ctrail-routes",
        mapTheme,
        getCTrailRouteVisibility(visibilityFiltersRef.current),
        getRouteIdFilter(visibilityFiltersRef.current, "CTrail"),
      );
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
          "circle-stroke-color": [
            "case",
            ["==", ["get", "status"], "work"],
            "#f97316",
            "#ffffff",
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "status"], "work"],
            3.6,
            1.8,
          ],
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
          "circle-stroke-color": [
            "case",
            ["get", "underRepair"],
            "#f97316",
            "#ffffff",
          ],
          "circle-stroke-width": [
            "case",
            ["get", "underRepair"],
            3.8,
            2,
          ],
        },
      });
      map.addLayer({
        id: "regional-rail-station-points",
        type: "circle",
        source: "regional-rail-stations",
        paint: {
          "circle-color": ["get", "color"],
          "circle-opacity": 0.9,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            3.5,
            11,
            6,
            15,
            10,
          ],
          "circle-stroke-color": [
            "case",
            ["get", "hasOutage"],
            "#f97316",
            "#ffffff",
          ],
          "circle-stroke-width": [
            "case",
            ["get", "hasOutage"],
            3.2,
            1.8,
          ],
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
          keepPopupInteractive();
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
          keepPopupInteractive();
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
          keepPopupInteractive();
        }
      });
      map.on("mouseenter", "regional-rail-station-points", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        const coordinates =
          feature?.geometry.type === "Point" ? feature.geometry.coordinates : null;
        const properties = feature?.properties as
          | RegionalRailFeatureProperties
          | undefined;

        if (coordinates && properties) {
          showRegionalRailPopup(
            map,
            popupRef.current,
            coordinates as [number, number],
            properties,
          );
          keepPopupInteractive();
        }
      });

      map.on("mouseleave", "asset-points", () => {
        map.getCanvas().style.cursor = "";
        schedulePopupClose();
      });
      map.on("mouseleave", "planned-elevator-points", () => {
        map.getCanvas().style.cursor = "";
        schedulePopupClose();
      });
      map.on("mouseleave", "accessible-station-points", () => {
        map.getCanvas().style.cursor = "";
        schedulePopupClose();
      });
      map.on("mouseleave", "regional-rail-station-points", () => {
        map.getCanvas().style.cursor = "";
        schedulePopupClose();
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

        cancelPopupClose();
        showAssetPopup(map, popupRef.current, coordinates as [number, number], properties);
        keepPopupInteractive();
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

        cancelPopupClose();
        showPlannedPopup(map, popupRef.current, coordinates as [number, number], properties);
        keepPopupInteractive();
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
        keepPopupInteractive();
      });
      map.on("click", "regional-rail-station-points", (event) => {
        const feature = event.features?.[0];
        const coordinates =
          feature?.geometry.type === "Point" ? feature.geometry.coordinates : null;
        const properties = feature?.properties as
          | RegionalRailFeatureProperties
          | undefined;

        if (!coordinates || !properties) {
          return;
        }

        showRegionalRailPopup(
          map,
          popupRef.current,
          coordinates as [number, number],
          properties,
        );
        keepPopupInteractive();
      });

      fitMapToFeatures(map, [
        ...featuresRef.current,
        ...plannedFeaturesRef.current,
        ...accessibleStationFeaturesRef.current,
        ...regionalRailFeaturesRef.current,
      ]);
    });

    return () => {
      cancelPopupClose();
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

    if (!map) return;

    const applyMapState = () => {
      if (!map.isStyleLoaded()) return;
      map.off("styledata", applyMapState);

      const source = map.getSource("assets") as GeoJSONSource | undefined;
      const plannedSource = map.getSource("planned-elevators") as
        | GeoJSONSource
        | undefined;
      const accessibleStationSource = map.getSource("accessible-stations") as
        | GeoJSONSource
        | undefined;
      const regionalRailSource = map.getSource("regional-rail-stations") as
        | GeoJSONSource
        | undefined;
      source?.setData(collection);
      plannedSource?.setData(plannedCollection);
      accessibleStationSource?.setData(accessibleStationCollection);
      regionalRailSource?.setData(regionalRailCollection);
      setRegionalRailRouteFilter(map, visibilityFilters);
      setRouteIdFilter(map, visibilityFilters, "NYCTA", [
        "subway-route-casing",
        "subway-route-lines",
      ]);
      setPathRouteVisibility(map, visibilityFilters);
      setAirTrainRouteVisibility(map, visibilityFilters);
      setRouteIdFilter(map, visibilityFilters, "JFK AirTrain", [
        "jfk-airtrain-route-casing",
        "jfk-airtrain-route-lines",
      ]);
      setToggleableRouteVisibility(
        map,
        "jfk-airtrain",
        getAirTrainRouteVisibility(visibilityFilters),
      );
      setNjTransitRouteVisibility(map, visibilityFilters);
      setCTrailRouteVisibility(map, visibilityFilters);
      fitMapToFeatures(map, [
        ...features,
        ...plannedFeatures,
        ...accessibleStationFeatures,
        ...regionalRailFeatures,
      ]);
    };

    if (map.isStyleLoaded()) {
      applyMapState();
    } else {
      map.on("styledata", applyMapState);
    }

    return () => {
      map.off("styledata", applyMapState);
    };
  }, [
    accessibleStationCollection,
    accessibleStationFeatures,
    collection,
    features,
    plannedCollection,
    plannedFeatures,
    regionalRailCollection,
    regionalRailFeatures,
    visibilityFilters,
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

      if (detail.kind === "regional") {
        const regionalFeature = allRegionalRailFeaturesRef.current.find(
          (item) => item.properties.key === detail.key,
        );

        if (!regionalFeature) return;

        setMode("combined");
        focusMapFeature(map, regionalFeature);
        showRegionalRailPopup(
          map,
          popupRef.current,
          regionalFeature.geometry.coordinates as [number, number],
          regionalFeature.properties,
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
  }, [setLayers, setMode]);

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
    } else if (feature.properties.type === "ADA project") {
      showPlannedPopup(
        map,
        popup,
        feature.geometry.coordinates as [number, number],
        feature.properties,
      );
    } else if (feature.properties.type === "Transit station") {
      showRegionalRailPopup(
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
        canvas
          ? "relative h-full min-h-[34rem] w-full max-w-full overflow-hidden bg-slate-900"
          : "scroll-mt-6",
        canvas ? "" : embedded ? "surface-card overflow-hidden" : "mt-10",
      ].join(" ")}
      id="asset-map-section"
    >
      {!minimal && (
        <div
          className={[
          "flex flex-col gap-4",
          canvas
            ? "absolute left-3 right-3 top-3 z-10 max-w-3xl rounded-2xl border border-white/20 bg-[rgb(var(--panel-rgb)_/_0.9)] p-3 shadow-[0_20px_60px_rgb(0_0_0_/_0.22)] backdrop-blur-xl sm:left-4 sm:right-auto sm:top-4 sm:max-w-[min(46rem,calc(100%-7rem))]"
            : embedded
              ? "border-b border-[var(--border)] p-4 sm:p-5"
              : "mb-4",
          ].join(" ")}
        >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--accent-600)]">
              {canvas ? "Map layers" : "Interactive map"}
            </p>
            <h2
              className={
                canvas
                  ? "sr-only"
                  : "mt-1 text-xl font-black tracking-[-0.03em] text-[var(--ink)]"
              }
            >
              {embedded ? "System accessibility map" : "Asset map"}
            </h2>
            <p
              className={
                canvas
                  ? "sr-only"
                  : "mt-1 text-xs font-medium text-[var(--muted)]"
              }
            >
              Current and future subway equipment outages are synchronized from
              the official MTA status page. Select a marker for its schedule.
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
          </div>
        </div>

        <div
          className={
            canvas
              ? "flex max-w-full gap-2 overflow-x-auto pb-1"
              : "flex flex-wrap gap-2"
          }
          role="group"
          aria-label="Map layers"
        >
          <MapLayerToggle
            active={layers.accessible}
            color={ASSET_MAP_STATUS_COLORS.accessible}
            label="ADA assets"
            onToggle={() =>
              setLayers((current) => ({ ...current, accessible: !current.accessible }))
            }
            value={counts.accessible}
          />
          <MapLayerToggle
            active={layers.not_accessible}
            color={ASSET_MAP_STATUS_COLORS.not_accessible}
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
            color={ASSET_MAP_STATUS_COLORS.equipment}
            label="Escalator assets"
            onToggle={() =>
              setLayers((current) => ({ ...current, equipment: !current.equipment }))
            }
            value={counts.equipment}
          />
          <MapLayerToggle
            active={layers.work}
            color={ASSET_MAP_STATUS_COLORS.work}
            label="Work / repair"
            onToggle={() =>
              setLayers((current) => ({ ...current, work: !current.work }))
            }
            value={counts.work}
          />
          <MapLayerToggle
            active={layers.planned}
            color={ADA_PROJECT_STATUS_META.funded_planned.color}
            label="ADA projects"
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
      )}

      {token ? (
        <div
          className={[
            "overflow-hidden bg-[var(--panel)]",
            canvas
              ? "absolute inset-0"
              : embedded
                ? ""
                : "rounded-2xl border border-[var(--border)] shadow-[0_16px_40px_rgb(15_35_64_/_0.06)]",
          ].join(" ")}
        >
          <div
            aria-describedby={minimal ? undefined : "map-results-description"}
            aria-label="Interactive subway, PATH, AirTrain, and regional rail accessibility map with present-day transit routes"
            className={
              canvas
                ? "h-full min-h-[34rem] w-full"
                : embedded
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
        <div
          className={
            canvas
              ? "absolute inset-0 grid place-items-center p-5"
              : embedded
                ? "p-5"
                : ""
          }
        >
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to enable the interactive system map.
          </div>
        </div>
      )}

      {!minimal && (
        <div
          className={
            canvas
              ? "absolute bottom-3 left-3 right-3 z-10 max-w-md rounded-2xl border border-white/20 bg-[rgb(var(--panel-rgb)_/_0.92)] p-3 shadow-[0_20px_60px_rgb(0_0_0_/_0.22)] backdrop-blur-xl sm:bottom-4 sm:left-4 sm:right-auto sm:w-[min(26rem,calc(100%-2rem))]"
              : "border-t border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5"
          }
        >
        <details>
          <summary className="cursor-pointer text-sm font-extrabold text-[var(--ink)] marker:text-[var(--accent-600)]">
            Browse {mapResultFeatures.length.toLocaleString()} enabled map markers
          </summary>
          <p
            className="mt-2 text-xs leading-5 text-[var(--muted-strong)]"
            id="map-results-description"
          >
            This keyboard-accessible list mirrors the current equipment mode and
            enabled map layers. Current and scheduled outage details come from
            the official MTA equipment status feed.
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
      )}
    </section>
  );
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

function showRegionalRailPopup(
  map: mapboxgl.Map,
  popup: mapboxgl.Popup | null,
  coordinates: [number, number],
  properties: RegionalRailFeatureProperties,
) {
  showPopup(map, popup, coordinates, getRegionalRailPopupHtml(properties));
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
  const equipmentCodesAtLocation = properties.equipmentCodesAtLocation
    .split(",")
    .filter(Boolean);

  return `
    <div class="space-y-1 pr-6">
      ${popupCloseButtonHtml()}
      <div class="asset-popup-title">${escapeHtml(properties.station)}</div>
      ${routeBadges ? `<div class="mt-1 flex flex-wrap gap-1">${routeBadges}</div>` : ""}
      <div class="asset-popup-detail">
        ${escapeHtml(properties.type)} ${escapeHtml(properties.code)}
      </div>
      ${
        equipmentCodesAtLocation.length > 1
          ? `<div class="asset-popup-meta">All equipment at this map point: ${equipmentCodesAtLocation.map(escapeHtml).join(" · ")}</div>`
          : ""
      }
      <div class="text-xs font-semibold" style="color:${escapeHtml(properties.color)}">
        ${escapeHtml(properties.statusLabel)}
      </div>
      ${getMtaOutageScheduleHtml("Current outage", properties.currentOutageDetails, "current")}
      ${getMtaOutageScheduleHtml("Future outage", properties.futureOutageDetails, "future")}
      ${
        properties.currentOutage || properties.futureOutage
          ? '<a class="asset-popup-link" href="https://www.mta.info/elevator-escalator-status" rel="noreferrer" target="_blank">Official MTA equipment status ↗</a>'
          : ""
      }
    </div>
  `;
}

type SubwayEquipmentOutage = {
  estimatedReturnToService?: string;
  outageStart?: string;
  reason?: string;
  serving?: string;
};

function getMtaOutageScheduleHtml(
  label: string,
  serialized: string,
  timeframe: "current" | "future",
) {
  const outages = parseSubwayEquipmentOutages(serialized);
  if (outages.length === 0) return "";

  return outages
    .map((outage) => {
      const startLabel = timeframe === "current" ? "Out since" : "Starts";
      return `
        <div class="mt-2 rounded-lg border border-orange-400/30 bg-orange-500/10 p-2">
          <div class="text-xs font-bold text-orange-500">${escapeHtml(label)} · ${escapeHtml(outage.reason || "Outage")}</div>
          ${outage.serving ? `<div class="asset-popup-meta">${escapeHtml(outage.serving)}</div>` : ""}
          ${outage.outageStart ? `<div class="asset-popup-meta">${startLabel}: ${escapeHtml(outage.outageStart)}</div>` : ""}
          ${outage.estimatedReturnToService ? `<div class="asset-popup-meta">Estimated return: ${escapeHtml(outage.estimatedReturnToService)}</div>` : ""}
        </div>
      `;
    })
    .join("");
}

function parseSubwayEquipmentOutages(value: string) {
  try {
    const parsed = JSON.parse(value) as SubwayEquipmentOutage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getPlannedPopupHtml(properties: PlannedFeatureProperties) {
  const routeBadges = projectRouteBadgesHtml(
    properties.transitRouteKeys,
    properties.routes,
  );

  return `
    <div class="space-y-1 pr-6">
      ${popupCloseButtonHtml()}
      <div class="asset-popup-title">${escapeHtml(properties.station)}</div>
      ${routeBadges ? `<div class="mt-1 flex flex-wrap gap-1">${routeBadges}</div>` : ""}
      <div class="text-xs font-semibold" style="color:${escapeHtml(properties.color)}">
        ${escapeHtml(properties.statusLabel)}
      </div>
      <div class="asset-popup-detail">${escapeHtml(properties.projectTitle)}</div>
      <div class="asset-popup-meta">Project phase: ${escapeHtml(properties.projectPhase)}</div>
      ${properties.note ? `<div class="asset-popup-meta">${escapeHtml(properties.note)}</div>` : ""}
      ${
        properties.sourceUrl
          ? `<a class="asset-popup-link" href="${escapeHtml(properties.sourceUrl)}" rel="noreferrer" target="_blank">Official project details ↗</a>`
          : ""
      }
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
      <div class="asset-popup-meta">${escapeHtml(properties.accessLabel)}</div>
      ${properties.underRepair ? '<div class="text-xs font-semibold text-orange-500">Station equipment flagged for repair / modernization</div>' : ""}
      <div class="text-xs font-semibold" style="color:${escapeHtml(properties.color)}">
        ${escapeHtml(properties.statusLabel)}
      </div>
    </div>
  `;
}

function getRegionalRailPopupHtml(properties: RegionalRailFeatureProperties) {
  const lineBadges = parseRegionalLineBadges(properties.lineBadges)
    .map(
      (line) =>
        `<img class="asset-popup-line-logo" src="${escapeHtml(line.imagePath)}" alt="${escapeHtml(line.label)}" title="${escapeHtml(line.label)}" />`,
    )
    .join("");
  const stationLink = properties.stationDetailUrl
    ? `<a class="mt-2 inline-flex text-xs font-bold text-sky-600 hover:text-sky-500" href="${escapeHtml(properties.stationDetailUrl)}" rel="noreferrer" target="_blank">Official station accessibility details ↗</a>`
    : "";

  return `
    <div class="space-y-1 pr-6">
      ${popupCloseButtonHtml()}
      <div class="asset-popup-title">${escapeHtml(properties.station)}</div>
      ${lineBadges ? `<div class="asset-popup-line-badges">${lineBadges}</div>` : ""}
      <div class="text-xs font-semibold" style="color:${escapeHtml(properties.color)}">
        ${escapeHtml(properties.statusLabel)}
      </div>
      ${properties.accessMethods ? `<div class="asset-popup-detail">Access: ${escapeHtml(properties.accessMethods)}</div>` : ""}
      <div class="asset-popup-detail">${escapeHtml(properties.equipmentSummary)}</div>
      ${properties.hasOutage ? '<div class="text-xs font-semibold text-orange-500">Elevator or escalator outage reported</div>' : ""}
      ${properties.serviceAlert ? `<div class="asset-popup-detail">${escapeHtml(properties.serviceAlert)}</div>` : ""}
      ${stationLink}
    </div>
  `;
}

function formatRegionalEquipmentSummary(station: RegionalRailStation) {
  const summaries = [
    formatEquipmentType("Elevators", station.elevators),
    formatEquipmentType("Escalators", station.escalators),
  ].filter(Boolean);

  return summaries.length > 0
    ? summaries.join(" · ")
    : "No elevator or escalator service listed";
}

function formatEquipmentType(label: string, equipment: RegionalRailEquipment[]) {
  if (equipment.length === 0) return "";

  const outageCount = equipment.filter(
    (item) => item.status === "outage" || item.status === "long_term_outage",
  ).length;
  const operationalCount = equipment.filter(
    (item) => item.status === "operational",
  ).length;
  const statusParts = [];

  if (operationalCount > 0) statusParts.push(`${operationalCount} working`);
  if (outageCount > 0) statusParts.push(`${outageCount} out`);
  if (statusParts.length === 0) statusParts.push(`${equipment.length} listed`);

  return `${label}: ${statusParts.join(", ")}`;
}

function addToggleableRouteLayers(
  map: mapboxgl.Map,
  layerPrefix: string,
  source: string,
  mapTheme: MapTheme,
  visibility: "none" | "visible",
  filter?: mapboxgl.FilterSpecification,
) {
  map.addLayer({
    id: `${layerPrefix}-route-casing`,
    type: "line",
    source,
    filter,
    layout: {
      "line-cap": "round",
      "line-join": "round",
      visibility,
    },
    paint: {
      "line-color": mapTheme === "dark" ? "#020617" : "#ffffff",
      "line-opacity": 0.72,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        7,
        2.4,
        10,
        3.4,
        14,
        5.4,
      ],
    },
  });
  map.addLayer({
    id: `${layerPrefix}-route-lines`,
    type: "line",
    source,
    filter,
    layout: {
      "line-cap": "round",
      "line-join": "round",
      visibility,
    },
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": 0.86,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        7,
        1.25,
        10,
        2,
        14,
        3.5,
      ],
    },
  });
}

function getRegionalRailRouteFilter(
  filters: AssetMapVisibilityFilters,
): mapboxgl.FilterSpecification {
  return [
    "any",
    [
      "all",
      ["==", ["get", "agency"], "LIRR"],
      filters.lirrStations,
      getRouteIdFilter(filters, "LIRR"),
    ],
    [
      "all",
      ["==", ["get", "agency"], "MNR"],
      filters.metroNorthStations,
      getRouteIdFilter(filters, "MNR"),
    ],
  ];
}

function getRouteIdFilter(
  filters: AssetMapVisibilityFilters,
  agency: string,
): mapboxgl.FilterSpecification {
  const routeIds = getEnabledTransitRouteIds(
    agency,
    filters.enabledTransitRoutes,
  );

  return ["in", ["get", "routeId"], ["literal", routeIds]];
}

function setRouteIdFilter(
  map: mapboxgl.Map,
  filters: AssetMapVisibilityFilters,
  agency: string,
  layerIds: string[],
) {
  const filter = getRouteIdFilter(filters, agency);
  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) map.setFilter(layerId, filter);
  }
}

function setRegionalRailRouteFilter(
  map: mapboxgl.Map,
  filters: AssetMapVisibilityFilters,
) {
  const filter = getRegionalRailRouteFilter(filters);

  for (const layerId of [
    "regional-rail-route-casing",
    "regional-rail-route-lines",
  ]) {
    if (map.getLayer(layerId)) map.setFilter(layerId, filter);
  }
}

function getPathRouteVisibility(
  filters: AssetMapVisibilityFilters,
): "none" | "visible" {
  return filters.pathStations ? "visible" : "none";
}

function setPathRouteVisibility(
  map: mapboxgl.Map,
  filters: AssetMapVisibilityFilters,
) {
  const visibility = getPathRouteVisibility(filters);
  setRouteIdFilter(map, filters, "PATH", [
    "path-route-casing",
    "path-route-lines",
  ]);

  for (const layerId of ["path-route-casing", "path-route-lines"]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }
}

function getAirTrainRouteVisibility(
  filters: AssetMapVisibilityFilters,
): "none" | "visible" {
  return filters.airTrainStations ? "visible" : "none";
}

function setAirTrainRouteVisibility(
  map: mapboxgl.Map,
  filters: AssetMapVisibilityFilters,
) {
  const visibility = getAirTrainRouteVisibility(filters);
  setRouteIdFilter(map, filters, "EWR AirTrain", [
    "airtrain-route-casing",
    "airtrain-route-lines",
  ]);

  for (const layerId of ["airtrain-route-casing", "airtrain-route-lines"]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }
}

function getNjTransitRouteVisibility(
  filters: AssetMapVisibilityFilters,
): "none" | "visible" {
  return filters.njTransitStations ? "visible" : "none";
}

function setNjTransitRouteVisibility(
  map: mapboxgl.Map,
  filters: AssetMapVisibilityFilters,
) {
  setToggleableRouteVisibility(
    map,
    "nj-transit",
    getNjTransitRouteVisibility(filters),
  );
  setRouteIdFilter(map, filters, "NJ Transit", [
    "nj-transit-route-casing",
    "nj-transit-route-lines",
  ]);
}

function getCTrailRouteVisibility(
  filters: AssetMapVisibilityFilters,
): "none" | "visible" {
  return filters.ctrailStations ? "visible" : "none";
}

function setCTrailRouteVisibility(
  map: mapboxgl.Map,
  filters: AssetMapVisibilityFilters,
) {
  setToggleableRouteVisibility(
    map,
    "ctrail",
    getCTrailRouteVisibility(filters),
  );
  setRouteIdFilter(map, filters, "CTrail", [
    "ctrail-route-casing",
    "ctrail-route-lines",
  ]);
}

function hasEnabledNyctaRoute(
  routes: string,
  filters: AssetMapVisibilityFilters,
) {
  const stationRoutes = new Set(
    routes
      .split(/[\s,/]+/)
      .map((route) => normalizeMapRoute(route))
      .filter(Boolean),
  );
  return TRANSIT_ROUTE_FILTERS.some(
    (route) =>
      route.key.startsWith("NYCTA:") &&
      filters.enabledTransitRoutes.includes(route.key) &&
      (route.stationRouteIds || [route.routeId]).some((routeId) =>
        stationRoutes.has(normalizeMapRoute(routeId)),
      ),
  );
}

function hasEnabledProjectRoute(
  transitRouteKeys: string,
  filters: AssetMapVisibilityFilters,
) {
  return transitRouteKeys
    .split(",")
    .filter(Boolean)
    .some((key) => filters.enabledTransitRoutes.includes(key));
}

function isAdaProjectVisible(
  status: AdaProjectStatus,
  filters: AssetMapVisibilityFilters,
) {
  return filters[ADA_PROJECT_STATUS_META[status].filterKey];
}

function getStationTransitRouteKeys(station: RegionalRailStation) {
  return getTransitRouteKeysForServices(getRegionalStationServices(station));
}

function getRegionalLineBadges(services: RegionalStationService[]) {
  return services
    .flatMap((service) =>
      getRegionalTransitBranding(
        service.agency,
        service.branchId,
        service.serviceRouteIds.join(","),
      ).lines,
    )
    .filter(
      (badge, index, badges) =>
        badges.findIndex((candidate) => candidate.imagePath === badge.imagePath) ===
        index,
    );
}

function parseRegionalLineBadges(value: string): RegionalTransitBadge[] {
  try {
    const badges = JSON.parse(value) as RegionalTransitBadge[];
    return Array.isArray(badges) ? badges : [];
  } catch {
    return [];
  }
}

function isRegionalAgencyVisible(
  agency: RegionalTransitAgency,
  filters: AssetMapVisibilityFilters,
) {
  if (agency === "LIRR") return filters.lirrStations;
  if (agency === "MNR") return filters.metroNorthStations;
  if (agency === "PATH") return filters.pathStations;
  if (agency === "NJ Transit") return filters.njTransitStations;
  if (agency === "CTrail") return filters.ctrailStations;
  return filters.airTrainStations;
}

function setToggleableRouteVisibility(
  map: mapboxgl.Map,
  layerPrefix: string,
  visibility: "none" | "visible",
) {
  for (const layerId of [
    `${layerPrefix}-route-casing`,
    `${layerPrefix}-route-lines`,
  ]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }
}

function isRampOrLevelAccess(accessMethod: AccessibleStationAccessMethod) {
  return accessMethod !== "elevator";
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

function normalizeStoredMapMode(
  storedValue: unknown,
  fallback: MapMode,
): MapMode {
  return storedValue === "elevators" ||
    storedValue === "escalators" ||
    storedValue === "combined"
    ? storedValue
    : fallback;
}

function normalizeStoredMapLayers(
  storedValue: unknown,
  fallback: Record<MapLayerKey, boolean>,
) {
  if (!storedValue || typeof storedValue !== "object") return fallback;
  const stored = storedValue as Partial<Record<MapLayerKey, boolean>>;
  return Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => [
      key,
      typeof stored[key as MapLayerKey] === "boolean"
        ? stored[key as MapLayerKey]
        : value,
    ]),
  ) as Record<MapLayerKey, boolean>;
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

function projectRouteBadgesHtml(transitRouteKeys: string, routes: string) {
  const badges = transitRouteKeys
    .split(",")
    .filter(Boolean)
    .flatMap((key) => {
      const route = TRANSIT_ROUTE_FILTERS.find((candidate) => candidate.key === key);
      if (!route) return [];
      return route.imagePaths.map(
        (imagePath) => `
          <img
            alt="${escapeHtml(route.label)}"
            height="20"
            src="${escapeHtml(imagePath)}"
            style="display:inline-block;height:20px;width:20px;object-fit:contain"
            title="${escapeHtml(route.label)}"
            width="20"
          />
        `,
      );
    });

  if (badges.length > 0) return badges.join("");
  return routes
    .split(",")
    .filter(Boolean)
    .map(routeBadgeHtml)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
