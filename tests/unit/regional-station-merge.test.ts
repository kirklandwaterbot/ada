import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeRegionalTransitStations } from "@/lib/regional-station-merge";
import type { RegionalTransitAgency } from "@/lib/regional-transit-branding";

type SnapshotStation = {
  accessMethods?: string[];
  accessibilityStatus: string;
  agency: RegionalTransitAgency;
  branchId: string;
  branchName: string;
  latitude: number;
  longitude: number;
  name: string;
  serviceRouteIds?: string[];
  stationCode: string;
};

const baseStation = {
  accessMethods: ["Elevator access"],
  accessibilityStatus: "Accessible",
  branchName: "New Haven",
  latitude: 41.297789,
  longitude: -72.925646,
  serviceRouteIds: ["3"],
};

describe("regional station merging", () => {
  it("merges MNR and CTrail records for the same physical New Haven station", () => {
    const stations = mergeRegionalTransitStations([
      {
        ...baseStation,
        agency: "MNR" as const,
        branchId: "NH",
        name: "New Haven",
        stationCode: "2NH",
      },
      {
        ...baseStation,
        agency: "CTrail" as const,
        branchId: "HART,SLE",
        branchName: "Hartford Line / Shore Line East",
        latitude: 41.297172,
        longitude: -72.925945,
        name: "New Haven Union Station",
        serviceRouteIds: [],
        stationCode: "HART:NEWHAVEN+SLE:NHV",
      },
    ]);

    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      agency: "MNR",
      latitude: 41.297789,
      longitude: -72.925646,
      name: "New Haven Union Station",
    });
    expect(stations[0].services.map((service) => service.agency)).toEqual([
      "MNR",
      "CTrail",
    ]);
  });

  it("does not merge CTrail-only Shore Line East stations", () => {
    const stations = mergeRegionalTransitStations([
      {
        ...baseStation,
        agency: "CTrail" as const,
        branchId: "SLE",
        branchName: "Shore Line East",
        name: "Branford",
        stationCode: "SLE:BNF",
      },
    ]);

    expect(stations).toHaveLength(1);
    expect(stations[0].name).toBe("Branford");
    expect(stations[0].services).toHaveLength(1);
  });

  it("emits one shared map record for every MNR/CTrail interchange", () => {
    const mnr = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "data", "mta-regional-rail-accessibility.json"),
        "utf8",
      ),
    ).stations as SnapshotStation[];
    const ctrail = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "data", "ctrail-accessibility.json"),
        "utf8",
      ),
    ).stations as SnapshotStation[];
    const merged = mergeRegionalTransitStations([...mnr, ...ctrail]);
    const sharedStationNames = [
      "New Haven Union Station",
      "New Haven State Street",
      "West Haven",
      "Milford",
      "Stratford",
      "Bridgeport",
      "Stamford",
    ];

    expect(merged).toHaveLength(mnr.length + ctrail.length - 7);
    for (const name of sharedStationNames) {
      const matches = merged.filter((station) => station.name === name);
      expect(matches, name).toHaveLength(1);
      expect(new Set(matches[0].services.map((service) => service.agency))).toEqual(
        new Set(["MNR", "CTrail"]),
      );
    }
  });

  it("combines PATH and NJ Transit at Newark Penn Station", () => {
    const stations = mergeRegionalTransitStations([
      {
        ...baseStation,
        agency: "PATH" as const,
        branchId: "red",
        branchName: "NWK–WTC",
        name: "Newark",
        stationCode: "NWK",
      },
      {
        ...baseStation,
        agency: "NJ Transit" as const,
        branchId: "10,11,13,16",
        branchName: "Northeast Corridor / Newark Light Rail",
        name: "Newark Penn Station",
        serviceRouteIds: ["NLR-BSE", "NLR-NCS"],
        stationCode: "95107+30771",
      },
    ]);

    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      agency: "NJ Transit",
      name: "Newark Penn Station",
    });
    expect(new Set(stations[0].services.map((service) => service.agency))).toEqual(
      new Set(["PATH", "NJ Transit"]),
    );
  });

  it("keeps equipment published by both operators at a shared terminal", () => {
    const stations = mergeRegionalTransitStations([
      {
        ...baseStation,
        agency: "PATH" as const,
        branchId: "red",
        branchName: "NWK–WTC",
        elevators: [{ location: "PATH platform", unitId: "PATH-EL" }],
        name: "Newark",
        stationCode: "NWK",
      },
      {
        ...baseStation,
        agency: "NJ Transit" as const,
        branchId: "10",
        branchName: "Northeast Corridor",
        elevators: [{ location: "NJ Transit concourse", unitId: "NJT-EL" }],
        name: "Newark Penn Station",
        stationCode: "95107",
      },
    ]);

    expect(stations[0].elevators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ unitId: "PATH-EL" }),
        expect.objectContaining({ unitId: "NJT-EL" }),
      ]),
    );
  });

  it("combines LIRR and NJ Transit at New York Penn Station", () => {
    const stations = mergeRegionalTransitStations([
      {
        ...baseStation,
        agency: "LIRR" as const,
        branchId: "CI",
        branchName: "City Terminal Zone",
        name: "Penn Station",
        stationCode: "NYK",
      },
      {
        ...baseStation,
        agency: "NJ Transit" as const,
        branchId: "10,11,16",
        branchName: "Northeast Corridor / North Jersey Coast Line",
        name: "New York Penn Station",
        stationCode: "95105",
      },
    ]);

    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      agency: "NJ Transit",
      name: "New York Penn Station",
    });
    expect(new Set(stations[0].services.map((service) => service.agency))).toEqual(
      new Set(["LIRR", "NJ Transit"]),
    );
  });

  it("publishes one canonical marker for each shared regional terminal", () => {
    const regional = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "data", "mta-regional-rail-accessibility.json"),
        "utf8",
      ),
    ).stations as SnapshotStation[];
    const pathStations = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "data", "path-accessibility.json"),
        "utf8",
      ),
    ).stations as SnapshotStation[];
    const njTransit = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "data", "nj-transit-accessibility.json"),
        "utf8",
      ),
    ).stations as SnapshotStation[];
    const jfkAirTrain = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "data", "jfk-airtrain-accessibility.json"),
        "utf8",
      ),
    ).stations as SnapshotStation[];
    const merged = mergeRegionalTransitStations([
      ...regional,
      ...pathStations,
      ...njTransit,
      ...jfkAirTrain,
    ]);

    const newark = merged.filter(
      (station) => station.name === "Newark Penn Station",
    );
    const newYork = merged.filter(
      (station) => station.name === "New York Penn Station",
    );
    const hoboken = merged.filter(
      (station) => station.name === "Hoboken",
    );
    const jamaica = merged.filter(
      (station) => station.name === "Jamaica",
    );

    expect(newark).toHaveLength(1);
    expect(newYork).toHaveLength(1);
    expect(hoboken).toHaveLength(1);
    expect(jamaica).toHaveLength(1);
    expect(new Set(newark[0].services.map((service) => service.agency))).toEqual(
      new Set(["PATH", "NJ Transit"]),
    );
    expect(new Set(newYork[0].services.map((service) => service.agency))).toEqual(
      new Set(["LIRR", "NJ Transit"]),
    );
    expect(new Set(hoboken[0].services.map((service) => service.agency))).toEqual(
      new Set(["PATH", "NJ Transit"]),
    );
    expect(new Set(jamaica[0].services.map((service) => service.agency))).toEqual(
      new Set(["LIRR", "JFK AirTrain"]),
    );
    expect(merged.some((station) => station.name === "Newark")).toBe(false);
    expect(merged.some((station) => station.name === "Penn Station")).toBe(false);
    expect(merged.some((station) => station.name === "Hoboken Terminal")).toBe(
      false,
    );
  });
});
