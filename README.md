# Hampshire Emissions Explorer

A small, static, client-side dashboard comparing greenhouse gas emissions for three Hampshire geographies: Winchester (the existing district), the proposed Mid-Hampshire unitary authority (East Hampshire + Winchester + New Forest + Test Valley), and Hampshire and the Solent (the Combined County Authority covering all of Hampshire plus Portsmouth, Southampton and Isle of Wight). Built for the Hampshire Local Government Reorganisation working group.

Live site: hosted on GitHub Pages from this repo's `main` branch, `/` root.

## What it is

- Plain HTML/CSS/JS, no build step, no framework, no server. Every figure is computed in the browser from pre-processed data files, loaded as plain `<script>` tags (not `fetch`) so it also works when `index.html` is opened directly from disk (`file://`), with no local server needed.
- Data: [DESNZ UK local authority and regional greenhouse gas emissions statistics, 2005–2024](https://www.gov.uk/government/statistics/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics-2005-to-2024/2005-to-2024-uk-local-and-regional-greenhouse-gas-emissions-statistical-release-web-accessible) (published 25 June 2026), plus DESNZ's [regional renewable statistics](https://www.gov.uk/government/statistics/regional-renewable-statistics) and [sub-national total final energy consumption](https://www.gov.uk/government/collections/total-final-energy-consumption-at-sub-national-level) datasets for the Energy section.
- Mid-Hampshire figures are not official — they're built from the four constituent districts' published figures, each scaled down by its 2021 Census parish population share to exclude the 11 parishes that move to neighbouring unitaries under the same LGR decision (no official sub-district emissions data exists, so this is a proxy, not an exact figure). See the in-app methodology notes (the "i" buttons) for the per-district scaling factors and other caveats.
- Hampshire and the Solent figures are also not official — they're the sum of all 11 current Hampshire districts plus Portsmouth, Southampton and Isle of Wight, using whole-district figures throughout (no parish-level correction needed, since that boundary doesn't depend on which new unitary the 11 parishes end up in).
- A page-wide "Time horizon" toggle switches every figure between DESNZ's official 100-year Global Warming Potential basis (GWP100, the default) and an unofficial 20-year basis (GWP20) computed by this site, which weights methane roughly 3x more heavily — see the in-app "i" button next to the toggle for why that matters, and the caveat below.
- Alongside the by-sector chart, a by-greenhouse-gas chart splits the same totals into CO2, CH4 (methane) and N2O (nitrous oxide) — useful for seeing why two areas with similar totals can differ in composition (e.g. transport-heavy CO2 vs farming-heavy CH4), and for seeing the Time horizon toggle's effect directly, since it's really a per-gas reweighting.
- A separate "Energy" section, from a different DESNZ dataset family, shows local renewable electricity generation by technology (solar, wind, hydro, bioenergy & waste) and how it compares to local electricity demand — see the in-app "i" buttons for why generation and consumption aren't directly connected (Great Britain's shared national grid means locally generated power isn't routed to local homes and businesses).

## Structure

```
index.html                 the whole app (dashboard + modal)
assets/css/style.css       styling, incl. light/dark theme tokens
assets/js/app.js           data loading, chart rendering (hand-rolled SVG), interactivity
data/mid_hampshire_emissions.json   pre-processed emissions data baked from the DESNZ CSV (reference copy, not loaded by the app)
data/mid_hampshire_emissions.js     same data as above, wrapped as `window.MHE_DATA = {...}` so index.html can load it via <script> instead of fetch
data/mid_hampshire_energy.json      pre-processed renewable generation + electricity consumption data (reference copy, not loaded by the app)
data/mid_hampshire_energy.js        same data as above, wrapped as `window.MHE_ENERGY_DATA = {...}`
data/emissions_source.csv           raw DESNZ emissions source CSV (~85MB); gitignored, not committed — see below for how to get it
data/renewable_electricity_source.xlsx   raw DESNZ renewable electricity by local authority workbook; gitignored, not committed
data/energy_consumption_source.xlsx      raw DESNZ sub-national total final energy consumption workbook; gitignored, not committed
data/la_config.py           shared local authority lists and Mid-Hampshire parish-population retained fractions, imported by both process scripts below
data/fetch_source.py        downloads/updates data/emissions_source.csv from the current DESNZ release
data/process.py             turns the raw emissions CSV above into the two pre-processed emissions files above
data/fetch_energy_source.py downloads/updates the two raw energy workbooks above from the current DESNZ releases
data/process_energy.py      turns the raw energy workbooks above into the two pre-processed energy files above (requires the `openpyxl` package)
```

## Getting the raw source data

`data/emissions_source.csv` (~85MB), `data/renewable_electricity_source.xlsx` and `data/energy_consumption_source.xlsx` aren't committed to this repo — they're gitignored, and the fetch scripts pull them instead:

```
cd data
python3 fetch_source.py          # emissions CSV
python3 fetch_energy_source.py   # renewable generation + energy consumption workbooks
```

Each finds the newest release on the relevant DESNZ collection/statistics page, compares it against the local copy's size, and only downloads if the file is missing or has changed — safe to re-run any time (e.g. from a `cron`/CI job checking for a new release) without needlessly re-fetching large files. Pass `--force` to re-download unconditionally. `process_energy.py` reads xlsx workbooks directly, so it needs the `openpyxl` Python package installed (`pip3 install openpyxl`).

## Updating the data for a new year

DESNZ typically publishes new releases each summer. To refresh:

1. From the `data/` directory, run `python3 fetch_source.py` to pull the latest `emissions_source.csv` (see above).
2. Still in `data/`, run `python3 process.py`. It filters the CSV to the 14 local authorities needed across all three regions (Winchester's, Mid-Hampshire's four, and Hampshire and the Solent's fourteen — see `MID_HAMPSHIRE_LAS`/`HAMPSHIRE_SOLENT_LAS` in `data/la_config.py`), sums territorial emissions across gases and sub-sectors per year/sector, computes per-capita figures, scales each district's contribution to Mid-Hampshire down by its fixed 2021 Census parish-population retained fraction (see `MID_HAMPSHIRE_RETAINED_FRACTION` in `data/la_config.py`), and overwrites both `mid_hampshire_emissions.json` and `mid_hampshire_emissions.js` in place. It also reads the CSV's per-row `Greenhouse gas` column to compute a parallel 20-year-GWP ("gwp20") view of every figure alongside the official 100-year one — see `GWP100`/`GWP20` in `process.py`.
3. Run `python3 fetch_energy_source.py` to pull the latest renewable electricity and energy consumption workbooks, then `python3 process_energy.py` to regenerate `mid_hampshire_energy.json`/`.js` — same 14 local authorities and Mid-Hampshire scaling as above, but a separate DESNZ dataset family (see the in-app energy chart's "i" button for technology grouping and disclosure-suppression handling).
4. Commit the four regenerated output files (not the raw source files, which stay gitignored). No other changes needed — the app reads whatever years/sectors/technologies are in the files.

## Local development

No build step, no server. Just open `index.html` directly in a browser (double-click it, or `open index.html`). Data loads via a `<script>` tag rather than `fetch`, so it works straight from disk (`file://`) — Chrome and other browsers block `fetch` of local files as a NetworkError, which a plain script tag isn't subject to.

## Known limitations

- Mid-Hampshire's true boundary excludes 11 parishes moving to South-West/South-East Hampshire. No sub-district emissions data exists, so this is corrected by scaling each district down by its 2021 Census parish population share (a proxy based on population, not actual emissions in those parishes) rather than left uncorrected.
- The LGR decision (25 March 2026) is subject to a judicial review sought by Hampshire County Council.
- DESNZ data lags roughly 18–24 months behind the current year.
- The 20-year GWP view isn't an official DESNZ output — it's calculated in this repo by rescaling DESNZ's own published per-gas CO2e figures using IPCC AR5 GWP20 factors (see `note_gwp20` in `mid_hampshire_emissions.json`). It uses the same fixed AR5 factors DESNZ uses for GWP100 (not a newer assessment report), and doesn't split methane into fossil/non-fossil sub-types, since DESNZ's own local-authority dataset doesn't either.
- The energy section's "renewable generation vs local electricity demand" figure compares two things that aren't directly connected: Great Britain runs on one shared national grid, so locally generated renewable electricity isn't routed to local homes and businesses — it's exported and pooled nationally, while local demand draws from that same pool. The ratio is a self-sufficiency gauge, not a claim about where the electricity actually goes.
- Renewable generation data starts in 2014 (the first year DESNZ publishes it at local authority level); electricity consumption data starts in 2005, same as emissions.
- DESNZ suppresses some small per-technology renewable generation figures to avoid revealing individual plants' output (marked "[X]" in its source workbook). This site treats suppressed cells as 0 for their own technology and folds the gap against DESNZ's own published total into an "Other" bucket, so technology totals still sum exactly to DESNZ's figures — see `process_energy.py`'s `TECH_GROUPS`/`note_suppression`.

See [ROADMAP.md](ROADMAP.md) for a longer list of possible extensions.

## License

MIT — see [LICENSE](LICENSE).
