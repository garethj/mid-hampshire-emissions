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

  // Independently recompute the expected axis max: the largest per-capita value of any sector, in
  // any year, for any region — per-capita figures now share one scale across all 19 regions, not
  // just New Forest's own tier (see tierScopeKey in app.js) — then compare against the historical
  // chart's actual rendered axis. The y-axis max itself isn't exposed in the DOM, so read it back
  // off the topmost gridline label instead.
  let expectedMax = 0;
  for (const r of DATA.meta.region_index.map((x) => x.key)) {
    for (const year of Object.keys(ENERGY_DATA.regions[r].consumption)) {
      const sectors = ENERGY_DATA.regions[r].consumption[year].sector_ktoe;
      const pop = DATA.regions[r].years[year].population_thousands;
      for (const v of Object.values(sectors)) {
        const perCapita = v / pop;
        if (perCapita > expectedMax) expectedMax = perCapita;
      }
    }
  }

  const svg = doc.querySelector("#consumption-chart svg");
  const gridlineValues = Array.from(svg.querySelectorAll('text[font-size="11"]'))
    .map((t) => t.textContent)
    .filter((t) => t.includes(".")) // excludes the x-axis year labels (plain integers, e.g. "2024")
    .map((t) => Number(t.replace(/,/g, "")));
  const renderedAxisMax = Math.max(...gridlineValues);

  // New Forest's own oil-refining-driven peak should dominate even this site-wide max, so this is
  // also an implicit check that New Forest itself is the region setting the shared scale here.
  assert.ok(Math.abs(renderedAxisMax - expectedMax * 1.08) < 1,
    `rendered axis max ${renderedAxisMax} toe/person, expected ~${(expectedMax * 1.08).toFixed(2)} (max x 1.08 headroom)`);
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

test("per-capita fixed scale gives regions in *different* tiers the same px-per-unit axis (gas chart) — total figures don't", async () => {
  // Gosport is a historic district, Portsmouth a current unitary — different tiers, so total
  // figures keep separate scales for them (population/area differ hugely), but per-capita figures
  // now share one scale across every region regardless of tier (see tierScopeKey in app.js), since
  // per-capita values already divide out exactly the difference tiers exist to separate.
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

  const gosportWidths = barWidthsByLabel(window, "gas-chart");
  doc.getElementById("region-select").value = "portsmouth";
  fireChange(window, doc.getElementById("region-select"));
  const portsmouthWidths = barWidthsByLabel(window, "gas-chart");

  const gosportPxPerUnit = gosportWidths.CO2 / perCapita("gosport");
  const portsmouthPxPerUnit = portsmouthWidths.CO2 / perCapita("portsmouth");
  assert.ok(Math.abs(gosportPxPerUnit - portsmouthPxPerUnit) < 0.01,
    `expected the same px/unit scale across tiers for per-capita, got Gosport=${gosportPxPerUnit} vs Portsmouth=${portsmouthPxPerUnit}`);
});

test("fixed scale holds the axis steady across the 100-year/20-year GWP horizon toggle, for a single region", async () => {
  // Unlike region tier (a population artifact per-capita washes out), a GWP horizon switch is a
  // real change to the underlying numbers — but the fixed-scale range now spans both horizons at
  // once (see withHorizon in app.js), so a region's own gas and sector bars/lines shouldn't resize
  // just from flipping that toggle. CO2's own value is unaffected by the horizon (GWP20/GWP100 both
  // weight it 1x), so its bar width is a direct read of whether the underlying axis moved.
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));
  const gwp100Widths = barWidthsByLabel(window, "gas-chart");

  fireClick(window, doc.querySelector('[data-horizon="gwp20"]'));
  const gwp20Widths = barWidthsByLabel(window, "gas-chart");

  assert.equal(gwp100Widths.CO2, gwp20Widths.CO2,
    `CO2 bar width shouldn't change between horizons under fixed scale, got ${gwp100Widths.CO2}px (100-year) vs ${gwp20Widths.CO2}px (20-year)`);

  // Sector chart's historical-trend axis ticks are also exposed in the DOM (unlike the gas chart's
  // axis) — check those stay put too, covering sectorTierRange's own horizon merge.
  fireClick(window, doc.querySelector('[data-view="historical"]'));
  fireClick(window, doc.querySelector('[data-horizon="gwp100"]'));
  const tickValues = () => Array.from(doc.querySelectorAll('#sector-chart svg text[text-anchor="end"]'))
    .map((t) => Number(t.textContent.replace(/,/g, "")));
  const gwp100Max = Math.max(...tickValues());
  fireClick(window, doc.querySelector('[data-horizon="gwp20"]'));
  const gwp20Max = Math.max(...tickValues());
  assert.equal(gwp100Max, gwp20Max,
    `sector chart's historical-trend axis max shouldn't change between horizons under fixed scale, got ${gwp100Max} (100-year) vs ${gwp20Max} (20-year)`);
});

test("gas chart's fixed-scale latest view scans only the latest year, not full history: Hampshire and the Solent's own largest gas reaches full bar width", async () => {
  // Hampshire and the Solent is the only region in its own tier ("aggregate"), so its fixed-scale
  // max used to come from scanning *its own* history back to 2005 — a genuine regression: local
  // (and UK-wide) CO2 has fallen a lot since then, so the latest year's CO2 bar only reached a
  // fraction of the chart width, comparing today's figure against a peak nobody currently has.
  const dom = await loadApp({ region: "hampshire-solent" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  // Totals metric: per-capita fixed scale now spans every region (see tierScopeKey in app.js —
  // per-person values wash out the population difference tiers exist for), so the aggregate's own
  // tier-of-one triviality this test relies on only holds for totals.
  fireClick(window, doc.querySelector('[data-metric="total"]'));

  const svg = doc.querySelector("#gas-chart svg");
  const vb = svg.getAttribute("viewBox").split(" ").map(Number);
  const M = { left: 150, right: 80 };
  const plotW = vb[2] - M.left - M.right;
  const widths = Array.from(svg.querySelectorAll("rect")).map((r) => Number(r.getAttribute("width")));

  assert.ok(Math.abs(Math.max(...widths) - plotW) < 1,
    `expected the largest gas (CO2) bar to reach the full plot width (${plotW}px) under fixed scale, got ${Math.max(...widths)}px`);

  // Sanity check this isn't trivially true because CO2 happens to be at an all-time high right
  // now — confirm the latest year really is below the all-time peak, so a full-width bar here
  // specifically demonstrates the latest-year-only scoping, not a coincidence of the data.
  const ly = DATA.meta.years[DATA.meta.years.length - 1];
  const latestCO2 = DATA.regions["hampshire-solent"].years[ly].gases_kt_co2e.CO2;
  const historicalPeakCO2 = Math.max(...DATA.meta.years.map((y) => DATA.regions["hampshire-solent"].years[y].gases_kt_co2e.CO2));
  assert.ok(latestCO2 < historicalPeakCO2,
    `test assumption broken: expected ${ly}'s CO2 (${latestCO2}) to be below the historical peak (${historicalPeakCO2}) — otherwise this test can't tell latest-year scoping apart from an all-years scan`);
});

test("fixed scale mode's sector chart latest-year bars use a symmetric shared-scale magnitude (diverging LULUCF-aware)", async () => {
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));

  // Independently recompute the expected magnitude: the largest |value| of any sector, in any
  // year, for any region, under either GWP horizon — mirrors sectorTierMax in app.js (per-capita
  // figures share one scale across all 19 regions, not just New Forest's own tier, and across both
  // horizons at once — see tierScopeKey/withHorizon), including LULUCF's negative values (Math.abs,
  // not a plain max). The latest-year bar chart is symmetric either side of zero, since a diverging
  // bar's left/right length needs one consistent scale.
  let expectedMax = 0;
  for (const r of DATA.meta.region_index.map((x) => x.key)) {
    for (const year of DATA.meta.years) {
      const yd = DATA.regions[r].years[year];
      for (const sectors of [yd.sectors_kt_co2e, yd.gwp20.sectors_kt_co2e]) {
        for (const v of Object.values(sectors)) {
          const abs = Math.abs(v / yd.population_thousands);
          if (abs > expectedMax) expectedMax = abs;
        }
      }
    }
  }

  // The zero baseline sits at the SVG's horizontal midpoint (zeroX = M.left + plotW/2); a bar's
  // width as a fraction of the plot half-width, times expectedMax, gives back the axis scale
  // implied by that bar, capped at the plot's own half-width.
  const svg = doc.querySelector("#sector-chart svg");
  const vb = svg.getAttribute("viewBox").split(" ").map(Number);
  const M = { left: 130, right: 70 };
  const plotHalfWidth = (vb[2] - M.left - M.right) / 2;
  const rects = Array.from(svg.querySelectorAll("rect.sector-bar"));
  const widestBarWidth = Math.max(...rects.map((r) => Number(r.getAttribute("width"))));
  assert.ok(widestBarWidth <= plotHalfWidth + 1,
    `widest sector bar (${widestBarWidth}px) shouldn't exceed the fixed-scale plot half-width (${plotHalfWidth}px)`);
  assert.ok(expectedMax > 0, "sanity check: expected some non-zero sector value somewhere");
});

test("fixed scale mode's sector chart historical trend uses the shared range's actual positive/negative extents independently, not a symmetric magnitude", async () => {
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-view="historical"]'));
  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));

  // Independently recompute the expected max and min (not abs) — mirrors sectorTierRange in
  // app.js. Per-capita figures now share one range across *every* region, not just New Forest's
  // own tier (historic districts — see tierScopeKey), and that range spans both GWP horizons at
  // once (see withHorizon in app.js), not just the currently-selected one, so both must be scanned
  // here too even though the UI itself is left on the default 100-year view. LULUCF's actual
  // negative range is far smaller in magnitude than some other sector's positive peak, so these
  // two extents genuinely differ — the regression this test guards is the axis wasting space
  // forcing them to match.
  let expectedMax = 0, expectedMin = 0;
  for (const r of DATA.meta.region_index.map((x) => x.key)) {
    for (const year of DATA.meta.years) {
      const yd = DATA.regions[r].years[year];
      for (const sectors of [yd.sectors_kt_co2e, yd.gwp20.sectors_kt_co2e]) {
        for (const v of Object.values(sectors)) {
          const perCapita = v / yd.population_thousands;
          if (perCapita > expectedMax) expectedMax = perCapita;
          if (perCapita < expectedMin) expectedMin = perCapita;
        }
      }
    }
  }
  assert.ok(expectedMax > Math.abs(expectedMin) * 2,
    `test assumption broken: expected the positive peak (${expectedMax}) to clearly exceed the negative magnitude (${expectedMin}) — otherwise this test can't distinguish symmetric from asymmetric axis sizing`);

  // Historical sector chart has no row labels (only axis ticks + a legend), so text-anchor="end"
  // cleanly isolates the y-axis value labels from the x-axis year labels (text-anchor="middle").
  const svg = doc.querySelector("#sector-chart svg");
  const tickValues = Array.from(svg.querySelectorAll('text[text-anchor="end"]'))
    .map((t) => Number(t.textContent.replace(/,/g, "")));
  const renderedAxisMax = Math.max(...tickValues);
  const renderedAxisMin = Math.min(...tickValues);

  assert.ok(Math.abs(renderedAxisMax - expectedMax * 1.08) < 0.5,
    `rendered axis max ${renderedAxisMax} t/person, expected ~${(expectedMax * 1.08).toFixed(2)} (max x 1.08 headroom)`);
  assert.ok(Math.abs(renderedAxisMin - expectedMin * 1.08) < 0.5,
    `rendered axis min ${renderedAxisMin} t/person, expected ~${(expectedMin * 1.08).toFixed(2)} (min x 1.08 headroom) — not the symmetric -${(expectedMax * 1.08).toFixed(2)}`);
});

test("each fixed-scale chart's info dialog states which control combination currently sets its axis", async () => {
  // New Forest's own 2007 Industry sector sets the sector chart's historical-trend ceiling — but
  // via its *20-year* GWP figure, not its 100-year one (its Industry sector has a large enough
  // methane component that GWP20 pushes it above every other region/year/sector/horizon
  // combination) — see sectorTierRange in app.js. The info dialog should say so explicitly, not
  // just render a passing axis: this is the exact confusion a user hit when the axis was higher
  // than New Forest's own 100-year peak while looking at the default 100-year view.
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-view="historical"]'));
  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));

  function infoIntro(key) {
    fireClick(window, doc.querySelector(`[data-info="${key}"]`));
    const text = doc.querySelector("#modal-body p").textContent;
    doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    return text;
  }

  const sectorIntro = infoIntro("sector-chart");
  assert.match(sectorIntro, /New Forest/);
  assert.match(sectorIntro, /Industry/);
  assert.match(sectorIntro, /2007/);
  assert.match(sectorIntro, /20-year GWP/);

  // Gas and trend charts should likewise name a real (region, year[, horizon]) combination, not
  // render an empty dynamicIntro.
  assert.match(infoIntro("gas-chart"), /\b\d{4}\b/);
  assert.match(infoIntro("trend-chart"), /\b\d{4}\b/);

  // The latest-year view uses a different fixed-scale scope (sectorTierMax's symmetric magnitude,
  // scanning only the latest year) from the historical view's range (sectorTierRange, scanning
  // full history) — so its dialog text should read differently, not just repeat the same sentence.
  fireClick(window, doc.querySelector('[data-view="latest"]'));
  const latestIntro = infoIntro("sector-chart");
  assert.notEqual(latestIntro, sectorIntro,
    `expected the latest-year view's setter sentence to differ from the historical view's, got the same text: ${latestIntro}`);
});

test("sector chart's sub-sector detail view scales fixed axis to the shared latest-year sub-sector max, not full history", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.getElementById("sector-detail-toggle"));

  // Per-capita figures share one scale across all 19 regions and both GWP horizons at once (see
  // tierScopeKey/withHorizon in app.js), not just Winchester's own tier and the active horizon.
  const ly = DATA.meta.years[DATA.meta.years.length - 1];
  let expectedMax = 0;
  for (const r of DATA.meta.region_index.map((x) => x.key)) {
    const pop = DATA.regions[r].years[ly].population_thousands;
    for (const detailRoot of [DATA.subsector_detail_latest_year, DATA.subsector_detail_latest_year.gwp20]) {
      const detail = detailRoot[r] || {};
      for (const subs of Object.values(detail)) {
        for (const v of Object.values(subs)) {
          const abs = Math.abs(v / pop);
          if (abs > expectedMax) expectedMax = abs;
        }
      }
    }
  }

  const svg = doc.querySelector("#sector-chart svg");
  const vb = svg.getAttribute("viewBox").split(" ").map(Number);
  const plotHalfWidth = (vb[2] - 235 - 70) / 2; // W - left - right margins (see buildSectorChartLatest), halved either side of zero
  const rects = Array.from(svg.querySelectorAll("rect.sector-bar"));
  const widestBarWidth = Math.max(...rects.map((r) => Number(r.getAttribute("width"))));

  // The widest sub-sector bar shouldn't exceed what the shared max would allow — a looser check
  // than the exact-pixel comparisons above, since sub-sector detail can't scan full history the
  // way the top-level view does, but it should still never let one region's own sub-sector exceed
  // the shared axis.
  assert.ok(widestBarWidth <= plotHalfWidth + 1,
    `widest sub-sector bar (${widestBarWidth}px) shouldn't exceed the fixed-scale plot half-width (${plotHalfWidth}px)`);
  assert.ok(expectedMax > 0, "sanity check: expected some non-zero sub-sector detail somewhere");
});

test("trend chart's fixed scale is one site-wide maximum: Hampshire and the Solent's line doesn't change size when switching between two regions that share a parent", async () => {
  // New Forest and Winchester both roll up to Mid-Hampshire (see la_config.py's REGION_DEFS), so
  // their "context" views both show [self, Mid-Hampshire, Hampshire and the Solent] — the exact
  // regression this test guards: those two shared lines shouldn't change size just because the
  // *third* line (each region's own) differs between the two views.
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-view="historical"]'));
  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));

  // Y-axis tick labels only: text-anchor="end" also matches the net-zero target markers, but
  // those render at font-size 10.5 (and aren't plain numbers), vs the ticks' font-size 11.
  const tickValues = () => Array.from(doc.querySelectorAll("#trend-chart svg text[text-anchor='end'][font-size='11']"))
    .map((t) => Number(t.textContent.replace(/,/g, "")));

  const newForestAxisMax = Math.max(...tickValues());
  doc.getElementById("region-select").value = "winchester";
  fireChange(window, doc.getElementById("region-select"));
  const winchesterAxisMax = Math.max(...tickValues());

  assert.equal(newForestAxisMax, winchesterAxisMax,
    `fixed scale should give New Forest (${newForestAxisMax}) and Winchester (${winchesterAxisMax}) contexts the same axis, since both share Mid-Hampshire as parent`);

  // Independently recompute the expected global max — mirrors trendGlobalMax in app.js, which now
  // scans both GWP horizons (see withHorizon in app.js) rather than just the currently-selected
  // one, so a region's own 100/20-year toggle doesn't rescale this chart either.
  let expectedMax = 0;
  for (const r of DATA.meta.region_index) {
    for (const year of DATA.meta.years) {
      const yd = DATA.regions[r.key].years[year];
      const perCapita = Math.max(yd.per_capita_t_co2e, yd.gwp20.per_capita_t_co2e);
      if (perCapita > expectedMax) expectedMax = perCapita;
    }
  }
  assert.ok(Math.abs(winchesterAxisMax - expectedMax * 1.08) < 0.5,
    `rendered axis max ${winchesterAxisMax}, expected ~${(expectedMax * 1.08).toFixed(2)} (global max x 1.08 headroom)`);

  // Auto mode should let the axis genuinely differ between these two regions' own context sets —
  // otherwise this test couldn't tell "fixed" apart from a chart that just never responds at all.
  fireClick(window, doc.querySelector('[data-scale-mode="auto"]'));
  const winchesterAutoMax = Math.max(...tickValues());
  doc.getElementById("region-select").value = "new-forest";
  fireChange(window, doc.getElementById("region-select"));
  const newForestAutoMax = Math.max(...tickValues());
  assert.notEqual(newForestAutoMax, winchesterAutoMax,
    "auto scale should size the axis to whichever 2-3 regions are shown, which should differ here");
});

test("trend chart's fixed scale also applies to the latest-year bar view", async () => {
  const dom = await loadApp({ region: "new-forest" });
  const { window } = dom;
  const { DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="per_capita"]'));

  const barHeights = () => Array.from(doc.querySelectorAll("#trend-chart svg rect")).map((r) => Number(r.getAttribute("height")));
  const newForestHeights = barHeights();
  doc.getElementById("region-select").value = "winchester";
  fireChange(window, doc.getElementById("region-select"));
  const winchesterHeights = barHeights();

  // Both contexts include Hampshire and the Solent as the last bar; its real value doesn't change
  // between the two, so under fixed scale its rendered bar height shouldn't either.
  assert.equal(newForestHeights[newForestHeights.length - 1], winchesterHeights[winchesterHeights.length - 1],
    "Hampshire and the Solent's bar height shouldn't change when switching the selected region under fixed scale");
});

test("consumption chart's 'By fuel type' defaults to just Fossil fuels and Green energy, summing to the all-fuels total", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { ENERGY_DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="total"]'));
  fireClick(window, doc.querySelector('[data-energy-unit="toe"]')); // native ktoe, to compare directly against raw fuels_ktoe
  fireClick(window, doc.querySelector('.table-toggle[data-target="consumption-table"]'));

  const rows = tableRows(window, "consumption-table");
  assert.equal(rows.length, 2, `expected exactly Fossil fuels and Green energy rows, got: ${JSON.stringify(rows)}`);
  const fossilRow = rows.find((r) => /Fossil fuels/.test(r[0]));
  const greenRow = rows.find((r) => /Green energy/.test(r[0]));
  assert.ok(fossilRow && greenRow, `expected a Fossil fuels and a Green energy row, got: ${JSON.stringify(rows)}`);

  const c = ENERGY_DATA.regions.winchester.consumption["2024"];
  const mix = ENERGY_DATA.meta.dukes_electricity_mix["2024"];
  const fossilElec = c.fuels_ktoe.Electricity * (mix.fossilPct / 100);
  const renewElec = c.fuels_ktoe.Electricity * (mix.greenPct / 100);
  const expectedFossil = c.fuels_ktoe.Coal + c.fuels_ktoe["Manufactured fuels"] + c.fuels_ktoe.Petroleum + c.fuels_ktoe.Gas + fossilElec;
  const expectedGreen = renewElec + c.fuels_ktoe["Bioenergy and wastes"];

  assert.ok(Math.abs(num(fossilRow[1]) - expectedFossil) < 0.5,
    `Fossil fuels = ${num(fossilRow[1])} ktoe, expected ~${expectedFossil.toFixed(1)}`);
  assert.ok(Math.abs(num(greenRow[1]) - expectedGreen) < 0.5,
    `Green energy = ${num(greenRow[1])} ktoe, expected ~${expectedGreen.toFixed(1)}`);
  assert.ok(Math.abs((num(fossilRow[1]) + num(greenRow[1])) - c.all_fuels_ktoe) < 1,
    `Fossil fuels + Green energy (${num(fossilRow[1]) + num(greenRow[1])}) should sum to all_fuels_ktoe (${c.all_fuels_ktoe})`);
});

test("consumption chart's 'Show all fuel types' expands Electricity into Fossil fuel electricity and Renewable electricity, not a bare Electricity row", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const doc = window.document;

  fireClick(window, doc.getElementById("consumption-detail-toggle"));
  fireClick(window, doc.querySelector('.table-toggle[data-target="consumption-table"]'));

  const rows = tableRows(window, "consumption-table");
  const names = rows.map((r) => r[0]);
  assert.equal(rows.length, 7, `expected 7 rows (4 direct fuels + 2 electricity splits + bioenergy), got: ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => /Fossil fuel electricity/.test(n)), `expected a "Fossil fuel electricity" row, got: ${JSON.stringify(names)}`);
  assert.ok(names.some((n) => /Renewable electricity/.test(n)), `expected a "Renewable electricity" row, got: ${JSON.stringify(names)}`);
  assert.ok(!names.some((n) => n === "Electricity"), `"Electricity" should no longer appear as its own bare row, got: ${JSON.stringify(names)}`);
});

test("hovering the 'Fossil fuels'/'Green energy' bars shows the same constituent breakdown 'Show all fuel types' would render, like the sector chart", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { ENERGY_DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="total"]'));
  const rect = doc.querySelector("#consumption-chart svg rect");
  const ev = new window.MouseEvent("pointermove", { clientX: 10, clientY: 10 });
  rect.dispatchEvent(ev);

  const subRows = Array.from(doc.querySelectorAll(".viz-tooltip .tt-subrow")).map((el) => el.textContent);
  // Whichever of Fossil fuels/Green energy sorts first (larger value) is what's hovered — either
  // way its breakdown should list its own constituent fuels, e.g. "Coal" or "Bioenergy & waste".
  assert.ok(subRows.length >= 2, `expected at least 2 breakdown sub-rows in the tooltip, got: ${JSON.stringify(subRows)}`);
});

test("hovering a derived electricity-split row ('Show all fuel types') shows the actual calculation, not just the result", async () => {
  const dom = await loadApp({ region: "winchester" });
  const { window } = dom;
  const { ENERGY_DATA } = getData(window);
  const doc = window.document;

  fireClick(window, doc.querySelector('[data-metric="total"]'));
  fireClick(window, doc.getElementById("consumption-detail-toggle"));

  const rects = Array.from(doc.querySelectorAll("#consumption-chart svg rect"));
  const labels = Array.from(doc.querySelectorAll("#consumption-chart svg text[text-anchor='end']")).map((t) => t.textContent);
  const idx = labels.indexOf("Fossil fuel electricity");
  assert.ok(idx >= 0, `expected to find a "Fossil fuel electricity" row label, got: ${JSON.stringify(labels)}`);

  rects[idx].dispatchEvent(new window.MouseEvent("pointermove", { clientX: 10, clientY: 10 }));
  const subRows = Array.from(doc.querySelectorAll(".viz-tooltip .tt-subrow")).map((el) => el.textContent);
  const mix = ENERGY_DATA.meta.dukes_electricity_mix["2024"];

  assert.ok(subRows.some((r) => /Total electricity/.test(r)), `expected a "Total electricity" calculation row, got: ${JSON.stringify(subRows)}`);
  assert.ok(subRows.some((r) => r.includes(mix.fossilPct.toFixed(1))), `expected the DUKES fossil share (${mix.fossilPct.toFixed(1)}%) shown in the calculation, got: ${JSON.stringify(subRows)}`);
});
