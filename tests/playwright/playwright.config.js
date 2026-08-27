"use strict";
// Minimal UI smoke suite — a real browser, run manually (`npm run test:ui`) or occasionally, not
// on every commit (the jsdom suite in tests/js/ covers the data-and-calculation regression net
// for every commit; this covers what only a real browser can: actual SVG rendering, CSS-driven
// visibility, and light/dark theme). testDir is this directory so the config can sit next to its
// one spec file rather than needing a root-level playwright.config.js for an otherwise
// no-build-step static site.
const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: __dirname,
  timeout: 15000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "file://" + path.join(__dirname, "..", "..") + "/",
    ...devices["Desktop Chrome"],
  },
});
