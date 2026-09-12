import { describe, expect, it } from "vitest";
import {
  getStationBySlug,
  getStationCoordinate,
  getStationSearchAliases,
  stationSummary,
  stations,
} from "@/lib/stations";

describe("149 St-Hostos accessibility update", () => {
  it("marks both connected line groups accessible from September 11, 2026", () => {
    const hostosStations = stations.filter(
      (station) => station.station === "149 St-Hostos",
    );

    expect(hostosStations).toHaveLength(2);
    expect(hostosStations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accessibilityStatus: "Accessible",
          dateMadeAccessible: "September 11, 2026",
          plannedAda: false,
          services: ["4"],
        }),
        expect.objectContaining({
          accessibilityStatus: "Accessible",
          dateMadeAccessible: "September 11, 2026",
          plannedAda: false,
          services: ["2", "5"],
        }),
      ]),
    );
    expect(stationSummary).toMatchObject({
      accessible: 161,
      notAccessible: 322,
      plannedAda: 102,
    });
  });

  it("uses the official GTFS coordinates for both station components", () => {
    const fourTrainStation = stations.find(
      (station) =>
        station.station === "149 St-Hostos" && station.services.includes("4"),
    );
    const twoFiveStation = stations.find(
      (station) =>
        station.station === "149 St-Hostos" && station.services.includes("2"),
    );

    expect(fourTrainStation).toBeDefined();
    expect(twoFiveStation).toBeDefined();
    expect(getStationCoordinate(fourTrainStation!)).toEqual({
      latitude: 40.818375,
      longitude: -73.927351,
    });
    expect(getStationCoordinate(twoFiveStation!)).toEqual({
      latitude: 40.81841,
      longitude: -73.926718,
    });
  });

  it("keeps legacy Grand Concourse detail links working", () => {
    expect(
      getStationBySlug("149-st-grand-concourse-jerome-av-line-4")?.station,
    ).toBe("149 St-Hostos");
    expect(
      getStationBySlug(
        "149-st-grand-concourse-white-plains-rd-line-2-5",
      )?.station,
    ).toBe("149 St-Hostos");
    expect(
      getStationSearchAliases(
        stations.find(
          (station) =>
            station.station === "149 St-Hostos" &&
            station.services.includes("4"),
        )!,
      ),
    ).toContain("149 St-Grand Concourse");
  });
});
