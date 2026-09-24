import { describe, expect, it } from "vitest";
import accessibleStations from "../../data/accessible-station-coordinates.json";

const RAMP_OR_LEVEL_METHODS = new Set([
  "accessible_entrance",
  "ramp",
  "street_level",
]);

describe("accessible station coordinate classifications", () => {
  it("classifies every fallback marker by its step-free access method", () => {
    expect(accessibleStations.stations).toHaveLength(18);
    expect(
      accessibleStations.stations.every((station) =>
        ["accessible_entrance", "elevator", "ramp", "street_level"].includes(
          station.accessMethod,
        ),
      ),
    ).toBe(true);
  });

  it("keeps ramp and level-entrance stations accessible and separately filterable", () => {
    const fullAccess = accessibleStations.stations.filter(
      (station) => !station.statusLabel.startsWith("Partially accessible"),
    );

    expect(
      fullAccess.filter((station) =>
        RAMP_OR_LEVEL_METHODS.has(station.accessMethod),
      ),
    ).toHaveLength(10);
    expect(
      fullAccess.filter((station) => station.accessMethod === "elevator"),
    ).toHaveLength(5);
  });

  it("uses one elevator-served marker for the entire 149 St-Hostos complex", () => {
    const hostosMarkers = accessibleStations.stations.filter(
      (station) => station.station === "149 St-Hostos",
    );

    expect(hostosMarkers).toEqual([
      expect.objectContaining({
        accessMethod: "elevator",
        services: ["2", "4", "5"],
        sourceStopIds: ["222", "415"],
      }),
    ]);
  });

  it("publishes the corrected accessibility markers for Package 4 stations", () => {
    expect(
      accessibleStations.stations.find(
        (station) => station.station === "137 St-City College",
      ),
    ).toMatchObject({
      equipmentCodes: ["EL519"],
      statusLabel:
        "Partially accessible station (uptown only; downtown elevator under construction)",
    });
    expect(
      accessibleStations.stations.find(
        (station) => station.station === "Northern Blvd",
      ),
    ).toMatchObject({
      equipmentCodes: ["EL485", "EL486"],
      statusLabel: "Accessible station",
    });
    expect(
      accessibleStations.stations.find(
        (station) => station.station === "Parkchester",
      ),
    ).toMatchObject({
      equipmentCodes: ["EL521", "EL522"],
      statusLabel: "Accessible station",
    });
  });
});
