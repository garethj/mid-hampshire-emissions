# Hampshire Emissions Explorer

A small, static, client-side dashboard comparing greenhouse gas emissions for three Hampshire geographies: Winchester (the existing district), the proposed Mid-Hampshire unitary authority (East Hampshire + Winchester + New Forest + Test Valley), and Hampshire and the Solent (the Combined County Authority covering all of Hampshire plus Portsmouth, Southampton and Isle of Wight). Built for the Hampshire Local Government Reorganisation working group.

Live site: hosted on GitHub Pages from this repo's `main` branch, `/` root.

## What it is

- Plain HTML/CSS/JS, no build step, no framework, no server. Every figure is computed in the browser from a single pre-processed data file, loaded as a plain `<script>` tag (not `fetch`) so it also works when `index.html` is opened directly from disk (`file://`), with no local server needed.
- Data: [DESNZ UK local authority and regional greenhouse gas emissions statistics, 2005–2024](https://www.gov.uk/government/statistics/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics-2005-to-2024/2005-to-2024-uk-local-and-regional-greenhouse-gas-emissions-statistical-release-web-accessible) (published 25 June 2026).
- Mid-Hampshire figures are not official — they're built from the four constituent districts' published figures, each scaled down by its 2021 Census parish population share to exclude the 11 parishes that move to neighbouring unitaries under the same LGR decision (no official sub-district emissions data exists, so this is a proxy, not an exact figure). See the in-app methodology notes (the "i" buttons) for the per-district scaling factors and other caveats.
- Hampshire and the Solent figures are also not official — they're the sum of all 11 current Hampshire districts plus Portsmouth, Southampton and Isle of Wight, using whole-district figures throughout (no parish-level correction needed, since that boundary doesn't depend on which new unitary the 11 parishes end up in).
- A page-wide "Time horizon" toggle switches every figure between DESNZ's official 100-year Global Warming Potential basis (GWP100, the default) and an unofficial 20-year basis (GWP20) computed by this site, which weights methane roughly 3x more heavily — see the in-app "i" button next to the toggle for why that matters, and the caveat below.
- Alongside the by-sector chart, a by-greenhouse-gas chart splits the same totals into CO2, CH4 (methane) and N2O (nitrous oxide) — useful for seeing why two areas with similar totals can differ in composition (e.g. transport-heavy CO2 vs farming-heavy CH4), and for seeing the Time horizon toggle's effect directly, since it's really a per-gas reweighting.

## Structure

```
index.html                 the whole app (dashboard + modal)
assets/css/style.css       styling, incl. light/dark theme tokens
assets/js/app.js           data loading, chart rendering (hand-rolled SVG), interactivity
data/mid_hampshire_emissions.json   pre-processed data baked from the DESNZ CSV (reference copy, not loaded by the app)
data/mid_hampshire_emissions.js     same data as above, wrapped as `window.MHE_DATA = {...}` so index.html can load it via <script> instead of fetch
data/emissions_source.csv           raw DESNZ source CSV (~85MB), committed so a refresh never depends on re-downloading; process.py's default input
data/process.py                     turns the raw CSV above into the two pre-processed files above
```

## Updating the data for a new year

DESNZ typically publishes a new release each summer. To refresh:

1. Find the new CSV on the [DESNZ collection page](https://www.gov.uk/government/collections/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics) (look for the "Full dataset (csv)" link) and download it, replacing `data/emissions_source.csv` in place.
2. From the `data/` directory, run `python3 process.py` (it defaults to reading `emissions_source.csv`; pass an explicit path to use a file elsewhere instead). It filters the CSV to the 14 local authorities needed across all three regions (Winchester's, Mid-Hampshire's four, and Hampshire and the Solent's fourteen — see `MID_HAMPSHIRE_LAS`/`HAMPSHIRE_SOLENT_LAS` in `process.py`), sums territorial emissions across gases and sub-sectors per year/sector, computes per-capita figures, scales each district's contribution to Mid-Hampshire down by its fixed 2021 Census parish-population retained fraction (see `MID_HAMPSHIRE_RETAINED_FRACTION`), and overwrites both `mid_hampshire_emissions.json` and `mid_hampshire_emissions.js` in place. It also reads the CSV's per-row `Greenhouse gas` column to compute a parallel 20-year-GWP ("gwp20") view of every figure alongside the official 100-year one — see `GWP100`/`GWP20` in `process.py`.
3. Commit the updated `emissions_source.csv` alongside both regenerated output files. No other changes needed — the app reads whatever years/sectors are in the file.

## Local development

No build step, no server. Just open `index.html` directly in a browser (double-click it, or `open index.html`). Data loads via a `<script>` tag rather than `fetch`, so it works straight from disk (`file://`) — Chrome and other browsers block `fetch` of local files as a NetworkError, which a plain script tag isn't subject to.

## Known limitations

- Mid-Hampshire's true boundary excludes 11 parishes moving to South-West/South-East Hampshire. No sub-district emissions data exists, so this is corrected by scaling each district down by its 2021 Census parish population share (a proxy based on population, not actual emissions in those parishes) rather than left uncorrected.
- The LGR decision (25 March 2026) is subject to a judicial review sought by Hampshire County Council.
- DESNZ data lags roughly 18–24 months behind the current year.
- The 20-year GWP view isn't an official DESNZ output — it's calculated in this repo by rescaling DESNZ's own published per-gas CO2e figures using IPCC AR5 GWP20 factors (see `note_gwp20` in `mid_hampshire_emissions.json`). It uses the same fixed AR5 factors DESNZ uses for GWP100 (not a newer assessment report), and doesn't split methane into fossil/non-fossil sub-types, since DESNZ's own local-authority dataset doesn't either.

See [ROADMAP.md](ROADMAP.md) for a longer list of possible extensions.

## License

MIT — see [LICENSE](LICENSE).
