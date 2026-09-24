import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_TRANSIT_ROUTE_KEYS,
  DEFAULT_ENABLED_TRANSIT_ROUTES,
  getEnabledTransitRouteIds,
  getTransitRouteKeysForServices,
  TRANSIT_FILTER_SYSTEMS,
  TRANSIT_ROUTE_FILTERS,
} from "@/lib/transit-filter-catalog";

describe("transit filter hierarchy", () => {
  it("organizes every requested operator and subdivision", () => {
    const systems = new Map(
      TRANSIT_FILTER_SYSTEMS.map((system) => [system.id, system]),
    );

    expect([...systems.keys()]).toEqual([
      "mta",
      "panynj",
      "nj-transit",
      "ctrail",
    ]);
    expect(systems.get("mta")?.agencies.map((agency) => agency.id)).toEqual([
      "nycta",
      "lirr",
      "mnr",
    ]);
    expect(systems.get("panynj")?.agencies.map((agency) => agency.id)).toEqual([
      "path",
      "jfk-airtrain",
      "ewr-airtrain",
    ]);
    expect(
      systems
        .get("nj-transit")
        ?.agencies.map((agency) => agency.id),
    ).toEqual(["njt-rail", "njt-light-rail"]);

    const nyctaSections = systems
      .get("mta")
      ?.agencies.find((agency) => agency.id === "nycta")
      ?.sections.map((section) => section.id);
    expect(nyctaSections).toEqual([
      "nycta-a-division",
      "nycta-b-division",
      "sir",
    ]);
  });

  it("includes Metro-North West-of-Hudson lines backed by NJ Transit", () => {
    const westOfHudson = TRANSIT_FILTER_SYSTEMS
      .find((system) => system.id === "mta")
      ?.agencies.find((agency) => agency.id === "mnr")
      ?.sections.find((section) => section.id === "mnr-west-of-hudson");

    expect(
      westOfHudson?.routes.map((route) => [route.label, route.key]),
    ).toEqual([
      ["Port Jervis", "NJ Transit:6"],
      ["Pascack Valley", "NJ Transit:14"],
    ]);
  });

  it("uses concise subway and SIR labels with their official route logos", () => {
    const nyctaRoutes = TRANSIT_ROUTE_FILTERS.filter((route) =>
      route.key.startsWith("NYCTA:"),
    );
    const byRouteId = new Map(
      nyctaRoutes.map((route) => [route.routeId, route]),
    );

    expect(nyctaRoutes.every((route) => !route.label.startsWith("NYCTA - "))).toBe(
      true,
    );
    expect(nyctaRoutes.every((route) => route.imagePaths.length === 1)).toBe(true);
    expect(byRouteId.get("B")).toMatchObject({
      color: "#FF6319",
      lineName: "IND 6 Av",
    });
    expect(byRouteId.get("A")).toMatchObject({
      color: "#0039A6",
      lineName: "IND 8 Av",
    });
    expect(byRouteId.get("SI")).toMatchObject({
      color: "#057FD4",
      imagePaths: ["/NewYorkSubwaySI.png"],
      label: "SIR",
    });
  });

  it("uses an existing line-logo image for every filter route", () => {
    for (const route of TRANSIT_ROUTE_FILTERS) {
      expect(route.imagePaths.length, route.key).toBeGreaterThan(0);
      for (const imagePath of route.imagePaths) {
        expect(
          existsSync(path.join(process.cwd(), "public", imagePath.replace(/^\//, ""))),
          `${route.key}: ${imagePath}`,
        ).toBe(true);
      }
    }
  });

  it("retains a valid display color for every regional line", () => {
    expect(
      TRANSIT_ROUTE_FILTERS.every((route) => /^#[0-9A-F]{6}$/.test(route.color)),
    ).toBe(true);
    expect(
      TRANSIT_ROUTE_FILTERS.find((route) => route.key === "LIRR:3"),
    ).toMatchObject({ color: "#00AF3F", label: "Oyster Bay" });
  });

  it("removes the synthetic City Terminal Zone filter and uses the Harlem label", () => {
    expect(TRANSIT_ROUTE_FILTERS.some((route) => route.key === "LIRR:12")).toBe(
      false,
    );
    expect(
      TRANSIT_ROUTE_FILTERS.find((route) => route.key === "MNR:2")?.label,
    ).toBe("Harlem");
  });

  it("does not classify Danbury-only stations as New Haven stations", () => {
    const routeKeys = getTransitRouteKeysForServices([
      {
        agency: "MNR",
        branchId: "DN,NH",
        branchName: "Danbury",
        serviceRouteIds: ["5"],
      },
    ]);

    expect(routeKeys).toContain("MNR:5");
    expect(routeKeys).not.toContain("MNR:3");
  });

  it("shows terminal stations when the Belmont Park service is selected", () => {
    const routeKeys = getTransitRouteKeysForServices([
      {
        agency: "LIRR",
        branchId: "BT,CI",
        branchName: "City Terminal Zone",
        serviceRouteIds: ["1", "4", "BT"],
      },
    ]);

    expect(routeKeys).toContain("LIRR:BT");
  });

  it("exposes individual HBLR and Newark Light Rail services", () => {
    const lightRailRoutes = TRANSIT_FILTER_SYSTEMS
      .find((system) => system.id === "nj-transit")
      ?.agencies.find((agency) => agency.id === "njt-light-rail")
      ?.sections.flatMap((section) => section.routes);

    expect(
      lightRailRoutes?.map((route) => [
        route.key,
        route.label,
        route.imagePaths[0],
      ]),
    ).toEqual([
      ["NJ Transit:HBLR-8H", "8th Street–Hoboken", "/NJTLR8thStHoboken.png"],
      [
        "NJ Transit:HBLR-WST",
        "West Side Avenue–Tonnelle Avenue",
        "/NJTLRWestSideTonnelle.png",
      ],
      [
        "NJ Transit:HBLR-HT",
        "Hoboken–Tonnelle Avenue",
        "/NJTLRHobokenTonnelle.png",
      ],
      ["NJ Transit:NLR-NCS", "Grove Street–Newark Penn", "/NJTLRNewark.png"],
      [
        "NJ Transit:NLR-BSE",
        "Broad Street–Newark Penn",
        "/NJTLRNewarkBroad.png",
      ],
      ["NJ Transit:17", "River LINE", "/NJTLRRiverLine.png"],
    ]);
  });

  it("exposes Main, Bergen County, and Port Jervis as separate rail filters", () => {
    const railRoutes = TRANSIT_FILTER_SYSTEMS
      .find((system) => system.id === "nj-transit")
      ?.agencies.find((agency) => agency.id === "njt-rail")
      ?.sections.flatMap((section) => section.routes);

    expect(
      railRoutes
        ?.filter((route) => ["5-main", "5-bergen", "6"].includes(route.routeId))
        .map((route) => [route.routeId, route.label, route.imagePaths[0]]),
    ).toEqual([
      ["5-main", "Main", "/NJTMainLine.png"],
      ["5-bergen", "Bergen County", "/NJTBergenCounty.png"],
      ["6", "Port Jervis", "/NJTPortJervis.png"],
    ]);
  });

  it("splits NJT Rail into Newark and Hoboken divisions with concise labels", () => {
    const sections = TRANSIT_FILTER_SYSTEMS
      .find((system) => system.id === "nj-transit")
      ?.agencies.find((agency) => agency.id === "njt-rail")
      ?.sections;

    expect(sections?.map((section) => [section.id, section.label])).toEqual([
      ["njt-newark-division", "Newark Division"],
      ["njt-hoboken-division", "Hoboken Division"],
    ]);
    expect(sections?.[0].routes.map((route) => route.label)).toEqual([
      "Northeast Corridor",
      "North Jersey Coast",
      "Raritan Valley",
      "Princeton",
      "Atlantic City",
    ]);
    expect(sections?.[1].routes.map((route) => route.label)).toEqual([
      "Montclair–Boonton",
      "Main",
      "Bergen County",
      "Port Jervis",
      "Morris & Essex",
      "Gladstone",
      "Meadowlands",
      "Pascack Valley",
    ]);
    expect(
      sections
        ?.flatMap((section) => section.routes)
        .every((route) => !/\b(?:Line|Branch|service)$/.test(route.label)),
    ).toBe(true);
  });

  it("consolidates NJCL and Montclair-Boonton aliases into one map control", () => {
    const njtRoutes = TRANSIT_ROUTE_FILTERS.filter((route) =>
      route.key.startsWith("NJ Transit:"),
    );

    expect(njtRoutes.some((route) => route.key === "NJ Transit:3")).toBe(false);
    expect(njtRoutes.some((route) => route.key === "NJ Transit:12")).toBe(false);
    expect(
      getEnabledTransitRouteIds("NJ Transit", ["NJ Transit:2"]),
    ).toEqual(["2", "3"]);
    expect(
      getEnabledTransitRouteIds("NJ Transit", ["NJ Transit:11"]),
    ).toEqual(["11", "12"]);
  });

  it("keeps every Hoboken rail and light-rail service on the merged marker", () => {
    const routeKeys = getTransitRouteKeysForServices([
      {
        agency: "NJ Transit",
        branchId: "14,2,3,4,5-bergen,5-main,6,7,8,9",
        branchName: "Hoboken services",
        serviceRouteIds: ["HBLR-8H", "HBLR-HT"],
      },
    ]);

    expect(routeKeys).toEqual(
      expect.arrayContaining([
        "NJ Transit:2",
        "NJ Transit:5-main",
        "NJ Transit:5-bergen",
        "NJ Transit:6",
        "NJ Transit:7",
        "NJ Transit:8",
        "NJ Transit:9",
        "NJ Transit:14",
        "NJ Transit:HBLR-8H",
        "NJ Transit:HBLR-HT",
      ]),
    );
    expect(new Set(routeKeys).size).toBe(routeKeys.length);
  });

  it("starts first-time visitors with only NYC Subway routes enabled", () => {
    expect(new Set(DEFAULT_ENABLED_TRANSIT_ROUTES).size).toBe(
      DEFAULT_ENABLED_TRANSIT_ROUTES.length,
    );
    expect(DEFAULT_ENABLED_TRANSIT_ROUTES.length).toBeGreaterThan(0);
    expect(
      DEFAULT_ENABLED_TRANSIT_ROUTES.every((routeKey) =>
        routeKey.startsWith("NYCTA:"),
      ),
    ).toBe(true);
    expect(new Set(ALL_TRANSIT_ROUTE_KEYS)).toEqual(
      new Set(TRANSIT_ROUTE_FILTERS.map((route) => route.key)),
    );
    expect(ALL_TRANSIT_ROUTE_KEYS.length).toBeGreaterThan(
      DEFAULT_ENABLED_TRANSIT_ROUTES.length,
    );
  });
});
