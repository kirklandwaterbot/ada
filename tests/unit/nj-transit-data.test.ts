import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const accessibilityData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data", "nj-transit-accessibility.json"),
    "utf8",
  ),
);
const routeData = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public", "data", "nj-transit-routes.geojson"),
    "utf8",
  ),
);

type NjTransitStation = {
  accessibilityStatus: string;
  accessMethods: string[];
  branchId: string;
  elevators: Array<{ location: string; status: string; system?: string }>;
  name: string;
  serviceRouteIds: string[];
};

describe("NJ Transit accessibility snapshots", () => {
  it("contains unique rail stations matched to official accessibility data", () => {
    const stations = accessibilityData.stations;
    const ids = stations.map((station: { stationCode: string }) => station.stationCode);

    expect(stations.length).toBeGreaterThanOrEqual(200);
    expect(new Set(ids).size).toBe(ids.length);
    expect(accessibilityData.metadata.matchedAccessibilityCount).toBeGreaterThan(
      stations.length * 0.8,
    );
    expect(
      stations.every(
        (station: { agency: string; latitude: number; longitude: number }) =>
          station.agency === "NJ Transit" &&
          Number.isFinite(station.latitude) &&
          Number.isFinite(station.longitude),
      ),
    ).toBe(true);
  });

  it("contains all NJ Transit rail route IDs with valid geometry", () => {
    expect(routeData.type).toBe("FeatureCollection");
    const routeIds = new Set(
      routeData.features.map(
        (feature: { properties: { routeId: string } }) =>
          feature.properties.routeId,
      ),
    );
    expect(routeIds.size).toBeGreaterThanOrEqual(17);
    for (const routeId of [
      "5-main",
      "5-bergen",
      "6",
      "HBLR-8H",
      "HBLR-WST",
      "HBLR-HT",
      "NLR-NCS",
      "NLR-BSE",
    ]) {
      expect(routeIds).toContain(routeId);
    }
    expect(
      routeData.features.every(
        (feature: {
          geometry: {
            coordinates: [number, number][] | [number, number][][];
            type: "LineString" | "MultiLineString";
          };
          properties: { agency: string; color: string };
        }) =>
          feature.properties.agency === "NJ Transit" &&
          /^#[0-9A-F]{6}$/.test(feature.properties.color) &&
          feature.geometry.coordinates.length >= 2,
      ),
    ).toBe(true);
  });

  it("separates Main, Bergen County, and Port Jervis station service", () => {
    const byName = new Map(
      (accessibilityData.stations as NjTransitStation[]).map((station) => [
        station.name,
        station.branchId.split(","),
      ]),
    );

    expect(byName.get("Paterson")).toEqual(["5-main"]);
    expect(byName.get("Radburn")).toEqual(["5-bergen"]);
    expect(byName.get("Ridgewood")).toEqual(
      expect.arrayContaining(["5-main", "5-bergen"]),
    );
    expect(byName.get("Ridgewood")).not.toContain("6");
    expect(byName.get("Ramsey")).not.toContain("6");
    expect(byName.get("Allendale")).not.toContain("6");
    expect(byName.get("Waldwick")).not.toContain("6");
    expect(byName.get("Mahwah")).toContain("6");
    expect(byName.get("Ramsey Route 17")).toContain("6");
    expect(byName.get("Secaucus Junction")).toContain("6");
    expect(byName.get("Hoboken")).toContain("6");
    expect(byName.get("Sloatsburg")).toEqual(["6"]);
    expect(byName.get("Suffern")).toEqual(
      expect.arrayContaining(["5-main", "5-bergen", "6"]),
    );
  });

  it("uses concise station names while preserving recognized proper names", () => {
    const stationNames = new Set(
      (accessibilityData.stations as NjTransitStation[]).map(
        (station) => station.name,
      ),
    );

    for (const name of [
      "Edison",
      "Meadowlands",
      "Newark Liberty International Airport",
      "Ramsey Route 17",
    ]) {
      expect(stationNames.has(name), name).toBe(true);
    }
    for (const obsoleteName of [
      "Edison Station",
      "Meadowlands Rail Station",
      "Newark Airport Railroad Station",
      "Ramsey Route 17 Station",
    ]) {
      expect(stationNames.has(obsoleteName), obsoleteName).toBe(false);
    }
    for (const properName of [
      "Mountain Station",
      "New York Penn Station",
      "Newark Penn Station",
    ]) {
      expect(stationNames.has(properName), properName).toBe(true);
    }
  });

  it("includes distinct Main and Bergen County geometry plus Port Jervis to Hoboken", () => {
    const featuresByRoute = new Map(
      ["5-main", "5-bergen", "6"].map((routeId) => [
        routeId,
        routeData.features.filter(
          (feature: { properties: { routeId: string } }) =>
            feature.properties.routeId === routeId,
        ),
      ]),
    );

    for (const routeId of ["5-main", "5-bergen", "6"]) {
      expect(featuresByRoute.get(routeId)?.length, routeId).toBeGreaterThan(0);
    }
    const minimumRouteDistance = (routeId: string, stationName: string) => {
      const station = accessibilityData.stations.find(
        (item: { name: string }) => item.name === stationName,
      ) as { latitude: number; longitude: number };
      const coordinates = featuresByRoute
        .get(routeId)
        ?.flatMap(
          (feature: { geometry: { coordinates: [number, number][] } }) =>
            feature.geometry.coordinates,
        );
      return Math.sqrt(
        Math.min(
          ...(coordinates || []).map(
            ([longitude, latitude]: [number, number]) =>
              (longitude - station.longitude) ** 2 +
              (latitude - station.latitude) ** 2,
          ),
        ),
      );
    };

    expect(minimumRouteDistance("5-main", "Paterson")).toBeLessThan(0.006);
    expect(minimumRouteDistance("5-main", "Radburn")).toBeGreaterThan(0.01);
    expect(minimumRouteDistance("5-bergen", "Radburn")).toBeLessThan(0.006);
    expect(minimumRouteDistance("5-bergen", "Paterson")).toBeGreaterThan(0.01);
    for (const stationName of [
      "Hoboken",
      "Secaucus Junction",
      "Ramsey Route 17",
      "Mahwah",
      "Port Jervis",
    ]) {
      expect(minimumRouteDistance("6", stationName), stationName).toBeLessThan(
        0.006,
      );
    }
  });

  it("uses the verified NJ Transit light-rail accessibility rules", () => {
    const byName = new Map(
      (accessibilityData.stations as NjTransitStation[]).map((station) => [
        station.name,
        station,
      ]),
    );
    const inaccessibleNewarkStations = [
      "Military Park",
      "Norfolk Street",
      "Park Avenue Newark",
      "Warren Street",
    ];

    expect(
      inaccessibleNewarkStations.every(
        (name) => byName.get(name)?.accessibilityStatus === "Not accessible",
      ),
    ).toBe(true);
    expect(
      accessibilityData.stations
        .filter((station: { branchId: string }) =>
          station.branchId.split(",").includes("4"),
        )
        .every(
          (station: { accessibilityStatus: string }) =>
            station.accessibilityStatus === "Accessible",
        ),
    ).toBe(true);
    expect(
      accessibilityData.stations
        .filter((station: { branchId: string }) =>
          station.branchId.split(",").includes("17"),
        )
        .every(
          (station: { accessibilityStatus: string }) =>
            station.accessibilityStatus === "Accessible",
        ),
    ).toBe(true);
    expect(byName.get("Morristown")?.accessMethods).toContain(
      "Mini-high platform",
    );
  });

  it("removes redundant light-rail suffixes and records elevator versus ramp access", () => {
    const lightRailStations = (accessibilityData.stations as NjTransitStation[])
      .filter((station) =>
        station.branchId
          .split(",")
          .some((routeId) => ["4", "13", "17"].includes(routeId)),
      );
    const byName = new Map(lightRailStations.map((station) => [station.name, station]));

    expect(
      lightRailStations.every(
        (station) => !/\bLight Rail (?:Sta|Station)$/i.test(station.name),
      ),
    ).toBe(true);
    expect(byName.get("8th Street")).toMatchObject({
      accessibilityStatus: "Accessible",
      accessMethods: ["Level boarding", "Elevator access"],
      elevators: [expect.objectContaining({ location: "Elevator" })],
      stationDetailUrl:
        "https://www.njtransit.com/accessibility/light-rail-accessibility",
    });
    expect(byName.get("Bergenline Ave")?.accessMethods).toContain(
      "Elevator access",
    );
    expect(byName.get("Port Imperial")?.accessMethods).toContain(
      "Elevator access",
    );
    expect(byName.get("2nd Street")?.accessMethods).toEqual([
      "Level boarding",
      "Ramp / street-level access",
    ]);
    expect(
      lightRailStations.every(
        (station) =>
          station.accessibilityStatus !== "Accessible" ||
          station.accessMethods.includes("Elevator access") ||
          station.accessMethods.includes("Ramp / street-level access"),
      ),
    ).toBe(true);
  });

  it("tracks current rail and light-rail elevators from the NJ Transit status page", () => {
    const byName = new Map(
      (accessibilityData.stations as NjTransitStation[]).map((station) => [
        station.name,
        station,
      ]),
    );

    expect(accessibilityData.metadata.elevatorStatusUrl).toBe(
      "https://www.njtransit.com/elevator-status",
    );
    expect(accessibilityData.metadata.elevatorCount).toBeGreaterThan(90);
    expect(accessibilityData.metadata.elevatorStationCount).toBeGreaterThan(40);
    expect(byName.get("New Brunswick")?.elevators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location: "Eastbound Elevator",
          status: "outage",
          system: "rail",
        }),
      ]),
    );
    expect(byName.get("8th Street")?.elevators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "outage", system: "light_rail" }),
      ]),
    );
  });

  it("uses complete service-specific GTFS geometry for HBLR and Newark Light Rail", () => {
    const serviceRouteIds = new Set([
      "HBLR-8H",
      "HBLR-WST",
      "HBLR-HT",
      "NLR-NCS",
      "NLR-BSE",
    ]);
    const lightRailFeatures = routeData.features.filter(
      (feature: { properties: { routeId: string } }) =>
        serviceRouteIds.has(feature.properties.routeId),
    );

    expect(lightRailFeatures.length).toBeGreaterThanOrEqual(5);
    expect(
      new Set(
        lightRailFeatures.map(
          (feature: { properties: { routeId: string } }) =>
            feature.properties.routeId,
        ),
      ),
    ).toEqual(serviceRouteIds);
    expect(
      lightRailFeatures.every(
        (feature: { properties: { source: string } }) =>
          feature.properties.source === "NJ Transit GTFS",
      ),
    ).toBe(true);

    const coordinatesFor = (routeId: string): [number, number][] =>
      lightRailFeatures
        .filter(
          (feature: { properties: { routeId: string } }) =>
            feature.properties.routeId === routeId,
        )
        .flatMap(
          (feature: { geometry: { coordinates: [number, number][] } }) =>
            feature.geometry.coordinates,
        );
    const westSideCoordinates = coordinatesFor("HBLR-WST");
    const newarkCitySubwayCoordinates = coordinatesFor("NLR-NCS");

    expect(Math.min(...westSideCoordinates.map(([longitude]: [number, number]) => longitude))).toBeLessThan(
      -74.08,
    );
    expect(Math.max(...westSideCoordinates.map(([, latitude]: [number, number]) => latitude))).toBeGreaterThan(
      40.78,
    );
    expect(
      Math.max(...newarkCitySubwayCoordinates.map(([, latitude]: [number, number]) => latitude)),
    ).toBeGreaterThan(40.78);
    expect(
      Math.min(...newarkCitySubwayCoordinates.map(([, latitude]: [number, number]) => latitude)),
    ).toBeLessThan(40.74);
  });

  it("assigns station-specific HBLR and Newark Light Rail services", () => {
    const byName = new Map(
      (accessibilityData.stations as NjTransitStation[]).map((station) => [
        station.name,
        station,
      ]),
    );

    expect(byName.get("Tonnelle Avenue")?.serviceRouteIds).toEqual(
      expect.arrayContaining(["HBLR-HT", "HBLR-WST"]),
    );
    expect(byName.get("West Side Avenue")?.serviceRouteIds).toEqual([
      "HBLR-WST",
    ]);
    expect(byName.get("8th Street")?.serviceRouteIds).toEqual([
      "HBLR-8H",
    ]);
    expect(byName.get("Newark Penn Station")?.serviceRouteIds).toEqual(
      expect.arrayContaining(["NLR-BSE", "NLR-NCS"]),
    );
    expect(byName.get("Broad Street")?.serviceRouteIds).toEqual([
      "NLR-BSE",
    ]);
  });
});
