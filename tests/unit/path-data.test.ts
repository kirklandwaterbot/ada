import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type PathEquipment = {
  status: "long_term_outage" | "operational" | "outage" | "unknown";
};

type PathStation = {
  accessibilityStatus: "Accessible" | "Not accessible";
  agency: "PATH";
  elevators: PathEquipment[];
  escalators: PathEquipment[];
  latitude: number;
  longitude: number;
  branchName: string;
  serviceAlert: string;
  stationCode: string;
};

const accessibilityData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "path-accessibility.json"),
    "utf8",
  ),
) as {
  metadata: {
    accessibleStationCount: number;
    stationCount: number;
  };
  stations: PathStation[];
};

const routeData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public", "data", "path-routes.geojson"),
    "utf8",
  ),
) as {
  features: Array<{
    properties: {
      agency: "PATH";
      color: string;
      description: string;
      offset: number;
      route: string;
      routeId: string;
    };
  }>;
  type: "FeatureCollection";
};

describe("PATH accessibility snapshots", () => {
  it("contains all 13 unique PATH stations and the official accessible count", () => {
    const stationIds = accessibilityData.stations.map(
      (station) => `${station.agency}:${station.stationCode}`,
    );
    const accessibleStations = accessibilityData.stations.filter(
      (station) => station.accessibilityStatus === "Accessible",
    );

    expect(accessibilityData.metadata.stationCount).toBe(13);
    expect(accessibilityData.stations).toHaveLength(13);
    expect(new Set(stationIds).size).toBe(13);
    expect(accessibilityData.metadata.accessibleStationCount).toBe(9);
    expect(accessibleStations).toHaveLength(9);
    expect(
      accessibilityData.stations.every(
        (station) =>
          Number.isFinite(station.latitude) && Number.isFinite(station.longitude),
      ),
    ).toBe(true);
  });

  it("associates each service alert with an affected vertical-transit status", () => {
    const stationsWithAlerts = accessibilityData.stations.filter(
      (station) => station.serviceAlert.length > 0,
    );

    expect(
      stationsWithAlerts.every((station) =>
        [...station.elevators, ...station.escalators].some(
          (equipment) =>
            equipment.status === "outage" ||
            equipment.status === "long_term_outage",
        ),
      ),
    ).toBe(true);
  });

  it("matches the PATH status-page elevator and escalator inventory", () => {
    const elevatorStations = accessibilityData.stations
      .filter((station) => station.elevators.length > 0)
      .map((station) => station.stationCode);
    const escalatorStations = accessibilityData.stations
      .filter((station) => station.escalators.length > 0)
      .map((station) => station.stationCode);

    expect(elevatorStations).toEqual(
      expect.arrayContaining(["NWK", "HAR", "JSQ", "GRV", "EXP", "WTC", "NEW", "HOB", "33S"]),
    );
    expect(escalatorStations).toEqual(
      expect.arrayContaining(["NWK", "HAR", "JSQ", "GRV", "EXP", "WTC", "NEW"]),
    );
  });

  it("contains official PATH route geometry with valid colors", () => {
    expect(routeData.type).toBe("FeatureCollection");
    expect(routeData.features.length).toBeGreaterThanOrEqual(4);
    expect(
      routeData.features.every(
        (feature) =>
          feature.properties.agency === "PATH" &&
          /^#[0-9A-F]{6}$/.test(feature.properties.color),
      ),
    ).toBe(true);
    expect(
      new Set(routeData.features.map((feature) => feature.properties.routeId)),
    ).toEqual(new Set(["BLU", "GRE", "RED", "YEL"]));
    expect(
      Object.fromEntries(
        routeData.features.map((feature) => [
          feature.properties.routeId,
          feature.properties.route,
        ]),
      ),
    ).toEqual({
      BLU: "HOB-33",
      GRE: "HOB-WTC",
      RED: "NWK-WTC",
      YEL: "JSQ-33",
    });
    expect(
      routeData.features.every((feature) =>
        Number.isFinite(feature.properties.offset),
      ),
    ).toBe(true);
    expect(
      accessibilityData.stations.every(
        (station) => !/\b(?:red|blue|green|yellow)(?: line)?\b/i.test(station.branchName),
      ),
    ).toBe(true);
  });
});
