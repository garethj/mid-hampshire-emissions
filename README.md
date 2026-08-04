# Mid-Hampshire Emissions Explorer

A small, static, client-side dashboard comparing greenhouse gas emissions for Winchester and the proposed Mid-Hampshire unitary authority (East Hampshire + Winchester + New Forest + Test Valley), built for the Hampshire Local Government Reorganisation working group.

Live site: hosted on GitHub Pages from this repo's `main` branch, `/` root.

## What it is

- Plain HTML/CSS/JS, no build step, no framework, no server. Every figure is computed in the browser from a single pre-processed data file, loaded as a plain `<script>` tag (not `fetch`) so it also works when `index.html` is opened directly from disk (`file://`), with no local server needed.
- Data: [DESNZ UK local authority and regional greenhouse gas emissions statistics, 2005–2023](https://www.gov.uk/government/statistics/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics-2005-to-2024/2005-to-2024-uk-local-and-regional-greenhouse-gas-emissions-statistical-release-web-accessible) (published 3 July 2025).
- Mid-Hampshire figures are not official — they're the sum of the four constituent districts' published figures. See the in-app methodology notes (the "i" buttons) for caveats, including the ~11 parishes that move to neighbouring unitaries and aren't corrected for.

## Structure

```
index.html                 the whole app (dashboard + modal)
assets/css/style.css       styling, incl. light/dark theme tokens
assets/js/app.js           data loading, chart rendering (hand-rolled SVG), interactivity
data/mid_hampshire_emissions.json   pre-processed data baked from the DESNZ CSV (reference copy, not loaded by the app)
data/mid_hampshire_emissions.js     same data as above, wrapped as `window.MHE_DATA = {...}` so index.html can load it via <script> instead of fetch
```

## Updating the data for a new year

DESNZ typically publishes a new release each summer. To refresh:

1. Find the new CSV on the [DESNZ collection page](https://www.gov.uk/government/collections/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics) (look for the "Full dataset (csv)" link) and download it somewhere local.
2. From the `data/` directory, run `python3 process.py /path/to/downloaded.csv`. It filters the CSV to Winchester/East Hampshire/New Forest/Test Valley, sums territorial emissions across gases and sub-sectors per year/sector, computes per-capita figures, and overwrites both `mid_hampshire_emissions.json` and `mid_hampshire_emissions.js` in place.
3. Commit both updated files. No other changes needed — the app reads whatever years/sectors are in the file. The raw source CSV is not committed to this repo (it's ~80MB); keep it locally or re-download if needed.

## Local development

No build step, no server. Just open `index.html` directly in a browser (double-click it, or `open index.html`). Data loads via a `<script>` tag rather than `fetch`, so it works straight from disk (`file://`) — Chrome and other browsers block `fetch` of local files as a NetworkError, which a plain script tag isn't subject to.

## Known limitations

- Mid-Hampshire's true boundary excludes 11 parishes moving to South-West/South-East Hampshire; no sub-district emissions data exists to correct for this precisely.
- The LGR decision (25 March 2026) is subject to a judicial review sought by Hampshire County Council.
- DESNZ data lags roughly 18–24 months behind the current year.

See [ROADMAP.md](ROADMAP.md) for a longer list of possible extensions.

## License

MIT — see [LICENSE](LICENSE).
