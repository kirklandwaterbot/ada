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

test("mobile navigation opens and reaches the equipment inventory", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Equipment", exact: true }).click();
  await expect(page).toHaveURL(/\/equipment$/);
  await expect(
    page.getByRole("heading", { name: "Every asset, one searchable view" }),
  ).toBeVisible({ timeout: 15_000 });
});

test("aligns the project spotlight with the station directory on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto("/");

  const spotlight = page.getByTestId("project-spotlight");
  const directory = page.getByTestId("station-directory");
  await expect(spotlight).toBeVisible({ timeout: 15_000 });
  await expect(directory).toBeVisible({ timeout: 15_000 });

  const spotlightBox = await spotlight.boundingBox();
  const directoryBox = await directory.boundingBox();

  expect(spotlightBox).not.toBeNull();
  expect(directoryBox).not.toBeNull();
  expect(
    Math.abs(
      spotlightBox!.y + spotlightBox!.height -
        (directoryBox!.y + directoryBox!.height),
    ),
  ).toBeLessThanOrEqual(2);
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
