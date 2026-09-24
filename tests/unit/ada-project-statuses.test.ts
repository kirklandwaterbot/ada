import { describe, expect, it } from "vitest";
import adaProjectStatuses from "../../data/ada-project-statuses.json";
import {
  ADA_PROJECT_STATUS_META,
  ADA_PROJECT_STATUSES,
  isAdaProjectStatus,
} from "@/lib/ada-project-status";
import { ASSET_MAP_STATUS_COLORS } from "@/lib/asset-display";
import { getStationCoordinate, stations } from "@/lib/stations";
import { TRANSIT_ROUTE_FILTERS } from "@/lib/transit-filter-catalog";

describe("ADA project status classifications", () => {
  it("keeps escalator equipment visually distinct from accessible-station upgrades", () => {
    expect(ASSET_MAP_STATUS_COLORS.equipment).not.toBe(
      ADA_PROJECT_STATUS_META.upgrade_to_accessible_station.color,
    );
  });

  it("publishes markers in every supported planning category", () => {
    for (const status of ADA_PROJECT_STATUSES) {
      expect(adaProjectStatuses.statusCounts[status]).toBeGreaterThan(0);
    }

    expect(
      Object.values(adaProjectStatuses.statusCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(adaProjectStatuses.stations.length);
    expect(
      adaProjectStatuses.stations.every((station) =>
        isAdaProjectStatus(station.projectStatus),
      ),
    ).toBe(true);
  });

  it("keeps planned Second Avenue Subway stations distinct from station upgrades", () => {
    const newStations = adaProjectStatuses.stations
      .filter((station) => station.projectStatus === "planned_new_station")
      .map((station) => station.station)
      .sort();

    expect(newStations).toEqual(["106 St", "116 St", "125 St"]);
  });

  it("classifies accessibility packages in active procurement as design / study", () => {
    const designStations = new Set(
      adaProjectStatuses.stations
        .filter((station) => station.projectStatus === "design_study")
        .map((station) => station.station),
    );

    expect(designStations).toEqual(
      new Set([
        "110 St",
        "145 St",
        "18 Av",
        "2 Av",
        "7 Av",
        "Bellerose",
        "Floral Park",
        "Fort Hamilton Pkwy",
        "Jefferson St",
        "Morrison Av-Soundview",
        "Neptune Av",
        "Nostrand Av",
        "Wakefield-241 St",
      ]),
    );
  });

  it("publishes all current missing-package stations with agency-aware route keys", () => {
    const expectedPackages = new Map([
      ["12411", new Set(["137 St-City College", "Bay Ridge-95 St"])],
      ["12754", new Set(["2 Av", "7 Av", "Morrison Av-Soundview"])],
      ["13429", new Set(["110 St", "145 St", "Wakefield-241 St"])],
      ["12654", new Set(["Babylon", "Forest Hills", "Hollis"])],
      ["14768", new Set(["Bellerose", "Floral Park"])],
    ]);

    for (const [projectId, expectedStations] of expectedPackages) {
      const projectStations = adaProjectStatuses.stations.filter((station) =>
        station.sourceUrl.includes(projectId),
      );
      expect(new Set(projectStations.map((station) => station.station))).toEqual(
        expectedStations,
      );
    }

    const validRouteKeys = new Set(TRANSIT_ROUTE_FILTERS.map((route) => route.key));
    expect(
      adaProjectStatuses.stations.every(
        (station) =>
          station.transitRouteKeys.length > 0 &&
          station.transitRouteKeys.every((key) => validRouteKeys.has(key)),
      ),
    ).toBe(true);
  });

  it("keeps only the unfinished 137 St direction in construction", () => {
    const packageFourProjects = adaProjectStatuses.stations.filter((station) =>
      station.sourceUrl.includes("12411"),
    );
    const cityCollege = packageFourProjects.find(
      (station) => station.station === "137 St-City College",
    );

    expect(cityCollege).toMatchObject({
      latitude: 40.821575,
      longitude: -73.95381,
      projectStatus: "under_construction",
    });
    expect(cityCollege?.note).toMatch(
      /uptown access is open.*downtown.*under construction/i,
    );
    expect(packageFourProjects.map((station) => station.station)).not.toContain(
      "Northern Blvd",
    );
    expect(packageFourProjects.map((station) => station.station)).not.toContain(
      "Parkchester",
    );
  });

  it("publishes Broadway Junction as one correctly located full-complex construction project", () => {
    const projects = adaProjectStatuses.stations.filter(
      (station) => station.station === "Broadway Junction",
    );

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: "broadway-junction-complex",
      latitude: 40.67856,
      longitude: -73.90392,
      projectStatus: "under_construction",
      services: ["A", "C", "J", "Z", "L"],
    });
    expect(projects[0].note).toMatch(/entire .* complex fully ADA accessible/i);

    const stationRows = stations.filter(
      (station) => station.station === "Broadway Junction",
    );
    expect(stationRows).toHaveLength(3);
    for (const station of stationRows) {
      expect(getStationCoordinate(station)).toEqual({
        latitude: 40.67856,
        longitude: -73.90392,
      });
    }
  });

  it("gives already-accessible station upgrades stable, mappable records", () => {
    const upgrades = adaProjectStatuses.stations.filter(
      (station) => station.projectStatus === "upgrade_to_accessible_station",
    );

    expect(new Set(upgrades.map((station) => station.id)).size).toBe(
      upgrades.length,
    );
    expect(upgrades.map((station) => station.station)).not.toContain(
      "Prospect Park",
    );
    expect(
      upgrades.every(
        (station) =>
          Number.isFinite(station.latitude) && Number.isFinite(station.longitude),
      ),
    ).toBe(true);
  });
});
