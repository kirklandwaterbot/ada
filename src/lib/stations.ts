import accessibilityData from "../../data/accessibility-stations.json";
import accessibleCoordinates from "../../data/accessible-station-coordinates.json";
import plannedCoordinates from "../../data/planned-ada-station-coordinates.json";
import {
  formatStationDescription,
  formatStationLineDisplay,
  getAssetRoutes,
} from "@/lib/asset-display";
import type { MtaAsset } from "@/lib/mta-assets";

export type Station = (typeof accessibilityData.stations)[number];
export type EquipmentState = "operational" | "outage" | "work" | "unknown";

export const stations = accessibilityData.stations;
export const stationSummary = accessibilityData.summary;

export function getStationSlug(station: Station) {
  return slugify(
    [station.station, station.line, station.services.join("-")].join("-"),
  );
}

export function getStationBySlug(slug: string) {
  return stations.find((station) => getStationSlug(station) === slug);
}

export function getStationAssets(station: Station, assets: MtaAsset[]) {
  const stationName = normalizeStationValue(station.station);
  const stationLine = normalizeStationValue(
    formatStationLineDisplay(station.line),
  );
  const stationRoutes = new Set(station.services.map(normalizeRoute));

  return assets.filter((asset) => {
    const assetName = normalizeStationValue(
      formatStationDescription(asset.station_description, asset.station_name),
    );

    if (!stationNamesMatch(stationName, assetName)) {
      return false;
    }

    const assetLines = (asset.station_line || asset.subway_line || "")
      .split(",")
      .map((line) => normalizeStationValue(formatStationLineDisplay(line)))
      .filter(Boolean);
    const lineMatches = assetLines.some(
      (line) => line === stationLine || line.includes(stationLine) || stationLine.includes(line),
    );
    const routeMatches = getAssetRoutes(asset)
      .map(normalizeRoute)
      .some((route) => stationRoutes.has(route));

    return lineMatches || routeMatches || stationRoutes.size === 0;
  });
}

export function getEquipmentState(asset: MtaAsset): EquipmentState {
  const code = asset.service_status_code?.trim().toUpperCase() ?? "";
  const statusText = [
    asset.service_status,
    asset.notes,
    asset.alternative_route,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    code === "RNOS" ||
    /\b(out of service|removed|non function|not in service)\b/i.test(statusText)
  ) {
    return "outage";
  }

  if (
    /\b(construction|repair|rehab|rehabilitation|modernization|temporar|closed|closure)\b/i.test(
      statusText,
    )
  ) {
    return "work";
  }

  if (code === "IFIS" || /\bfunctioning|in service\b/i.test(statusText)) {
    return "operational";
  }

  return "unknown";
}

export function getEquipmentCounts(assets: MtaAsset[]) {
  const counts = {
    elevators: 0,
    escalators: 0,
    operational: 0,
    outage: 0,
    total: assets.length,
    unknown: 0,
    work: 0,
  };

  for (const asset of assets) {
    if (asset.elevator_or_escalator === "Elevator") {
      counts.elevators += 1;
    } else if (asset.elevator_or_escalator === "Escalator") {
      counts.escalators += 1;
    }

    counts[getEquipmentState(asset)] += 1;
  }

  return counts;
}

export function getStationEquipmentSummary(station: Station, assets: MtaAsset[]) {
  return getEquipmentCounts(getStationAssets(station, assets));
}

export function getStationCoordinate(station: Station) {
  const stationName = normalizeStationValue(station.station);
  const routeSet = new Set(station.services.map(normalizeRoute));
  const candidates = [
    ...accessibleCoordinates.stations,
    ...plannedCoordinates.stations,
  ];

  const match = candidates.find((candidate) => {
    const sameName =
      normalizeStationValue(candidate.station) === stationName ||
      stationNamesMatch(
        stationName,
        normalizeStationValue(candidate.station),
      );
    const hasSharedRoute = candidate.services
      .map(normalizeRoute)
      .some((route) => routeSet.has(route));

    return sameName && (hasSharedRoute || routeSet.size === 0);
  });

  return match
    ? { latitude: match.latitude, longitude: match.longitude }
    : null;
}

export function getAccessibilityTone(station: Station) {
  if (station.accessibilityStatus === "Accessible") {
    return "accessible" as const;
  }

  if (station.accessibilityStatus === "Partially accessible") {
    return "partial" as const;
  }

  if (station.plannedAda) {
    return "planned" as const;
  }

  return "not-accessible" as const;
}

export function formatRidership(value: number | null) {
  if (value === null) return "Not listed";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    notation: value >= 100_000 ? "compact" : "standard",
  }).format(value);
}

export function normalizeStationValue(value?: string) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(station|complex)\b/g, " ")
    .replace(/\bavenue\b/g, "av")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\broad\b/g, "rd")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRoute(value: string) {
  return value.trim().toUpperCase().replace("6X", "6").replace("7X", "7");
}

function stationNamesMatch(left: string, right: string) {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const aliases: Record<string, string[]> = {
    "borough hall": ["borough hall court st"],
    "court sq 23 st": ["court sq"],
    "14 st 6 av": ["14 st sixth av"],
    "south ferry": ["whitehall st south ferry"],
  };

  return (
    aliases[left]?.includes(right) === true ||
    aliases[right]?.includes(left) === true
  );
}

function slugify(value: string) {
  return normalizeStationValue(value).replace(/\s+/g, "-");
}
