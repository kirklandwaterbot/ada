import { describe, expect, it } from "vitest";
import {
  formatStationDescription,
  getAssetCoordinates,
} from "@/lib/asset-display";
import { createStationExplorerData } from "@/lib/station-explorer-data";
import type { MtaAsset } from "@/lib/mta-assets";

describe("asset coordinate corrections", () => {
  it("keeps EL487 at Rockaway Blvd when the upstream point is wrong", () => {
    const asset = {
      asset_class: "Elevator Traction",
      elevator_or_escalator: "Elevator",
      equipment_code: "EL487",
      station_description: "Rockaway Blvd - Station",
      x_coordinate: "40.768143",
      y_coordinate: "-73.84487",
    } satisfies MtaAsset;

    expect(getAssetCoordinates(asset)).toEqual({
      latitude: 40.680429,
      longitude: -73.843853,
    });
  });

  it.each(["EL521", "EL522"])(
    "keeps %s at Parkchester when the upstream point is wrong",
    (equipmentCode) => {
      const asset = {
        asset_class: "Elevator Traction",
        elevator_or_escalator: "Elevator",
        equipment_code: equipmentCode,
        station_description: "Parkchester - Station",
        x_coordinate: "40.880028",
        y_coordinate: "-73.88435",
      } satisfies MtaAsset;

      expect(getAssetCoordinates(asset)).toEqual({
        latitude: 40.833333,
        longitude: -73.860972,
      });
    },
  );
});

describe("149 St-Hostos equipment display", () => {
  it("uses the current station name for legacy Grand Concourse inventory rows", () => {
    expect(
      formatStationDescription(
        "149 St-Grand Concourse - Station",
        "149ST-GRANDCONCOURSE-JER-4",
      ),
    ).toBe("149 St-Hostos");
  });

  it("exposes all three elevator IDs when their map coordinates overlap", () => {
    const assets = ["EL100", "EL101", "EL102"].map(
      (equipmentCode) =>
        ({
          ada_compliant: "YES",
          asset_class: "Elevator Hydraulic",
          elevator_or_escalator: "Elevator",
          equipment_code: equipmentCode,
          station_description: "149 St-Grand Concourse - Station",
          station_name: "149ST-GRANDCONCOURSE-JER-4",
          station_services: "2,4,5",
          subway_line: "IRT-J-JEROMEAV",
          x_coordinate: "40.818375",
          y_coordinate: "-73.92735",
        }) satisfies MtaAsset,
    );

    const hostosMarkers = createStationExplorerData(assets).mapAssets.filter(
      (marker) => marker.station === "149 St-Hostos",
    );

    expect(hostosMarkers).toHaveLength(3);
    expect(
      hostosMarkers.every(
        (marker) => marker.equipmentCodesAtLocation === "EL100,EL101,EL102",
      ),
    ).toBe(true);
  });
});
