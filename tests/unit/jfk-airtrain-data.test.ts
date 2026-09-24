import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const accessibilityData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "jfk-airtrain-accessibility.json"),
    "utf8",
  ),
);
const routeData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public", "data", "jfk-airtrain-routes.geojson"),
    "utf8",
  ),
);

describe("JFK AirTrain accessibility snapshots", () => {
  it("contains nine accessible stations", () => {
    expect(accessibilityData.metadata.stationCount).toBe(9);
    expect(
      accessibilityData.stations.every(
        (station: { accessibilityStatus: string; agency: string }) =>
          station.agency === "JFK AirTrain" &&
          station.accessibilityStatus === "Accessible",
      ),
    ).toBe(true);
  });

  it("prefixes airport terminals while retaining Jamaica as the interchange name", () => {
    const names = accessibilityData.stations.map(
      (station: { name: string }) => station.name,
    );

    expect(names.filter((name: string) => name.startsWith("JFK Terminal "))).toHaveLength(5);
    expect(names).toContain("Jamaica");
    expect(names.some((name: string) => /^Terminal\s/i.test(name))).toBe(false);
  });

  it("contains the three current map services", () => {
    expect(
      new Set(
        routeData.features.map(
          (feature: { properties: { routeId: string } }) =>
            feature.properties.routeId,
        ),
      ),
    ).toEqual(new Set(["HOWARD", "JAMAICA", "TERMINALS"]));
  });

  it("keeps Howard Beach service connected through the airport terminal loop", () => {
    const howard = routeData.features.find(
      (feature: { properties: { routeId: string } }) =>
        feature.properties.routeId === "HOWARD",
    );
    const coordinates = howard.geometry.coordinates.flat(2) as number[];
    const longitudeValues = coordinates.filter((_, index) => index % 2 === 0);
    const latitudeValues = coordinates.filter((_, index) => index % 2 === 1);

    expect(Math.max(...longitudeValues)).toBeGreaterThan(-73.79);
    expect(Math.min(...latitudeValues)).toBeLessThan(40.65);
  });
});
