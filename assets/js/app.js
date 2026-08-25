(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  let DATA = null;
  let ENERGY_DATA = null;
  let currentRegion = "winchester";
  let currentMetric = "per_capita"; // "total" | "per_capita"
  let currentView = "latest"; // "latest" | "historical"
  let currentDetail = false; // show sector chart as sub-sectors (latest view only)
  let currentConsumptionDetail = false; // show consumption chart as all fuel types instead of simple groups
  let currentHorizon = "gwp100"; // "gwp100" (official DESNZ) | "gwp20"
  let tooltipEl = null;

  // Headline "Total renewable generation, 2024: X GWh - equivalent to Y% of demand" sentence,
  // recomputed on every buildGenerationChart() call and surfaced inside the generation chart's
  // info modal (dynamicIntro below) rather than as a permanent on-page note, so region/year/
  // metric changes don't need a second render path just to keep this one sentence in sync.
  let generationNoteText = "";

  // Region display order for the trend chart, legends and tables — also the source of truth
  // for which regions exist. Colour comes from CATEGORY_COLOR_SLOT below, keyed by `key`.
  const REGIONS = [
    { key: "winchester", label: "Winchester", legendLabel: "Winchester" },
    { key: "mid-hampshire", label: "Mid-Hampshire", legendLabel: "Mid-Hampshire (proposed)" },
    { key: "hampshire-solent", label: "Hampshire and the Solent", legendLabel: "Hampshire and the Solent" }
  ];
  const REGION_LABEL = Object.fromEntries(REGIONS.map(r => [r.key, r.label]));

  // This order is not alphabetical — it's chosen so that consecutive sectors always land on a
  // CVD-safe adjacent pair of colours in the historical (line) chart, which renders sectors in
  // this exact fixed sequence. See the CVD note in CATEGORY_COLOR_SLOT below; don't reorder this
  // casually without re-running the palette validator against the new adjacency.
  const SECTOR_ORDER = ["Transport", "Domestic", "LULUCF", "Waste", "Commercial", "Agriculture", "Public Sector", "Industry"];

  // Gas display order — separate from the 1-8 sector slots since the sector and gas charts are
  // never shown side by side.
  const GAS_ORDER = ["CO2", "CH4", "N2O"];
  const GAS_LABEL = { CO2: "CO2", CH4: "CH4 (methane)", N2O: "N2O (nitrous oxide)" };

  // Matches ENERGY_DATA.meta.technology_groups (see process_energy.py). Also not alphabetical —
  // reordered from the "natural" Solar/Wind/Hydro/Bioenergy/Other grouping for the same
  // CVD-adjacency reason as SECTOR_ORDER above (the historical chart renders this fixed order).
  const ENERGY_TECH_ORDER = ["Solar", "Bioenergy & waste", "Wind", "Hydro", "Other"];

  // Matches ENERGY_DATA.meta.fuel_categories (see process_energy.py) — DESNZ's own fuel
  // categories, used for the consumption chart's "complex" (all fuel types) view.
  const FUEL_ORDER = ["Coal", "Manufactured fuels", "Petroleum", "Gas", "Electricity", "Bioenergy and wastes"];
  const FUEL_LABEL = {
    Coal: "Coal", "Manufactured fuels": "Manufactured fuels", Petroleum: "Oil (petroleum)",
    Gas: "Gas", Electricity: "Electricity", "Bioenergy and wastes": "Bioenergy & waste"
  };
  // "Simple" view groups: not a DESNZ category, a bucketing this site applies for the collapsed
  // view. Electricity is kept separate rather than folded into either side, since the fuel this
  // site measures ("Electricity" consumed locally) isn't itself fossil or renewable — it's
  // generated from a national mix that this dataset doesn't attribute back to source.
  const FUEL_SIMPLE_GROUPS = {
    "Fossil fuels": ["Coal", "Manufactured fuels", "Petroleum", "Gas"],
    "Electricity": ["Electricity"],
    "Bioenergy & waste": ["Bioenergy and wastes"]
  };

  // ---------------- category colours ----------------
  // Every named category on this site (sector, gas, technology, fuel, region) gets a *fixed*
  // colour by identity, not by its position in whatever array or sort order happens to render
  // it — so "Agriculture" is always the same green whether it's the biggest bar or the
  // smallest, and whether SECTOR_ORDER gets reordered or not. All colours are drawn from the
  // same validated 8-hue --series-1..8 categorical palette (assets/css/style.css) — nothing
  // new is invented here, each category is just pinned to one of those 8 slots by a real-world
  // association (sun = yellow, water = aqua, farming = green, gas's blue flame, etc.) rather
  // than left to whatever index it happens to sit at.
  //
  // The same slot is deliberately reused across *different* chart families where it reinforces
  // the same real-world idea (e.g. green for both Agriculture and Bioenergy & waste; violet for
  // "Other" wherever an "Other" bucket exists) — safe because those charts are never shown side
  // by side.
  //
  // CVD adjacency: for charts that render categories in a *fixed* order (the historical/line
  // charts — sector, gas, generation, consumption), the sequence in which their category slots
  // are actually drawn next to each other was checked with this skill's palette validator
  // (dataviz skill, scripts/validate_palette.js) and passes both light and dark mode. That's why
  // SECTOR_ORDER and ENERGY_TECH_ORDER above aren't alphabetical, and why a couple of picks below
  // (CH4, N2O, the "Fossil fuels" simple-view group) aren't the first-choice mnemonic hue — e.g.
  // red/orange next to each other fails CVD separation, so CH4 couldn't be orange while sitting
  // next to CO2's red. The *sorted-by-value* bar views (sector/generation/consumption "latest")
  // can't get the same guarantee, since which categories end up adjacent depends on that year's
  // data — this was already true before this mapping existed (colour was previously pinned by
  // array position, not identity, but the sort-driven adjacency risk is unchanged either way).
  const CATEGORY_COLOR_SLOT = {
    // Regions (trend chart) — unchanged from the original hand-picked assignment.
    "winchester": 1,        // blue
    "mid-hampshire": 6,     // green
    "hampshire-solent": 7,  // violet

    // Emissions sectors — all 8 slots used once each.
    "Transport": 1,      // blue
    "Domestic": 2,       // orange — heating/warmth
    "LULUCF": 3,          // aqua — land/forestry carbon sink
    "Waste": 4,           // yellow — recycling-bin yellow
    "Commercial": 5,      // magenta
    "Agriculture": 6,     // green — farming/land
    "Public Sector": 7,   // violet — civic/institutional
    "Industry": 8,        // red

    // Greenhouse gases — CO2 red (the near-universal "warming" hue). CH4 violet and N2O green
    // aren't the first-choice mnemonic (CH4 ties more naturally to gas/orange, N2O to
    // agriculture/orange-ish), but red-orange fails CVD separation, so CH4 couldn't sit next to
    // CO2 as orange; N2O's green at least echoes its main real-world source (agricultural soils
    // and manure — the same association as the Agriculture sector's green).
    "CO2": 8,
    "CH4": 7,
    "N2O": 6,

    // Renewable generation technologies.
    "Solar": 4,               // yellow — the sun
    "Wind": 1,                // blue — the sky
    "Hydro": 3,                // aqua — water
    "Bioenergy & waste": 6,   // green — organic matter (matches the fuel category below)
    "Other": 7,                // violet — the "everything else" bucket, wherever it appears

    // Energy consumption by fuel — "complex" (all types) view. DESNZ's exact spelling
    // ("Bioenergy and wastes") differs slightly from the generation chart's "Bioenergy & waste"
    // but is the same real-world category, so it gets the same green.
    "Coal": 8,                     // red — combustion
    "Manufactured fuels": 7,       // violet — coal-derived, grouped near Coal's family
    "Petroleum": 5,                // magenta
    "Gas": 1,                      // blue — the iconic blue gas flame
    "Electricity": 4,              // yellow — the lightning-bolt association
    "Bioenergy and wastes": 6,     // green

    // Energy consumption by fuel — "simple" (grouped) view. Not real DESNZ categories, so
    // these get their own slot rather than inheriting one component's colour arbitrarily.
    // Violet rather than the more obvious orange ("generic fossil" hue) because this group sits
    // next to Electricity's yellow, and orange-yellow also fails CVD separation.
    "Fossil fuels": 7   // violet
    // "Electricity" and "Bioenergy & waste" simple-view groups reuse the slots above directly.
  };

  // ---------------- helpers ----------------

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function seriesColor(slot) {
    return cssVar("--series-" + slot);
  }

  // Deterministic (not random) fallback for a category this site doesn't know about yet, e.g.
  // DESNZ adding a 9th sector or a new renewable technology in a future data release. A truly
  // random colour would change on every reload, defeating the whole point of "consistent" —
  // hashing the name instead means the same unknown category always lands on the same slot,
  // for this session and the next. It can still collide with a sibling category in the same
  // chart (a hash has no way to know what else is on screen); the console warning is there so
  // a real new category gets a deliberate, non-colliding slot added to CATEGORY_COLOR_SLOT
  // above rather than being left to chance indefinitely.
  function hashSlot(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) {
      h = (h * 31 + name.charCodeAt(i)) | 0;
    }
    return (Math.abs(h) % 8) + 1;
  }

  function categoryColor(name) {
    const slot = CATEGORY_COLOR_SLOT[name];
    if (slot) return seriesColor(slot);
    console.warn("No colour mapping for \"" + name + "\" — using a hash-derived fallback. Add it to CATEGORY_COLOR_SLOT in app.js.");
    return seriesColor(hashSlot(name));
  }

  function regionColor(key) {
    return categoryColor(key);
  }

  function fmtKt(n) {
    return Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }

  function fmtInt(n) {
    return Math.round(n).toLocaleString("en-GB");
  }

  function fmtPerCapita(n) {
    return Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }

  function fmtPct(n) {
    const sign = n > 0 ? "+" : "";
    return sign + n.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";
  }

  // Metric-aware formatting: "total" is kt CO2e (whole numbers), "per_capita" is t CO2e per person (2dp).
  function fmtValue(metric, n) {
    return metric === "total" ? fmtKt(n) : fmtPerCapita(n);
  }

  function fmtAxisValue(metric, n) {
    return metric === "total" ? fmtInt(n) : n.toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }

  function unitLabel(metric) {
    return metric === "total" ? "kt CO2e" : "t CO2e / person";
  }

  function unitShort(metric) {
    return metric === "total" ? "kt" : "t";
  }

  // Energy figures are stored in MWh (matching the source workbooks) but always displayed in
  // GWh, since these regions' totals (tens of thousands to ~1M MWh) read better compressed.
  function fmtGwh(mwh) {
    return (Number(mwh) / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }

  function fmtRatioPct(n) {
    return Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";
  }

  // Consumption-by-fuel figures are stored and displayed in ktoe, DESNZ's own native unit for
  // this dataset — unlike generation (GWh), converting to a second unit here wouldn't earn its
  // keep, since ktoe already reads at a comparable, compact scale for these regions.
  function fmtKtoe(ktoe) {
    return Number(ktoe).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }

  // Per-capita generation uses kWh/person rather than GWh/person (which would be a tiny
  // fraction for every region) — values land in the low hundreds to low thousands, so this
  // keeps fmtGwh's 1dp precision.
  function fmtKwhPerCapita(n) {
    return Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }

  // Per-capita consumption uses toe/person rather than ktoe/person — values land in the same
  // 1-10 range as emissions' t CO2e/person, so this uses fmtPerCapita's 2dp precision.
  function fmtToePerCapita(n) {
    return Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }

  // Appended to chart/KPI titles whenever the 20-year horizon is active, so it's never ambiguous
  // which set of figures is on screen — this is the one thing distinguishing an unofficial
  // GWP20 view from DESNZ's own published GWP100 numbers.
  function horizonTitleSuffix() {
    return currentHorizon === "gwp20" ? " (20-year GWP)" : "";
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const k in attrs) e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "viz-tooltip";
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function showTooltip(x, y, buildFn) {
    const tt = ensureTooltip();
    clearNode(tt);
    buildFn(tt);
    tt.style.left = (x + window.scrollX + 14) + "px";
    tt.style.top = (y + window.scrollY + 14) + "px";
    tt.classList.add("is-visible");
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove("is-visible");
  }

  function ttRow(parent, colorHex, label, value) {
    const row = document.createElement("div");
    row.className = "tt-row";
    const key = document.createElement("div");
    key.className = "tt-key";
    if (colorHex) {
      const stroke = document.createElement("span");
      stroke.className = "stroke";
      stroke.style.background = colorHex;
      key.appendChild(stroke);
    }
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    key.appendChild(labelSpan);
    const val = document.createElement("div");
    val.className = "tt-val";
    val.textContent = value;
    row.appendChild(key);
    row.appendChild(val);
    parent.appendChild(row);
  }

  function ttTitle(parent, text) {
    const t = document.createElement("div");
    t.className = "tt-title";
    t.textContent = text;
    parent.appendChild(t);
  }

  // Indented, muted row for a hovered bar's breakdown (e.g. Transport's sub-sectors, or Fossil
  // fuels' constituent fuel types) — visually distinct from ttRow's main aggregate row without
  // a colour swatch, since these all share the parent's identity rather than having their own.
  // groupFirst marks the first row of a breakdown group explicitly (rather than relying on a
  // CSS :first-of-type, which would only catch the very first .tt-subrow in the whole tooltip —
  // wrong when more than one hovered row has its own breakdown, e.g. the historical crosshair
  // showing several series at once).
  function ttSubRow(parent, label, value, groupFirst) {
    const row = document.createElement("div");
    row.className = "tt-row tt-subrow" + (groupFirst ? " tt-subrow-first" : "");
    const key = document.createElement("div");
    key.className = "tt-key";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    key.appendChild(labelSpan);
    const val = document.createElement("div");
    val.className = "tt-val";
    val.textContent = value;
    row.appendChild(key);
    row.appendChild(val);
    parent.appendChild(row);
  }

  // ---------------- data access ----------------

  function regionYears(regionKey) {
    return DATA.meta.years;
  }

  // Horizon-aware view of a region's year data: under GWP20, total_kt_co2e, per_capita_t_co2e
  // and sectors_kt_co2e are swapped for their .gwp20 counterparts (see process.py) — everything
  // else (population_thousands) is unaffected by the horizon, so it passes through unchanged.
  function yearData(regionKey, year) {
    const yd = DATA.regions[regionKey].years[year];
    return currentHorizon === "gwp20" ? Object.assign({}, yd, yd.gwp20) : yd;
  }

  function regionSeriesTotals(regionKey) {
    return DATA.meta.years.map(y => yearData(regionKey, y).total_kt_co2e);
  }

  function latestYear() {
    return DATA.meta.years[DATA.meta.years.length - 1];
  }

  function regionMetricValue(regionKey, year, metric) {
    const yd = yearData(regionKey, year);
    return metric === "total" ? yd.total_kt_co2e : yd.per_capita_t_co2e;
  }

  function sectorMetricValue(regionKey, year, sector, metric) {
    const yd = yearData(regionKey, year);
    const raw = yd.sectors_kt_co2e[sector];
    return metric === "total" ? raw : raw / yd.population_thousands;
  }

  function gasMetricValue(regionKey, year, gas, metric) {
    const yd = yearData(regionKey, year);
    const raw = yd.gases_kt_co2e[gas];
    return metric === "total" ? raw : raw / yd.population_thousands;
  }

  // Sub-sector detail only exists for the latest year (DATA.subsector_detail_latest_year),
  // grouped by parent sector (in SECTOR_ORDER) and sorted by magnitude within each sector.
  // Groups sub-sector rows under their parent sector, with sectors ordered by their own total
  // (descending) — the same order the non-detail view sorts by — so toggling "sub-sector
  // detail" on doesn't reshuffle which sector sits at the top; it only expands each one in place.
  // Sub-sector rows for a single sector, sorted by magnitude — the building block both the
  // full sub-sector detail view and the latest-view tooltip's "breakdown" rows are built from.
  function sectorSubrowsFor(regionKey, ly, sector, metric) {
    const detailRoot = currentHorizon === "gwp20" ? DATA.subsector_detail_latest_year.gwp20 : DATA.subsector_detail_latest_year;
    const subs = detailRoot[regionKey][sector] || {};
    const population = DATA.regions[regionKey].years[ly].population_thousands;
    return Object.keys(subs).map(name => ({
      name: name,
      sector: sector,
      value: metric === "total" ? subs[name] : subs[name] / population
    })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  function sectorSubrows(regionKey, ly, metric) {
    const sectorsByTotal = SECTOR_ORDER.slice()
      .sort((a, b) => sectorMetricValue(regionKey, ly, b, metric) - sectorMetricValue(regionKey, ly, a, metric));
    const rows = [];
    sectorsByTotal.forEach(sector => {
      rows.push(...sectorSubrowsFor(regionKey, ly, sector, metric));
    });
    return rows;
  }

  // Sub-sector names repeat their parent sector's name as a prefix (e.g. "Agriculture
  // Livestock", "LULUCF Net Emissions: Forestry") — strip it for the chart row label
  // since the row is already colour-coded by sector; full names still appear in the table.
  function shortSubsectorLabel(sector, name) {
    let label = name;
    if (label.startsWith(sector + " ")) label = label.slice(sector.length + 1);
    if (sector === "LULUCF") label = label.replace(/^Net Emissions:\s*/, "");
    return label.replace(/'/g, "");
  }

  // ---------------- energy data access ----------------

  function energyGenerationYears() {
    return ENERGY_DATA.meta.generation_years;
  }

  function energyLatestGenerationYear() {
    const years = energyGenerationYears();
    return years[years.length - 1];
  }

  function energyGeneration(regionKey, year) {
    return ENERGY_DATA.regions[regionKey].generation[year];
  }

  function energyConsumption(regionKey, year) {
    return ENERGY_DATA.regions[regionKey].consumption[year];
  }

  function energyConsumptionYears() {
    return ENERGY_DATA.meta.consumption_years;
  }

  // Population isn't part of ENERGY_DATA — it's the same DESNZ mid-year estimates already
  // loaded for the emissions dataset, for the same regions and (fully overlapping) years, so
  // energy per-capita figures reuse it rather than duplicating it.
  function regionPopulation(regionKey, year) {
    return DATA.regions[regionKey].years[year].population_thousands;
  }

  // Generation is stored in MWh. "Totals" keeps that (fmtGenerationMetric formats it as GWh);
  // "Per person" divides by population-in-thousands instead, which cancels both factors of
  // 1000 and lands directly on kWh/person — the same trick sectorMetricValue/gasMetricValue
  // use for emissions (kt / population-thousands = t/person).
  function generationMetricValue(regionKey, year, rawMwh, metric) {
    return metric === "total" ? rawMwh : rawMwh / regionPopulation(regionKey, year);
  }

  function fmtGenerationMetric(metric, n) {
    return metric === "total" ? fmtGwh(n) : fmtKwhPerCapita(n);
  }

  function generationUnitLabel(metric) {
    return metric === "total" ? "GWh" : "kWh/person";
  }

  // "Simple" categories collapse FUEL_ORDER into FUEL_SIMPLE_GROUPS; "complex" uses FUEL_ORDER
  // directly. Returns [{key, label}], where key is what consumptionValue expects back.
  function consumptionCategories(detail) {
    return detail
      ? FUEL_ORDER.map(f => ({ key: f, label: FUEL_LABEL[f] }))
      : Object.keys(FUEL_SIMPLE_GROUPS).map(g => ({ key: g, label: g }));
  }

  // Consumption is stored in ktoe. "Totals" keeps that; "Per person" divides by
  // population-in-thousands, cancelling to toe/person (mirrors generationMetricValue above).
  function consumptionValue(regionKey, year, categoryKey, detail, metric) {
    const c = energyConsumption(regionKey, year);
    if (!c) return null;
    const raw = detail
      ? c.fuels_ktoe[categoryKey]
      : FUEL_SIMPLE_GROUPS[categoryKey].reduce((sum, f) => sum + c.fuels_ktoe[f], 0);
    return metric === "total" ? raw : raw / regionPopulation(regionKey, year);
  }

  function fmtConsumptionMetric(metric, n) {
    return metric === "total" ? fmtKtoe(n) : fmtToePerCapita(n);
  }

  function consumptionUnitLabel(metric) {
    return metric === "total" ? "ktoe" : "toe/person";
  }

  // Constituent fuel breakdown for a "simple" group (e.g. "Fossil fuels" -> Coal, Manufactured
  // fuels, Petroleum, Gas), sorted by magnitude. Null for single-fuel groups (Electricity,
  // Bioenergy & waste) where a "breakdown" would just repeat the aggregate row.
  function fuelSimpleBreakdown(regionKey, year, groupKey, metric) {
    const constituents = FUEL_SIMPLE_GROUPS[groupKey];
    if (!constituents || constituents.length <= 1) return null;
    const c = energyConsumption(regionKey, year);
    if (!c) return null;
    const pop = regionPopulation(regionKey, year);
    return constituents.map(f => ({
      name: FUEL_LABEL[f],
      value: metric === "total" ? c.fuels_ktoe[f] : c.fuels_ktoe[f] / pop
    })).sort((a, b) => b.value - a.value);
  }

  // Renewable generation as a % of local electricity demand — not the same as "how much of
  // this area's electricity is renewable", since the grid means generation isn't necessarily
  // consumed where it's produced (see the generation-chart info modal). Null if either figure is
  // missing for that year (consumption data starts 2005, generation data starts 2014). This
  // ratio is metric-invariant (population cancels top and bottom), so it's always computed from
  // raw totals regardless of currentMetric.
  function energyGenerationShareOfDemand(regionKey, year) {
    const gen = energyGeneration(regionKey, year);
    const con = energyConsumption(regionKey, year);
    if (!gen || !con) return null;
    return (gen.total_mwh / con.electricity_consumption_mwh) * 100;
  }

  // ---------------- trend chart (historical line / latest bar) ----------------

  function buildTrendChart() {
    const container = document.getElementById("trend-chart");
    clearNode(container);

    const metric = currentMetric;
    const view = currentView;
    const years = DATA.meta.years;
    const ly = latestYear();

    const metricLabel = metric === "total" ? "Total emissions" : "Emissions per person";
    document.getElementById("trend-chart-title").textContent =
      metricLabel + ", " + (view === "historical" ? (years[0] + "–" + ly) : ly) + horizonTitleSuffix();

    if (view === "historical") {
      buildTrendChartHistorical(container, years, metric);
    } else {
      buildTrendChartLatest(container, ly, metric);
    }
  }

  // Target years shown on the historical trend chart. Both are "reach ~zero by year Y"
  // targets, so — unlike the CCC's percentage-vs-1990 pathway, which DESNZ's LA data (starts
  // 2005) can't express exactly — they need no baseline figure to plot.
  const TARGET_NET_ZERO_YEAR = 2050; // Hampshire County Council area target, aligned to UK Gov's legally-binding Climate Change Act target
  const TARGET_WCC_YEAR = 2030; // Winchester City Council's own district-wide carbon-neutral target — more ambitious than, and specific to, Winchester alone
  // Mid-Hampshire and Hampshire and the Solent have no target of their own yet (neither is an
  // existing council with a published net-zero date), so they fall back to the shared HCC/UK
  // Gov 2050 goal; only Winchester's own dashed pathway targets its own, earlier, date.
  const REGION_TARGET_YEAR = { winchester: TARGET_WCC_YEAR, "mid-hampshire": TARGET_NET_ZERO_YEAR, "hampshire-solent": TARGET_NET_ZERO_YEAR };

  function buildTrendChartHistorical(container, years, metric) {
    const series = REGIONS.map(r => ({
      key: r.key,
      label: r.label,
      legendLabel: r.legendLabel,
      color: categoryColor(r.key),
      targetYear: REGION_TARGET_YEAR[r.key],
      values: years.map(y => regionMetricValue(r.key, y, metric))
    }));

    const lastActualYear = years[years.length - 1];
    const chartMinYear = years[0];
    const chartMaxYear = TARGET_NET_ZERO_YEAR;

    // Straight-line "required" trajectory from each region's latest actual value to zero at
    // *its own* net-zero target year (Winchester: 2030; others: 2050) — not a modelled
    // decarbonisation pathway (real ones are rarely linear), just the simplest honest read of
    // the average pace still needed from here. Flat at zero past a region's own target, rather
    // than continuing to fall, since "required pace" has no meaning once the goal is met.
    function valueAtYear(s, year) {
      if (year <= lastActualYear) {
        const idx = years.indexOf(year);
        return idx >= 0 ? s.values[idx] : null;
      }
      if (year >= s.targetYear) return 0;
      const lastVal = s.values[s.values.length - 1];
      const t = (year - lastActualYear) / (s.targetYear - lastActualYear);
      return Math.max(0, lastVal * (1 - t));
    }

    const W = 860, H = 320;
    const M = { top: 20, right: 30, bottom: 32, left: 56 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const maxVal = Math.max(...series.flatMap(s => s.values)) * 1.08;
    const xScale = year => M.left + ((year - chartMinYear) / (chartMaxYear - chartMinYear)) * plotW;
    const yScale = v => M.top + plotH - (v / maxVal) * plotH;

    // gridlines + y ticks
    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const val = (maxVal / yTicks) * t;
      const yy = yScale(val);
      el("line", { x1: M.left, x2: M.left + plotW, y1: yy, y2: yy, stroke: cssVar("--gridline"), "stroke-width": "1" }, svg);
      const txt = el("text", { x: M.left - 8, y: yy + 4, "text-anchor": "end", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = fmtAxisValue(metric, val);
    }

    // x ticks
    const xTickYears = [chartMinYear, 2015, lastActualYear, TARGET_WCC_YEAR, 2040, TARGET_NET_ZERO_YEAR];
    xTickYears.forEach(year => {
      const xx = xScale(year);
      const txt = el("text", { x: xx, y: M.top + plotH + 20, "text-anchor": "middle", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = year;
    });

    el("line", { x1: M.left, x2: M.left + plotW, y1: M.top + plotH, y2: M.top + plotH, stroke: cssVar("--baseline"), "stroke-width": "1" }, svg);

    series.forEach(s => {
      let d = "";
      years.forEach((y, i) => { d += (i === 0 ? "M" : "L") + xScale(y).toFixed(1) + "," + yScale(s.values[i]).toFixed(1) + " "; });
      el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      const lastX = xScale(lastActualYear), lastY = yScale(s.values[s.values.length - 1]);
      el("circle", { cx: lastX, cy: lastY, r: "5", fill: s.color, stroke: cssVar("--surface-1"), "stroke-width": "2" }, svg);

      // dashed "required pathway" continuation, to this region's own target year — kept light
      // (low opacity, thin, tight dashes) so it reads as a background guide, not a fourth data
      // line competing with the actual (solid, full-weight) trend lines above it.
      el("line", {
        x1: lastX, y1: lastY, x2: xScale(s.targetYear), y2: yScale(0),
        stroke: s.color, "stroke-width": "1.5", "stroke-dasharray": "3,3", opacity: "0.3"
      }, svg);
    });

    // Net-zero target markers — one per distinct target year in use (2030 for Winchester's own
    // WCC target, 2050 for the shared HCC/UK Gov target the other two regions fall back to).
    // Single-line labels (not name+sub-label stacked) to keep this corner of the chart calm.
    const NET_ZERO_MARKERS = [
      { year: TARGET_WCC_YEAR, label: "2030: Net zero — WCC (Winchester)" },
      { year: TARGET_NET_ZERO_YEAR, label: "2050: Net zero — HCC & UK Gov" }
    ];
    const nzLabelEls = NET_ZERO_MARKERS.map(m => {
      const nzX = xScale(m.year), nzY = yScale(0);
      el("circle", { cx: nzX, cy: nzY, r: "4", fill: cssVar("--text-muted") }, svg);
      const nzLabel = el("text", { x: nzX - 8, y: nzY - 10, "text-anchor": "end", "font-size": "10.5", "font-weight": "700", fill: cssVar("--text-secondary") }, svg);
      nzLabel.textContent = m.label;
      return nzLabel;
    });

    // End-of-line labels: a single compact "Name value" line per region (not name + value
    // stacked across two rows), sitting at the latest actual year and pushed apart vertically
    // as a group only when series end close together in value, so they don't overlap each
    // other or the dashed lines fanning out just below them.
    const labelX = xScale(lastActualYear);
    const MIN_LABEL_GAP = 18;
    const endLabels = series.map(s => ({ ...s, y: yScale(s.values[s.values.length - 1]) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < endLabels.length; i++) {
      if (endLabels[i].y - endLabels[i - 1].y < MIN_LABEL_GAP) {
        endLabels[i].y = endLabels[i - 1].y + MIN_LABEL_GAP;
      }
    }
    const endLabelEls = endLabels.map(item => {
      const nameText = el("text", { x: labelX + 10, y: item.y + 4, "font-size": "12", "font-weight": "700", fill: item.color }, svg);
      nameText.textContent = item.label;
      const valText = el("tspan", { fill: cssVar("--text-secondary"), "font-weight": "500" });
      valText.textContent = "  " + fmtAxisValue(metric, item.values[item.values.length - 1]) + unitShort(metric);
      nameText.appendChild(valText);
      return nameText;
    });

    // A net-zero marker's label can land right on top of a region's own end-of-line label —
    // guaranteed for Winchester, whose 2030 target sits close in x to its 2024 data point, and
    // whose total emissions are small enough to keep both labels pinned near the zero baseline.
    // getBBox() gives the actual rendered box (no font-metric guessing needed, since both sets
    // of labels are already in the DOM), so nudge a colliding marker label up and clear of
    // whichever end-of-line label(s) it overlaps. Re-measures after each nudge (rather than
    // computing one offset up front) since clearing one label can push it straight into
    // another one stacked above it.
    nzLabelEls.forEach(nzEl => {
      for (let pass = 0; pass < 6; pass++) {
        let moved = false;
        endLabelEls.forEach(endEl => {
          const nzBox = nzEl.getBBox();
          const endBox = endEl.getBBox();
          const overlapsX = nzBox.x < endBox.x + endBox.width && nzBox.x + nzBox.width > endBox.x;
          const overlapsY = nzBox.y < endBox.y + endBox.height && nzBox.y + nzBox.height > endBox.y;
          if (overlapsX && overlapsY) {
            const currentY = parseFloat(nzEl.getAttribute("y"));
            const shift = endBox.y - (nzBox.y + nzBox.height) - 4;
            nzEl.setAttribute("y", currentY + shift);
            moved = true;
          }
        });
        if (!moved) break;
      }
    });

    // crosshair + hover — works across the whole 2005-2050 range; years beyond the latest
    // actual figure show the interpolated pathway value instead of real data.
    const crosshair = el("line", { x1: 0, x2: 0, y1: M.top, y2: M.top + plotH, stroke: cssVar("--text-muted"), "stroke-width": "1", opacity: "0" }, svg);
    const hitRect = el("rect", { x: M.left, y: M.top, width: plotW, height: plotH, fill: "transparent" }, svg);

    hitRect.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const localX = (ev.clientX - rect.left) * scaleX;
      const yearFloat = chartMinYear + ((localX - M.left) / plotW) * (chartMaxYear - chartMinYear);
      const year = Math.round(Math.max(chartMinYear, Math.min(chartMaxYear, yearFloat)));
      const xx = xScale(year);
      const isFuture = year > lastActualYear;
      crosshair.setAttribute("x1", xx); crosshair.setAttribute("x2", xx); crosshair.setAttribute("opacity", "1");
      const idx = years.indexOf(year);
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(year) + (isFuture ? " — required pathway" : ""));
        series.forEach(s => {
          const val = valueAtYear(s, year);
          let text = fmtValue(metric, val) + " " + unitShort(metric);
          if (!isFuture && idx > 0) {
            text += " (" + fmtPct((val - s.values[idx - 1]) / s.values[idx - 1] * 100) + " vs " + years[idx - 1] + ")";
          }
          ttRow(tt, s.color, s.label, text);
        });
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    // legend
    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.legendLabel)));
    container.appendChild(legendWrap);

    buildTrendTableHistorical(years, series, metric);
  }

  function buildTrendChartLatest(container, ly, metric) {
    const py = DATA.meta.years[DATA.meta.years.length - 2];
    const regions = REGIONS.map(r => ({ key: r.key, label: r.label, color: categoryColor(r.key) }));
    const values = regions.map(r => regionMetricValue(r.key, ly, metric));
    const prevValues = regions.map(r => regionMetricValue(r.key, py, metric));

    const W = 860, H = 320;
    const M = { top: 20, right: 40, bottom: 40, left: 64 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const maxVal = Math.max(...values) * 1.2;
    const yScale = v => M.top + plotH - (v / maxVal) * plotH;

    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const val = (maxVal / yTicks) * t;
      const yy = yScale(val);
      el("line", { x1: M.left, x2: M.left + plotW, y1: yy, y2: yy, stroke: cssVar("--gridline"), "stroke-width": "1" }, svg);
      const txt = el("text", { x: M.left - 8, y: yy + 4, "text-anchor": "end", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = fmtAxisValue(metric, val);
    }
    el("line", { x1: M.left, x2: M.left + plotW, y1: M.top + plotH, y2: M.top + plotH, stroke: cssVar("--baseline"), "stroke-width": "1" }, svg);

    const slotW = plotW / regions.length;
    const barW = Math.min(140, slotW * 0.5);

    regions.forEach((r, i) => {
      const value = values[i];
      const cx = M.left + slotW * (i + 0.5);
      const barY = yScale(value);
      const barH = (M.top + plotH) - barY;

      const rect = el("rect", { x: cx - barW / 2, y: barY, width: barW, height: barH, rx: "6", fill: r.color }, svg);
      rect.style.cursor = "pointer";

      const valText = el("text", { x: cx, y: barY - 10, "text-anchor": "middle", "font-size": "13", "font-weight": "700", fill: cssVar("--text-primary") }, svg);
      valText.textContent = fmtAxisValue(metric, value) + " " + unitShort(metric);

      const label = el("text", { x: cx, y: M.top + plotH + 24, "text-anchor": "middle", "font-size": "12.5", fill: cssVar("--text-secondary") }, svg);
      label.textContent = r.label;

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, r.label + " — " + ly);
          const prev = prevValues[i];
          const deltaText = " (" + fmtPct((value - prev) / prev * 100) + " vs " + py + ")";
          ttRow(tt, r.color, unitLabel(metric), fmtValue(metric, value) + deltaText);
        });
      });
    });

    buildTrendTableLatest(ly, regions, values, metric);
  }

  function legendItemLine(color, label) {
    const item = document.createElement("div");
    item.className = "legend-item";
    const sw = document.createElement("span");
    sw.className = "legend-swatch line";
    sw.style.background = color;
    const txt = document.createElement("span");
    txt.textContent = label;
    item.appendChild(sw);
    item.appendChild(txt);
    return item;
  }

  function legendItemBox(color, label) {
    const item = document.createElement("div");
    item.className = "legend-item";
    const sw = document.createElement("span");
    sw.className = "legend-swatch";
    sw.style.background = color;
    const txt = document.createElement("span");
    txt.textContent = label;
    item.appendChild(sw);
    item.appendChild(txt);
    return item;
  }

  function buildTrendTableHistorical(years, series, metric) {
    const wrap = document.getElementById("trend-table");
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.label + " (" + unitLabel(metric) + ")")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtValue(metric, s.values[i])));
      cells.forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildTrendTableLatest(ly, regions, values, metric) {
    const wrap = document.getElementById("trend-table");
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Region", unitLabel(metric) + " (" + ly + ")"].forEach(h => { const th = document.createElement("th"); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    regions.forEach((r, i) => {
      const tr = document.createElement("tr");
      [r.label, fmtValue(metric, values[i])].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // ---------------- sector chart (latest bars / historical lines) ----------------

  function buildSectorChart(regionKey) {
    const container = document.getElementById("sector-chart");
    clearNode(container);
    const ly = latestYear();
    const metric = currentMetric;
    const view = currentView;

    // Sub-sector detail only exists for the latest year, so disable it whenever the
    // historical view is active (and force it off so the toggle doesn't lie about state).
    const detailAvailable = view === "latest";
    if (!detailAvailable) currentDetail = false;
    const detailToggle = document.getElementById("sector-detail-toggle");
    detailToggle.checked = currentDetail;
    detailToggle.disabled = !detailAvailable;
    document.getElementById("sector-detail-row").classList.toggle("is-disabled", !detailAvailable);

    const metricLabel = metric === "total" ? "emissions by sector" : "emissions per person by sector";
    document.getElementById("sector-chart-title").textContent =
      REGION_LABEL[regionKey] + " " + metricLabel + ", " + (view === "historical" ? (DATA.meta.years[0] + "–" + ly) : ly) + horizonTitleSuffix();

    if (view === "historical") {
      buildSectorChartHistorical(container, regionKey, metric);
    } else {
      buildSectorChartLatest(container, regionKey, ly, metric, currentDetail);
    }
  }

  function buildSectorChartLatest(container, regionKey, ly, metric, detail) {
    const regionTotal = regionMetricValue(regionKey, ly, metric);
    const rows = detail
      ? sectorSubrows(regionKey, ly, metric)
      : SECTOR_ORDER.map(s => ({ name: s, value: sectorMetricValue(regionKey, ly, s, metric) }))
          .sort((a, b) => b.value - a.value);

    const W = 860;
    const rowH = detail ? 26 : 34;
    const gap = detail ? 3 : 6;
    const barH = detail ? 18 : 24;
    const labelFontSize = detail ? "11" : "12.5";
    const M = { top: 10, right: 70, bottom: 10, left: detail ? 235 : 130 };
    const plotW = W - M.left - M.right;
    const H = M.top + M.bottom + rows.length * (rowH + gap);

    const maxAbs = Math.max(...rows.map(r => Math.abs(r.value)));
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const xScale = v => (v / maxAbs) * (plotW / 2);
    const zeroX = M.left + plotW / 2;

    el("line", { x1: zeroX, x2: zeroX, y1: M.top, y2: H - M.bottom, stroke: cssVar("--baseline"), "stroke-width": "1" }, svg);

    rows.forEach((r, i) => {
      const y = M.top + i * (rowH + gap);
      const barW = xScale(r.value);
      const barX = r.value >= 0 ? zeroX : zeroX + barW;
      const color = categoryColor(detail ? r.sector : r.name);
      const barY = y + (rowH - barH) / 2;

      const label = el("text", { x: M.left - 12, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": labelFontSize, fill: cssVar("--text-secondary") }, svg);
      label.textContent = detail ? (r.sector + " — " + shortSubsectorLabel(r.sector, r.name)) : r.name;

      const rect = el("rect", {
        x: barX, y: barY, width: Math.abs(barW), height: barH, rx: "4",
        fill: color, class: "sector-bar"
      }, svg);
      rect.style.cursor = "pointer";

      const valX = r.value >= 0 ? barX + Math.abs(barW) + 8 : barX - 8;
      const valAnchor = r.value >= 0 ? "start" : "end";
      const valText = el("text", { x: valX, y: y + rowH / 2 + 4, "text-anchor": valAnchor, "font-size": labelFontSize, "font-weight": "700", fill: cssVar("--text-primary") }, svg);
      valText.textContent = fmtAxisValue(metric, r.value);

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, detail ? (r.sector + " — " + shortSubsectorLabel(r.sector, r.name)) : r.name);
          ttRow(tt, color, ly + "", fmtValue(metric, r.value) + " " + unitLabel(metric) + " (" + fmtRatioPct(r.value / regionTotal * 100) + " of total)");
          // Non-detail hover shows this sector's own sub-sector breakdown, so a viewer doesn't
          // need to tick "Show sub-sector detail" just to see what's inside e.g. Transport.
          if (!detail) {
            sectorSubrowsFor(regionKey, ly, r.name, metric).forEach((sub, i) => {
              ttSubRow(tt, shortSubsectorLabel(sub.sector, sub.name), fmtValue(metric, sub.value) + " " + unitShort(metric), i === 0);
            });
          }
        });
      });
    });

    buildSectorTableLatest(regionKey, ly, rows, metric, detail);
  }

  function buildSectorChartHistorical(container, regionKey, metric) {
    const years = DATA.meta.years;
    const series = SECTOR_ORDER.map(s => ({
      name: s,
      color: categoryColor(s),
      values: years.map(y => sectorMetricValue(regionKey, y, s, metric))
    }));

    const W = 860, H = 340;
    const M = { top: 20, right: 20, bottom: 32, left: 64 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const allValues = series.flatMap(s => s.values);
    const maxVal = Math.max(...allValues, 0) * 1.08;
    const minVal = Math.min(...allValues, 0) * 1.08;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const xScale = i => M.left + (i / (years.length - 1)) * plotW;
    const yScale = v => M.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const val = minVal + ((maxVal - minVal) / yTicks) * t;
      const yy = yScale(val);
      el("line", { x1: M.left, x2: M.left + plotW, y1: yy, y2: yy, stroke: cssVar("--gridline"), "stroke-width": "1" }, svg);
      const txt = el("text", { x: M.left - 8, y: yy + 4, "text-anchor": "end", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = fmtAxisValue(metric, val);
    }

    const xTickYears = [years[0], years[Math.round((years.length - 1) * 0.25)], years[Math.round((years.length - 1) * 0.5)], years[Math.round((years.length - 1) * 0.75)], years[years.length - 1]];
    xTickYears.forEach(y => {
      const i = years.indexOf(y);
      const txt = el("text", { x: xScale(i), y: M.top + plotH + 20, "text-anchor": "middle", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = y;
    });

    // zero baseline (LULUCF typically runs negative, so this can sit inside the plot area)
    el("line", { x1: M.left, x2: M.left + plotW, y1: yScale(0), y2: yScale(0), stroke: cssVar("--baseline"), "stroke-width": "1" }, svg);

    series.forEach(s => {
      let d = "";
      s.values.forEach((v, i) => { d += (i === 0 ? "M" : "L") + xScale(i).toFixed(1) + "," + yScale(v).toFixed(1) + " "; });
      el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    });

    const crosshair = el("line", { x1: 0, x2: 0, y1: M.top, y2: M.top + plotH, stroke: cssVar("--text-muted"), "stroke-width": "1", opacity: "0" }, svg);
    const hitRect = el("rect", { x: M.left, y: M.top, width: plotW, height: plotH, fill: "transparent" }, svg);

    hitRect.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const localX = (ev.clientX - rect.left) * scaleX;
      let idx = Math.round(((localX - M.left) / plotW) * (years.length - 1));
      idx = Math.max(0, Math.min(years.length - 1, idx));
      const xx = xScale(idx);
      crosshair.setAttribute("x1", xx); crosshair.setAttribute("x2", xx); crosshair.setAttribute("opacity", "1");
      const yearTotal = series.reduce((a, s) => a + s.values[idx], 0) || 1;
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(years[idx]));
        series.slice().sort((a, b) => b.values[idx] - a.values[idx]).forEach(s => {
          ttRow(tt, s.color, s.name, fmtValue(metric, s.values[idx]) + " " + unitShort(metric) + " (" + fmtRatioPct(s.values[idx] / yearTotal * 100) + ")");
        });
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.name)));
    container.appendChild(legendWrap);

    buildSectorTableHistorical(regionKey, years, series, metric);
  }

  function buildSectorTableLatest(regionKey, ly, rows, metric, detail) {
    const wrap = document.getElementById("sector-table");
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    const headers = detail
      ? ["Sector", "Sub-sector", unitLabel(metric) + " (" + ly + ")"]
      : ["Sector", unitLabel(metric) + " (" + ly + ")"];
    headers.forEach(h => { const th = document.createElement("th"); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const cells = detail ? [r.sector, r.name, fmtValue(metric, r.value)] : [r.name, fmtValue(metric, r.value)];
      cells.forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildSectorTableHistorical(regionKey, years, series, metric) {
    const wrap = document.getElementById("sector-table");
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.name + " (" + unitLabel(metric) + ")")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtValue(metric, s.values[i])));
      cells.forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // ---------------- gas chart (latest bars / historical lines) ----------------
  // Unlike sectors, gases are never negative, so these bars run from a fixed left edge rather
  // than diverging from a centre zero line — a plain left-to-right bar reads better when nothing
  // needs to point the other way. Rows keep GAS_ORDER's fixed CO2/CH4/N2O order rather than
  // sorting by magnitude, since which gas is which is the whole point of this chart.

  function buildGasChart(regionKey) {
    const container = document.getElementById("gas-chart");
    clearNode(container);
    const ly = latestYear();
    const metric = currentMetric;
    const view = currentView;

    const metricLabel = metric === "total" ? "emissions by greenhouse gas" : "emissions per person by greenhouse gas";
    document.getElementById("gas-chart-title").textContent =
      REGION_LABEL[regionKey] + " " + metricLabel + ", " + (view === "historical" ? (DATA.meta.years[0] + "–" + ly) : ly) + horizonTitleSuffix();

    if (view === "historical") {
      buildGasChartHistorical(container, regionKey, metric);
    } else {
      buildGasChartLatest(container, regionKey, ly, metric);
    }
  }

  function buildGasChartLatest(container, regionKey, ly, metric) {
    const rows = GAS_ORDER.map(g => ({ key: g, name: GAS_LABEL[g], value: gasMetricValue(regionKey, ly, g, metric) }));
    const regionTotal = rows.reduce((a, r) => a + r.value, 0) || 1;

    const W = 860, rowH = 40, gap = 14, barH = 26, labelFontSize = "12.5";
    const M = { top: 10, right: 80, bottom: 10, left: 150 };
    const plotW = W - M.left - M.right;
    const H = M.top + M.bottom + rows.length * (rowH + gap) - gap;

    const maxVal = Math.max(...rows.map(r => r.value)) || 1;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const xScale = v => (v / maxVal) * plotW;

    rows.forEach((r, i) => {
      const y = M.top + i * (rowH + gap);
      const barW = xScale(r.value);
      const color = categoryColor(r.key);
      const barY = y + (rowH - barH) / 2;

      const label = el("text", { x: M.left - 12, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": labelFontSize, fill: cssVar("--text-secondary") }, svg);
      label.textContent = r.name;

      const rect = el("rect", { x: M.left, y: barY, width: Math.max(barW, 0), height: barH, rx: "4", fill: color }, svg);
      rect.style.cursor = "pointer";

      const valText = el("text", { x: M.left + barW + 8, y: y + rowH / 2 + 4, "text-anchor": "start", "font-size": labelFontSize, "font-weight": "700", fill: cssVar("--text-primary") }, svg);
      valText.textContent = fmtAxisValue(metric, r.value);

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, r.name);
          ttRow(tt, color, ly + "", fmtValue(metric, r.value) + " " + unitLabel(metric) + " (" + fmtRatioPct(r.value / regionTotal * 100) + " of total)");
        });
      });
    });

    buildGasTableLatest(ly, rows, metric);
  }

  function buildGasChartHistorical(container, regionKey, metric) {
    const years = DATA.meta.years;
    const series = GAS_ORDER.map(g => ({
      key: g,
      name: GAS_LABEL[g],
      color: categoryColor(g),
      values: years.map(y => gasMetricValue(regionKey, y, g, metric))
    }));

    const W = 860, H = 340;
    const M = { top: 20, right: 20, bottom: 32, left: 64 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const maxVal = Math.max(...series.flatMap(s => s.values), 0) * 1.08;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const xScale = i => M.left + (i / (years.length - 1)) * plotW;
    const yScale = v => M.top + plotH - (v / maxVal) * plotH;

    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const val = (maxVal / yTicks) * t;
      const yy = yScale(val);
      el("line", { x1: M.left, x2: M.left + plotW, y1: yy, y2: yy, stroke: cssVar("--gridline"), "stroke-width": "1" }, svg);
      const txt = el("text", { x: M.left - 8, y: yy + 4, "text-anchor": "end", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = fmtAxisValue(metric, val);
    }

    const xTickYears = [years[0], years[Math.round((years.length - 1) * 0.25)], years[Math.round((years.length - 1) * 0.5)], years[Math.round((years.length - 1) * 0.75)], years[years.length - 1]];
    xTickYears.forEach(y => {
      const i = years.indexOf(y);
      const txt = el("text", { x: xScale(i), y: M.top + plotH + 20, "text-anchor": "middle", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = y;
    });

    el("line", { x1: M.left, x2: M.left + plotW, y1: yScale(0), y2: yScale(0), stroke: cssVar("--baseline"), "stroke-width": "1" }, svg);

    series.forEach(s => {
      let d = "";
      s.values.forEach((v, i) => { d += (i === 0 ? "M" : "L") + xScale(i).toFixed(1) + "," + yScale(v).toFixed(1) + " "; });
      el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    });

    const crosshair = el("line", { x1: 0, x2: 0, y1: M.top, y2: M.top + plotH, stroke: cssVar("--text-muted"), "stroke-width": "1", opacity: "0" }, svg);
    const hitRect = el("rect", { x: M.left, y: M.top, width: plotW, height: plotH, fill: "transparent" }, svg);

    hitRect.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const localX = (ev.clientX - rect.left) * scaleX;
      let idx = Math.round(((localX - M.left) / plotW) * (years.length - 1));
      idx = Math.max(0, Math.min(years.length - 1, idx));
      const xx = xScale(idx);
      crosshair.setAttribute("x1", xx); crosshair.setAttribute("x2", xx); crosshair.setAttribute("opacity", "1");
      const yearTotal = series.reduce((a, s) => a + s.values[idx], 0) || 1;
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(years[idx]));
        series.slice().sort((a, b) => b.values[idx] - a.values[idx]).forEach(s => {
          ttRow(tt, s.color, s.name, fmtValue(metric, s.values[idx]) + " " + unitShort(metric) + " (" + fmtRatioPct(s.values[idx] / yearTotal * 100) + ")");
        });
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.name)));
    container.appendChild(legendWrap);

    buildGasTableHistorical(years, series, metric);
  }

  function buildGasTableLatest(ly, rows, metric) {
    const wrap = document.getElementById("gas-table");
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Gas", unitLabel(metric) + " (" + ly + ")"].forEach(h => { const th = document.createElement("th"); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      [r.name, fmtValue(metric, r.value)].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildGasTableHistorical(years, series, metric) {
    const wrap = document.getElementById("gas-table");
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.name + " (" + unitLabel(metric) + ")")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtValue(metric, s.values[i])));
      cells.forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // ---------------- generation chart (latest bars / historical lines) ----------------
  // Structurally mirrors the gas chart above: technologies, like gases, are never negative, so
  // bars run left-to-right from a fixed edge rather than diverging from a centre zero line.

  function updateGenerationNote(regionKey, gy, metric) {
    const gen = energyGeneration(regionKey, gy);
    const total = generationMetricValue(regionKey, gy, gen.total_mwh, metric);
    const share = energyGenerationShareOfDemand(regionKey, gy);
    const label = metric === "total" ? "Total renewable generation, " : "Renewable generation per person, ";
    generationNoteText = label + gy + ": " + fmtGenerationMetric(metric, total) + " " + generationUnitLabel(metric) +
      (share === null ? "." : " — equivalent to " + fmtRatioPct(share) + " of estimated local electricity demand (generation and demand aren't directly connected via the shared national grid).");
  }

  function buildGenerationChart(regionKey) {
    const container = document.getElementById("generation-chart");
    if (!container || !ENERGY_DATA) return;
    clearNode(container);
    const years = energyGenerationYears();
    const gy = energyLatestGenerationYear();
    const view = currentView;
    const metric = currentMetric;

    const metricLabel = metric === "total"
      ? "renewable electricity generation by technology"
      : "renewable electricity generation per person by technology";
    document.getElementById("generation-chart-title").textContent =
      REGION_LABEL[regionKey] + " " + metricLabel + ", " +
      (view === "historical" ? (years[0] + "–" + gy) : gy);
    updateGenerationNote(regionKey, gy, metric);

    if (view === "historical") {
      buildGenerationChartHistorical(container, regionKey, years, metric);
    } else {
      buildGenerationChartLatest(container, regionKey, gy, metric);
    }
  }

  function buildGenerationChartLatest(container, regionKey, gy, metric) {
    const gen = energyGeneration(regionKey, gy);
    const total = generationMetricValue(regionKey, gy, gen.total_mwh, metric);
    const rows = ENERGY_TECH_ORDER.map(t => ({ name: t, value: generationMetricValue(regionKey, gy, gen.by_technology_mwh[t], metric) }))
      .sort((a, b) => b.value - a.value);

    const W = 860, rowH = 40, gap = 14, barH = 26, labelFontSize = "12.5";
    const M = { top: 10, right: 80, bottom: 10, left: 150 };
    const plotW = W - M.left - M.right;
    const H = M.top + M.bottom + rows.length * (rowH + gap) - gap;

    const maxVal = Math.max(...rows.map(r => r.value)) || 1;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const xScale = v => (v / maxVal) * plotW;

    rows.forEach((r, i) => {
      const y = M.top + i * (rowH + gap);
      const barW = xScale(r.value);
      const color = categoryColor(r.name);
      const barY = y + (rowH - barH) / 2;

      const label = el("text", { x: M.left - 12, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": labelFontSize, fill: cssVar("--text-secondary") }, svg);
      label.textContent = r.name;

      const rect = el("rect", { x: M.left, y: barY, width: Math.max(barW, 0), height: barH, rx: "4", fill: color }, svg);
      rect.style.cursor = "pointer";

      const valText = el("text", { x: M.left + barW + 8, y: y + rowH / 2 + 4, "text-anchor": "start", "font-size": labelFontSize, "font-weight": "700", fill: cssVar("--text-primary") }, svg);
      valText.textContent = fmtGenerationMetric(metric, r.value) + " " + generationUnitLabel(metric);

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, r.name);
          ttRow(tt, color, gy + "", fmtGenerationMetric(metric, r.value) + " " + generationUnitLabel(metric) + " (" + fmtRatioPct(r.value / total * 100) + " of total)");
        });
      });
    });

    buildGenerationTableLatest(gy, rows, metric);
  }

  function buildGenerationChartHistorical(container, regionKey, years, metric) {
    const series = ENERGY_TECH_ORDER.map(t => ({
      name: t,
      color: categoryColor(t),
      values: years.map(y => generationMetricValue(regionKey, y, energyGeneration(regionKey, y).by_technology_mwh[t], metric))
    }));

    const W = 860, H = 340;
    const M = { top: 20, right: 20, bottom: 32, left: 64 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const maxVal = Math.max(...series.flatMap(s => s.values), 0) * 1.08 || 1;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const xScale = i => M.left + (i / (years.length - 1)) * plotW;
    const yScale = v => M.top + plotH - (v / maxVal) * plotH;

    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const val = (maxVal / yTicks) * t;
      const yy = yScale(val);
      el("line", { x1: M.left, x2: M.left + plotW, y1: yy, y2: yy, stroke: cssVar("--gridline"), "stroke-width": "1" }, svg);
      const txt = el("text", { x: M.left - 8, y: yy + 4, "text-anchor": "end", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = fmtGenerationMetric(metric, val);
    }

    const xTickYears = [years[0], years[Math.round((years.length - 1) * 0.25)], years[Math.round((years.length - 1) * 0.5)], years[Math.round((years.length - 1) * 0.75)], years[years.length - 1]];
    xTickYears.forEach(y => {
      const i = years.indexOf(y);
      const txt = el("text", { x: xScale(i), y: M.top + plotH + 20, "text-anchor": "middle", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = y;
    });

    el("line", { x1: M.left, x2: M.left + plotW, y1: yScale(0), y2: yScale(0), stroke: cssVar("--baseline"), "stroke-width": "1" }, svg);

    series.forEach(s => {
      let d = "";
      s.values.forEach((v, i) => { d += (i === 0 ? "M" : "L") + xScale(i).toFixed(1) + "," + yScale(v).toFixed(1) + " "; });
      el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    });

    const crosshair = el("line", { x1: 0, x2: 0, y1: M.top, y2: M.top + plotH, stroke: cssVar("--text-muted"), "stroke-width": "1", opacity: "0" }, svg);
    const hitRect = el("rect", { x: M.left, y: M.top, width: plotW, height: plotH, fill: "transparent" }, svg);

    hitRect.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const localX = (ev.clientX - rect.left) * scaleX;
      let idx = Math.round(((localX - M.left) / plotW) * (years.length - 1));
      idx = Math.max(0, Math.min(years.length - 1, idx));
      const xx = xScale(idx);
      crosshair.setAttribute("x1", xx); crosshair.setAttribute("x2", xx); crosshair.setAttribute("opacity", "1");
      const yearTotal = series.reduce((a, s) => a + s.values[idx], 0) || 1;
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(years[idx]));
        series.slice().sort((a, b) => b.values[idx] - a.values[idx]).forEach(s => {
          ttRow(tt, s.color, s.name, fmtGenerationMetric(metric, s.values[idx]) + " " + generationUnitLabel(metric) + " (" + fmtRatioPct(s.values[idx] / yearTotal * 100) + ")");
        });
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.name)));
    container.appendChild(legendWrap);

    buildGenerationTableHistorical(years, series, metric);
  }

  function buildGenerationTableLatest(gy, rows, metric) {
    const wrap = document.getElementById("generation-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Technology", generationUnitLabel(metric) + " (" + gy + ")"].forEach(h => { const th = document.createElement("th"); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      [r.name, fmtGenerationMetric(metric, r.value)].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildGenerationTableHistorical(years, series, metric) {
    const wrap = document.getElementById("generation-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.name + " (" + generationUnitLabel(metric) + ")")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtGenerationMetric(metric, s.values[i])));
      cells.forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // ---------------- consumption chart (latest bars / historical lines) ----------------
  // Structurally identical to the generation chart above, but categories come from either
  // FUEL_ORDER ("complex") or FUEL_SIMPLE_GROUPS ("simple") depending on currentConsumptionDetail
  // — the same simple/detailed split as the sector chart's sub-sector toggle, but available in
  // both Latest year and Historical trend view here, since (unlike sub-sector emissions detail)
  // DESNZ publishes the full fuel breakdown for every year, not just the latest.

  function buildConsumptionChart(regionKey) {
    const container = document.getElementById("consumption-chart");
    if (!container || !ENERGY_DATA) return;
    clearNode(container);
    const years = energyConsumptionYears();
    const cy = years[years.length - 1];
    const view = currentView;
    const detail = currentConsumptionDetail;
    const metric = currentMetric;

    // Browsers restore a checkbox's checked state across a manual refresh independently of the
    // DOM/JS default, so force it back in line with actual app state on every render (same
    // pattern as the sector chart's sub-sector-detail toggle below) — otherwise a page refresh
    // with this ticked leaves the box looking ticked while currentConsumptionDetail (and thus
    // the chart) has already reset to the simple view.
    document.getElementById("consumption-detail-toggle").checked = detail;

    const metricLabel = metric === "total"
      ? "energy consumption by " + (detail ? "fuel type" : "source")
      : "energy consumption per person by " + (detail ? "fuel type" : "source");
    document.getElementById("consumption-chart-title").textContent =
      REGION_LABEL[regionKey] + " " + metricLabel + ", " +
      (view === "historical" ? (years[0] + "–" + cy) : cy);

    if (view === "historical") {
      buildConsumptionChartHistorical(container, regionKey, years, detail, metric);
    } else {
      buildConsumptionChartLatest(container, regionKey, cy, detail, metric);
    }
  }

  function buildConsumptionChartLatest(container, regionKey, cy, detail, metric) {
    const cats = consumptionCategories(detail);
    const allFuelsRaw = energyConsumption(regionKey, cy).all_fuels_ktoe;
    const allFuels = metric === "total" ? allFuelsRaw : allFuelsRaw / regionPopulation(regionKey, cy);
    const rows = cats.map(c => ({ key: c.key, name: c.label, value: consumptionValue(regionKey, cy, c.key, detail, metric) }))
      .sort((a, b) => b.value - a.value);

    const W = 860, rowH = 40, gap = 14, barH = 26, labelFontSize = "12.5";
    const M = { top: 10, right: 80, bottom: 10, left: 150 };
    const plotW = W - M.left - M.right;
    const H = M.top + M.bottom + rows.length * (rowH + gap) - gap;

    const maxVal = Math.max(...rows.map(r => r.value)) || 1;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const xScale = v => (v / maxVal) * plotW;

    rows.forEach((r, i) => {
      const y = M.top + i * (rowH + gap);
      const barW = xScale(r.value);
      const color = categoryColor(r.key);
      const barY = y + (rowH - barH) / 2;

      const label = el("text", { x: M.left - 12, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": labelFontSize, fill: cssVar("--text-secondary") }, svg);
      label.textContent = r.name;

      const rect = el("rect", { x: M.left, y: barY, width: Math.max(barW, 0), height: barH, rx: "4", fill: color }, svg);
      rect.style.cursor = "pointer";

      const valText = el("text", { x: M.left + barW + 8, y: y + rowH / 2 + 4, "text-anchor": "start", "font-size": labelFontSize, "font-weight": "700", fill: cssVar("--text-primary") }, svg);
      valText.textContent = fmtConsumptionMetric(metric, r.value) + " " + consumptionUnitLabel(metric);

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, r.name);
          ttRow(tt, color, cy + "", fmtConsumptionMetric(metric, r.value) + " " + consumptionUnitLabel(metric) + " (" + fmtRatioPct(r.value / allFuels * 100) + " of total)");
          if (!detail) {
            const breakdown = fuelSimpleBreakdown(regionKey, cy, r.key, metric);
            if (breakdown) {
              breakdown.forEach((sub, i) => ttSubRow(tt, sub.name, fmtConsumptionMetric(metric, sub.value) + " " + consumptionUnitLabel(metric), i === 0));
            }
          }
        });
      });
    });

    buildConsumptionTableLatest(cy, rows, metric);
  }

  function buildConsumptionChartHistorical(container, regionKey, years, detail, metric) {
    const cats = consumptionCategories(detail);
    const series = cats.map(c => ({
      key: c.key,
      name: c.label,
      color: categoryColor(c.key),
      values: years.map(y => consumptionValue(regionKey, y, c.key, detail, metric))
    }));

    const W = 860, H = 340;
    const M = { top: 20, right: 20, bottom: 32, left: 64 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const maxVal = Math.max(...series.flatMap(s => s.values), 0) * 1.08 || 1;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const xScale = i => M.left + (i / (years.length - 1)) * plotW;
    const yScale = v => M.top + plotH - (v / maxVal) * plotH;

    const yTicks = 5;
    for (let t = 0; t <= yTicks; t++) {
      const val = (maxVal / yTicks) * t;
      const yy = yScale(val);
      el("line", { x1: M.left, x2: M.left + plotW, y1: yy, y2: yy, stroke: cssVar("--gridline"), "stroke-width": "1" }, svg);
      const txt = el("text", { x: M.left - 8, y: yy + 4, "text-anchor": "end", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = fmtConsumptionMetric(metric, val);
    }

    const xTickYears = [years[0], years[Math.round((years.length - 1) * 0.25)], years[Math.round((years.length - 1) * 0.5)], years[Math.round((years.length - 1) * 0.75)], years[years.length - 1]];
    xTickYears.forEach(y => {
      const i = years.indexOf(y);
      const txt = el("text", { x: xScale(i), y: M.top + plotH + 20, "text-anchor": "middle", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = y;
    });

    el("line", { x1: M.left, x2: M.left + plotW, y1: yScale(0), y2: yScale(0), stroke: cssVar("--baseline"), "stroke-width": "1" }, svg);

    series.forEach(s => {
      let d = "";
      s.values.forEach((v, i) => { d += (i === 0 ? "M" : "L") + xScale(i).toFixed(1) + "," + yScale(v).toFixed(1) + " "; });
      el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    });

    const crosshair = el("line", { x1: 0, x2: 0, y1: M.top, y2: M.top + plotH, stroke: cssVar("--text-muted"), "stroke-width": "1", opacity: "0" }, svg);
    const hitRect = el("rect", { x: M.left, y: M.top, width: plotW, height: plotH, fill: "transparent" }, svg);

    hitRect.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const localX = (ev.clientX - rect.left) * scaleX;
      let idx = Math.round(((localX - M.left) / plotW) * (years.length - 1));
      idx = Math.max(0, Math.min(years.length - 1, idx));
      const xx = xScale(idx);
      crosshair.setAttribute("x1", xx); crosshair.setAttribute("x2", xx); crosshair.setAttribute("opacity", "1");
      const yearTotal = series.reduce((a, s) => a + s.values[idx], 0) || 1;
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(years[idx]));
        series.slice().sort((a, b) => b.values[idx] - a.values[idx]).forEach(s => {
          ttRow(tt, s.color, s.name, fmtConsumptionMetric(metric, s.values[idx]) + " " + consumptionUnitLabel(metric) + " (" + fmtRatioPct(s.values[idx] / yearTotal * 100) + ")");
          if (!detail) {
            const breakdown = fuelSimpleBreakdown(regionKey, years[idx], s.key, metric);
            if (breakdown) {
              breakdown.forEach((sub, i) => ttSubRow(tt, sub.name, fmtConsumptionMetric(metric, sub.value) + " " + consumptionUnitLabel(metric), i === 0));
            }
          }
        });
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.name)));
    container.appendChild(legendWrap);

    buildConsumptionTableHistorical(years, series, metric);
  }

  function buildConsumptionTableLatest(cy, rows, metric) {
    const wrap = document.getElementById("consumption-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Source", consumptionUnitLabel(metric) + " (" + cy + ")"].forEach(h => { const th = document.createElement("th"); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      [r.name, fmtConsumptionMetric(metric, r.value)].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildConsumptionTableHistorical(years, series, metric) {
    const wrap = document.getElementById("consumption-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.name + " (" + consumptionUnitLabel(metric) + ")")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtConsumptionMetric(metric, s.values[i])));
      cells.forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // ---------------- info modal ----------------

  const INFO_CONTENT = {
    "region-toggle": {
      title: "Winchester, Mid-Hampshire & Hampshire and the Solent",
      body: [
        "Winchester is the existing district council. Mid-Hampshire is the proposed new unitary authority, combining East Hampshire, Winchester, New Forest and Test Valley from 1 April 2028, following the Government's Local Government Reorganisation decision of 25 March 2026.",
        "Hampshire and the Solent is the Combined County Authority established 4 June 2026 (SI 2026/595), covering the whole of Hampshire plus Portsmouth, Southampton and the Isle of Wight — the strategic tier sitting above Mid-Hampshire and its neighbouring new unitaries. Unlike Mid-Hampshire, this one already exists; its footprint isn't affected by exactly where the 11 moving parishes end up, since they stay inside it either way.",
        "The Mid-Hampshire decision is subject to a judicial review sought by Hampshire County Council, so that boundary is the current best information, not guaranteed final."
      ]
    },
    "horizon-toggle": {
      title: "100-year vs 20-year time horizon",
      body: [
        "Methane (CH4) traps far more heat than CO2 while it's in the atmosphere, but breaks down over a decade or two, whereas CO2 lingers for centuries. To compare gases on one scale, emissions statistics weight each gas by its Global Warming Potential (GWP) — how much warming a tonne of it causes relative to a tonne of CO2, over a chosen time window.",
        "DESNZ's official figures (\"100-year\" here) use GWP100 — the international reporting standard, and the default view on this site. Judged over 100 years, methane is weighted at 28x CO2 (IPCC AR5).",
        "The \"20-year\" view reweights the same underlying gas quantities using GWP20 instead — methane at 84x CO2, roughly 3x higher than under GWP100. Nitrous oxide (N2O), the other major non-CO2 gas here, barely changes between the two (264x vs 265x), since it persists for over a century either way. Nothing about the underlying emissions changes — only how heavily methane counts.",
        "Why it matters: a shorter horizon reflects the urgency of near-term warming and the fact that cutting methane now has an outsized effect on the next few decades' peak temperature — a case increasingly made in climate policy discussion, though GWP100 remains the official reporting basis DESNZ, the UK Government and the UNFCCC use. Areas with more livestock farming or landfill waste (both largely methane) look proportionally worse under the 20-year view than the official 100-year figures suggest; areas dominated by transport and heating (mostly CO2) barely move.",
        "This 20-year view is calculated here, not published by DESNZ — it rescales each gas's contribution to the official CO2e figure by GWP20/GWP100 for that gas (IPCC AR5 Table 8.A.1, without climate-carbon feedbacks: CO2=1/1, CH4=84/28, N2O=264/265). Every other part of the methodology (boundaries, population, sectors) is identical between the two views."
      ]
    },
    "trend-chart": {
      title: "Total emissions over time",
      body: [
        "Territorial greenhouse gas emissions (CO2, CH4 and N2O, combined as CO2e) for each year 2005–2024, summed across all sectors.",
        "Use the control panel above to switch between totals (kt CO2e) and per-person figures (t CO2e per person), between a single latest-year comparison and the full historical trend, and between the 100-year and 20-year GWP time horizons (see the \"i\" button next to Time horizon above for what that means).",
        "Winchester is the official district figure, published directly by DESNZ. Mid-Hampshire and Hampshire and the Solent are calculated here by summing the same DESNZ district figures — neither is an official published figure.",
        "In the historical trend view, dashed lines extend each region's latest actual figure out to zero at its own net-zero target — a straight-line \"required pathway\" showing the average pace of reduction still needed from here. Winchester's own line targets 2030, its more ambitious district-wide carbon-neutral target from its Carbon Neutrality Action Plan; Mid-Hampshire and Hampshire and the Solent have no target of their own yet, so their lines target 2050 instead, the Hampshire County Council area target (aligned to the UK Government's own legally-binding 2050 target). This is the simplest honest read of the numbers, not a modelled decarbonisation forecast — real pathways are rarely a straight line.",
        "Source: DESNZ UK local authority and regional greenhouse gas emissions statistics, 2005–2024 (published 25 June 2026)."
      ],
      link: { href: "https://assets.publishing.service.gov.uk/media/6a3bacc9d52550a19950f2f5/2005-24-local-authority-ghg-emissions-csv-dataset.csv", label: "Download the source CSV" }
    },
    "sector-chart": {
      title: "Emissions by sector",
      body: [
        "Territorial emissions split by the eight DESNZ sectors (Agriculture, Commercial, Domestic, Industry, LULUCF, Public Sector, Transport, Waste), each summed across their sub-sectors and gases.",
        "Use the control panel above to switch between totals and per-person figures, and between a latest-year snapshot and each sector's trend since 2005. In the latest-year view, tick “Show sub-sector detail” to break each sector down further (e.g. Transport into road, rail and other) — sub-sector figures are only published for the latest year, so this detail isn't available in the historical trend view.",
        "The Time horizon toggle changes how heavily this chart weights methane — switching it to \"20-year\" makes Agriculture and Waste (the two most methane-heavy sectors) noticeably larger relative to the others; Transport, Domestic and Commercial (mostly CO2) barely move. See the \"i\" button next to Time horizon above for why.",
        "LULUCF (land use, land-use change and forestry) is usually negative — it represents a net carbon sink from woodland, hedgerows and soils, which subtracts from the total rather than adding to it.",
        "For Mid-Hampshire, each sector is the sum of that sector's figure across the four constituent districts."
      ]
    },
    "gas-chart": {
      title: "Emissions by greenhouse gas",
      body: [
        "The same territorial emissions as the sector chart above, split instead by the three gases DESNZ publishes at local authority level: CO2, methane (CH4) and nitrous oxide (N2O) — each already converted to CO2e using the active time horizon (see the Time horizon toggle above).",
        "CO2 is almost entirely energy use — heating, electricity, vehicle fuel. CH4 is mostly agriculture (livestock) and waste (landfill). N2O is mostly agriculture (fertilised soils) and manure management. This split is a useful cross-check on the sector chart: two areas can have the same total emissions for very different reasons — one dominated by CO2 from transport and heating, another by CH4 from farming — and this chart is what makes that visible.",
        "Switch the Time horizon toggle to \"20-year\" and watch the CH4 bar roughly triple while CO2 and N2O barely move — the clearest single illustration on this site of what that toggle actually does. Fluorinated gases (HFCs etc.) are excluded here, as DESNZ excludes them from local authority statistics entirely (they're under 2% of the UK total).",
        "Use the control panel above to switch between totals and per-person figures, and between a latest-year snapshot and the trend since 2005."
      ]
    },
    "generation-chart": {
      title: "Renewable electricity generation by technology",
      dynamicIntro: () => generationNoteText,
      body: [
        "Renewable electricity generated within the area's boundary, in GWh, split by technology: Solar (photovoltaics), Wind (onshore + offshore), Hydro, Bioenergy & waste (anaerobic digestion, sewage gas, landfill gas, municipal solid waste, animal and plant biomass, cofiring), and Other (wave/tidal, plus a small residual — see the note further down).",
        "This is generation, not consumption — how much renewable electricity is physically produced within the area, regardless of where it's ultimately used. The figure above compares this to local electricity demand (from DESNZ's separate energy consumption statistics) — but the two aren't directly connected: Great Britain runs on one shared national grid, so electricity generated by a local wind farm or solar array isn't routed to local homes and businesses, it's exported to the grid and pooled with generation from everywhere else, while local demand draws from that same shared pool. A ratio near or above 100% means an area generates roughly as much renewable electricity as it consumes in total, not that it's disconnected from the grid or self-sufficient in practice.",
        "DESNZ suppresses some small per-technology generation figures (shown as \"[X]\" in its source workbook) to avoid revealing individual plants' output — mainly affects Wind, Hydro and Bioenergy in these mostly solar-dominated local authorities. This site treats suppressed cells as 0 for their own technology and folds the (small) gap against DESNZ's own published total into \"Other\", so the bars always sum exactly to DESNZ's figure.",
        "Electricity consumption figures (used for the demand comparison above) are published in ktoe and converted here to MWh using the standard DUKES/IEA factor of 1 toe = 11.63 MWh.",
        "Generation data starts 2014, the first year DESNZ publishes local authority-level renewable generation; consumption data runs 2005–2024, so the demand comparison is only available from 2014 onward.",
        "Use the control panel above the charts to switch between totals (GWh) and per-person figures (kWh per person) — the demand-comparison percentage is unaffected either way, since it's a ratio of two totals.",
        "For Mid-Hampshire, each technology is the sum of that technology's figure across the four constituent districts, scaled the same way as the emissions charts (see the region selector's \"i\" button)."
      ],
      link: { href: "https://www.gov.uk/government/statistics/regional-renewable-statistics", label: "gov.uk statistical release" }
    },
    "consumption-chart": {
      title: "Energy consumption by fuel",
      body: [
        "Total final energy consumed within the area's boundary, in ktoe (kilotonnes of oil equivalent, DESNZ's own unit for this dataset), covering every fuel — not just electricity: heating, cooking and industrial fuels, and road transport fuel. This is a different DESNZ dataset from the renewable generation chart above, and measures something different too: consumption of all fuel types, rather than local electricity generation.",
        "The default \"simple\" view groups DESNZ's six published fuel categories into three: Fossil fuels (Coal + Manufactured fuels + Petroleum + Gas), Electricity, and Bioenergy & waste. Tick \"Show all fuel types\" for DESNZ's own six categories individually.",
        "Electricity is kept separate from both \"Fossil fuels\" and \"Bioenergy & waste\" rather than folded into either — the electricity consumed locally is drawn from Great Britain's national grid, whose generation mix (gas, nuclear, wind, solar, imports, etc.) isn't attributed back to the area consuming it by this dataset, so this site can't honestly label it either way.",
        "Oil (petroleum) is typically the largest category here, dominated by road transport fuel — DESNZ's road transport figures are modelled from national/regional fuel sales data apportioned to local authorities, not measured locally.",
        "Use the control panel above to switch between totals (ktoe) and per-person figures (toe per person).",
        "For Mid-Hampshire, each fuel is the sum of that fuel's figure across the four constituent districts, scaled the same way as the emissions charts (see the region selector's \"i\" button)."
      ],
      link: { href: "https://www.gov.uk/government/collections/total-final-energy-consumption-at-sub-national-level", label: "gov.uk statistical release" }
    },
    "general-methodology": {
      title: "Full methodology & sources",
      dl: [
        ["Primary data source", "DESNZ (Department for Energy Security and Net Zero), “UK local authority and regional greenhouse gas emissions statistics, 2005–2024”, published 25 June 2026."],
        ["Basis", "Territorial emissions — what physically happens within the area's boundary — in kt CO2e (thousand tonnes carbon dioxide equivalent), combining CO2, methane (CH4) and nitrous oxide (N2O)."],
        ["Time horizon", "The default (\"100-year\") view is DESNZ's own published figures, which weight CH4 and N2O by their 100-year Global Warming Potential (GWP100, IPCC AR5: CH4=28, N2O=265, CO2=1) — the international reporting standard. The \"20-year\" view, toggled above the charts, is calculated by this site (not DESNZ) by reweighting the same gas quantities using GWP20 instead (IPCC AR5: CH4=84, N2O=264, CO2=1) — methane counts roughly 3x more heavily, which raises Agriculture- and Waste-heavy areas' figures noticeably. See the Time horizon \"i\" button for the full explanation."],
        ["Mid-Hampshire boundary", "East Hampshire + Winchester + New Forest + Test Valley, per the Government's LGR decision of 25 March 2026, each scaled down to exclude the 11 parishes moving to neighbouring unitaries (South-West/South-East Hampshire) under the same decision. No official sub-district emissions data exists, so each district's contribution is reduced by its 2021 Census parish population share instead of using the whole district — East Hampshire to 82.0%, Winchester to 97.7%, New Forest to 61.0%, Test Valley to 88.8%. Decision subject to possible judicial review."],
        ["Hampshire and the Solent boundary", "Hampshire County Council + Portsmouth + Southampton + Isle of Wight, per the Hampshire and the Solent Combined County Authority Regulations 2026 (SI 2026/595). Hampshire CC itself isn't a DESNZ-reporting unit, so this is modelled as the sum of all 11 current Hampshire districts (Basingstoke and Deane, East Hampshire, Eastleigh, Fareham, Gosport, Hart, Havant, New Forest, Rushmoor, Test Valley, Winchester) plus Portsmouth, Southampton and Isle of Wight, using whole-district figures throughout (this total doesn't need the parish-level adjustment above, since it doesn't matter which new unitary those parishes end up in)."],
        ["Population / per-person", "DESNZ mid-year population estimates, included in the same dataset, summed the same way as emissions for each region (and scaled down per district for Mid-Hampshire, as above)."],
        ["Update cycle", "DESNZ typically publishes new figures each summer, roughly 18–24 months behind the current year. This site's data was last refreshed 4 August 2026 and is updated manually when a new release lands."],
        ["Energy data", "Renewable electricity generation by technology (2014–2024) and energy consumption by fuel (2005–2024), both from DESNZ, at local authority level, aggregated to these three regions the same way as the emissions figures above. See each energy chart's own \"i\" button for category grouping and unit conversions."],
        ["Data & code", "Every figure on this site traces back to the single published DESNZ CSV linked below, with Mid-Hampshire district figures scaled down using 2021 Census parish population shares (see the boundary note above) — nothing else here is estimated or modelled."]
      ],
      link: { href: "https://www.gov.uk/government/statistics/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics-2005-to-2024/2005-to-2024-uk-local-and-regional-greenhouse-gas-emissions-statistical-release-web-accessible", label: "gov.uk statistical release" }
    }
  };

  function openModal(key) {
    const info = INFO_CONTENT[key];
    if (!info) return;
    const overlay = document.getElementById("modal-overlay");
    const title = document.getElementById("modal-title");
    const body = document.getElementById("modal-body");
    title.textContent = info.title;
    clearNode(body);
    if (info.dynamicIntro) {
      const introEl = document.createElement("p");
      introEl.textContent = info.dynamicIntro();
      body.appendChild(introEl);
    }
    (info.body || []).forEach(p => {
      const pEl = document.createElement("p");
      pEl.textContent = p;
      body.appendChild(pEl);
    });
    if (info.dl) {
      const dl = document.createElement("dl");
      info.dl.forEach(([dt, dd]) => {
        const dtEl = document.createElement("dt"); dtEl.textContent = dt;
        const ddEl = document.createElement("dd"); ddEl.textContent = dd;
        dl.appendChild(dtEl); dl.appendChild(ddEl);
      });
      body.appendChild(dl);
    }
    if (info.link) {
      const p = document.createElement("p");
      const a = document.createElement("a");
      a.href = info.link.href; a.target = "_blank"; a.rel = "noopener";
      a.textContent = info.link.label;
      p.appendChild(a);
      body.appendChild(p);
    }
    overlay.classList.remove("is-hidden");
  }

  function closeModal() {
    document.getElementById("modal-overlay").classList.add("is-hidden");
  }

  // ---------------- wiring ----------------

  // Every chart that should re-render whenever a page-wide control changes (metric, view,
  // horizon, colour theme) or the app first loads. A new chart added to the page must be added
  // here (and to REGION_SCOPED_CHARTS below, if it takes a region) — that's the only place a
  // control-to-chart wiring can now be forgotten, instead of each control handler needing its
  // own hand-maintained list. Some charts here ignore some controls (generation/consumption
  // read currentMetric but not currentHorizon, since GWP reweighting doesn't apply to physical
  // energy volumes) — re-rendering them anyway on every page-wide control is deliberate: it's
  // cheap, and it means "does chart X react to control Y" is answered by that chart's own code,
  // not by whether someone remembered to list it under every applicable handler.
  const PAGE_WIDE_CHARTS = [
    buildTrendChart,
    () => buildSectorChart(currentRegion),
    () => buildGasChart(currentRegion),
    () => buildGenerationChart(currentRegion),
    () => buildConsumptionChart(currentRegion)
  ];

  // The subset of PAGE_WIDE_CHARTS that also needs re-rendering when the region selector
  // changes — everything except the trend chart, which always plots all three regions at once
  // and so has no single "current region" to react to.
  const REGION_SCOPED_CHARTS = [
    () => buildSectorChart(currentRegion),
    () => buildGasChart(currentRegion),
    () => buildGenerationChart(currentRegion),
    () => buildConsumptionChart(currentRegion)
  ];

  function renderPageWideCharts() {
    PAGE_WIDE_CHARTS.forEach(fn => fn());
  }

  function renderRegionScopedCharts() {
    REGION_SCOPED_CHARTS.forEach(fn => fn());
  }

  function setRegion(regionKey) {
    currentRegion = regionKey;
    document.querySelectorAll(".region-toggle .seg-btn").forEach(b => {
      b.classList.toggle("is-active", b.dataset.region === regionKey);
    });
    renderRegionScopedCharts();
  }

  function setMetric(metric) {
    currentMetric = metric;
    document.querySelectorAll("[data-metric]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.metric === metric);
    });
    renderPageWideCharts();
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll("[data-view]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.view === view);
    });
    renderPageWideCharts();
  }

  // Horizon is deliberately page-wide (not a per-chart control): it changes which numbers are
  // "true" everywhere at once, so a body-level class lets CSS reinforce that (e.g. a themed
  // banner) rather than just re-rendering the two charts in isolation.
  function setHorizon(horizon) {
    currentHorizon = horizon;
    document.querySelectorAll("[data-horizon]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.horizon === horizon);
    });
    document.body.classList.toggle("horizon-gwp20", horizon === "gwp20");
    document.getElementById("horizon-banner").classList.toggle("is-hidden", horizon !== "gwp20");
    renderPageWideCharts();
  }

  // Keeps the sticky region-toggle row pinned directly under the sticky control panel,
  // whatever height the panel actually renders at (it wraps to two rows below ~640px wide).
  function setupStickyOffset() {
    const panel = document.getElementById("control-panel");
    const update = () => {
      document.documentElement.style.setProperty("--control-panel-h", panel.offsetHeight + "px");
    };
    update();
    if (window.ResizeObserver) {
      new ResizeObserver(update).observe(panel);
    } else {
      window.addEventListener("resize", update);
    }
  }

  function wireEvents() {
    setupStickyOffset();

    document.querySelectorAll(".region-toggle .seg-btn").forEach(btn => {
      btn.addEventListener("click", () => setRegion(btn.dataset.region));
    });

    document.querySelectorAll("[data-metric]").forEach(btn => {
      btn.addEventListener("click", () => setMetric(btn.dataset.metric));
    });
    document.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });
    document.querySelectorAll("[data-horizon]").forEach(btn => {
      btn.addEventListener("click", () => setHorizon(btn.dataset.horizon));
    });

    document.getElementById("sector-detail-toggle").addEventListener("change", (ev) => {
      currentDetail = ev.target.checked;
      buildSectorChart(currentRegion);
    });

    document.getElementById("consumption-detail-toggle").addEventListener("change", (ev) => {
      currentConsumptionDetail = ev.target.checked;
      buildConsumptionChart(currentRegion);
    });

    document.querySelectorAll(".info-btn, .link-btn[data-info]").forEach(btn => {
      btn.addEventListener("click", () => openModal(btn.dataset.info));
    });
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", (ev) => {
      if (ev.target.id === "modal-overlay") closeModal();
    });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeModal(); });

    document.querySelectorAll(".table-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        const hidden = target.classList.toggle("is-hidden");
        btn.textContent = hidden ? "Show as table" : "Hide table";
      });
    });

    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderPageWideCharts);
    }
  }

  function init() {
    if (!window.MHE_DATA) {
      document.getElementById("trend-chart").textContent = "Could not load emissions data: data/mid_hampshire_emissions.js did not load.";
      return;
    }
    DATA = window.MHE_DATA;
    ENERGY_DATA = window.MHE_ENERGY_DATA || null;
    wireEvents();
    // "winchester" is already marked is-active in the HTML, so no need to route through
    // setRegion() just to re-toggle a class that's already correct.
    currentRegion = "winchester";
    renderPageWideCharts();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
