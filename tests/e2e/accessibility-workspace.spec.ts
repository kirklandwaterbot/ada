import { expect, test } from "@playwright/test";

test("supports skip navigation and paginated station results", async ({ page }) => {
  await page.goto("/stations?view=explorer");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();

  await expect(page.getByTestId("station-result")).toHaveCount(30);
  await page.getByRole("button", { name: "Show more stations" }).click();
  await expect(page.getByTestId("station-result")).toHaveCount(60);
});

test("switches between Explorer, Both, and Map without duplicate pages", async ({
  page,
}) => {
  await page.goto("/stations?view=explorer");

  await expect(page.getByRole("button", { name: "Explorer" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Both" }).click();
  await expect(
    page.getByRole("heading", { name: "System accessibility map" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page).toHaveURL(/view=map/);
  await expect(page.getByLabel("Explorer workspace layout")).toBeVisible();
  await expect(page.getByTestId("station-result")).toHaveCount(0);
});

test("places the map theme control before the workspace view selector", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/stations?view=explorer");

  const mapTheme = page.getByRole("group", { name: "Map theme" });
  const workspaceView = page.getByRole("group", { name: "Workspace view" });
  await expect(mapTheme).toBeVisible();
  await expect(workspaceView).toBeVisible();

  const mapThemeBox = await mapTheme.boundingBox();
  const workspaceViewBox = await workspaceView.boundingBox();
  expect(mapThemeBox).not.toBeNull();
  expect(workspaceViewBox).not.toBeNull();
  expect(mapThemeBox!.x + mapThemeBox!.width).toBeLessThanOrEqual(
    workspaceViewBox!.x,
  );

  await page.getByRole("button", { name: "Use dark map" }).click();
  await expect(page.getByRole("button", { name: "Use dark map" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("mta-access-assets-map-theme")),
    )
    .toBe("dark");
});

test("offers a keyboard-accessible list synchronized with map controls", async ({
  page,
}) => {
  await page.goto("/stations?view=map");
  const results = page.getByText(/Browse .* enabled map markers/);

  await expect(results).toBeVisible();
  await results.click();
  await expect(page.getByRole("list")).toBeVisible();

  await page.getByRole("button", { name: "Elevators" }).click();
  await expect(page.getByText(/Browse .* enabled map markers/)).toBeVisible();
});

test("keeps the legacy map URL as a redirect to the consolidated workspace", async ({
  page,
}) => {
  await page.goto("/map");
  await expect(page).toHaveURL(/\/stations\?view=map$/);
});

test("mobile map tools reach the equipment inventory", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Filter map" }).click();
  const mobileFilters = page.getByRole("region", { name: "Map filters" });
  await expect(mobileFilters).toBeVisible();
  const mobileFilterBox = await mobileFilters.boundingBox();

  expect(mobileFilterBox).not.toBeNull();
  expect(mobileFilterBox!.x).toBeGreaterThanOrEqual(0);
  expect(mobileFilterBox!.y).toBeGreaterThanOrEqual(0);
  expect(mobileFilterBox!.x + mobileFilterBox!.width).toBeLessThanOrEqual(390);
  expect(mobileFilterBox!.y + mobileFilterBox!.height).toBeLessThanOrEqual(844);
  await mobileFilters.getByRole("button", { name: "Close map filters" }).click();
  await page.getByRole("link", { name: "Equipment", exact: true }).click();
  await expect(page).toHaveURL(/\/equipment$/);
  await expect(
    page.getByRole("heading", { name: "Every asset, one searchable view" }),
  ).toBeVisible({ timeout: 15_000 });
});

test("collapses the Access NYC masthead into a map-tool button", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");

  const masthead = page.locator("#access-nyc-masthead");
  await expect(masthead).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse Access NYC header" })
    .click();
  await expect(masthead).toBeHidden();

  const expandButton = page.getByRole("button", {
    name: "Expand Access NYC header",
  });
  await expect(expandButton).toBeVisible();
  const expandButtonBox = await expandButton.boundingBox();
  const searchButtonBox = await page
    .getByRole("button", { name: "Search stations" })
    .boundingBox();

  expect(expandButtonBox).not.toBeNull();
  expect(searchButtonBox).not.toBeNull();
  expect(expandButtonBox!.width).toBe(48);
  expect(expandButtonBox!.height).toBe(48);
  expect(searchButtonBox!.y).toBeGreaterThanOrEqual(
    expandButtonBox!.y + expandButtonBox!.height,
  );

  await expandButton.click();
  await expect(masthead).toBeVisible();
});

test("shows 149 St-Hostos as accessible and preserves its former name", async ({
  page,
}) => {
  await page.goto("/stations?view=explorer");
  await page
    .getByPlaceholder("Station, line, route, or borough")
    .fill("149 St-Grand Concourse");
  await expect(page.getByRole("link", { name: /149 St-Hostos/ })).toHaveCount(2);

  await page.goto("/stations/149-st-grand-concourse-jerome-av-line-4");
  await expect(
    page.getByRole("heading", { level: 1, name: "149 St-Hostos" }),
  ).toBeVisible();
  await expect(page.getByText("Made accessible September 11, 2026")).toBeVisible();
});

test("opens with a clean map canvas and compact atlas tools", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto("/");

  await expect(page.getByText("Access NYC", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Where are accessible subway, PATH, AirTrain, and commuter rail stations?",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page.getByLabel(
      "Interactive subway, PATH, AirTrain, and regional rail accessibility map with present-day transit routes",
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Map layers", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Browse .* enabled map markers/)).toHaveCount(0);
  await expect(
    page.getByPlaceholder("Station, route, or neighborhood"),
  ).toHaveCount(0);

  const filterButton = page.getByRole("button", { name: "Filter map" });
  const themeButton = page.getByRole("button", { name: /Use .* map/ });
  const filterButtonBox = await filterButton.boundingBox();
  const themeButtonBox = await themeButton.boundingBox();

  expect(filterButtonBox).not.toBeNull();
  expect(themeButtonBox).not.toBeNull();
  expect(filterButtonBox!.y + filterButtonBox!.height).toBeLessThanOrEqual(
    themeButtonBox!.y,
  );

  await filterButton.click();
  const mapFilters = page.getByRole("region", { name: "Map filters" });
  await expect(mapFilters).toBeVisible();
  const rampFilter = mapFilters.getByRole("button", {
    name: /Accessible via ramp \/ level entrance.*10/,
  });
  await expect(rampFilter).toHaveAttribute("aria-pressed", "true");
  const elevatorStationFilter = mapFilters.getByRole("button", {
    name: /Accessible via elevator.*4/,
  });
  await expect(elevatorStationFilter).toHaveAttribute("aria-pressed", "true");
  for (const statusLabel of [
    "Under construction",
    "Funded / planned",
    "Design / study",
    "Planned new station",
    "Upgrade to already-accessible station",
  ]) {
    await expect(
      mapFilters.getByRole("button", { name: new RegExp(statusLabel) }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await expect(mapFilters.getByText("Long Island Rail Road", { exact: true })).toBeVisible();
  await expect(mapFilters.getByText("Metro-North Railroad", { exact: true })).toBeVisible();
  await expect(mapFilters.getByText("City Terminal Zone", { exact: true })).toHaveCount(0);
  await expect(mapFilters.getByText("Harlem / Wassaic", { exact: true })).toHaveCount(0);
  await expect(mapFilters.getByText("Harlem", { exact: true })).toHaveCount(1);
  await expect(mapFilters.getByText("PATH", { exact: true })).toBeVisible();
  await expect(mapFilters.getByText("AirTrain JFK", { exact: true })).toBeVisible();
  await expect(mapFilters.getByText("AirTrain Newark", { exact: true })).toBeVisible();
  const repairFilter = mapFilters.getByRole("button", {
    name: /Outages \/ repair \/ modernization/,
  });
  await expect(repairFilter).toHaveAttribute("aria-pressed", "true");
  await repairFilter.click();
  await expect(repairFilter).toHaveAttribute("aria-pressed", "false");
  const partialFilter = mapFilters.getByRole("button", {
    name: /Partially accessible.*2/,
  });
  await expect(partialFilter).toHaveAttribute("aria-pressed", "true");
  await partialFilter.click();
  await expect(partialFilter).toHaveAttribute("aria-pressed", "false");
  await mapFilters.getByRole("button", { name: "Select all filters" }).click();
  await expect(partialFilter).toHaveAttribute("aria-pressed", "true");
  await expect(repairFilter).toHaveAttribute("aria-pressed", "true");
  await mapFilters.getByRole("button", { name: "Close map filters" }).click();
  await expect(mapFilters).toHaveCount(0);
  await expect(
    page.getByText(/Official MTA routes · inventory updated/),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Search stations" }).click();
  const search = page.getByPlaceholder("Station, route, or neighborhood");
  await expect(search).toBeVisible();
  await search.fill("149 St-Hostos");
  await expect(
    page.getByRole("button", { name: /Show 149 St-Hostos on map/ }).first(),
  ).toBeVisible();

  const spotlight = page.getByTestId("project-spotlight");
  await expect(spotlight).toBeVisible({ timeout: 15_000 });
  await expect(spotlight).toHaveAttribute(
    "href",
    /^https:\/\/www\.mta\.info\/press-release\//,
  );
  await expect(spotlight).toHaveAttribute(
    "aria-label",
    /^Latest MTA accessibility release:/,
  );
});

test("starts with only NYC Subway routes and restores map preferences", async ({
  page,
}) => {
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("access-nyc:home-map-filters:v1");
        return raw ? JSON.parse(raw).enabledTransitRoutes : null;
      }),
    )
    .toEqual(
      expect.arrayContaining(["NYCTA:1", "NYCTA:A", "NYCTA:SI"]),
    );
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("access-nyc:home-map-filters:v1");
      const routes = raw ? JSON.parse(raw).enabledTransitRoutes : [];
      return routes.every((route: string) => route.startsWith("NYCTA:"));
    }),
  ).toBe(true);

  await page.getByRole("button", { name: "Filter map" }).click();
  const filters = page.getByRole("region", { name: "Map filters" });
  await filters.locator("summary").filter({ hasText: /^PATH/ }).click();
  const hoboken33 = filters.getByRole("button", { name: "HOB–33", exact: true });
  await expect(hoboken33).toHaveAttribute("aria-pressed", "false");
  await hoboken33.click();
  await page
    .getByRole("button", { name: "Collapse Access NYC header" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        mastheadOpen: JSON.parse(
          localStorage.getItem("access-nyc:home-masthead-open:v1") ?? "true",
        ),
        routes: JSON.parse(
          localStorage.getItem("access-nyc:home-map-filters:v1") ?? "{}",
        ).enabledTransitRoutes,
      })),
    )
    .toMatchObject({
      mastheadOpen: false,
      routes: expect.arrayContaining(["PATH:BLU"]),
    });

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand Access NYC header" }),
  ).toBeVisible();
  const restoredFilters = page.getByRole("region", { name: "Map filters" });
  await expect(restoredFilters).toBeVisible();
  await restoredFilters.locator("summary").filter({ hasText: /^PATH/ }).click();
  await expect(
    restoredFilters.getByRole("button", {
      name: "HOB–33",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("serves corrected regional transit data and filters to the map", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Filter map" })).toBeVisible();

  const dataBaseUrl = new URL(page.url());
  const [
    pathResponse,
    regionalResponse,
    airTrainResponse,
    jfkAirTrainResponse,
    njTransitResponse,
    ctrailResponse,
  ] = await Promise.all([
    page.request.get(new URL("/data/path-routes.geojson", dataBaseUrl).toString()),
    page.request.get(
      new URL("/data/mta-regional-rail-routes.geojson", dataBaseUrl).toString(),
    ),
    page.request.get(
      new URL("/data/ewr-airtrain-routes.geojson", dataBaseUrl).toString(),
    ),
    page.request.get(
      new URL("/data/jfk-airtrain-routes.geojson", dataBaseUrl).toString(),
    ),
    page.request.get(
      new URL("/data/nj-transit-routes.geojson", dataBaseUrl).toString(),
    ),
    page.request.get(
      new URL("/data/ctrail-routes.geojson", dataBaseUrl).toString(),
    ),
  ]);
  expect(pathResponse.ok()).toBe(true);
  expect(regionalResponse.ok()).toBe(true);
  expect(airTrainResponse.ok()).toBe(true);
  expect(jfkAirTrainResponse.ok()).toBe(true);
  expect(njTransitResponse.ok()).toBe(true);
  expect(ctrailResponse.ok()).toBe(true);

  const pathRoutes = (await pathResponse.json()) as {
    features: Array<{ properties: { route: string; routeId: string } }>;
  };
  expect(
    Object.fromEntries(
      pathRoutes.features.map((feature) => [
        feature.properties.routeId,
        feature.properties.route,
      ]),
    ),
  ).toMatchObject({
    BLU: "HOB-33",
    GRE: "HOB-WTC",
    RED: "NWK-WTC",
    YEL: "JSQ-33",
  });
  expect(
    pathRoutes.features.some((feature) => feature.properties.routeId === "ATW"),
  ).toBe(false);

  const regionalRoutes = (await regionalResponse.json()) as {
    features: Array<{
      properties: { agency: string; routeId: string; shapeId: string };
    }>;
  };
  expect(
    regionalRoutes.features.some(
      (feature) =>
        feature.properties.routeId === "BT" &&
        feature.properties.shapeId === "mta-gtfs-belmont-park-penn",
    ),
  ).toBe(true);
  expect(
    regionalRoutes.features.some(
      (feature) =>
        feature.properties.routeId === "BT" &&
        feature.properties.shapeId ===
          "mta-gtfs-belmont-park-grand-central",
    ),
  ).toBe(true);

  const jfkAirTrainRoutes = (await jfkAirTrainResponse.json()) as {
    features: Array<{
      geometry: { coordinates: number[][][]; type: "MultiLineString" };
      properties: { agency: string; routeId: string };
    }>;
  };
  expect(
    new Set(
      jfkAirTrainRoutes.features.map((feature) => feature.properties.routeId),
    ),
  ).toEqual(new Set(["HOWARD", "JAMAICA", "TERMINALS"]));
  const howardBeachRoute = jfkAirTrainRoutes.features.find(
    (feature) => feature.properties.routeId === "HOWARD",
  );
  const howardBeachCoordinates = howardBeachRoute?.geometry.coordinates.flat() || [];
  expect(Math.max(...howardBeachCoordinates.map(([longitude]) => longitude))).toBeGreaterThan(
    -73.79,
  );
  expect(Math.min(...howardBeachCoordinates.map(([, latitude]) => latitude))).toBeLessThan(
    40.65,
  );
  expect(
    regionalRoutes.features
      .filter(
        (feature) =>
          feature.properties.agency === "MNR" &&
          ["2", "6"].includes(feature.properties.routeId),
      )
      .every(
        (feature) =>
          feature.properties.shapeId.startsWith("osm-") ||
          feature.properties.shapeId ===
            "mta-gtfs-waterbury-bridgeport-connector",
      ),
  ).toBe(true);
  expect(
    regionalRoutes.features.some(
      (feature) =>
        feature.properties.shapeId ===
        "mta-gtfs-waterbury-bridgeport-connector",
    ),
  ).toBe(true);

  const airTrainRoutes = (await airTrainResponse.json()) as {
    features: Array<{
      properties: { agency: string; color: string; routeId: string };
    }>;
  };
  expect(airTrainRoutes.features.length).toBeGreaterThan(0);
  expect(
    airTrainRoutes.features.every(
      (feature) =>
        feature.properties.agency === "EWR AirTrain" &&
        feature.properties.routeId === "AIRTRAIN" &&
        feature.properties.color === "#C81858",
    ),
  ).toBe(true);

  const njTransitRoutes = (await njTransitResponse.json()) as {
    features: Array<{ properties: { agency: string; routeId: string } }>;
  };
  const njTransitRouteIds = new Set(
    njTransitRoutes.features.map((feature) => feature.properties.routeId),
  );
  expect(
    njTransitRouteIds.size,
  ).toBeGreaterThanOrEqual(17);
  for (const routeId of [
    "HBLR-8H",
    "HBLR-WST",
    "HBLR-HT",
    "NLR-NCS",
    "NLR-BSE",
  ]) {
    expect(njTransitRouteIds).toContain(routeId);
  }
  expect(
    njTransitRoutes.features.every(
      (feature) => feature.properties.agency === "NJ Transit",
    ),
  ).toBe(true);

  const ctrailRoutes = (await ctrailResponse.json()) as {
    features: Array<{ properties: { agency: string; routeId: string } }>;
  };
  expect(
    new Set(ctrailRoutes.features.map((feature) => feature.properties.routeId)),
  ).toEqual(new Set(["HART", "SLE"]));

  await page.getByRole("button", { name: "Filter map" }).click();
  const filters = page.getByRole("region", { name: "Map filters" });
  await filters.locator("summary").filter({ hasText: /^PATH/ }).click();
  await filters
    .locator("summary")
    .filter({ hasText: /^AirTrain Newark/ })
    .click();
  await filters
    .locator("summary")
    .filter({ hasText: /^NJT Light Rail/ })
    .click();
  for (const service of [
    "8th Street–Hoboken",
    "West Side Avenue–Tonnelle Avenue",
    "Hoboken–Tonnelle Avenue",
    "Grove Street–Newark Penn",
    "Broad Street–Newark Penn",
  ]) {
    await expect(filters.getByText(service, { exact: true })).toBeVisible();
  }
  await expect(
    filters.getByText("Hudson–Bergen Light Rail", { exact: true }),
  ).toHaveCount(0);
  await expect(
    filters.getByText("Newark Light Rail", { exact: true }),
  ).toHaveCount(0);
  const pathFilter = filters.getByText("All PATH", { exact: true });
  const airTrainFilter = filters.getByText("All AirTrain Newark", {
    exact: true,
  });
  const njTransitFilter = filters.getByText("All NJ Transit", { exact: true });
  const ctrailFilter = filters.getByText("All CTrail", { exact: true });
  await pathFilter.click();
  await airTrainFilter.click();
  await njTransitFilter.click();
  await ctrailFilter.click();
  await expect(pathFilter).toHaveAttribute("aria-pressed", "false");
  await expect(airTrainFilter).toHaveAttribute("aria-pressed", "false");
  await expect(njTransitFilter).toHaveAttribute("aria-pressed", "false");
  await expect(ctrailFilter).toHaveAttribute("aria-pressed", "false");
  await pathFilter.click();
  await airTrainFilter.click();
  await njTransitFilter.click();
  await ctrailFilter.click();
  await expect(pathFilter).toHaveAttribute("aria-pressed", "true");
  await expect(airTrainFilter).toHaveAttribute("aria-pressed", "true");
  await expect(njTransitFilter).toHaveAttribute("aria-pressed", "true");
  await expect(ctrailFilter).toHaveAttribute("aria-pressed", "true");

  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await page.waitForTimeout(2_000);
  await page.screenshot({
    path: testInfo.outputPath("corrected-transit-map.png"),
  });
  expect(pageErrors).toEqual([]);
});

test("searches Capital Plan projects and opens budget history", async ({ page }) => {
  await page.goto("/projects");

  await expect(
    page.getByRole("heading", { name: "Elevator and escalator projects" }),
  ).toBeVisible();
  await page.getByPlaceholder("Project, ID, phase, or agency").fill("T9040701");
  await expect(page.getByTestId("capital-project-result")).toHaveCount(1);
  await page.getByRole("link", { name: "Replace 45 Elevators" }).click();

  await expect(page).toHaveURL(/\/projects\/legacy-T9040701$/);
  await expect(
    page.getByRole("heading", { name: "Replace 45 Elevators" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Budget detail and history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plan allocations and amendments" }),
  ).toBeVisible();
  await expect(page.getByText("reduction reflects transfers", { exact: false })).toBeVisible();
});

test("shows modern project milestones even when percent complete is unpublished", async ({
  page,
}) => {
  await page.goto("/projects/modern-8356");

  await expect(
    page.getByRole("heading", {
      name: "NYCT ADA Station Improvements: 149 St Complex & Tremont Av",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Phases and milestones" })).toBeVisible();
  await expect(page.getByText("Financial Closeout", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest budget by ACEP", { exact: true })).toBeVisible();
});
