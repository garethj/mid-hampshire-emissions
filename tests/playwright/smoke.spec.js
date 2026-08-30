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

// Regression test for a real bug: the generation and consumption "latest" bar charts placed each
// bar's value+unit label in a *fixed*-width right margin. A shorter bar leaves unused plot space
// for its label to spill into before hitting the SVG's edge, but the chart's longest bar already
// fills the full plot width, so its label has only that fixed margin to work with — if the label
// text (e.g. "84,519.7 kWh/person") is wider than the margin, it gets clipped exactly there. Only
// a real browser can measure actual rendered text width (jsdom's getBBox always returns zeros),
// which is why this lives here rather than in the jsdom suite. Also covers the sector/gas charts'
// "Fixed scale" mode, added later: their bars get shorter (not longer) relative to auto mode when
// the tier max exceeds the current region's own max, so this is a lower-risk code path than
// generation/consumption's, but still worth checking given it shares the same margin-sizing idea.
async function overflowingValueLabels(page, svgSelector) {
  return page.locator(svgSelector).evaluate((svg) => {
    const vb = svg.viewBox.baseVal;
    return Array.from(svg.querySelectorAll('text[font-weight="700"]'))
      .map((t) => {
        const box = t.getBBox();
        return { text: t.textContent, right: box.x + box.width, vbRight: vb.x + vb.width };
      })
      .filter((r) => r.right > r.vbRight + 0.5); // small tolerance for sub-pixel rounding
  });
}

test("bar chart value labels never overflow the chart's SVG viewBox, even for the longest bar", async ({ page }) => {
  // New Forest is the known worst case (its Fossil fuels bar is the longest in the site, and its
  // value label — "84,519.7 kWh/person" — is one of the widest), but Hampshire and the Solent
  // (largest totals) and Winchester (the default, smallest numbers) exercise the same code path
  // at very different magnitudes.
  for (const region of ["new-forest", "hampshire-solent", "winchester"]) {
    await page.goto(`index.html?region=${region}`);
    await page.click('[data-view="latest"]');

    // Both scale modes: fixed mode's margin is sized from the tier's peak value/label rather
    // than the current region's own (see latestBarRightMargin in app.js), a different code path
    // worth its own overflow check.
    for (const scaleMode of ["fixed", "auto"]) {
      await page.click(`[data-scale-mode="${scaleMode}"]`);
      for (const metric of ["per_capita", "total"]) {
        await page.click(`[data-metric="${metric}"]`);

        // Sector and gas charts don't depend on the energy-unit toggle, so check them once per
        // scale mode/metric rather than inside the unit loop below.
        let sectorOverflow = await overflowingValueLabels(page, "#sector-chart svg");
        expect(sectorOverflow, `sector chart (${region}, ${scaleMode}, ${metric}): ${JSON.stringify(sectorOverflow)}`).toEqual([]);

        await page.check("#sector-detail-toggle");
        sectorOverflow = await overflowingValueLabels(page, "#sector-chart svg");
        expect(sectorOverflow, `sector chart, sub-sector detail (${region}, ${scaleMode}, ${metric}): ${JSON.stringify(sectorOverflow)}`).toEqual([]);
        await page.uncheck("#sector-detail-toggle");

        const gasOverflow = await overflowingValueLabels(page, "#gas-chart svg");
        expect(gasOverflow, `gas chart (${region}, ${scaleMode}, ${metric}): ${JSON.stringify(gasOverflow)}`).toEqual([]);

        for (const unit of ["kwh", "toe"]) {
          await page.click(`[data-energy-unit="${unit}"]`);

          let overflow = await overflowingValueLabels(page, "#generation-chart svg");
          expect(overflow, `generation chart (${region}, ${scaleMode}, ${metric}, ${unit}): ${JSON.stringify(overflow)}`).toEqual([]);

          overflow = await overflowingValueLabels(page, "#consumption-chart svg");
          expect(overflow, `consumption chart, By fuel type (${region}, ${scaleMode}, ${metric}, ${unit}): ${JSON.stringify(overflow)}`).toEqual([]);

          await page.check("#consumption-detail-toggle");
          overflow = await overflowingValueLabels(page, "#consumption-chart svg");
          expect(overflow, `consumption chart, all fuel types (${region}, ${scaleMode}, ${metric}, ${unit}): ${JSON.stringify(overflow)}`).toEqual([]);
          await page.uncheck("#consumption-detail-toggle");

          await page.click('[data-consumption-view="sector"]');
          overflow = await overflowingValueLabels(page, "#consumption-chart svg");
          expect(overflow, `consumption chart, By sector (${region}, ${scaleMode}, ${metric}, ${unit}): ${JSON.stringify(overflow)}`).toEqual([]);
          await page.click('[data-consumption-view="fuel"]');

          overflow = await overflowingValueLabels(page, "#green-fossil-chart svg");
          expect(overflow, `green/fossil chart (${region}, ${metric}, ${unit}): ${JSON.stringify(overflow)}`).toEqual([]);
        }
      }
    }
  }
});

// Regression test for a real bug: a card's own heading could render partially hidden behind the
// sticky control panel/region toggle/energy unit row when a browser-driven scroll (in-page
// search, a fragment link, Tab-focusing an element) landed on it, since nothing reserved enough
// clearance above it. scroll-margin-top (see .card in style.css) fixes this for exactly those
// browser-driven jumps — it doesn't and can't prevent a heading briefly sitting under the sticky
// bars mid-scroll during ordinary continuous scrolling, which is normal for any sticky-header
// design, so this test only checks the "jump to element" case, not continuous scrolling.
test("a card's own heading clears the sticky bars above it when scrolled to directly (not covered)", async ({ page }) => {
  await page.goto("index.html");

  // A card above the energy section (two sticky bars: control panel + region toggle).
  let overlap = await page.evaluate(() => {
    document.getElementById("sector-chart-title").scrollIntoView();
    const cp = document.getElementById("control-panel").getBoundingClientRect().bottom;
    const rt = document.querySelector(".region-toggle-row").getBoundingClientRect().bottom;
    const titleTop = document.getElementById("sector-chart-title").getBoundingClientRect().top;
    return titleTop < Math.max(cp, rt);
  });
  expect(overlap, "sector chart title should clear the control panel + region toggle").toBe(false);

  // A card inside #energy-scoped (three sticky bars, including the energy unit row).
  overlap = await page.evaluate(() => {
    document.getElementById("generation-chart-title").scrollIntoView();
    const eur = document.getElementById("energy-unit-row").getBoundingClientRect().bottom;
    const titleTop = document.getElementById("generation-chart-title").getBoundingClientRect().top;
    return titleTop < eur;
  });
  expect(overlap, "generation chart title should clear all three sticky bars, including the energy unit row").toBe(false);
});
