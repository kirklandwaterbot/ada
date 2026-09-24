import {
  formatAssetCellValue,
  formatStationDescription,
  formatStationLineDisplay,
  formatSubwayLine,
  getAssetCoordinates,
  getAssetMapStatus,
  getAssetRoutes,
  type AssetMapStatus,
} from "@/lib/asset-display";
import type { MapFocusDetail } from "@/lib/map-focus";
import type { MtaAsset } from "@/lib/mta-assets";
import {
  getRegionalAgencyLabel,
  getRegionalStationFocusKey,
  getRegionalStationSlug,
  regionalStations,
  type RegionalStation,
} from "@/lib/regional-transit-data";
import {
  getRegionalTransitBranding,
  type RegionalTransitAgency,
  type RegionalTransitBadge,
} from "@/lib/regional-transit-branding";
import { getRegionalStationServices } from "@/lib/regional-station-merge";
import {
  formatRidership,
  getAccessibilityTone,
  getEquipmentCounts,
  getStationAssets,
  getStationCoordinate,
  getStationSlug,
  stations,
  type Station,
} from "@/lib/stations";

export type AssetMapMarker = {
  ada: string;
  code: string;
  equipmentCodesAtLocation: string;
  currentOutage: boolean;
  currentOutageDetails: string;
  futureOutage: boolean;
  futureOutageDetails: string;
  latitude: number;
  line: string;
  longitude: number;
  routes: string;
  station: string;
  status: AssetMapStatus;
  type: string;
};

export type StationExplorerRecord = {
  equipment: ReturnType<typeof getEquipmentCounts>;
  focusDetail: MapFocusDetail | null;
  lineDisplay: string;
  locationLabel: string;
  regionalBadges: RegionalTransitBadge[];
  ridershipLabel: string;
  slug: string;
  station: DirectoryStation;
  tone: ReturnType<typeof getAccessibilityTone>;
};

export type DirectoryStation = {
  accessibilityRaw: string;
  accessibilityStatus: Station["accessibilityStatus"] | "Unknown";
  agencies: string[];
  agency: "NYCTA" | RegionalTransitAgency;
  borough: string;
  dateMadeAccessible: string | null;
  division: string;
  line: string;
  neighborhood: string;
  officialUrl: string | null;
  plannedAda: boolean;
  plannedAdaNote: string;
  rank: number | null;
  ridership2024: number | null;
  services: string[];
  station: string;
  stationCode: string;
  stationKey: string;
};

export function createStationExplorerData(assets: MtaAsset[]) {
  const subwayStationRecords = stations.map((station): StationExplorerRecord => {
    const stationAssets = getStationAssets(station, assets);
    const focusAssetCode = stationAssets.find((asset) =>
      Boolean(getAssetCoordinates(asset)),
    )?.equipment_code;
    const lineDisplay = formatStationLineDisplay(station.line);
    const hasStationCoordinate = Boolean(getStationCoordinate(station));
    const stationFocusKey = [
      station.station,
      lineDisplay,
      station.services.join(","),
    ].join("|");

    const directoryStation: DirectoryStation = {
      ...station,
      agencies: ["NYCTA"],
      agency: "NYCTA",
      officialUrl: null,
      stationCode: station.stationKey,
    };

    return {
      equipment: getEquipmentCounts(stationAssets),
      focusDetail: focusAssetCode
        ? { code: focusAssetCode, kind: "asset" }
        : hasStationCoordinate
          ? { key: stationFocusKey, kind: "station" }
          : null,
      lineDisplay,
      locationLabel: `${station.neighborhood} · ${station.borough}`,
      regionalBadges: [],
      ridershipLabel: formatRidership(station.ridership2024),
      slug: getStationSlug(station),
      station: directoryStation,
      tone: getAccessibilityTone(directoryStation),
    };
  });
  const regionalStationRecords = regionalStations.map(toRegionalDirectoryRecord);
  const stationRecords = [...subwayStationRecords, ...regionalStationRecords];
  const mapAssets = assets.flatMap((asset): AssetMapMarker[] => {
    const coordinates = getAssetCoordinates(asset);

    if (!coordinates) {
      return [];
    }

    return [
      {
        ada: asset.ada_compliant || "-",
        code: asset.equipment_code,
        equipmentCodesAtLocation: asset.equipment_code,
        currentOutage: asset.current_outage === "YES",
        currentOutageDetails: asset.current_outage_details || "[]",
        futureOutage: asset.future_outage === "YES",
        futureOutageDetails: asset.future_outage_details || "[]",
        latitude: coordinates.latitude,
        line:
          formatAssetCellValue(asset, "subway_line") ||
          formatSubwayLine(asset.subway_line),
        longitude: coordinates.longitude,
        routes: getAssetRoutes(asset).join(","),
        station: formatStationDescription(
          asset.station_description,
          asset.station_name,
        ),
        status: getAssetMapStatus(asset),
        type: asset.elevator_or_escalator || "-",
      },
    ];
  });

  const equipmentCodesByLocation = new Map<string, string[]>();
  for (const marker of mapAssets) {
    const key = getMapAssetLocationKey(marker);
    const codes = equipmentCodesByLocation.get(key) ?? [];
    codes.push(marker.code);
    equipmentCodesByLocation.set(key, codes);
  }

  for (const codes of equipmentCodesByLocation.values()) {
    codes.sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
  }

  const mapAssetsWithCoLocatedEquipment = mapAssets.map((marker) => ({
    ...marker,
    equipmentCodesAtLocation:
      equipmentCodesByLocation.get(getMapAssetLocationKey(marker))?.join(",") ??
      marker.code,
  }));

  return { mapAssets: mapAssetsWithCoLocatedEquipment, stationRecords };
}

function toRegionalDirectoryRecord(
  station: RegionalStation,
): StationExplorerRecord {
  const services = getRegionalStationServices(station);
  const agencies = [
    ...new Set(services.map((service) => service.agency)),
  ];
  const serviceLabels = [
    ...new Set(services.map((service) => service.branchName)),
  ];
  const regionalBadges = services
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
  const equipment = getRegionalDirectoryEquipmentCounts(station);
  const lineDisplay = serviceLabels.join(" / ") || station.branchName;
  const systemLabel = agencies.map(getRegionalAgencyLabel).join(" + ");
  const directoryStation: DirectoryStation = {
    accessibilityRaw: station.accessibilityStatus,
    accessibilityStatus: station.accessibilityStatus,
    agencies,
    agency: station.agency,
    borough: systemLabel,
    dateMadeAccessible: null,
    division: systemLabel,
    line: lineDisplay,
    neighborhood: lineDisplay,
    officialUrl: station.stationDetailUrl,
    plannedAda: false,
    plannedAdaNote: "",
    rank: null,
    ridership2024: null,
    services: serviceLabels,
    station: station.name,
    stationCode: station.stationCode,
    stationKey: `${station.agency}:${station.stationCode}`,
  };

  return {
    equipment,
    focusDetail: {
      key: getRegionalStationFocusKey(station),
      kind: "regional",
    },
    lineDisplay,
    locationLabel: `${lineDisplay} · ${systemLabel}`,
    regionalBadges,
    ridershipLabel: "Not published",
    slug: getRegionalStationSlug(station),
    station: directoryStation,
    tone: getAccessibilityTone(directoryStation),
  };
}

function getRegionalDirectoryEquipmentCounts(station: RegionalStation) {
  const equipment = [...station.elevators, ...station.escalators];
  return equipment.reduce(
    (counts, item) => {
      if (item.type === "Elevator") counts.elevators += 1;
      if (item.type === "Escalator") counts.escalators += 1;

      if (item.status === "operational") counts.operational += 1;
      else if (
        item.status === "outage" ||
        item.status === "long_term_outage"
      ) {
        counts.outage += 1;
      } else counts.unknown += 1;

      return counts;
    },
    {
      elevators: 0,
      escalators: 0,
      operational: 0,
      outage: 0,
      total: equipment.length,
      unknown: 0,
      work: 0,
    },
  );
}

function getMapAssetLocationKey(marker: AssetMapMarker) {
  return [
    marker.station,
    marker.latitude.toFixed(6),
    marker.longitude.toFixed(6),
  ].join("|");
}
