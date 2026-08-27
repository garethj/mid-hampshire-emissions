"use strict";
// UI smoke checks for what only a real browser can verify: actual SVG chart rendering, CSS-driven
// show/hide, and light/dark theme — the jsdom suite in tests/js/ already covers data-and-
// calculation correctness across every control permutation, so these stay few and high-level.
// Run manually via `npm run test:ui`, not on every commit (needs a downloaded browser).
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (err) => { throw err; });
});

test("loads Winchester by default and renders the trend chart as SVG", async ({ page }) => {
  await page.goto("index.html");
  await expect(page.locator("#sector-chart-title")).toContainText("Winchester");
  await expect(page.locator("#trend-chart svg")).toBeVisible();
  // Default view is "latest" (bars, one <rect> per region shown); the historical line view is
  // covered separately below.
  await expect(page.locator("#trend-chart svg rect")).not.toHaveCount(0);
});

test("deep link opens directly into the requested region", async ({ page }) => {
  await page.goto("index.html?region=isle-of-wight");
  await expect(page.locator("#region-select")).toHaveValue("isle-of-wight");
  await expect(page.locator("#sector-chart-title")).toContainText("Isle of Wight");
});

test("switching region updates every region-scoped chart title and the URL", async ({ page }) => {
  await page.goto("index.html");
  await page.selectOption("#region-select", "portsmouth");
  await expect(page.locator("#sector-chart-title")).toContainText("Portsmouth");
  await expect(page.locator("#gas-chart-title")).toContainText("Portsmouth");
  await expect(page).toHaveURL(/region=portsmouth/);
});

test("metric/view/horizon toggles switch active state and re-render without a page error", async ({ page }) => {
  await page.goto("index.html");
  await page.click('[data-view="historical"]');
  await expect(page.locator('[data-view="historical"]')).toHaveClass(/is-active/);
  await expect(page.locator("#trend-chart svg polyline, #trend-chart svg path").first()).toBeVisible();

  await page.click('[data-horizon="gwp20"]');
  await expect(page.locator("#horizon-banner")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/horizon-gwp20/);

  await page.click('[data-metric="total"]');
  await expect(page.locator('[data-metric="total"]')).toHaveClass(/is-active/);
});

test("'Show as table' reveals the data table", async ({ page }) => {
  await page.goto("index.html");
  const table = page.locator("#trend-table");
  await expect(table).toHaveClass(/is-hidden/);
  await page.click('.table-toggle[data-target="trend-table"]');
  await expect(table).not.toHaveClass(/is-hidden/);
  await expect(table.locator("table")).toBeVisible();
});

test("info modal opens on click and closes on Escape", async ({ page }) => {
  await page.goto("index.html");
  await page.click('[data-info="trend-chart"]');
  await expect(page.locator("#modal-overlay")).toBeVisible();
  await expect(page.locator("#modal-title")).not.toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal-overlay")).toBeHidden();
});

test("renders without a page error in forced dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("index.html");
  await expect(page.locator("#trend-chart svg")).toBeVisible();
});

test("modal title and close button stay in view when the body content is scrolled", async ({ page }) => {
  await page.goto("index.html");
  // "Full methodology & sources" is the longest dialog on the site, tall enough to scroll on any
  // reasonably-sized viewport.
  await page.click('[data-info="general-methodology"]');
  const before = await page.locator("#modal-close").boundingBox();

  await page.locator("#modal-body").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const after = await page.locator("#modal-close").boundingBox();

  expect(after).toEqual(before);
  await expect(page.locator("#modal-close")).toBeInViewport();
  await expect(page.locator("#modal-title")).toBeInViewport();
});

test("energy unit toggle sits above the generation/consumption charts, not the top control panel, and switches units live", async ({ page }) => {
  await page.goto("index.html");
  await expect(page.locator('#control-panel [data-energy-unit]')).toHaveCount(0);
  await expect(page.locator('#energy-scoped [data-energy-unit="toe"]')).toBeVisible();

  await page.click('.table-toggle[data-target="generation-table"]');
  await expect(page.locator("#generation-table thead th").nth(1)).toContainText("kWh/person");

  await page.click('[data-energy-unit="toe"]');
  await expect(page.locator('[data-energy-unit="toe"]')).toHaveClass(/is-active/);
  await expect(page.locator("#generation-table thead th").nth(1)).toContainText("toe/person");
});

test("'Compare all constituents' checkbox changes the number of chart bars/lines shown", async ({ page }) => {
  await page.goto("index.html?region=eastleigh");
  await page.click('[data-view="historical"]');
  const before = await page.locator("#trend-chart .legend-item").count();
  await page.check("#compare-constituents-toggle");
  const after = await page.locator("#trend-chart .legend-item").count();
  expect(after).not.toBe(before);
});
