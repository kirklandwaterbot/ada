import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type RegionalStation = {
  accessMethods: string[];
  accessibilityStatus: string;
  agency: "LIRR" | "MNR";
  latitude: number;
  longitude: number;
  name: string;
  serviceRouteIds: string[];
  stationCode: string;
};

const accessibilityData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "mta-regional-rail-accessibility.json"),
    "utf8",
  ),
) as {
  metadata: { officialAccessibleStations: Record<"LIRR" | "MNR", number> };
  stations: RegionalStation[];
};
const routeData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public", "data", "mta-regional-rail-routes.geojson"),
    "utf8",
  ),
) as {
  features: Array<{
    geometry: { coordinates: [number, number][]; type: "LineString" };
    properties: {
      agency: "LIRR" | "MNR";
      color: string;
      routeId: string;
      shapeId: string;
    };
  }>;
  type: "FeatureCollection";
};

describe("MTA regional rail snapshots", () => {
  it("contains unique, mappable LIRR and Metro-North stations", () => {
    const stationIds = accessibilityData.stations.map(
      (station) => `${station.agency}:${station.stationCode}`,
    );

    expect(accessibilityData.stations.length).toBeGreaterThan(200);
    expect(new Set(stationIds).size).toBe(stationIds.length);
    expect(new Set(accessibilityData.stations.map((station) => station.agency))).toEqual(
      new Set(["LIRR", "MNR"]),
    );
    expect(
      accessibilityData.stations.every(
        (station) =>
          Number.isFinite(station.latitude) && Number.isFinite(station.longitude),
      ),
    ).toBe(true);
    expect(
      accessibilityData.stations.every((station) =>
        ["Accessible", "Partially accessible", "Not accessible", "Unknown"].includes(
          station.accessibilityStatus,
        ),
      ),
    ).toBe(true);
  });

  it("uses the current official MTA ramp-or-elevator station list", () => {
    const byAgencyAndName = new Map(
      accessibilityData.stations.map((station) => [
        `${station.agency}:${station.name}`,
        station,
      ]),
    );
    const accessibleCounts = Object.fromEntries(
      ["LIRR", "MNR"].map((agency) => [
        agency,
        accessibilityData.stations.filter(
          (station) =>
            station.agency === agency &&
            station.accessibilityStatus === "Accessible",
        ).length,
      ]),
    );

    expect(accessibleCounts).toEqual(
      accessibilityData.metadata.officialAccessibleStations,
    );
    expect(accessibleCounts.LIRR).toBeGreaterThanOrEqual(110);
    expect(accessibleCounts.MNR).toBeGreaterThanOrEqual(70);
    expect(
      byAgencyAndName.get("LIRR:Kew Gardens")?.accessibilityStatus,
    ).toBe("Accessible");
    expect(
      byAgencyAndName.get("LIRR:Douglaston")?.accessibilityStatus,
    ).toBe("Accessible");
    expect(
      byAgencyAndName.get("LIRR:Cold Spring Harbor")?.accessibilityStatus,
    ).toBe("Not accessible");
    expect(
      byAgencyAndName.get("LIRR:Yaphank-BNL")?.accessibilityStatus,
    ).toBe("Accessible");
    expect(
      accessibilityData.stations
        .filter((station) => station.accessibilityStatus === "Accessible")
        .every((station) => station.accessMethods.length > 0),
    ).toBe(true);
  });

  it("stores actual GTFS services for City Terminal Zone stations", () => {
    const byAgencyAndName = new Map(
      accessibilityData.stations.map((station) => [
        `${station.agency}:${station.name}`,
        station,
      ]),
    );

    expect(byAgencyAndName.get("LIRR:Long Island City")?.serviceRouteIds).toEqual([
      "3",
      "5",
      "10",
    ]);
    expect(byAgencyAndName.get("LIRR:Long Island City")?.serviceRouteIds).not.toContain(
      "12",
    );
    expect(byAgencyAndName.get("MNR:Grand Central")?.serviceRouteIds).toEqual(
      expect.arrayContaining(["1", "2", "3", "4", "5"]),
    );
    expect(
      byAgencyAndName.get("LIRR:Grand Central Madison")?.serviceRouteIds,
    ).toEqual(expect.arrayContaining(["1", "2", "4", "6", "7", "8", "9", "10"]));
    expect(byAgencyAndName.has("LIRR:Grand Central")).toBe(false);
  });

  it("contains route geometry and valid colors for both railroads", () => {
    expect(routeData.type).toBe("FeatureCollection");
    expect(routeData.features.length).toBeGreaterThan(100);
    expect(new Set(routeData.features.map((feature) => feature.properties.agency))).toEqual(
      new Set(["LIRR", "MNR"]),
    );
    expect(
      routeData.features.every((feature) =>
        /^#[0-9A-F]{6}$/.test(feature.properties.color),
      ),
    ).toBe(true);
  });

  it("includes the Belmont Park branch and rejects implausible straight-line jumps", () => {
    const belmontFeatures = routeData.features.filter(
      (feature) =>
        feature.properties.agency === "LIRR" &&
        feature.properties.routeId === "BT",
    );
    expect(
      new Set(belmontFeatures.map((feature) => feature.properties.shapeId)),
    ).toEqual(
      new Set([
        "mta-gtfs-belmont-park-penn",
        "mta-gtfs-belmont-park-grand-central",
      ]),
    );
    expect(
      belmontFeatures.every(
        (feature) =>
          !feature.geometry.coordinates.some(
            ([longitude, latitude]) =>
              longitude === -73.731559 && latitude === 40.718578,
          ),
      ),
    ).toBe(true);

    for (const stationName of [
      "Belmont Park",
      "Jamaica",
      "Woodside",
      "Penn Station",
      "Grand Central Madison",
    ]) {
      const station = accessibilityData.stations.find(
        (candidate) =>
          candidate.agency === "LIRR" && candidate.name === stationName,
      );
      expect(station?.serviceRouteIds, stationName).toContain("BT");
      expect(
        Math.min(
          ...belmontFeatures.map((feature) =>
            distanceToLineKm(
              [station!.longitude, station!.latitude],
              feature.geometry.coordinates,
            ),
          ),
        ),
        `${stationName} Belmont Park geometry`,
      ).toBeLessThan(0.5);
    }

    const longestSegmentKm = Math.max(
      ...routeData.features.flatMap((feature) =>
        feature.geometry.coordinates.slice(1).map((coordinate, index) =>
          distanceKm(feature.geometry.coordinates[index], coordinate),
        ),
      ),
    );
    expect(longestSegmentKm).toBeLessThanOrEqual(20);

    const harlemFeatures = routeData.features.filter(
      (feature) =>
        feature.properties.agency === "MNR" &&
        feature.properties.routeId === "2",
    );
    const waterburyFeatures = routeData.features.filter(
      (feature) =>
        feature.properties.agency === "MNR" &&
        feature.properties.routeId === "6",
    );
    expect(harlemFeatures.length).toBeGreaterThan(0);
    expect(
      harlemFeatures.every((feature) =>
        feature.properties.shapeId.startsWith("osm-"),
      ),
    ).toBe(true);
    expect(waterburyFeatures.length).toBeGreaterThan(0);
    expect(
      waterburyFeatures.every(
        (feature) =>
          feature.properties.shapeId.startsWith("osm-") ||
          feature.properties.shapeId ===
            "mta-gtfs-waterbury-bridgeport-connector",
      ),
    ).toBe(true);
  });

  it("connects the Waterbury service from Bridgeport to the physical branch", () => {
    const waterburyFeatures = routeData.features.filter(
      (feature) =>
        feature.properties.agency === "MNR" &&
        feature.properties.routeId === "6",
    );
    const connector = waterburyFeatures.find(
      (feature) =>
        feature.properties.shapeId ===
        "mta-gtfs-waterbury-bridgeport-connector",
    );
    const bridgeport: [number, number] = [-73.186724, 41.177594];
    const waterbury: [number, number] = [-73.047065, 41.554447];

    expect(connector).toBeDefined();
    expect(
      Math.min(
        ...waterburyFeatures.flatMap((feature) =>
          feature.geometry.coordinates.map((coordinate) =>
            distanceKm(coordinate, bridgeport),
          ),
        ),
      ),
    ).toBeLessThan(0.5);
    expect(
      Math.min(
        ...waterburyFeatures.flatMap((feature) =>
          feature.geometry.coordinates.map((coordinate) =>
            distanceKm(coordinate, waterbury),
          ),
        ),
      ),
    ).toBeLessThan(1);
  });
});

function distanceKm(
  [longitudeA, latitudeA]: [number, number],
  [longitudeB, latitudeB]: [number, number],
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(haversine));
}

function distanceToLineKm(
  point: [number, number],
  coordinates: [number, number][],
) {
  return Math.min(
    ...coordinates.slice(1).map((end, index) => {
      const start = coordinates[index];
      const longitudeDelta = end[0] - start[0];
      const latitudeDelta = end[1] - start[1];
      const lengthSquared = longitudeDelta ** 2 + latitudeDelta ** 2;
      const projection =
        lengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((point[0] - start[0]) * longitudeDelta +
                  (point[1] - start[1]) * latitudeDelta) /
                  lengthSquared,
              ),
            );
      return distanceKm(point, [
        start[0] + longitudeDelta * projection,
        start[1] + latitudeDelta * projection,
      ]);
    }),
  );
}
