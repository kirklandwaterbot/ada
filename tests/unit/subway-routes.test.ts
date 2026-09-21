import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type RouteFeature = {
  properties: {
    color: string;
    route: string;
    routeId: string;
  };
};

type RouteCollection = {
  features: RouteFeature[];
  metadata: {
    feedVersion: string;
    source: string;
    validFrom: string;
    validTo: string;
  };
  type: "FeatureCollection";
};

const routeCollection = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "public", "data", "nyc-subway-routes.geojson"),
    "utf8",
  ),
) as RouteCollection;

describe("present-day subway route geometry", () => {
  it("uses a current official MTA feed rather than the fictional Metro Memory map", () => {
    expect(routeCollection.type).toBe("FeatureCollection");
    expect(routeCollection.metadata.source).toBe(
      "MTA New York City Transit GTFS",
    );
    expect(routeCollection.metadata.feedVersion).toBeTruthy();
    expect(routeCollection.metadata.validFrom).toMatch(/^\d{8}$/);
    expect(routeCollection.metadata.validTo).toMatch(/^\d{8}$/);
    expect(routeCollection.features.length).toBeGreaterThan(100);
  });

  it("contains official route colors and excludes future-only T and IBX tracks", () => {
    const routeIds = new Set(
      routeCollection.features.map((feature) => feature.properties.routeId),
    );

    expect([...routeIds]).toEqual(
      expect.arrayContaining(["1", "4", "7", "A", "F", "G", "L", "Q", "SI"]),
    );
    expect(routeIds.has("T")).toBe(false);
    expect(routeIds.has("IBX")).toBe(false);
    expect(
      routeCollection.features.every((feature) =>
        /^#[0-9A-F]{6}$/.test(feature.properties.color),
      ),
    ).toBe(true);
  });
});
