"use strict";
// Integration tests for assets/js/app.js, run against the real index.html + app.js (unmodified)
// in jsdom — see helpers/loadApp.js. These drive the actual DOM controls (region select, metric/
// view/horizon toggles, checkboxes) the way a user would, and check two things per control
// combination: (1) nothing throws, across every one of the 19 regions, and (2) numbers rendered
// into the on-page tables are self-consistent with the underlying DATA/ENERGY_DATA the page
// loaded — i.e. the JS layer's per-control-combination arithmetic (division for per-capita/per-
// person, region-hierarchy traversal, gwp20 swap) correctly reflects the pre-computed JSON, which
// data/tests/test_committed_data.py already validates independently in Python.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, fireChange, fireClick, getData, tableRows } = require("./helpers/loadApp");

function num(text) {
  return Number(String(text).replace(/[^0-9.-]/g, ""));
}

test("loads with the default region (Winchester) and no console errors", async () => {
  const dom = await loadApp();
  const { window } = dom;
  assert.equal(window.document.getElementById("region-select").value, "winchester");
  assert.match(window.document.getElementById("sector-chart-title").textContent, /^Winchester/);
  assert.deepEqual(dom.errors, []);
});

test("deep link (?region=) opens directly into that region", async () => {
  const dom = await loadApp({ region: "eastleigh" });
  assert.equal(dom.window.document.getElementById("region-select").value, "eastleigh");
  assert.deepEqual(dom.errors, []);
});

test("deep link with an unknown region key falls back to Winchester", async () => {
  const dom = await loadApp({ region: "not-a-real-region" });
  assert.equal(dom.window.document.getElementById("region-select").value, "winchester");
  assert.deepEqual(dom.errors, []);
});

test("every region in region_index can be selected, in every metric/view/horizon combination, without error", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;
  const sel = doc.getElementById("region-select");

  for (const r of DATA.meta.region_index) {
    sel.value = r.key;
    fireChange(window, sel);
    for (const view of ["latest", "historical"]) {
      fireClick(window, doc.querySelector(`[data-view="${view}"]`));
      for (const metric of ["per_capita", "total"]) {
        fireClick(window, doc.querySelector(`[data-metric="${metric}"]`));
        for (const horizon of ["gwp100", "gwp20"]) {
          fireClick(window, doc.querySelector(`[data-horizon="${horizon}"]`));
        }
      }
    }
  }

  assert.deepEqual(dom.errors, [], `unexpected error(s) while cycling every region x control combination: ${dom.errors.map(String)}`);
});

test("switching region updates the URL's ?region= param, and clears it for Winchester", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const doc = window.document;
  const sel = doc.getElementById("region-select");

  sel.value = "portsmouth";
  fireChange(window, sel);
  assert.equal(new window.URL(window.location.href).searchParams.get("region"), "portsmouth");

  sel.value = "winchester";
  fireChange(window, sel);
  assert.equal(new window.URL(window.location.href).searchParams.get("region"), null);
});

test("historical trend table's per-capita values match DATA for the selected region", async () => {
  const dom = await loadApp({ region: "isle-of-wight" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;
  fireClick(window, doc.querySelector('[data-view="historical"]'));

  const rows = tableRows(window, "trend-table");
  const years = DATA.meta.years;
  assert.equal(rows.length, years.length);

  // Context mode's first column is the selected region itself (self, then ancestors) — check a
  // handful of years rather than all, to keep this fast.
  [0, Math.floor(years.length / 2), years.length - 1].forEach((i) => {
    const year = years[i];
    const expected = DATA.regions["isle-of-wight"].years[year].per_capita_t_co2e;
    assert.ok(Math.abs(num(rows[i][1]) - expected) < 0.02,
      `year ${year}: table shows ${rows[i][1]}, DATA has ${expected}`);
  });
});

test("switching metric to Totals renders total_kt_co2e, not per-capita", async () => {
  const dom = await loadApp({ region: "hart" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;
  fireClick(window, doc.querySelector('[data-view="historical"]'));
  fireClick(window, doc.querySelector('[data-metric="total"]'));

  const rows = tableRows(window, "trend-table");
  const years = DATA.meta.years;
  const lastIdx = years.length - 1;
  const expected = DATA.regions["hart"].years[years[lastIdx]].total_kt_co2e;
  assert.ok(Math.abs(num(rows[lastIdx][1]) - expected) < 1,
    `table shows ${rows[lastIdx][1]}, DATA total_kt_co2e is ${expected}`);
});

test("switching horizon to 20-year renders gwp20 figures and shows the banner", async () => {
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;
  fireClick(window, doc.querySelector('[data-view="historical"]'));
  fireClick(window, doc.querySelector('[data-horizon="gwp20"]'));

  assert.ok(!doc.getElementById("horizon-banner").classList.contains("is-hidden"));
  assert.ok(doc.body.classList.contains("horizon-gwp20"));

  const rows = tableRows(window, "trend-table");
  const years = DATA.meta.years;
  const lastIdx = years.length - 1;
  const expected = DATA.regions["new-forest"].years[years[lastIdx]].gwp20.per_capita_t_co2e;
  assert.ok(Math.abs(num(rows[lastIdx][1]) - expected) < 0.02,
    `table shows ${rows[lastIdx][1]}, DATA gwp20 per-capita is ${expected}`);

  fireClick(window, doc.querySelector('[data-horizon="gwp100"]'));
  assert.ok(doc.getElementById("horizon-banner").classList.contains("is-hidden"));
  assert.ok(!doc.body.classList.contains("horizon-gwp20"));
});

test("sector table rows sum to the same total shown in the trend chart, for total and per-capita", async () => {
  const dom = await loadApp({ region: "gosport" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  for (const metric of ["per_capita", "total"]) {
    fireClick(window, doc.querySelector(`[data-metric="${metric}"]`));
    const rows = tableRows(window, "sector-table");
    const sum = rows.reduce((acc, row) => acc + num(row[1]), 0);
    const ly = DATA.meta.years[DATA.meta.years.length - 1];
    const yd = DATA.regions["gosport"].years[ly];
    const expectedTotal = metric === "total" ? yd.total_kt_co2e : yd.per_capita_t_co2e;
    const tolerance = metric === "total" ? 1 : 0.05;
    assert.ok(Math.abs(sum - expectedTotal) < tolerance,
      `${metric}: sector rows sum to ${sum}, expected ~${expectedTotal}`);
  }
});

test("'Compare all constituents' shows the right sibling count for a leaf region vs a hub region", async () => {
  const dom = await loadApp({ region: "eastleigh" }); // leaf: historic district under south-west-hampshire
  const { window } = dom;
  const doc = window.document;
  const toggle = doc.getElementById("compare-constituents-toggle");

  // The legend (and its .legend-item nodes) only exist in the historical view.
  fireClick(window, doc.querySelector('[data-view="historical"]'));

  toggle.checked = true;
  fireChange(window, toggle);
  // south-west-hampshire's children: eastleigh, southampton
  assert.equal(doc.querySelectorAll("#trend-chart .legend-item").length, 2);

  // context mode (self + ancestors up to Hampshire and the Solent): eastleigh -> south-west-hampshire -> hampshire-solent
  toggle.checked = false;
  fireChange(window, toggle);
  assert.equal(doc.querySelectorAll("#trend-chart .legend-item").length, 3);
});

test("info modal opens with non-empty content and closes on Escape", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-info="trend-chart"]'));
  assert.ok(!doc.getElementById("modal-overlay").classList.contains("is-hidden"));
  assert.ok(doc.getElementById("modal-title").textContent.length > 0);
  assert.ok(doc.getElementById("modal-body").textContent.length > 0);

  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.ok(doc.getElementById("modal-overlay").classList.contains("is-hidden"));
});

test("energy unit toggle lives above the generation/consumption charts, not the top control panel", async () => {
  const dom = await loadApp();
  const doc = dom.window.document;

  assert.equal(doc.querySelector("#control-panel [data-energy-unit]"), null,
    "energy unit toggle should not be in the page-wide control panel");

  const toggle = doc.querySelector('[data-energy-unit="toe"]');
  assert.ok(toggle, "expected an energy-unit toggle button somewhere on the page");

  const energyScoped = doc.getElementById("energy-scoped");
  assert.ok(energyScoped, "expected an #energy-scoped wrapper");
  assert.ok(energyScoped.contains(toggle), "toggle should live inside #energy-scoped");
  assert.ok(energyScoped.contains(doc.getElementById("generation-chart")));
  assert.ok(energyScoped.contains(doc.getElementById("consumption-chart")));

  // The three emissions charts don't read currentEnergyUnit, and shouldn't be inside its scope.
  assert.ok(!energyScoped.contains(doc.getElementById("trend-chart")));
  assert.ok(!energyScoped.contains(doc.getElementById("sector-chart")));
  assert.ok(!energyScoped.contains(doc.getElementById("gas-chart")));
});

test("energy unit toggle converts generation and consumption tables between MWh-based and ktoe-based figures", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { DATA, ENERGY_DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('.table-toggle[data-target="generation-table"]'));
  fireClick(window, doc.querySelector('.table-toggle[data-target="consumption-table"]'));

  const gy = ENERGY_DATA.meta.generation_years[ENERGY_DATA.meta.generation_years.length - 1];
  const cy = ENERGY_DATA.meta.consumption_years[ENERGY_DATA.meta.consumption_years.length - 1];
  const gen = ENERGY_DATA.regions.winchester.generation[gy];
  const con = ENERGY_DATA.regions.winchester.consumption[cy];
  const popGy = DATA.regions.winchester.years[gy].population_thousands;
  const popCy = DATA.regions.winchester.years[cy].population_thousands;
  const KTOE_TO_MWH = 11630;

  // Default is per-capita, MWh-based: generation shows its native kWh/person; consumption is
  // converted from its native toe/person.
  assert.ok(doc.querySelector('[data-energy-unit="kwh"]').classList.contains("is-active"));
  let genSum = tableRows(window, "generation-table").reduce((acc, row) => acc + num(row[1]), 0);
  let conSum = tableRows(window, "consumption-table").reduce((acc, row) => acc + num(row[1]), 0);
  const expectedGenKwh = gen.total_mwh / popGy;
  const expectedConKwh = (con.all_fuels_ktoe / popCy) * KTOE_TO_MWH;
  assert.ok(Math.abs(genSum - expectedGenKwh) < 0.5,
    `generation table sums to ${genSum} kWh/person, expected ~${expectedGenKwh}`);
  assert.ok(Math.abs(conSum - expectedConKwh) < 5,
    `consumption table sums to ${conSum} kWh/person, expected ~${expectedConKwh}`);

  // Switch to ktoe-based: generation is now converted, consumption reverts to its native figure.
  fireClick(window, doc.querySelector('[data-energy-unit="toe"]'));
  assert.ok(doc.querySelector('[data-energy-unit="toe"]').classList.contains("is-active"));
  assert.ok(!doc.querySelector('[data-energy-unit="kwh"]').classList.contains("is-active"));
  genSum = tableRows(window, "generation-table").reduce((acc, row) => acc + num(row[1]), 0);
  conSum = tableRows(window, "consumption-table").reduce((acc, row) => acc + num(row[1]), 0);
  const expectedGenToe = expectedGenKwh / KTOE_TO_MWH;
  const expectedConToe = con.all_fuels_ktoe / popCy;
  assert.ok(Math.abs(genSum - expectedGenToe) < 0.05,
    `generation table sums to ${genSum} toe/person, expected ~${expectedGenToe}`);
  assert.ok(Math.abs(conSum - expectedConToe) < 0.05,
    `consumption table sums to ${conSum} toe/person, expected ~${expectedConToe}`);
});

test("energy unit toggle can be switched in every metric/view combination without error", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const doc = window.document;

  for (const view of ["latest", "historical"]) {
    fireClick(window, doc.querySelector(`[data-view="${view}"]`));
    for (const metric of ["per_capita", "total"]) {
      fireClick(window, doc.querySelector(`[data-metric="${metric}"]`));
      for (const unit of ["kwh", "toe"]) {
        fireClick(window, doc.querySelector(`[data-energy-unit="${unit}"]`));
      }
    }
  }

  assert.deepEqual(dom.errors, [], `unexpected error(s) while cycling energy unit x metric x view: ${dom.errors.map(String)}`);
});

test("generation chart's info modal shows a % of demand figure consistent with the raw MWh totals", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { DATA, ENERGY_DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-info="generation-chart"]'));
  const bodyText = doc.getElementById("modal-body").textContent;
  const match = bodyText.match(/equivalent to ([\d.]+)% of estimated local electricity demand/);
  assert.ok(match, `modal body didn't contain the expected sentence: ${bodyText}`);

  const gy = ENERGY_DATA.meta.generation_years[ENERGY_DATA.meta.generation_years.length - 1];
  const gen = ENERGY_DATA.regions.winchester.generation[gy];
  const con = ENERGY_DATA.regions.winchester.consumption[gy];
  const expectedShare = (gen.total_mwh / con.electricity_consumption_mwh) * 100;
  assert.ok(Math.abs(Number(match[1]) - expectedShare) < 0.1,
    `modal shows ${match[1]}%, expected ~${expectedShare.toFixed(1)}%`);
});

test("consumption chart's 'By sector' view sums to the same all_fuels_ktoe total as 'By fuel type', and disables the fuel-detail checkbox", async () => {
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const { ENERGY_DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="total"]'));
  // Compare against the dataset's native ktoe unit directly, rather than the default GWh-based
  // display (which would need its own KTOE_TO_MWH conversion to compare against all_fuels_ktoe).
  fireClick(window, doc.querySelector('[data-energy-unit="toe"]'));
  fireClick(window, doc.querySelector('.table-toggle[data-target="consumption-table"]'));

  const cy = ENERGY_DATA.meta.consumption_years[ENERGY_DATA.meta.consumption_years.length - 1];
  const con = ENERGY_DATA.regions["new-forest"].consumption[cy];

  assert.ok(doc.querySelector('[data-consumption-view="fuel"]').classList.contains("is-active"));
  assert.ok(!doc.getElementById("consumption-detail-toggle").disabled);

  fireClick(window, doc.querySelector('[data-consumption-view="sector"]'));
  assert.ok(doc.querySelector('[data-consumption-view="sector"]').classList.contains("is-active"));
  assert.ok(!doc.querySelector('[data-consumption-view="fuel"]').classList.contains("is-active"));
  assert.ok(doc.getElementById("consumption-detail-toggle").disabled,
    "the 'Show all fuel types' checkbox should be disabled in the 'By sector' view — it doesn't apply to that axis");

  const rows = tableRows(window, "consumption-table");
  assert.equal(rows.length, 3, "expected exactly the three sector rows (Domestic, Transport, Industrial/Commercial/other)");
  const sectorSum = rows.reduce((acc, row) => acc + num(row[1]), 0);
  assert.ok(Math.abs(sectorSum - con.all_fuels_ktoe) < 0.5,
    `sector table sums to ${sectorSum} ktoe, expected ~${con.all_fuels_ktoe} (all_fuels_ktoe)`);

  // New Forest's oil refining should make "Industrial, Commercial and other" the dominant row —
  // this is the anomaly the "By sector" view exists to make visible (see
  // ENERGY_DATA.meta.note_industrial_consumption).
  const industrialRow = rows.find(r => /Industrial/.test(r[0]));
  const domesticRow = rows.find(r => /Domestic/.test(r[0]));
  assert.ok(industrialRow && domesticRow, `expected Domestic and Industrial rows, got: ${JSON.stringify(rows)}`);
  assert.ok(num(industrialRow[1]) > num(domesticRow[1]) * 2,
    `expected New Forest's industrial consumption (${industrialRow[1]}) to dwarf its domestic consumption (${domesticRow[1]})`);
});

test("switching back to 'By fuel type' from 'By sector' re-enables the fuel-detail checkbox and restores its prior state", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const doc = window.document;

  fireClick(window, doc.getElementById("consumption-detail-toggle"));
  assert.ok(doc.getElementById("consumption-detail-toggle").checked);

  fireClick(window, doc.querySelector('[data-consumption-view="sector"]'));
  assert.ok(doc.getElementById("consumption-detail-toggle").disabled);
  assert.ok(doc.getElementById("consumption-detail-toggle").checked,
    "checked state should be preserved (not reset) while the checkbox is disabled");

  fireClick(window, doc.querySelector('[data-consumption-view="fuel"]'));
  assert.ok(!doc.getElementById("consumption-detail-toggle").disabled);
  assert.ok(doc.getElementById("consumption-detail-toggle").checked);
});

test("consumption view toggle (By fuel type / By sector) can be switched in every metric/view/energy-unit combination without error", async () => {
  const dom = await loadApp();
  const { window } = dom;
  const doc = window.document;

  for (const view of ["latest", "historical"]) {
    fireClick(window, doc.querySelector(`[data-view="${view}"]`));
    for (const metric of ["per_capita", "total"]) {
      fireClick(window, doc.querySelector(`[data-metric="${metric}"]`));
      for (const unit of ["kwh", "toe"]) {
        fireClick(window, doc.querySelector(`[data-energy-unit="${unit}"]`));
        for (const consView of ["sector", "fuel"]) {
          fireClick(window, doc.querySelector(`[data-consumption-view="${consView}"]`));
        }
      }
    }
  }

  assert.deepEqual(dom.errors, [], `unexpected error(s) while cycling consumption view x metric x view x energy unit: ${dom.errors.map(String)}`);
});

// Pairs each bar's label <text> (text-anchor="end") with the <rect> immediately after it in the
// same row — matches the render order in buildGenerationChartLatest/buildConsumptionChartLatest
// (label, then rect, then value text, per row), so the Nth label corresponds to the Nth rect.
function barWidthsByLabel(window, chartId) {
  const svg = window.document.querySelector(`#${chartId} svg`);
  const labels = Array.from(svg.querySelectorAll('text[text-anchor="end"]')).map((t) => t.textContent);
  const rects = Array.from(svg.querySelectorAll("rect"));
  const out = {};
  labels.forEach((name, i) => { out[name] = Number(rects[i].getAttribute("width")); });
  return out;
}

test("fixed scale mode is the default, and gives regions in the same tier the same px-per-unit axis (generation chart)", async () => {
  const dom = await loadApp({ region: "gosport" });
  const { window } = dom;
  const { DATA, ENERGY_DATA } = getData(window);
  const doc = window.document;

  assert.ok(doc.querySelector('[data-scale-mode="fixed"]').classList.contains("is-active"),
    "fixed scale should be the default, not auto");

  const gy = ENERGY_DATA.meta.generation_years[ENERGY_DATA.meta.generation_years.length - 1];
  const perCapita = (regionKey) => ENERGY_DATA.regions[regionKey].generation[gy].by_technology_mwh.Solar
    / DATA.regions[regionKey].years[gy].population_thousands;

  const gosportWidths = barWidthsByLabel(window, "generation-chart");
  doc.getElementById("region-select").value = "test-valley";
  fireChange(window, doc.getElementById("region-select"));
  const testValleyWidths = barWidthsByLabel(window, "generation-chart");

  // Gosport and Test Valley are both historic districts (same tier) with a genuinely large
  // (~20x) difference in per-capita solar generation — the exact "Gosport vs Test Valley" example
  // from the feedback this feature was built for. Under a shared (fixed) axis, the same
  // real-world quantity should occupy the same pixels-per-unit regardless of which region's
  // screen you're looking at.
  const gosportPxPerUnit = gosportWidths.Solar / perCapita("gosport");
  const testValleyPxPerUnit = testValleyWidths.Solar / perCapita("test-valley");
  assert.ok(Math.abs(gosportPxPerUnit - testValleyPxPerUnit) < 0.01,
    `expected the same px/unit scale in fixed mode, got Gosport=${gosportPxPerUnit} vs Test Valley=${testValleyPxPerUnit}`);

  // Switching to "Auto scale" should break that equality for Gosport — the small region, not Test
  // Valley (which happens to *be* the tier's own largest region for per-capita solar generation,
  // so fixed and auto scale are legitimately identical for it; that's not a bug, just a
  // coincidence of the data, so it's the wrong region to prove the toggle does anything).
  // Gosport's own auto-scaled max is far smaller than the tier max, so its bar should visibly
  // widen once "Auto scale" refits the axis to its own (much smaller) figures — this is the
  // regression check: without the toggle actually doing anything, this would stay unchanged.
  doc.getElementById("region-select").value = "gosport";
  fireChange(window, doc.getElementById("region-select"));
  fireClick(window, doc.querySelector('[data-scale-mode="auto"]'));
  const gosportAutoWidths = barWidthsByLabel(window, "generation-chart");
  const gosportAutoPxPerUnit = gosportAutoWidths.Solar / perCapita("gosport");
  assert.ok(Math.abs(gosportAutoPxPerUnit - gosportPxPerUnit) > 1,
    "expected auto scale to render a visibly different bar width than fixed scale for Gosport");
});

test("fixed scale mode also applies to the historical trend line (consumption chart, 'By sector' axis)", async () => {
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const { DATA, ENERGY_DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-view="historical"]'));
  fireClick(window, doc.querySelector('[data-consumption-view="sector"]'));
  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));
  fireClick(window, doc.querySelector('[data-energy-unit="toe"]')); // native ktoe/toe-per-person units, to compare directly against raw sector_ktoe

  // Independently recompute the expected tier-wide axis max: the largest per-capita value of any
  // sector, in any year, for any historic district — the same scope consumptionTierMax uses in
  // app.js — then compare against the historical chart's actual rendered axis. The y-axis max
  // itself isn't exposed in the DOM, so read it back off the topmost gridline label instead.
  const historicDistricts = DATA.meta.region_index.filter((r) => r.group === "historic-district").map((r) => r.key);
  let expectedTierMax = 0;
  for (const r of historicDistricts) {
    for (const year of Object.keys(ENERGY_DATA.regions[r].consumption)) {
      const sectors = ENERGY_DATA.regions[r].consumption[year].sector_ktoe;
      const pop = DATA.regions[r].years[year].population_thousands;
      for (const v of Object.values(sectors)) {
        const perCapita = v / pop;
        if (perCapita > expectedTierMax) expectedTierMax = perCapita;
      }
    }
  }

  const svg = doc.querySelector("#consumption-chart svg");
  const gridlineValues = Array.from(svg.querySelectorAll('text[font-size="11"]'))
    .map((t) => t.textContent)
    .filter((t) => t.includes(".")) // excludes the x-axis year labels (plain integers, e.g. "2024")
    .map((t) => Number(t.replace(/,/g, "")));
  const renderedAxisMax = Math.max(...gridlineValues);

  // New Forest's own oil-refining-driven peak should dominate this tier's max, so this is also an
  // implicit check that New Forest itself is the region setting the shared scale here.
  assert.ok(Math.abs(renderedAxisMax - expectedTierMax * 1.08) < 1,
    `rendered axis max ${renderedAxisMax} toe/person, expected ~${(expectedTierMax * 1.08).toFixed(2)} (tier max x 1.08 headroom)`);
});

test("fixed scale mode also gives regions in the same tier the same px-per-unit axis on the gas chart", async () => {
  const dom = await loadApp({ region: "gosport" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));

  const ly = DATA.meta.years[DATA.meta.years.length - 1];
  const perCapita = (regionKey) => {
    const yd = DATA.regions[regionKey].years[ly];
    return yd.gases_kt_co2e.CO2 / yd.population_thousands;
  };

  // Gosport (smallest per-capita CO2 among historic districts) vs Winchester (the largest) —
  // neither happens to already be the tier's own max across *every* year, unlike the
  // Test-Valley-for-solar coincidence noted below, so both sides of this comparison are
  // meaningful checks, not just a restatement of "this region already sets the scale".
  const gosportWidths = barWidthsByLabel(window, "gas-chart");
  doc.getElementById("region-select").value = "winchester";
  fireChange(window, doc.getElementById("region-select"));
  const winchesterWidths = barWidthsByLabel(window, "gas-chart");

  const gosportPxPerUnit = gosportWidths.CO2 / perCapita("gosport");
  const winchesterPxPerUnit = winchesterWidths.CO2 / perCapita("winchester");
  assert.ok(Math.abs(gosportPxPerUnit - winchesterPxPerUnit) < 0.01,
    `expected the same px/unit scale in fixed mode, got Gosport=${gosportPxPerUnit} vs Winchester=${winchesterPxPerUnit}`);

  doc.getElementById("region-select").value = "gosport";
  fireChange(window, doc.getElementById("region-select"));
  fireClick(window, doc.querySelector('[data-scale-mode="auto"]'));
  const gosportAutoWidths = barWidthsByLabel(window, "gas-chart");
  const gosportAutoPxPerUnit = gosportAutoWidths.CO2 / perCapita("gosport");
  assert.ok(Math.abs(gosportAutoPxPerUnit - gosportPxPerUnit) > 1,
    "expected auto scale to render a visibly different bar width than fixed scale for Gosport");
});

test("fixed scale mode's sector chart axis is the largest magnitude across the tier (diverging LULUCF-aware), and applies to the historical trend too", async () => {
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-view="historical"]'));
  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));

  // Independently recompute the expected tier-wide magnitude: the largest |value| of any sector,
  // in any year, for any historic district — mirrors sectorTierMax in app.js, including LULUCF's
  // negative values (Math.abs, not a plain max).
  const historicDistricts = DATA.meta.region_index.filter((r) => r.group === "historic-district").map((r) => r.key);
  let expectedTierMax = 0;
  for (const r of historicDistricts) {
    for (const year of DATA.meta.years) {
      const yd = DATA.regions[r].years[year];
      for (const v of Object.values(yd.sectors_kt_co2e)) {
        const abs = Math.abs(v / yd.population_thousands);
        if (abs > expectedTierMax) expectedTierMax = abs;
      }
    }
  }

  // Historical sector chart has no row labels (only axis ticks + a legend), so text-anchor="end"
  // cleanly isolates the y-axis value labels from the x-axis year labels (text-anchor="middle").
  const svg = doc.querySelector("#sector-chart svg");
  const tickValues = Array.from(svg.querySelectorAll('text[text-anchor="end"]'))
    .map((t) => Number(t.textContent.replace(/,/g, "")));
  const renderedAxisMax = Math.max(...tickValues);

  assert.ok(Math.abs(renderedAxisMax - expectedTierMax * 1.08) < 0.5,
    `rendered axis max ${renderedAxisMax} t/person, expected ~${(expectedTierMax * 1.08).toFixed(2)} (tier max x 1.08 headroom)`);
});

test("sector chart's sub-sector detail view scales fixed axis to the tier's latest-year sub-sector max, not full history", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.getElementById("sector-detail-toggle"));

  const ly = DATA.meta.years[DATA.meta.years.length - 1];
  const historicDistricts = DATA.meta.region_index.filter((r) => r.group === "historic-district").map((r) => r.key);
  let expectedTierMax = 0;
  for (const r of historicDistricts) {
    const detail = DATA.subsector_detail_latest_year[r] || {};
    const pop = DATA.regions[r].years[ly].population_thousands;
    for (const subs of Object.values(detail)) {
      for (const v of Object.values(subs)) {
        const abs = Math.abs(v / pop);
        if (abs > expectedTierMax) expectedTierMax = abs;
      }
    }
  }

  const svg = doc.querySelector("#sector-chart svg");
  const vb = svg.getAttribute("viewBox").split(" ").map(Number);
  const plotHalfWidth = (vb[2] - 235 - 70) / 2; // W - left - right margins (see buildSectorChartLatest), halved either side of zero
  const rects = Array.from(svg.querySelectorAll("rect.sector-bar"));
  const widestBarWidth = Math.max(...rects.map((r) => Number(r.getAttribute("width"))));

  // The widest sub-sector bar shouldn't exceed what the tier-wide max would allow — a looser
  // check than the exact-pixel comparisons above, since sub-sector detail can't scan full history
  // the way the top-level view does, but it should still never let one region's own sub-sector
  // exceed the shared axis.
  assert.ok(widestBarWidth <= plotHalfWidth + 1,
    `widest sub-sector bar (${widestBarWidth}px) shouldn't exceed the fixed-scale plot half-width (${plotHalfWidth}px)`);
  assert.ok(expectedTierMax > 0, "sanity check: expected some non-zero sub-sector detail in this tier");
});

test("electricity green vs fossil chart: green + fossil sums to total electricity consumption, matching the DUKES-based formula", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { DATA, ENERGY_DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="total"]'));
  fireClick(window, doc.querySelector('[data-energy-unit="kwh"]'));
  fireClick(window, doc.querySelector('.table-toggle[data-target="green-fossil-table"]'));

  const rows = tableRows(window, "green-fossil-table");
  assert.equal(rows.length, 2, `expected exactly Green and Fossil rows, got: ${JSON.stringify(rows)}`);
  const greenRow = rows.find((r) => /Green/.test(r[0]));
  const fossilRow = rows.find((r) => /Fossil/.test(r[0]));
  assert.ok(greenRow && fossilRow, `expected a Green and a Fossil row, got: ${JSON.stringify(rows)}`);

  // Independently recompute Phil Gagg's formula from raw ENERGY_DATA (not by calling app.js's own
  // functions), same pattern as the demand-comparison test above: local green generation nets off
  // first, that year's DUKES 6.5a renewable-generation share applies to the remainder. Reads the
  // ratio from the data rather than hardcoding it, so this stays correct across a future DUKES
  // data refresh rather than silently drifting from whatever's actually committed.
  const con = ENERGY_DATA.regions.winchester.consumption["2024"];
  const gen = ENERGY_DATA.regions.winchester.generation["2024"];
  const mix = ENERGY_DATA.meta.dukes_electricity_mix["2024"];
  const totalMwh = con.electricity_consumption_mwh;
  const localGreenMwh = Math.min(gen.total_mwh, totalMwh);
  const gridMwh = totalMwh - localGreenMwh;
  const expectedGreenGwh = (localGreenMwh + gridMwh * (mix.greenPct / 100)) / 1000;
  const expectedFossilGwh = (gridMwh * (mix.fossilPct / 100)) / 1000;

  const greenGwh = num(greenRow[1]);
  const fossilGwh = num(fossilRow[1]);
  assert.ok(Math.abs(greenGwh - expectedGreenGwh) < 0.5,
    `green = ${greenGwh} GWh, expected ~${expectedGreenGwh.toFixed(1)}`);
  assert.ok(Math.abs(fossilGwh - expectedFossilGwh) < 0.5,
    `fossil = ${fossilGwh} GWh, expected ~${expectedFossilGwh.toFixed(1)}`);
  assert.ok(Math.abs((greenGwh + fossilGwh) - totalMwh / 1000) < 0.5,
    `green + fossil (${greenGwh + fossilGwh} GWh) should sum to total electricity consumption (${(totalMwh / 1000).toFixed(1)} GWh)`);
});

test("electricity green vs fossil chart responds to the page-wide Latest year/Historical trend toggle, now that it spans multiple years", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { ENERGY_DATA } = getData(window);
  const doc = window.document;

  const before = doc.getElementById("green-fossil-chart-title").textContent;
  assert.match(before, /, 2024$/, `latest view should show a single year, got: ${before}`);

  fireClick(window, doc.querySelector('[data-view="historical"]'));
  const after = doc.getElementById("green-fossil-chart-title").textContent;
  assert.match(after, /, \d{4}–2024$/, `historical view should show a year range ending 2024, got: ${after}`);
  assert.notEqual(before, after);

  // Historical view renders one line per Green/Fossil, same shape as the sector/gas charts.
  const paths = doc.querySelectorAll("#green-fossil-chart svg path");
  assert.equal(paths.length, 2, `expected 2 lines (Green, Fossil), got ${paths.length}`);

  fireClick(window, doc.querySelector('.table-toggle[data-target="green-fossil-table"]'));
  const rows = tableRows(window, "green-fossil-table");
  const genYears = new Set(ENERGY_DATA.meta.generation_years);
  const conYears = new Set(ENERGY_DATA.meta.consumption_years);
  const mixYears = new Set(Object.keys(ENERGY_DATA.meta.dukes_electricity_mix).map(Number));
  const expectedYears = ENERGY_DATA.meta.generation_years.filter((y) => genYears.has(y) && conYears.has(y) && mixYears.has(y));
  assert.equal(rows.length, expectedYears.length, `expected one table row per year with generation+consumption+DUKES data (${expectedYears.length}), got ${rows.length}`);

  assert.deepEqual(dom.errors, []);
});
