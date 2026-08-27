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
