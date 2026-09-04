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
  ridershipLabel: string;
  slug: string;
  station: Station;
  tone: ReturnType<typeof getAccessibilityTone>;
};

export function createStationExplorerData(assets: MtaAsset[]) {
  const stationRecords = stations.map((station): StationExplorerRecord => {
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

    return {
      equipment: getEquipmentCounts(stationAssets),
      focusDetail: focusAssetCode
        ? { code: focusAssetCode, kind: "asset" }
        : hasStationCoordinate
          ? { key: stationFocusKey, kind: "station" }
          : null,
      lineDisplay,
      ridershipLabel: formatRidership(station.ridership2024),
      slug: getStationSlug(station),
      station,
      tone: getAccessibilityTone(station),
    };
  });
  const mapAssets = assets.flatMap((asset): AssetMapMarker[] => {
    const coordinates = getAssetCoordinates(asset);

    if (!coordinates) {
      return [];
    }

    return [
      {
        ada: asset.ada_compliant || "-",
        code: asset.equipment_code,
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

  return { mapAssets, stationRecords };
}
