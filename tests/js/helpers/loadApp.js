"use strict";
// Loads the real index.html + app.js (unmodified) into a jsdom document, exactly as a browser
// would via <script src>, so integration tests exercise the actual control-wiring/rendering code
// path rather than a re-implementation of it. Two jsdom gaps are patched below because they'd
// otherwise break code paths that work fine in a real browser but aren't implemented in jsdom:
// SVGElement.getBBox() (used for label-collision avoidance in the historical trend chart) and
// window.matchMedia (used to re-render on OS theme change).

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..", "..", "..");

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// Builds a single HTML document with every <script src="..."> in index.html inlined, in the same
// order, so jsdom's parser executes them synchronously exactly like a browser loading the real
// page would — no fetch/network involved.
function buildInlinedHtml({ region } = {}) {
  let html = readFile("index.html");
  html = html.replace(
    /<script src="([^"]+)"><\/script>/g,
    (match, src) => `<script>${readFile(src)}</script>`
  );
  // The stylesheet <link> isn't needed (jsdom doesn't apply CSS layout) and pulling in Google
  // Fonts would attempt a real network request — strip both <link> tags.
  html = html.replace(/<link[^>]+>/g, "");
  return html;
}

// Loads the app in a fresh jsdom window and resolves once app.js's init() has run (i.e. after
// DOMContentLoaded has fired) — mirrors a real page being ready for interaction.
async function loadApp({ region } = {}) {
  const url = region ? `http://localhost/?region=${encodeURIComponent(region)}` : "http://localhost/";
  const dom = new JSDOM(buildInlinedHtml(), {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });

  const { window } = dom;

  // Collects any uncaught script error thrown while jsdom runs app.js (init, or later from a
  // dispatched event handler) — surfaced on dom.errors so a test driving many control
  // combinations can assert none of them crashed the app, without needing to predict which one.
  dom.errors = [];
  window.addEventListener("error", (ev) => dom.errors.push(ev.error || ev.message));

  // jsdom doesn't implement SVG layout, so getBBox() throws "not implemented" — the historical
  // trend chart uses it purely to nudge overlapping text labels apart, which has no bearing on
  // the underlying data these tests check, so a fixed zero-size box is a safe stand-in.
  window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });

  // jsdom's matchMedia is unimplemented by default; app.js only uses it to add a change listener
  // for re-rendering on OS theme change, which these tests never trigger.
  window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    media: "",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  await new Promise((resolve) => {
    if (window.document.readyState === "complete") {
      resolve();
    } else {
      window.addEventListener("load", resolve);
    }
  });

  return dom;
}

// Fires a native "change" event on a control element (select/checkbox), matching how a real user
// interaction would be dispatched, rather than calling app.js's internal handlers directly.
function fireChange(window, el) {
  el.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function fireClick(window, el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

// Reads DATA/ENERGY_DATA straight off window (set by the inlined data scripts) rather than
// re-reading the JSON files separately, so assertions compare the app against the exact same
// object it rendered from.
function getData(window) {
  return { DATA: window.MHE_DATA, ENERGY_DATA: window.MHE_ENERGY_DATA };
}

// Parses a rendered <table> (trend-table / sector-table / etc.) into rows of cell text, skipping
// the header row — the simplest stable way to check what actually landed on screen without
// depending on app.js's internal data structures.
function tableRows(window, tableId) {
  const table = window.document.querySelector(`#${tableId} table`);
  if (!table) return [];
  return Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td, th")).map((cell) => cell.textContent)
  );
}

module.exports = { loadApp, fireChange, fireClick, getData, tableRows };
