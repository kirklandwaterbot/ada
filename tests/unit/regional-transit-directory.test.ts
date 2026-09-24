import { describe, expect, it } from "vitest";
import { createStationExplorerData } from "@/lib/station-explorer-data";
import {
  getRegionalStationBySlug,
  getRegionalStationSlug,
  regionalEquipmentRecords,
  regionalStations,
  regionalSystemSummaries,
} from "@/lib/regional-transit-data";
import { getRegionalStationServices } from "@/lib/regional-station-merge";
import { stations } from "@/lib/stations";

describe("regional station directory", () => {
  it("adds every canonical regional station to the shared directory", () => {
    const records = createStationExplorerData([]).stationRecords;

    expect(records).toHaveLength(stations.length + regionalStations.length);
    expect(records.filter((record) => record.station.agency !== "NYCTA")).toHaveLength(
      regionalStations.length,
    );
  });

  it("publishes unique, resolvable slugs for every regional station", () => {
    const slugs = regionalStations.map(getRegionalStationSlug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(getRegionalStationBySlug(slug)).not.toBeNull();
    }
  });

  it("links equipment at shared terminals to the canonical merged profile", () => {
    for (const equipment of regionalEquipmentRecords) {
      expect(
        getRegionalStationBySlug(equipment.stationSlug),
        `${equipment.agency} ${equipment.stationName} ${equipment.unitId}`,
      ).not.toBeNull();
    }
  });

  it("combines LIRR and AirTrain service at Jamaica", () => {
    const jamaica = regionalStations.find((station) => station.name === "Jamaica");

    expect(jamaica).toBeDefined();
    expect(new Set(getRegionalStationServices(jamaica!).map((service) => service.agency))).toEqual(
      new Set(["LIRR", "JFK AirTrain"]),
    );
  });

  it("summarizes every connected regional operator", () => {
    expect(new Set(regionalSystemSummaries.map((summary) => summary.agency))).toEqual(
      new Set([
        "CTrail",
        "EWR AirTrain",
        "JFK AirTrain",
        "LIRR",
        "MNR",
        "NJ Transit",
        "PATH",
      ]),
    );
  });
});
