import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type AirTrainStation = {
  accessibilityStatus: "Accessible";
  agency: "EWR AirTrain";
  elevators: Array<{ status: "unknown" }>;
  escalators: Array<{ status: "unknown" }>;
  latitude: number;
  longitude: number;
  name: string;
  stationCode: string;
};

const accessibilityData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "ewr-airtrain-accessibility.json"),
    "utf8",
  ),
) as {
  metadata: {
    accessibleStationCount: number;
    attribution: string;
    stationCount: number;
  };
  stations: AirTrainStation[];
};
const routeData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public", "data", "ewr-airtrain-routes.geojson"),
    "utf8",
  ),
) as {
  features: Array<{
    geometry: { coordinates: [number, number][]; type: "LineString" };
    properties: { agency: "EWR AirTrain"; color: string; routeId: "AIRTRAIN" };
  }>;
  metadata: { attribution: string };
  type: "FeatureCollection";
};

describe("EWR AirTrain accessibility snapshots", () => {
  it("contains all six current public stations as accessible", () => {
    expect(accessibilityData.metadata.stationCount).toBe(6);
    expect(accessibilityData.metadata.accessibleStationCount).toBe(6);
    expect(accessibilityData.metadata.attribution).toContain("OpenStreetMap");
    expect(new Set(accessibilityData.stations.map((station) => station.name))).toEqual(
      new Set([
        "Newark RailLink",
        "EWR P4",
        "EWR Terminal C",
        "EWR Terminal B",
        "EWR P3",
        "EWR Terminal A",
      ]),
    );
    expect(
      accessibilityData.stations.every(
        (station) =>
          station.agency === "EWR AirTrain" &&
          station.accessibilityStatus === "Accessible" &&
          station.elevators[0]?.status === "unknown" &&
          station.escalators[0]?.status === "unknown" &&
          Number.isFinite(station.latitude) &&
          Number.isFinite(station.longitude),
      ),
    ).toBe(true);
  });

  it("contains attributed AirTrain Newark route geometry", () => {
    expect(routeData.type).toBe("FeatureCollection");
    expect(routeData.metadata.attribution).toContain("OpenStreetMap");
    expect(routeData.features.length).toBeGreaterThan(0);
    expect(
      routeData.features.every(
        (feature) =>
          feature.properties.agency === "EWR AirTrain" &&
          feature.properties.routeId === "AIRTRAIN" &&
          feature.properties.color === "#C81858" &&
          feature.geometry.coordinates.length >= 2,
      ),
    ).toBe(true);
  });
});
