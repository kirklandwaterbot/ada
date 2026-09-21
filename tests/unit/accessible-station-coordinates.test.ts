import { describe, expect, it } from "vitest";
import accessibleStations from "../../data/accessible-station-coordinates.json";

const RAMP_OR_LEVEL_METHODS = new Set([
  "accessible_entrance",
  "ramp",
  "street_level",
]);

describe("accessible station coordinate classifications", () => {
  it("classifies every fallback marker by its step-free access method", () => {
    expect(accessibleStations.stations).toHaveLength(17);
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

  it("identifies 149 St-Hostos as elevator-served on both line groups", () => {
    const hostosMarkers = accessibleStations.stations.filter(
      (station) => station.station === "149 St-Hostos",
    );

    expect(hostosMarkers).toHaveLength(2);
    expect(
      hostosMarkers.every((station) => station.accessMethod === "elevator"),
    ).toBe(true);
  });
});
