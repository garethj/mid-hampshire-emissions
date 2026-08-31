# Hampshire Emissions Explorer

A small, static, client-side dashboard comparing greenhouse gas emissions across every Hampshire local authority and every proposed future unitary — 19 regions in three tiers: the 11 historic districts and 3 current unitaries (Portsmouth, Southampton, Isle of Wight) as they exist today; the four unitary authorities that replace all 14 of those from 1 April 2028 (North Hampshire, Mid-Hampshire, South East Hampshire, South West Hampshire); and Hampshire and the Solent, the Combined County Authority sitting above all of them. Built for the Hampshire Local Government Reorganisation working group.

Live site: hosted on GitHub Pages from this repo's `main` branch, `/` root.

## What it is

- Plain HTML/CSS/JS, no build step, no framework, no server. Every figure is computed in the browser from pre-processed data files, loaded as plain `<script>` tags (not `fetch`) so it also works when `index.html` is opened directly from disk (`file://`), with no local server needed.
- Data: [DESNZ UK local authority and regional greenhouse gas emissions statistics, 2005–2024](https://www.gov.uk/government/statistics/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics-2005-to-2024/2005-to-2024-uk-local-and-regional-greenhouse-gas-emissions-statistical-release-web-accessible) (published 25 June 2026), plus DESNZ's [regional renewable statistics](https://www.gov.uk/government/statistics/regional-renewable-statistics) and [sub-national total final energy consumption](https://www.gov.uk/government/collections/total-final-energy-consumption-at-sub-national-level) datasets for the Energy section.
- The region selector groups regions into "Historic districts", "Current unitaries" and "Proposed unitaries (2028)", plus Hampshire and the Solent itself. The top comparison chart shows the selected region in its hierarchy context by default (itself, its proposed unitary, and Hampshire and the Solent) — tick "Compare all constituents" to instead compare every sibling at the nearest useful level (all historic districts within a unitary, or all unitaries within Hampshire and the Solent). A region can also be deep-linked directly via `?region=<key>` in the URL (e.g. `?region=eastleigh`).
- Historic district and current unitary figures are DESNZ's own published district totals, used whole and unadjusted. The four proposed unitaries and Hampshire and the Solent are not official — they're built by summing those same district figures, with North Hampshire, Fareham, Gosport, Havant, Portsmouth, Eastleigh and Southampton needing no adjustment (no parish boundary changes), while Mid-Hampshire, South East Hampshire and South West Hampshire each scale a handful of split districts by 2021 Census parish population share to reflect the parishes moving between them under the same LGR decision (no official sub-district emissions data exists, so this is a proxy, not an exact figure). See the in-app methodology notes (the "i" buttons) for the exact scaling factors and other caveats.
- A page-wide "Time horizon" toggle switches every figure between DESNZ's official 100-year Global Warming Potential basis (GWP100, the default) and an unofficial 20-year basis (GWP20) computed by this site, which weights methane roughly 3x more heavily — see the in-app "i" button next to the toggle for why that matters, and the caveat below.
- Alongside the by-sector chart, a by-greenhouse-gas chart splits the same totals into CO2, CH4 (methane) and N2O (nitrous oxide) — useful for seeing why two areas with similar totals can differ in composition (e.g. transport-heavy CO2 vs farming-heavy CH4), and for seeing the Time horizon toggle's effect directly, since it's really a per-gas reweighting.
- Three further charts, from separate DESNZ dataset families (plus one UK-wide DUKES figure), cover local energy rather than emissions: renewable electricity generation by technology (solar, wind, hydro, bioenergy & waste), whose "i" button opens to a figure comparing it to local electricity demand; energy consumption, which can be split "By fuel type" (fossil fuels, electricity, bioenergy & waste in the default "simple" view, or DESNZ's own six fuel categories individually via "Show all fuel types") or "By sector" (Domestic, Transport, Industrial/Commercial and other); and electricity consumption split into an indicative green vs fossil estimate, combining an area's own local renewable generation with DUKES table 6.5a's national grid-mix ratio for whatever's drawn from the grid. See each chart's "i" button for what they measure, why generation and consumption aren't directly connected (Great Britain's shared national grid means locally generated power isn't routed to local homes and businesses), and why a large "Industrial, Commercial and other" share can make an area's energy consumption look disproportionately high next to its emissions (New Forest's oil refining is the clearest example). All three respond to the page-wide Totals/Per person toggle (GWh/ktoe vs kWh and toe per person) and the Latest year/Historical trend toggle.
- A "Fixed scale" axis (the default) shares one axis maximum across every region in the same tier (historic districts / current unitaries / proposed unitaries) for the sector, gas, generation and consumption charts, so switching regions doesn't rescale the chart and hide a real difference in volume — "Auto scale" reverts to sizing each chart to its own region's figures. The trend chart uses the same toggle, but with one true site-wide maximum instead of a per-tier one, since it can show regions from more than one tier on the same chart at once (a district alongside its unitary and Hampshire and the Solent).

## Structure

```
refresh_data.py             checks DESNZ for new releases and regenerates the data files below if there are any — see "Updating the data for a new year" below
index.html                 the whole app (dashboard + modal)
assets/css/style.css       styling, incl. light/dark theme tokens
assets/js/app.js           data loading, chart rendering (hand-rolled SVG), interactivity
data/mid_hampshire_emissions.json   pre-processed emissions data baked from the DESNZ CSV (reference copy, not loaded by the app)
data/mid_hampshire_emissions.js     same data as above, wrapped as `window.MHE_DATA = {...}` so index.html can load it via <script> instead of fetch
data/mid_hampshire_energy.json      pre-processed renewable generation (by technology) + energy consumption (by fuel and by sector) data (reference copy, not loaded by the app)
data/mid_hampshire_energy.js        same data as above, wrapped as `window.MHE_ENERGY_DATA = {...}`
data/emissions_source.csv           raw DESNZ emissions source CSV (~85MB); gitignored, not committed — see below for how to get it
data/renewable_electricity_source.xlsx   raw DESNZ renewable electricity by local authority workbook; gitignored, not committed
data/energy_consumption_source.xlsx      raw DESNZ sub-national total final energy consumption workbook; gitignored, not committed
data/la_config.py           shared local authority lists and Mid-Hampshire parish-population retained fractions, imported by both process scripts below
data/fetch_source.py        downloads/updates data/emissions_source.csv from the current DESNZ release
data/process.py             turns the raw emissions CSV above into the two pre-processed emissions files above
data/fetch_energy_source.py downloads/updates the two raw energy workbooks above from the current DESNZ releases
data/process_energy.py      turns the raw energy workbooks above into the two pre-processed energy files above (requires the `openpyxl` package)
data/tests/                 Python tests: la_config.py structure, pipeline fixture tests, and invariant checks against the committed data files — see "Running the tests" below
tests/js/                   jsdom integration tests against the real index.html + app.js
tests/playwright/           real-browser UI smoke suite (run manually, not part of the pre-commit gate)
.githooks/pre-commit        the pre-commit test gate (opt in with `git config core.hooksPath .githooks`)
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

DESNZ typically publishes new releases each summer. From the repo root, run:

```
python3 refresh_data.py
```

This checks both DESNZ collections for a newer release than the local copy (comparing file size, same as the fetch scripts below), and only regenerates the data files for whichever dataset actually has new data — if neither has, it exits having changed nothing, including the committed `mid_hampshire_*` files (`process.py`/`process_energy.py` stamp a fresh "generated" date on every run, so running them unconditionally would dirty those files on every check even with no real change). Pass `--force` to re-download and regenerate both unconditionally. Safe to re-run any time, e.g. from a `cron` job checking for a new release.

Under the hood, for whichever dataset changed:

1. `data/fetch_source.py` pulls the latest `emissions_source.csv` (see "Getting the raw source data" below).
2. `data/process.py` filters the CSV to the 14 local authorities needed across every region (see `ALL_LAS` in `data/la_config.py`), sums territorial emissions across gases and sub-sectors per year/sector, computes per-capita figures, and builds all 19 regions from the single `REGION_DEFS` list in `data/la_config.py` — each split-district region (Mid-Hampshire, South East Hampshire, South West Hampshire) scales the affected districts' contributions down by their fixed 2021 Census parish-population fractions (`MID_HAMPSHIRE_RETAINED_FRACTION`/`MOVED_FRACTION`) — and overwrites both `mid_hampshire_emissions.json` and `mid_hampshire_emissions.js` in place. It also reads the CSV's per-row `Greenhouse gas` column to compute a parallel 20-year-GWP ("gwp20") view of every figure alongside the official 100-year one — see `GWP100`/`GWP20` in `process.py`.
3. `data/fetch_energy_source.py` pulls the latest renewable electricity and energy consumption workbooks, plus DUKES table 6.5 (Great Britain's national "Share of renewable generation" time series — see the electricity green/fossil chart's own "i" button), then `data/process_energy.py` regenerates `mid_hampshire_energy.json`/`.js` — same 14 local authorities and `REGION_DEFS` as above for the two sub-national DESNZ dataset families, plus `meta.dukes_electricity_mix` (a single national figure per year, not split by local authority) parsed from the DUKES workbook's "6.5a" sheet (see the in-app generation/consumption charts' own "i" buttons for technology/fuel grouping and disclosure-suppression handling).

Then commit whichever of the four output files `refresh_data.py` reports as regenerated (not the raw source files, which stay gitignored). No other changes needed — the app reads whatever years/sectors/technologies are in the files.

## Local development

No build step, no server. Just open `index.html` directly in a browser (double-click it, or `open index.html`). Data loads via a `<script>` tag rather than `fetch`, so it works straight from disk (`file://`) — Chrome and other browsers block `fetch` of local files as a NetworkError, which a plain script tag isn't subject to.

## Running the tests

The site itself has no dependencies, but the test suite does — `npm install` once to pull them in (see `package.json`; nothing here affects the shipped site). Three tiers, of increasing cost:

```
data/tests/            Python: la_config.py structure, pipeline fixture tests (process.py/process_energy.py
                        run against tiny synthetic source files), and invariant checks against the committed
                        mid_hampshire_emissions.json/mid_hampshire_energy.json (sector/gas/region sums,
                        per-capita, GWP20 rescaling, suppression folding, cross-hierarchy consistency).
                        Run: npm run test:data  (or python3 -m unittest discover -s data/tests -p "test_*.py")

tests/js/               jsdom integration tests against the real index.html + app.js — drives every one of
                        the 19 regions through every metric/view/horizon combination (checking nothing
                        throws), plus targeted checks that rendered table/modal values match DATA/ENERGY_DATA.
                        Run: npm run test:js

tests/playwright/       A small real-browser smoke suite (rendering, CSS show/hide, light/dark theme, deep
                        links) — not part of the pre-commit gate (needs a downloaded browser, slower). Run
                        manually as needed: npm run test:ui  (first time: npx playwright install chromium)
```

`npm test` runs the first two tiers together — the same ones a pre-commit hook runs. To have git run them automatically before every commit: `git config core.hooksPath .githooks` (one-time, local to your checkout; see `.githooks/pre-commit`).

## Known limitations

- Mid-Hampshire, South East Hampshire and South West Hampshire's true boundaries each exclude or include a handful of parishes moving between them. No sub-district emissions data exists, so this is corrected by scaling the affected districts' contributions by 2021 Census parish population share (a proxy based on population, not actual emissions in those parishes) rather than left uncorrected. North Hampshire needs no such correction — no parishes move in or out of it.
- Portsmouth and Southampton are shown both as their own current-unitary regions (today's whole-district figures) and folded into South East/South West Hampshire's proposed-unitary totals — these are two different, both-correct views of the same district, not a double-count anywhere in the app.
- The LGR decision (25 March 2026) is subject to a judicial review sought by Hampshire County Council.
- DESNZ data lags roughly 18–24 months behind the current year.
- The 20-year GWP view isn't an official DESNZ output — it's calculated in this repo by rescaling DESNZ's own published per-gas CO2e figures using IPCC AR5 GWP20 factors (see `note_gwp20` in `mid_hampshire_emissions.json`). It uses the same fixed AR5 factors DESNZ uses for GWP100 (not a newer assessment report), and doesn't split methane into fossil/non-fossil sub-types, since DESNZ's own local-authority dataset doesn't either.
- The generation chart info panel's "renewable generation vs local electricity demand" figure compares two things that aren't directly connected: Great Britain runs on one shared national grid, so locally generated renewable electricity isn't routed to local homes and businesses — it's exported and pooled nationally, while local demand draws from that same pool. The figure is a self-sufficiency gauge, not a claim about where the electricity actually goes.
- Renewable generation data starts in 2014 (the first year DESNZ publishes it at local authority level); energy consumption data starts in 2005, same as emissions.
- DESNZ suppresses some small per-technology renewable generation figures to avoid revealing individual plants' output (marked "[X]" in its source workbook). This site treats suppressed cells as 0 for their own technology and folds the gap against DESNZ's own published total into an "Other" bucket, so technology totals still sum exactly to DESNZ's figures — see `process_energy.py`'s `TECH_GROUPS`/`note_suppression`.
- The consumption-by-fuel chart's "simple" view keeps "Electricity" as its own category rather than grouping it with "Fossil fuels" or "Bioenergy & waste" — the electricity consumed locally is drawn from the national grid mix (gas, nuclear, wind, solar, imports, etc.), which this dataset doesn't attribute back to the consuming area, so this site can't honestly label it either way.
- The energy consumption dataset counts fuel burned within a boundary, including fuel used by large industrial sites (e.g. oil refining) to make products consumed elsewhere — it measures fuel burned on-site, not local household/business demand. DESNZ's emissions statistics attribute CO2 by point-source location under separate rules and don't necessarily move in step with this consumption total. The consumption chart's "By sector" view exists to make this visible: New Forest's oil refining pushes its "Industrial, Commercial and other" total far above Domestic and Transport combined, which is also why its energy consumption looks high next to its emissions elsewhere on this site — see `note_industrial_consumption` in `mid_hampshire_energy.json`.
- The sector/gas/generation/consumption charts' "Fixed scale" (the default) shares one axis maximum across every region in the same tier — the highest single value seen for that chart/metric/breakdown across every region in the tier and every year of data, not just what's on screen — so a smaller region's bar can end up short enough that its own internal split is hard to read. "Auto scale" trades that comparability away for a clearer read of one region's own composition; see `assets/js/app.js`'s `sectorTierMax`/`gasTierMax`/`generationTierMax`/`consumptionTierMax`. The sector chart's latest-year bars use one symmetric scale either side of zero (`sectorTierMax`, the largest magnitude in either direction — needed since a diverging bar's left/right length has to stay comparable); its historical trend line instead uses the tier's actual highest and lowest values independently (`sectorTierRange`), since a line's vertical position isn't a length comparison the same way. The sector chart's sub-sector detail view is the one further case that can only share a scale across the latest year, not full history, since DESNZ only publishes sub-sector figures for the latest year.
- The trend chart's "Fixed scale" is a single maximum across all 19 regions (`trendGlobalMax`), not a per-tier one — it can show regions from more than one tier on the same chart at once (a "context" view mixes a district, its unitary and Hampshire and the Solent), so there's no single tier to scale it to. This means Hampshire and the Solent (present in every context view) renders at a consistent size regardless of which region is selected, at the cost of an individual district's own line reading small next to it under "Totals" — the same comparability-vs-detail trade-off the other charts' fixed scale makes.
- The electricity green/fossil split is a deliberately indicative estimate, not a metered figure: no dataset ties a specific unit of electricity consumed in one area back to where it was generated. It assumes an area's own renewable generation fully offsets its own consumption first (the same "market-based" accounting logic, and the same simplification as the generation-vs-demand figure above — in reality that generation is exported to the shared grid and pooled), then applies DUKES 6.5a's national renewable-generation share to whatever's left. "Green" is specifically DUKES's renewable share; "Fossil fuel" is the remainder, which strictly also includes nuclear and net imports, not fossil fuel alone. Available from 2014 onward (when local renewable generation data starts).

See [ROADMAP.md](ROADMAP.md) for a longer list of possible extensions.

## License

MIT — see [LICENSE](LICENSE).
