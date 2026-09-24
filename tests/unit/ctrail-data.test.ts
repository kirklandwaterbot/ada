import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const accessibilityData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "ctrail-accessibility.json"),
    "utf8",
  ),
);
const routeData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public", "data", "ctrail-routes.geojson"),
    "utf8",
  ),
);
const mnrData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "mta-regional-rail-accessibility.json"),
    "utf8",
  ),
);

describe("CTrail accessibility snapshots", () => {
  it("contains both CTrail services and current elevator equipment", () => {
    const stations = accessibilityData.stations;

    expect(stations.length).toBeGreaterThanOrEqual(15);
    expect(
      stations.some((station: { branchId: string }) =>
        station.branchId.includes("HART"),
      ),
    ).toBe(true);
    expect(
      stations.some((station: { branchId: string }) =>
        station.branchId.includes("SLE"),
      ),
    ).toBe(true);
    expect(
      stations.some(
        (station: { elevators: Array<{ status: string }> }) =>
          station.elevators.length > 0 &&
          station.elevators.every((equipment) =>
            ["operational", "outage"].includes(equipment.status),
          ),
      ),
    ).toBe(true);
  });

  it("matches the stations listed on CTrail's live elevator-status page", () => {
    const stationsWithElevators = accessibilityData.stations
      .filter((station: { elevators: unknown[] }) => station.elevators.length > 0)
      .map((station: { name: string }) => station.name);

    expect(stationsWithElevators).toEqual(
      expect.arrayContaining([
        "Berlin",
        "Branford",
        "Clinton",
        "Guilford",
        "Hartford Union Station",
        "Meriden",
        "New Haven State Street",
        "New Haven Union Station",
        "Old Saybrook",
        "Springfield Union Station",
        "Wallingford",
        "Westbrook",
      ]),
    );
    expect(stationsWithElevators).toHaveLength(
      accessibilityData.metadata.equipmentStationCount,
    );
  });

  it("uses GTFS and track geometry for the complete CTrail network", () => {
    const routeIds = new Set(
      routeData.features.map(
        (feature: { properties: { routeId: string } }) =>
          feature.properties.routeId,
      ),
    );
    const shoreLineEast = routeData.features.filter(
      (feature: { properties: { routeId: string } }) =>
        feature.properties.routeId === "SLE",
    );

    expect(routeIds).toEqual(new Set(["HART", "SLE"]));
    expect(shoreLineEast.length).toBeGreaterThan(0);
    expect(
      shoreLineEast.some(
        (feature: { properties: { shapeId: string } }) =>
          feature.properties.shapeId.startsWith("osm-"),
      ),
    ).toBe(true);
    expect(
      shoreLineEast.some(
        (feature: { properties: { shapeId: string } }) =>
          feature.properties.shapeId.startsWith("mnr-through-"),
      ),
    ).toBe(true);
  });

  it("keeps every station on its rendered line instead of drawing straight-line shortcuts", () => {
    for (const station of accessibilityData.stations) {
      const stationRouteIds = station.branchId.split(",");
      const stationRoutes = routeData.features.filter(
        (feature: { properties: { routeId: string } }) =>
          stationRouteIds.includes(feature.properties.routeId),
      );
      const nearestRouteDistance = Math.min(
        ...stationRoutes.map(
          (feature: { geometry: { coordinates: [number, number][] } }) =>
            distanceToLineKm(
              [station.longitude, station.latitude],
              feature.geometry.coordinates,
            ),
        ),
      );

      expect(stationRoutes.length, `${station.name} route coverage`).toBeGreaterThan(0);
      expect(
        nearestRouteDistance,
        `${station.name} distance from ${station.branchId} geometry`,
      ).toBeLessThan(0.1);
    }
  });

  it("includes every core and scheduled through Shore Line East stop", () => {
    const shoreLineEastStations = accessibilityData.stations
      .filter((station: { branchId: string }) =>
        station.branchId.split(",").includes("SLE"),
      )
      .map((station: { name: string }) => station.name)
      .sort();

    expect(shoreLineEastStations).toEqual(
      [
        "Branford",
        "Bridgeport",
        "Clinton",
        "Guilford",
        "Madison",
        "Milford",
        "New Haven State Street",
        "New Haven Union Station",
        "New London",
        "Old Saybrook",
        "Stamford",
        "Stratford",
        "West Haven",
        "Westbrook",
      ].sort(),
    );
  });

  it("keeps shared New Haven Line records within the same station area", () => {
    const ctrailByName = new Map<
      string,
      { latitude: number; longitude: number; name: string }
    >(
      accessibilityData.stations.map(
        (station: { latitude: number; longitude: number; name: string }) => [
          station.name,
          station,
        ],
      ),
    );
    const mnrAliases: Record<string, string> = {
      Bridgeport: "Bridgeport",
      Milford: "Milford",
      "New Haven State Street": "New Haven-State St",
      "New Haven Union Station": "New Haven",
      Stamford: "Stamford",
      Stratford: "Stratford",
      "West Haven": "West Haven",
    };

    for (const [ctrailName, mnrName] of Object.entries(mnrAliases)) {
      const ctrail = ctrailByName.get(ctrailName);
      const mnr = mnrData.stations.find(
        (station: { agency: string; name: string }) =>
          station.agency === "MNR" && station.name === mnrName,
      );

      expect(ctrail, ctrailName).toBeDefined();
      expect(mnr, mnrName).toBeDefined();
      expect(
        distanceKm(
          [ctrail!.longitude, ctrail!.latitude],
          [mnr.longitude, mnr.latitude],
        ),
        `${ctrailName} coordinate drift`,
      ).toBeLessThan(0.5);
    }
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
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    nearest = Math.min(
      nearest,
      distanceToSegmentKm(point, coordinates[index - 1], coordinates[index]),
    );
  }
  return nearest;
}

function distanceToSegmentKm(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitude = toRadians(point[1]);
  const project = ([longitude, projectedLatitude]: [number, number]) => [
    toRadians(longitude - point[0]) * Math.cos(latitude) * earthRadiusKm,
    toRadians(projectedLatitude - point[1]) * earthRadiusKm,
  ];
  const [startX, startY] = project(start);
  const [endX, endY] = project(end);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const segmentLengthSquared = deltaX ** 2 + deltaY ** 2;
  const projection =
    segmentLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            -(startX * deltaX + startY * deltaY) / segmentLengthSquared,
          ),
        );
  return Math.hypot(
    startX + projection * deltaX,
    startY + projection * deltaY,
  );
}
