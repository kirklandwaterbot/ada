import { describe, expect, it } from "vitest";
import {
  getEquipmentState,
  getStationBySlug,
  getStationCoordinate,
  getStationSearchAliases,
  stationSummary,
  stations,
} from "@/lib/stations";
import type { MtaAsset } from "@/lib/mta-assets";

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

  it("focuses both station components on one consolidated complex marker", () => {
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
      longitude: -73.92735,
    });
    expect(getStationCoordinate(twoFiveStation!)).toEqual({
      latitude: 40.818375,
      longitude: -73.92735,
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

describe("Beach 90 St service", () => {
  it("lists both A and Rockaway Shuttle service", () => {
    const beach90 = stations.find((station) => station.station === "Beach 90 St");

    expect(beach90?.services).toEqual(["A", "SR"]);
  });
});

describe("live subway equipment status", () => {
  it("marks a current outage unavailable without treating future work as current", () => {
    const base = {
      ada_compliant: "YES",
      elevator_or_escalator: "Elevator",
      equipment_code: "EL1",
      service_status_code: "IFIS",
    } as MtaAsset;

    expect(
      getEquipmentState({
        ...base,
        current_outage: "YES",
        live_equipment_status: "outage",
      }),
    ).toBe("outage");
    expect(
      getEquipmentState({
        ...base,
        current_outage: "NO",
        future_outage: "YES",
        live_equipment_status: "operational",
      }),
    ).toBe("operational");
  });
});
