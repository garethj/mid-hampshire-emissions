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
  let currentConsumptionView = "fuel"; // "fuel" (by fuel type) | "sector" (by Domestic/Transport/Industrial)
  let currentHorizon = "gwp100"; // "gwp100" (official DESNZ) | "gwp20"
  // "kwh" (GWh / kWh per person) | "toe" (ktoe / toe per person) — shared display unit for the
  // generation and consumption charts, which otherwise show each dataset's own native unit (see
  // KTOE_TO_MWH below).
  let currentEnergyUnit = "kwh";
  // "fixed" (default) or "auto" — governs the y/x-axis scale of the generation and consumption
  // charts. "fixed" uses one shared axis max per region tier (historic districts / current
  // unitaries / proposed unitaries / Hampshire and the Solent) so switching between regions in
  // the same tier doesn't rescale the chart and hide a real difference in volume — e.g. Gosport's
  // renewable generation is genuinely ~30x smaller than Test Valley's, not just differently
  // proportioned. Defaults to "fixed" (not a toggle defaulting to "auto") because a chart that
  // sometimes rescales and sometimes doesn't, depending on a control elsewhere on the page, reads
  // as more confusing than one that's always comparable — "auto" stays available as an escape
  // hatch for the (rarer) case where a small region's own internal composition needs the full
  // width to read clearly. See generationTierMax/consumptionTierMax below.
  let currentScaleMode = "fixed";
  // "context" (self + ancestors up to Hampshire and the Solent, the default) or "constituents"
  // (all siblings at the nearest level with children — see nearestHub() below) — drives the top
  // trend chart's region set. Reset to "context" on every region change, since carrying
  // "constituents" across a region switch would land on a sibling set unrelated to the click
  // that triggered it.
  let compareMode = "context";
  let tooltipEl = null;

  // Headline "Total renewable generation, 2024: X GWh - equivalent to Y% of demand" sentence,
  // recomputed on every buildGenerationChart() call and surfaced inside the generation chart's
  // info modal (dynamicIntro below) rather than as a permanent on-page note, so region/year/
  // metric changes don't need a second render path just to keep this one sentence in sync.
  let generationNoteText = "";

  // Every region this site can show — built from DATA.meta.region_index (see region_index in
  // process.py) once data loads, rather than hardcoded here, since there are 19 of them across
  // three tiers (historic districts / current unitaries / proposed 2028 unitaries) plus
  // Hampshire and the Solent itself. Populated by initRegions() in init(). `group` and `parent`
  // drive the dropdown grouping and the context-chart hierarchy helpers just below.
  let REGIONS = [];
  let REGION_LABEL = {};
  let REGION_BY_KEY = {};

  function initRegions() {
    REGIONS = DATA.meta.region_index.map(r => ({
      key: r.key,
      label: r.name,
      legendLabel: r.group === "proposed-unitary" ? r.name + " (proposed)" : r.name,
      group: r.group,
      parent: r.parent
    }));
    REGION_LABEL = Object.fromEntries(REGIONS.map(r => [r.key, r.label]));
    REGION_BY_KEY = Object.fromEntries(REGIONS.map(r => [r.key, r]));
  }

  // ---------------- region hierarchy ----------------
  // Two distinct rollups exist for a region and shouldn't be conflated: how its own *figures*
  // are built (which LAs, at what population-weighted share — baked into the data files already,
  // nothing to do with this section) versus which single region it rolls up to in the *UI*
  // hierarchy used here — the dropdown's grouping and the context chart's ancestor chain. E.g.
  // East Hampshire's hierarchy parent is Mid-Hampshire, even though a small population slice of
  // it is also baked into South East Hampshire's own figures.

  function regionParent(key) {
    const r = REGION_BY_KEY[key];
    return r ? r.parent : null;
  }

  // Self, then parent, then grandparent, ... up to and including Hampshire and the Solent.
  function regionAncestors(key) {
    const chain = [];
    let k = key;
    while (k) {
      chain.push(k);
      k = regionParent(k);
    }
    return chain;
  }

  function regionChildren(key) {
    return REGIONS.filter(r => r.parent === key).map(r => r.key);
  }

  // The nearest region (self or an ancestor) that has constituents to show — used by the
  // "compare all constituents" mode. A region with its own children (e.g. a proposed unitary)
  // is its own hub; a leaf (a historic district, or a current unitary like Portsmouth) defers to
  // its parent, so picking a leaf and toggling "constituents" shows its siblings, not itself.
  function nearestHub(key) {
    return regionChildren(key).length > 0 ? key : regionParent(key);
  }

  // All regions sharing a region's tier ("group": historic-district / current-unitary /
  // proposed-unitary / aggregate) — the "fixed scale" comparison set for generationTierMax and
  // consumptionTierMax below. Hampshire and the Solent is the only "aggregate" region, so its own
  // tier is just itself (fixed scale there is a no-op, same as auto).
  function regionsInTier(key) {
    const r = REGION_BY_KEY[key];
    if (!r) return [key];
    return REGIONS.filter(x => x.group === r.group).map(x => x.key);
  }

  // Display heading + explicit order for the region select's <optgroup>s. "aggregate"
  // (Hampshire and the Solent) isn't listed — it renders as a loose top-level option, not inside
  // a group, since it's the one region that isn't a constituent of anything else on this site.
  const REGION_GROUP_LABEL = {
    "historic-district": "Historic districts",
    "current-unitary": "Current unitaries",
    "proposed-unitary": "Proposed unitaries (2028)"
  };
  const REGION_GROUP_ORDER = ["historic-district", "current-unitary", "proposed-unitary"];

  // Builds the #region-select's <option>/<optgroup> markup from REGIONS — nothing hardcoded in
  // index.html, so the dropdown always matches whatever region_index the data actually contains.
  function populateRegionSelect() {
    const select = document.getElementById("region-select");
    clearNode(select);
    REGIONS.filter(r => r.group === "aggregate").forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.key; opt.textContent = r.label;
      select.appendChild(opt);
    });
    REGION_GROUP_ORDER.forEach(group => {
      const members = REGIONS.filter(r => r.group === group);
      if (!members.length) return;
      const og = document.createElement("optgroup");
      og.label = REGION_GROUP_LABEL[group];
      // Historic districts are alphabetised (11 of them — easier to scan); the unitary groups
      // keep REGIONS' own order, which already reads sensibly (Isle of Wight, then the two
      // absorbed cities; North, Mid, South East, South West geographically).
      const ordered = group === "historic-district" ? [...members].sort((a, b) => a.label.localeCompare(b.label)) : members;
      ordered.forEach(r => {
        const opt = document.createElement("option");
        opt.value = r.key; opt.textContent = r.label;
        og.appendChild(opt);
      });
      select.appendChild(og);
    });
  }

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

  // Matches ENERGY_DATA.meta.sector_categories (see process_energy.py) — the consumption chart's
  // alternate breakdown axis: the same "All fuels: Total" figure split by sector (Domestic /
  // Transport / Industrial, Commercial and other) instead of by fuel type. Toggled against
  // FUEL_ORDER/FUEL_SIMPLE_GROUPS above, never shown alongside them, so it doesn't need its own
  // simple/detailed split. This view exists specifically to make visible when a large industrial
  // or commercial energy user (not local households) is driving an area's consumption total —
  // see meta.note_industrial_consumption.
  const CONSUMPTION_SECTOR_ORDER = ["Domestic", "Transport", "Industrial, Commercial and other"];
  const CONSUMPTION_SECTOR_LABEL = {
    Domestic: "Domestic",
    Transport: "Transport",
    "Industrial, Commercial and other": "Industrial, commercial & other"
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
  // Regions aren't in CATEGORY_COLOR_SLOT below: with 19 of them and only 8 slots, no fixed
  // per-region identity colour is possible (or useful — at most ~5 regions are ever on screen
  // together). See contextRegionColor() near the trend chart for how region colour is assigned
  // instead: by role (selected region / its parent / Hampshire and the Solent) in "context" mode,
  // by a fixed validated slot rotation in "constituents" mode.
  const CATEGORY_COLOR_SLOT = {

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
    "Fossil fuels": 7,   // violet
    // "Electricity" and "Bioenergy & waste" simple-view groups reuse the slots above directly.

    // Energy consumption by sector — the consumption chart's alternate view (toggled against the
    // by-fuel-type view above, never shown together). "Domestic" and "Transport" reuse the exact
    // same slots as their emissions-sector namesakes above, since they're the same real-world
    // category. "Industrial, Commercial and other" gets its own slot (Industry's red) as the
    // dominant real-world driver of that bucket — CONSUMPTION_SECTOR_ORDER is deliberately
    // ordered (Domestic, Transport, Industrial...) so this red slot sits next to Transport's blue
    // rather than Domestic's orange, since red-orange adjacency fails CVD separation (see above).
    "Industrial, Commercial and other": 8,  // red — shares Industry's slot

    // Electricity green/fossil split (DUKES 6.5a-derived, its own small chart — never shown
    // alongside the by-fuel/by-sector views above, so no adjacency constraint with them). "Green"
    // reuses Bioenergy & waste/Agriculture's green slot (the obvious real-world association);
    // "Fossil" reuses the "Fossil fuels" simple-view group's violet slot above, since it's the
    // same real-world concept.
    "Green": 6,     // green
    "Fossil": 7     // violet
  };

  // ---------------- helpers ----------------

  // Rough (deliberately generous) estimate of a bold value-label's rendered width in this
  // chart family's font — used to size a "latest" bar chart's right margin from the actual
  // label text, rather than a fixed guess. A fixed margin clips the *longest* bar's label
  // specifically: a shorter bar leaves unused plot space for its label to spill into before
  // hitting the SVG's edge, but the longest bar's bar already fills the full plot width, so its
  // label has only the fixed margin to work with — if that's narrower than the label, it's cut
  // off exactly there (as seen on New Forest's Solar and Fossil fuels bars). Calibrated against
  // real rendered text (Chromium, Roboto, 12.5px bold): observed ~6.1-6.6 px/char across a range
  // of formatted value+unit strings; 7.5 leaves headroom for font-rendering differences across
  // browsers/platforms.
  function estimateLabelWidth(text) {
    return text.length * 7.5;
  }

  // Right margin for a "latest" bar chart's value+unit labels. In auto mode, sizing it from just
  // the rows actually on screen is enough (see estimateLabelWidth's own comment). In fixed mode
  // it isn't: two regions in the same tier share an axis maxVal, but if each region's margin were
  // still sized from its own (smaller-magnitude) labels, their drawable plot widths would differ
  // slightly, so the same shared value would render at very slightly different pixel widths
  // between regions — undermining the whole point of a "fixed" scale. Sizing the margin from the
  // tier's own peak value instead (formatted the same way) gives every region in the tier an
  // identical margin, and therefore an identical plot width.
  function latestBarRightMargin(rows, formatLabel, tierMax) {
    const labels = currentScaleMode === "fixed" ? [formatLabel(tierMax)] : rows.map(r => formatLabel(r.value));
    return Math.ceil(Math.max(80, ...labels.map(estimateLabelWidth)) + 16);
  }

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

  function formatIsoDate(isoDate) {
    const d = new Date(isoDate + "T00:00:00Z");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
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

  // population_thousands (e.g. 212.345) as a person count, rounded to the nearest hundred —
  // DESNZ's mid-year estimates aren't precise to the individual, so showing exact ones would be
  // false precision.
  function fmtPopulation(thousands) {
    return (Math.round(thousands * 10) * 100).toLocaleString("en-GB");
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

  // Same DUKES/IEA factor as data/process_energy.py's KTOE_TO_MWH — used here to let the
  // generation chart (native MWh) and consumption chart (native ktoe) share one display-unit
  // toggle (currentEnergyUnit) instead of each being stuck in its own dataset's native unit.
  const KTOE_TO_MWH = 11630;

  // DUKES table 6.5a: Great Britain's "Share of renewable generation" — a *national* figure, not
  // part of any of the sub-national datasets this site otherwise loads, so it's fetched and parsed
  // separately (data/fetch_energy_source.py + process_energy.py's read_dukes_renewable_share) into
  // ENERGY_DATA.meta.dukes_electricity_mix, keyed by year as {greenPct, fossilPct}. "greenPct" is
  // DUKES's own renewable-generation share; "fossilPct" is the remainder (100 - greenPct), DUKES's
  // usual simplification for a two-way split — it's really "non-renewable" (nuclear and net
  // imports included alongside fossil fuel), not fossil fuel alone. See this chart's "i" button.
  function dukesElectricityMix() {
    return ENERGY_DATA.meta.dukes_electricity_mix || {};
  }

  // The most recent year with a DUKES grid-mix figure *and* the generation/consumption data
  // electricityGreenFossilSplit needs (generation starts 2014, consumption starts 2005) — null if
  // none overlap. Independent of region: year coverage is the same dataset-wide.
  function latestGreenFossilYear() {
    return greenFossilYears()[0] || null;
  }

  // Every year with a DUKES grid-mix figure and matching generation/consumption data, newest
  // first — the historical trend chart's x-axis, and latestGreenFossilYear's source.
  function greenFossilYears() {
    const genYears = new Set(energyGenerationYears());
    const conYears = new Set(energyConsumptionYears());
    return Object.keys(dukesElectricityMix()).map(Number)
      .filter(y => genYears.has(y) && conYears.has(y))
      .sort((a, b) => b - a);
  }

  // Splits an area's electricity consumption into an indicative "green" and "fossil" MWh figure,
  // combining two datasets this site already has with the one external DUKES figure above —
  // proposed by the same reviewer as a way to answer "how green is the electricity I use" without
  // the false precision of just applying the national ratio to the whole total (see the chart's
  // "i" button for the full reasoning). The logic: local renewable generation is treated as green
  // consumption first (the same idea behind "market-based" Scope 2 carbon accounting — known local
  // generation nets off before a residual grid-average mix is applied), and only the *remainder*
  // of local electricity consumption is assumed to be drawn from the national grid at that year's
  // DUKES low-carbon/fossil split. Local generation is capped at total consumption (defensive —
  // never observed in this dataset, where the highest local share is ~32%, but renewables could
  // in principle grow past 100% of local demand in future data). Null if generation, consumption
  // or a DUKES figure isn't available for that year.
  function electricityGreenFossilSplit(regionKey, year) {
    const mix = dukesElectricityMix()[year];
    const con = energyConsumption(regionKey, year);
    const gen = energyGeneration(regionKey, year);
    if (!mix || !con || !gen) return null;
    const totalMwh = con.electricity_consumption_mwh;
    const localGreenMwh = Math.min(gen.total_mwh, totalMwh);
    const gridMwh = totalMwh - localGreenMwh;
    return {
      greenMwh: localGreenMwh + gridMwh * (mix.greenPct / 100),
      fossilMwh: gridMwh * (mix.fossilPct / 100)
    };
  }

  // Consumption-by-fuel figures are stored in ktoe, DESNZ's own native unit for this dataset.
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
  // showing several series at once). groupLast marks the last row of a group whose tooltip
  // keeps going with another row afterwards belonging to a *different* parent (e.g. the next
  // region in a multi-region crosshair) — the divider goes after this row instead of before it,
  // so it reads as closing this group rather than detaching this row from its own parent above.
  function ttSubRow(parent, label, value, groupFirst, groupLast) {
    const row = document.createElement("div");
    row.className = "tt-row tt-subrow" + (groupFirst ? " tt-subrow-first" : "") + (groupLast ? " tt-subrow-last" : "");
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

  // Muted "Population" subrow showing the person count a per-capita figure was divided by —
  // only relevant under the per-capita metric (population isn't part of the "total" calculation,
  // so it'd be noise there), and only when that region/year actually has a population figure
  // (the historical trend chart's post-latest-year "required pathway" points don't).
  function ttPopulationRow(tt, regionKey, year, metric, groupFirst, groupLast) {
    if (metric !== "per_capita") return;
    const yd = DATA.regions[regionKey] && DATA.regions[regionKey].years[year];
    if (!yd) return;
    ttSubRow(tt, "Population", fmtPopulation(yd.population_thousands), groupFirst, groupLast);
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

  // unit "kwh" shows generation's native GWh/kWh-per-person; "toe" converts to ktoe/toe-per-person
  // via KTOE_TO_MWH, so the chart can match whatever unit family the consumption chart is on.
  function fmtGenerationMetric(metric, unit, n) {
    if (unit === "toe") {
      return metric === "total" ? fmtKtoe(n / KTOE_TO_MWH) : fmtToePerCapita(n / KTOE_TO_MWH);
    }
    return metric === "total" ? fmtGwh(n) : fmtKwhPerCapita(n);
  }

  function generationUnitLabel(metric, unit) {
    if (unit === "toe") return metric === "total" ? "ktoe" : "toe/person";
    return metric === "total" ? "GWh" : "kWh/person";
  }

  // "Simple" categories collapse FUEL_ORDER into FUEL_SIMPLE_GROUPS; "complex" uses FUEL_ORDER
  // directly; "sector" (axis === "sector") ignores detail entirely and uses
  // CONSUMPTION_SECTOR_ORDER instead — a different breakdown axis of the same total, with no
  // simple/detailed split of its own. "axis" here is currentConsumptionView (fuel/sector) — kept
  // as its own name rather than "breakdown" since that word already means something else nearby
  // (fuelSimpleBreakdown's per-fuel drill-down rows). Returns [{key, label}], where key is what
  // consumptionValue expects back.
  function consumptionCategories(detail, axis) {
    if (axis === "sector") {
      return CONSUMPTION_SECTOR_ORDER.map(s => ({ key: s, label: CONSUMPTION_SECTOR_LABEL[s] }));
    }
    return detail
      ? FUEL_ORDER.map(f => ({ key: f, label: FUEL_LABEL[f] }))
      : Object.keys(FUEL_SIMPLE_GROUPS).map(g => ({ key: g, label: g }));
  }

  // Consumption is stored in ktoe. "Totals" keeps that; "Per person" divides by
  // population-in-thousands, cancelling to toe/person (mirrors generationMetricValue above).
  function consumptionValue(regionKey, year, categoryKey, detail, metric, axis) {
    const c = energyConsumption(regionKey, year);
    if (!c) return null;
    const raw = axis === "sector"
      ? c.sector_ktoe[categoryKey]
      : detail
        ? c.fuels_ktoe[categoryKey]
        : FUEL_SIMPLE_GROUPS[categoryKey].reduce((sum, f) => sum + c.fuels_ktoe[f], 0);
    return metric === "total" ? raw : raw / regionPopulation(regionKey, year);
  }

  // unit "toe" shows consumption's native ktoe/toe-per-person; "kwh" converts to GWh/kWh-per-person
  // via KTOE_TO_MWH — mirrors fmtGenerationMetric above.
  function fmtConsumptionMetric(metric, unit, n) {
    if (unit === "kwh") {
      return metric === "total" ? fmtGwh(n * KTOE_TO_MWH) : fmtKwhPerCapita(n * KTOE_TO_MWH);
    }
    return metric === "total" ? fmtKtoe(n) : fmtToePerCapita(n);
  }

  function consumptionUnitLabel(metric, unit) {
    if (unit === "kwh") return metric === "total" ? "GWh" : "kWh/person";
    return metric === "total" ? "ktoe" : "toe/person";
  }

  // Tier-wide axis maxima for "fixed scale" mode (currentScaleMode — see its declaration above).
  // Scans every region in the tier, across every year the dataset has (not just the one
  // currently displayed), so the axis stays the same whether you're looking at the latest bars
  // or the historical trend line, and whether the tier's peak happens to be in the selected
  // region/year or not. Cheap enough (19 regions x ~20 years x a handful of categories) to
  // recompute on demand rather than precompute at load, so it's just memoized per distinct
  // (tier, metric, ...) combination actually asked for.
  const generationTierMaxCache = {};
  function generationTierMax(regionKey, metric) {
    const tier = REGION_BY_KEY[regionKey] ? REGION_BY_KEY[regionKey].group : regionKey;
    const cacheKey = tier + "|" + metric;
    if (generationTierMaxCache[cacheKey] !== undefined) return generationTierMaxCache[cacheKey];
    let max = 0;
    for (const r of regionsInTier(regionKey)) {
      for (const year of energyGenerationYears()) {
        const gen = energyGeneration(r, year);
        if (!gen) continue;
        for (const tech of ENERGY_TECH_ORDER) {
          const v = generationMetricValue(r, year, gen.by_technology_mwh[tech], metric);
          if (v > max) max = v;
        }
      }
    }
    return (generationTierMaxCache[cacheKey] = max || 1);
  }

  const consumptionTierMaxCache = {};
  function consumptionTierMax(regionKey, metric, detail, axis) {
    const tier = REGION_BY_KEY[regionKey] ? REGION_BY_KEY[regionKey].group : regionKey;
    const cacheKey = [tier, metric, detail, axis].join("|");
    if (consumptionTierMaxCache[cacheKey] !== undefined) return consumptionTierMaxCache[cacheKey];
    const cats = consumptionCategories(detail, axis);
    let max = 0;
    for (const r of regionsInTier(regionKey)) {
      for (const year of energyConsumptionYears()) {
        if (!energyConsumption(r, year)) continue;
        for (const c of cats) {
          const v = consumptionValue(r, year, c.key, detail, metric, axis);
          if (v !== null && v > max) max = v;
        }
      }
    }
    return (consumptionTierMaxCache[cacheKey] = max || 1);
  }

  // Sector chart's bars diverge from a centre zero line (LULUCF usually runs negative), so its
  // fixed-scale maximum is the largest *magnitude* seen either side of zero, not a plain max — the
  // same idea as generationTierMax/consumptionTierMax above, scanning every region in the tier
  // across every year, but keyed on currentHorizon too (sectorMetricValue reweights by GWP20 when
  // active, so a GWP20 tier max can be larger than the GWP100 one for the same tier). Sub-sector
  // detail only exists for the latest year (DATA.subsector_detail_latest_year has no history), so
  // its tier max only scans that one year — it can't be computed across "every year" the way the
  // top-level sector split can.
  const sectorTierMaxCache = {};
  function sectorTierMax(regionKey, metric, detail) {
    const tier = REGION_BY_KEY[regionKey] ? REGION_BY_KEY[regionKey].group : regionKey;
    const cacheKey = [tier, metric, detail, currentHorizon].join("|");
    if (sectorTierMaxCache[cacheKey] !== undefined) return sectorTierMaxCache[cacheKey];
    let max = 0;
    if (detail) {
      const ly = latestYear();
      for (const r of regionsInTier(regionKey)) {
        for (const sector of SECTOR_ORDER) {
          for (const row of sectorSubrowsFor(r, ly, sector, metric)) {
            if (Math.abs(row.value) > max) max = Math.abs(row.value);
          }
        }
      }
    } else {
      for (const r of regionsInTier(regionKey)) {
        for (const year of DATA.meta.years) {
          for (const sector of SECTOR_ORDER) {
            const v = Math.abs(sectorMetricValue(r, year, sector, metric));
            if (v > max) max = v;
          }
        }
      }
    }
    return (sectorTierMaxCache[cacheKey] = max || 1);
  }

  // The historical (line) chart's fixed-scale axis needs the tier's actual positive and negative
  // extents separately, not a symmetric ±sectorTierMax — a line chart's vertical position isn't a
  // left/right length comparison the way the diverging bar chart's is, so there's no need to waste
  // axis space forcing the negative side to match whatever the largest *positive* sector happens
  // to be somewhere in the tier (this was a real bug: LULUCF's actual negative range is far
  // smaller than some other sector's positive peak, so the symmetric version left a large blank
  // band below zero on every region's chart).
  const sectorTierRangeCache = {};
  function sectorTierRange(regionKey, metric) {
    const tier = REGION_BY_KEY[regionKey] ? REGION_BY_KEY[regionKey].group : regionKey;
    const cacheKey = [tier, metric, currentHorizon].join("|");
    if (sectorTierRangeCache[cacheKey] !== undefined) return sectorTierRangeCache[cacheKey];
    let max = 0, min = 0;
    for (const r of regionsInTier(regionKey)) {
      for (const year of DATA.meta.years) {
        for (const sector of SECTOR_ORDER) {
          const v = sectorMetricValue(r, year, sector, metric);
          if (v > max) max = v;
          if (v < min) min = v;
        }
      }
    }
    return (sectorTierRangeCache[cacheKey] = { max: max || 1, min: min });
  }

  // Gases are never negative, so this is a plain max (no divergence to account for) — otherwise
  // the same idea as sectorTierMax above, including the currentHorizon dependence.
  const gasTierMaxCache = {};
  function gasTierMax(regionKey, metric) {
    const tier = REGION_BY_KEY[regionKey] ? REGION_BY_KEY[regionKey].group : regionKey;
    const cacheKey = [tier, metric, currentHorizon].join("|");
    if (gasTierMaxCache[cacheKey] !== undefined) return gasTierMaxCache[cacheKey];
    let max = 0;
    for (const r of regionsInTier(regionKey)) {
      for (const year of DATA.meta.years) {
        for (const g of GAS_ORDER) {
          const v = gasMetricValue(r, year, g, metric);
          if (v > max) max = v;
        }
      }
    }
    return (gasTierMaxCache[cacheKey] = max || 1);
  }

  // The trend chart isn't tier-scoped like the charts above — a "context" view can show a
  // district alongside its own unitary and Hampshire and the Solent on one chart, spanning three
  // tiers at once, so "one shared scale per tier" has no single tier to anchor to. Its "fixed"
  // scale is instead one true site-wide maximum across every one of the 19 regions, which is what
  // actually fixes the reported bug: without this, switching the selected region (e.g. New Forest
  // to Winchester) changed the axis to fit whichever 2-3 regions happened to be on screen, so
  // Hampshire and the Solent's bar/line — present in *every* context view, at the same real value
  // each time — visibly changed size purely because the denominator moved, even though nothing
  // about Hampshire and the Solent itself had changed.
  const trendGlobalMaxCache = {};
  function trendGlobalMax(metric) {
    const cacheKey = [metric, currentHorizon].join("|");
    if (trendGlobalMaxCache[cacheKey] !== undefined) return trendGlobalMaxCache[cacheKey];
    let max = 0;
    for (const r of REGIONS) {
      for (const year of DATA.meta.years) {
        const v = regionMetricValue(r.key, year, metric);
        if (v > max) max = v;
      }
    }
    return (trendGlobalMaxCache[cacheKey] = max || 1);
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

  // Which regions the top chart plots: in "context" mode, the selected region and its ancestors
  // up to Hampshire and the Solent (self first); in "constituents" mode, all siblings at the
  // nearest level with children (see nearestHub()) — e.g. all historic districts within the
  // selected region's unitary, or all unitaries within Hampshire and the Solent.
  function contextRegionKeys() {
    return compareMode === "constituents"
      ? regionChildren(nearestHub(currentRegion))
      : regionAncestors(currentRegion);
  }

  // Prefix of the same slot order already validated (dataviz skill's palette validator) for
  // SECTOR_ORDER's 8-category fixed-order chart — a prefix of an adjacency-safe sequence is
  // still adjacency-safe, and this only ever needs up to 5 (Hampshire and the Solent's 5
  // constituent unitaries, the largest sibling group in the hierarchy).
  const CONSTITUENT_SLOT_ORDER = [1, 2, 3, 4, 5, 6, 7, 8];

  // Colour by role, not by fixed per-region identity — with 19 regions and 8 slots, identity
  // colour isn't possible, and isn't needed since at most ~5 regions render together. In
  // "context" mode: the selected region is always blue (slot 1, "you are here"), an intermediate
  // parent (if shown) is always green (slot 6), Hampshire and the Solent is always violet
  // (slot 7) — same visual language regardless of which specific region is selected. In
  // "constituents" mode, the originally-selected region keeps its "you are here" blue if it's
  // one of the siblings shown; everyone else cycles through the remaining validated slots.
  function contextRegionColors(keys) {
    if (compareMode === "context") {
      return keys.map((key, i) => {
        if (key === "hampshire-solent") return seriesColor(7);
        return seriesColor(i === 0 ? 1 : 6);
      });
    }
    const selfIdx = keys.indexOf(currentRegion);
    const slotOrder = selfIdx >= 0 ? CONSTITUENT_SLOT_ORDER.filter(s => s !== 1) : CONSTITUENT_SLOT_ORDER;
    let cursor = 0;
    return keys.map((key, i) => (i === selfIdx ? seriesColor(1) : seriesColor(slotOrder[cursor++])));
  }

  // The regions the top chart should render right now, in display order, with colour attached.
  function contextRegions() {
    const keys = contextRegionKeys();
    const colors = contextRegionColors(keys);
    return keys.map((key, i) => ({ ...REGION_BY_KEY[key], color: colors[i] }));
  }

  function buildTrendChart() {
    const container = document.getElementById("trend-chart");
    clearNode(container);

    const metric = currentMetric;
    const view = currentView;
    const years = DATA.meta.years;
    const ly = latestYear();

    const metricLabel = metric === "total" ? "Total emissions" : "Emissions per person";
    const modeSuffix = compareMode === "constituents" ? " — constituents of " + REGION_LABEL[nearestHub(currentRegion)] : "";
    document.getElementById("trend-chart-title").textContent =
      metricLabel + ", " + (view === "historical" ? (years[0] + "–" + ly) : ly) + horizonTitleSuffix() + modeSuffix;

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
  // No other region has a published net-zero date of its own yet, so every region but Winchester
  // falls back to the shared HCC/UK Gov 2050 goal; only Winchester's own dashed pathway targets
  // its own, earlier, date.
  const REGION_TARGET_YEAR = { winchester: TARGET_WCC_YEAR };

  function buildTrendChartHistorical(container, years, metric) {
    const series = contextRegions().map(r => ({
      key: r.key,
      label: r.label,
      legendLabel: r.legendLabel,
      color: r.color,
      targetYear: REGION_TARGET_YEAR[r.key] || TARGET_NET_ZERO_YEAR,
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

    const maxVal = (currentScaleMode === "fixed" ? trendGlobalMax(metric) : Math.max(...series.flatMap(s => s.values))) * 1.08;
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
          ttPopulationRow(tt, s.key, year, metric, false, true);
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
    const regions = contextRegions();
    const values = regions.map(r => regionMetricValue(r.key, ly, metric));
    const prevValues = regions.map(r => regionMetricValue(r.key, py, metric));

    const W = 860, H = 320;
    const M = { top: 20, right: 40, bottom: 40, left: 64 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const maxVal = (currentScaleMode === "fixed" ? trendGlobalMax(metric) : Math.max(...values)) * 1.2;
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
          ttPopulationRow(tt, r.key, ly, metric, true);
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

    const maxAbs = currentScaleMode === "fixed"
      ? sectorTierMax(regionKey, metric, detail)
      : Math.max(...rows.map(r => Math.abs(r.value))) || 1;
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
          ttPopulationRow(tt, regionKey, ly, metric, true);
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
    const fixedRange = currentScaleMode === "fixed" ? sectorTierRange(regionKey, metric) : null;
    const maxVal = (fixedRange ? fixedRange.max : Math.max(...allValues, 0)) * 1.08;
    const minVal = (fixedRange ? fixedRange.min : Math.min(...allValues, 0)) * 1.08;

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
        ttPopulationRow(tt, regionKey, years[idx], metric, true);
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

    const maxVal = (currentScaleMode === "fixed" ? gasTierMax(regionKey, metric) : Math.max(...rows.map(r => r.value))) || 1;
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
          ttPopulationRow(tt, regionKey, ly, metric, true);
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

    const maxVal = (currentScaleMode === "fixed" ? gasTierMax(regionKey, metric) : Math.max(...series.flatMap(s => s.values), 0)) * 1.08 || 1;

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
        ttPopulationRow(tt, regionKey, years[idx], metric, true);
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

  function updateGenerationNote(regionKey, gy, metric, unit) {
    const gen = energyGeneration(regionKey, gy);
    const total = generationMetricValue(regionKey, gy, gen.total_mwh, metric);
    const share = energyGenerationShareOfDemand(regionKey, gy);
    const label = metric === "total" ? "Total renewable generation, " : "Renewable generation per person, ";
    generationNoteText = label + gy + ": " + fmtGenerationMetric(metric, unit, total) + " " + generationUnitLabel(metric, unit) +
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
    const unit = currentEnergyUnit;

    const metricLabel = metric === "total"
      ? "renewable electricity generation by technology"
      : "renewable electricity generation per person by technology";
    document.getElementById("generation-chart-title").textContent =
      REGION_LABEL[regionKey] + " " + metricLabel + ", " +
      (view === "historical" ? (years[0] + "–" + gy) : gy);
    updateGenerationNote(regionKey, gy, metric, unit);

    if (view === "historical") {
      buildGenerationChartHistorical(container, regionKey, years, metric, unit);
    } else {
      buildGenerationChartLatest(container, regionKey, gy, metric, unit);
    }
  }

  function buildGenerationChartLatest(container, regionKey, gy, metric, unit) {
    const gen = energyGeneration(regionKey, gy);
    const total = generationMetricValue(regionKey, gy, gen.total_mwh, metric);
    const rows = ENERGY_TECH_ORDER.map(t => ({ name: t, value: generationMetricValue(regionKey, gy, gen.by_technology_mwh[t], metric) }))
      .sort((a, b) => b.value - a.value);
    const valueLabels = rows.map(r => fmtGenerationMetric(metric, unit, r.value) + " " + generationUnitLabel(metric, unit));
    const formatGenerationLabel = v => fmtGenerationMetric(metric, unit, v) + " " + generationUnitLabel(metric, unit);
    const tierMax = generationTierMax(regionKey, metric);

    const W = 860, rowH = 40, gap = 14, barH = 26, labelFontSize = "12.5";
    const M = { top: 10, right: latestBarRightMargin(rows, formatGenerationLabel, tierMax), bottom: 10, left: 150 };
    const plotW = W - M.left - M.right;
    const H = M.top + M.bottom + rows.length * (rowH + gap) - gap;

    const maxVal = currentScaleMode === "fixed" ? tierMax : (Math.max(...rows.map(r => r.value)) || 1);
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
      valText.textContent = valueLabels[i];

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, r.name);
          ttRow(tt, color, gy + "", fmtGenerationMetric(metric, unit, r.value) + " " + generationUnitLabel(metric, unit) + " (" + fmtRatioPct(r.value / total * 100) + " of total)");
          ttPopulationRow(tt, regionKey, gy, metric, true);
        });
      });
    });

    buildGenerationTableLatest(gy, rows, metric, unit);
  }

  function buildGenerationChartHistorical(container, regionKey, years, metric, unit) {
    const series = ENERGY_TECH_ORDER.map(t => ({
      name: t,
      color: categoryColor(t),
      values: years.map(y => generationMetricValue(regionKey, y, energyGeneration(regionKey, y).by_technology_mwh[t], metric))
    }));

    const W = 860, H = 340;
    const M = { top: 20, right: 20, bottom: 32, left: 64 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const maxVal = (currentScaleMode === "fixed" ? generationTierMax(regionKey, metric) : Math.max(...series.flatMap(s => s.values), 0)) * 1.08 || 1;

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
      txt.textContent = fmtGenerationMetric(metric, unit, val);
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
          ttRow(tt, s.color, s.name, fmtGenerationMetric(metric, unit, s.values[idx]) + " " + generationUnitLabel(metric, unit) + " (" + fmtRatioPct(s.values[idx] / yearTotal * 100) + ")");
        });
        ttPopulationRow(tt, regionKey, years[idx], metric, true);
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.name)));
    container.appendChild(legendWrap);

    buildGenerationTableHistorical(years, series, metric, unit);
  }

  function buildGenerationTableLatest(gy, rows, metric, unit) {
    const wrap = document.getElementById("generation-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Technology", generationUnitLabel(metric, unit) + " (" + gy + ")"].forEach(h => { const th = document.createElement("th"); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      [r.name, fmtGenerationMetric(metric, unit, r.value)].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildGenerationTableHistorical(years, series, metric, unit) {
    const wrap = document.getElementById("generation-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.name + " (" + generationUnitLabel(metric, unit) + ")")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtGenerationMetric(metric, unit, s.values[i])));
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
    const axis = currentConsumptionView;
    const detail = currentConsumptionDetail;
    const metric = currentMetric;
    const unit = currentEnergyUnit;

    // Browsers restore a checkbox's checked state across a manual refresh independently of the
    // DOM/JS default, so force it back in line with actual app state on every render (same
    // pattern as the sector chart's sub-sector-detail toggle below) — otherwise a page refresh
    // with this ticked leaves the box looking ticked while currentConsumptionDetail (and thus
    // the chart) has already reset to the simple view. The "Show all fuel types" checkbox only
    // means anything in the "by fuel type" axis, so it's disabled (not hidden — its checked
    // state is preserved for when the user switches back) whenever "by sector" is selected.
    document.getElementById("consumption-detail-toggle").checked = detail;
    document.getElementById("consumption-detail-toggle").disabled = axis === "sector";
    document.getElementById("consumption-detail-row").classList.toggle("is-disabled", axis === "sector");
    document.querySelectorAll("[data-consumption-view]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.consumptionView === axis);
    });

    const metricLabel = metric === "total"
      ? "energy consumption by " + (axis === "sector" ? "sector" : (detail ? "fuel type" : "source"))
      : "energy consumption per person by " + (axis === "sector" ? "sector" : (detail ? "fuel type" : "source"));
    document.getElementById("consumption-chart-title").textContent =
      REGION_LABEL[regionKey] + " " + metricLabel + ", " +
      (view === "historical" ? (years[0] + "–" + cy) : cy);

    if (view === "historical") {
      buildConsumptionChartHistorical(container, regionKey, years, detail, metric, unit, axis);
    } else {
      buildConsumptionChartLatest(container, regionKey, cy, detail, metric, unit, axis);
    }
  }

  function buildConsumptionChartLatest(container, regionKey, cy, detail, metric, unit, axis) {
    const cats = consumptionCategories(detail, axis);
    const allFuelsRaw = energyConsumption(regionKey, cy).all_fuels_ktoe;
    const allFuels = metric === "total" ? allFuelsRaw : allFuelsRaw / regionPopulation(regionKey, cy);
    const rows = cats.map(c => ({ key: c.key, name: c.label, value: consumptionValue(regionKey, cy, c.key, detail, metric, axis) }))
      .sort((a, b) => b.value - a.value);
    const valueLabels = rows.map(r => fmtConsumptionMetric(metric, unit, r.value) + " " + consumptionUnitLabel(metric, unit));
    const formatConsumptionLabel = v => fmtConsumptionMetric(metric, unit, v) + " " + consumptionUnitLabel(metric, unit);
    const tierMax = consumptionTierMax(regionKey, metric, detail, axis);

    const W = 860, rowH = 40, gap = 14, barH = 26, labelFontSize = "12.5";
    // The sector axis's "Industrial, commercial & other" label is longer than any fuel-type
    // label this margin was originally sized for (the previous longest, "Manufactured fuels",
    // fits comfortably at 150) — widen it for that axis so the label isn't clipped.
    const M = { top: 10, right: latestBarRightMargin(rows, formatConsumptionLabel, tierMax), bottom: 10, left: axis === "sector" ? 230 : 150 };
    const plotW = W - M.left - M.right;
    const H = M.top + M.bottom + rows.length * (rowH + gap) - gap;

    const maxVal = currentScaleMode === "fixed" ? tierMax : (Math.max(...rows.map(r => r.value)) || 1);
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
      valText.textContent = valueLabels[i];

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, r.name);
          ttRow(tt, color, cy + "", fmtConsumptionMetric(metric, unit, r.value) + " " + consumptionUnitLabel(metric, unit) + " (" + fmtRatioPct(r.value / allFuels * 100) + " of total)");
          if (axis !== "sector" && !detail) {
            const breakdown = fuelSimpleBreakdown(regionKey, cy, r.key, metric);
            if (breakdown) {
              breakdown.forEach((sub, i) => ttSubRow(tt, sub.name, fmtConsumptionMetric(metric, unit, sub.value) + " " + consumptionUnitLabel(metric, unit), i === 0));
            }
          }
          ttPopulationRow(tt, regionKey, cy, metric, true);
        });
      });
    });

    buildConsumptionTableLatest(cy, rows, metric, unit);
  }

  function buildConsumptionChartHistorical(container, regionKey, years, detail, metric, unit, axis) {
    const cats = consumptionCategories(detail, axis);
    const series = cats.map(c => ({
      key: c.key,
      name: c.label,
      color: categoryColor(c.key),
      values: years.map(y => consumptionValue(regionKey, y, c.key, detail, metric, axis))
    }));

    const W = 860, H = 340;
    const M = { top: 20, right: 20, bottom: 32, left: 64 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const maxVal = (currentScaleMode === "fixed" ? consumptionTierMax(regionKey, metric, detail, axis) : Math.max(...series.flatMap(s => s.values), 0)) * 1.08 || 1;

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
      txt.textContent = fmtConsumptionMetric(metric, unit, val);
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
          ttRow(tt, s.color, s.name, fmtConsumptionMetric(metric, unit, s.values[idx]) + " " + consumptionUnitLabel(metric, unit) + " (" + fmtRatioPct(s.values[idx] / yearTotal * 100) + ")");
          if (axis !== "sector" && !detail) {
            const breakdown = fuelSimpleBreakdown(regionKey, years[idx], s.key, metric);
            if (breakdown) {
              breakdown.forEach((sub, i) => ttSubRow(tt, sub.name, fmtConsumptionMetric(metric, unit, sub.value) + " " + consumptionUnitLabel(metric, unit), i === 0));
            }
          }
        });
        ttPopulationRow(tt, regionKey, years[idx], metric, true);
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.name)));
    container.appendChild(legendWrap);

    buildConsumptionTableHistorical(years, series, metric, unit);
  }

  function buildConsumptionTableLatest(cy, rows, metric, unit) {
    const wrap = document.getElementById("consumption-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Source", consumptionUnitLabel(metric, unit) + " (" + cy + ")"].forEach(h => { const th = document.createElement("th"); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      [r.name, fmtConsumptionMetric(metric, unit, r.value)].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildConsumptionTableHistorical(years, series, metric, unit) {
    const wrap = document.getElementById("consumption-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.name + " (" + consumptionUnitLabel(metric, unit) + ")")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtConsumptionMetric(metric, unit, s.values[i])));
      cells.forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // ---------------- electricity green/fossil chart ----------------
  // greenFossilYears() spans every year with both generation and consumption data alongside a
  // DUKES grid-mix figure (2014 onward, DUKES 6.5a going back to 1996) — enough for a real trend,
  // so unlike the single-year-only design this chart started with, it now responds to the
  // page-wide Latest year/Historical trend toggle like every other chart.

  let greenFossilNoteText = "";

  function updateGreenFossilNote(regionKey, year, metric, unit) {
    const split = electricityGreenFossilSplit(regionKey, year);
    if (!split) { greenFossilNoteText = ""; return; }
    const totalMwh = split.greenMwh + split.fossilMwh;
    const greenShare = totalMwh ? (split.greenMwh / totalMwh) * 100 : 0;
    const label = metric === "total" ? "Electricity consumption, " : "Electricity consumption per person, ";
    greenFossilNoteText = label + year + ": an estimated " + fmtRatioPct(greenShare) +
      " green (" + fmtGenerationMetric(metric, unit, greenFossilValue(regionKey, year, split.greenMwh, metric)) + " " + generationUnitLabel(metric, unit) +
      "), combining this area's own renewable generation with the national grid's low-carbon share for whatever's drawn from it — see this chart's \"i\" button for the method and its limits.";
  }

  function greenFossilValue(regionKey, year, rawMwh, metric) {
    return metric === "total" ? rawMwh : rawMwh / regionPopulation(regionKey, year);
  }

  function buildGreenFossilChart(regionKey) {
    const container = document.getElementById("green-fossil-chart");
    const titleEl = document.getElementById("green-fossil-chart-title");
    if (!container || !titleEl || !ENERGY_DATA) return;
    clearNode(container);
    const metric = currentMetric;
    const unit = currentEnergyUnit;
    const view = currentView;
    const years = greenFossilYears(); // newest first

    if (!years.length) {
      titleEl.textContent = REGION_LABEL[regionKey] + " electricity consumption: green vs fossil (not yet available)";
      greenFossilNoteText = "";
      const p = document.createElement("p");
      p.className = "chart-empty-note";
      p.textContent = "Not available yet: needs a DUKES 6.5a grid-mix figure for a year both renewable generation and energy consumption data cover — see this chart's \"i\" button.";
      container.appendChild(p);
      buildGreenFossilTableLatest(null, [], metric, unit);
      return;
    }

    const year = years[0];
    updateGreenFossilNote(regionKey, year, metric, unit);
    const metricLabel = metric === "total" ? "electricity consumption: green vs fossil" : "electricity consumption per person: green vs fossil";
    titleEl.textContent = REGION_LABEL[regionKey] + " " + metricLabel + ", " +
      (view === "historical" ? (years[years.length - 1] + "–" + year) : year);

    if (view === "historical") {
      buildGreenFossilChartHistorical(container, regionKey, years.slice().reverse(), metric, unit);
      return;
    }

    const split = electricityGreenFossilSplit(regionKey, year);
    const totalValue = greenFossilValue(regionKey, year, split.greenMwh + split.fossilMwh, metric) || 1;
    const rows = [
      { key: "Green", name: "Green", value: greenFossilValue(regionKey, year, split.greenMwh, metric) },
      { key: "Fossil", name: "Fossil fuel", value: greenFossilValue(regionKey, year, split.fossilMwh, metric) }
    ];
    const valueLabels = rows.map(r => fmtGenerationMetric(metric, unit, r.value) + " " + generationUnitLabel(metric, unit));

    const W = 860, rowH = 40, gap = 14, barH = 26, labelFontSize = "12.5";
    const M = { top: 10, right: Math.ceil(Math.max(80, ...valueLabels.map(estimateLabelWidth)) + 16), bottom: 10, left: 150 };
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
      valText.textContent = valueLabels[i];

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, r.name);
          ttRow(tt, color, year + "", valueLabels[i] + " (" + fmtRatioPct(r.value / totalValue * 100) + " of consumption)");
          ttPopulationRow(tt, regionKey, year, metric, true);
        });
      });
    });

    buildGreenFossilTableLatest(year, rows, metric, unit);
  }

  function buildGreenFossilTableLatest(year, rows, metric, unit) {
    const wrap = document.getElementById("green-fossil-table");
    if (!wrap) return;
    clearNode(wrap);
    if (!year) { return; }
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Source", generationUnitLabel(metric, unit) + " (" + year + ")"].forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      [r.name, fmtGenerationMetric(metric, unit, r.value)].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildGreenFossilChartHistorical(container, regionKey, years, metric, unit) {
    const series = ["Green", "Fossil"].map(key => ({
      key: key,
      name: key === "Green" ? "Green" : "Fossil fuel",
      color: categoryColor(key),
      values: years.map(y => {
        const split = electricityGreenFossilSplit(regionKey, y);
        const raw = key === "Green" ? split.greenMwh : split.fossilMwh;
        return greenFossilValue(regionKey, y, raw, metric);
      })
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
      txt.textContent = fmtGenerationMetric(metric, unit, val);
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
        series.forEach(s => {
          ttRow(tt, s.color, s.name, fmtGenerationMetric(metric, unit, s.values[idx]) + " " + generationUnitLabel(metric, unit) + " (" + fmtRatioPct(s.values[idx] / yearTotal * 100) + ")");
        });
        ttPopulationRow(tt, regionKey, years[idx], metric, true);
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.name)));
    container.appendChild(legendWrap);

    buildGreenFossilTableHistorical(years, series, metric, unit);
  }

  function buildGreenFossilTableHistorical(years, series, metric, unit) {
    const wrap = document.getElementById("green-fossil-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.name + " (" + generationUnitLabel(metric, unit) + ")")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtGenerationMetric(metric, unit, s.values[i])));
      cells.forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  // ---------------- info modal ----------------

  const INFO_CONTENT = {
    "region-toggle": {
      title: "Choosing a region",
      body: [
        "Every current Hampshire local authority and every proposed future unitary is here, in three groups. \"Historic districts\" are the 11 district/borough councils that exist today under Hampshire County Council's two-tier system — Basingstoke and Deane, East Hampshire, Eastleigh, Fareham, Gosport, Hart, Havant, New Forest, Rushmoor, Test Valley and Winchester. \"Current unitaries\" are Portsmouth, Southampton and the Isle of Wight — already unitary authorities today, each covering only its own area. \"Proposed unitaries (2028)\" are the four new unitary authorities that replace all 14 of the above from 1 April 2028, under the Government's Local Government Reorganisation decision of 25 March 2026: North Hampshire, Mid-Hampshire, South East Hampshire and South West Hampshire.",
        "Isle of Wight is unaffected by the decision and stays exactly as it is. Portsmouth and Southampton, by contrast, don't remain standalone — Portsmouth is absorbed into South East Hampshire, Southampton into South West Hampshire. Three of the four new unitaries also pick up a handful of parishes moving from a Mid-Hampshire district: South East Hampshire gains Clanfield, Horndean and Rowlands Castle from East Hampshire and Newlands from Winchester; South West Hampshire gains Totton and Eling, Marchwood, Hythe and Dibden and Fawley from New Forest, and Chilworth, Nursling and Rownhams and Valley Park from Test Valley. No official sub-district emissions data exists for any of this, so each affected district's contribution is apportioned by 2021 Census parish population share rather than left as a whole-district guess — see \"Full methodology & sources\" below for the exact fractions.",
        "Hampshire and the Solent is the Combined County Authority established 4 June 2026 (SI 2026/595), covering the whole of Hampshire plus Portsmouth, Southampton and the Isle of Wight — the strategic tier every other region here sits underneath. Unlike the four new unitaries, this one already exists, and its footprint isn't affected by exactly where any moving parish ends up, since they all stay inside it either way.",
        "The historic districts and current unitaries always show today's whole-district figures — not an LGR-adjusted fragment — even though a few of them also contribute a population-weighted slice to a neighbouring proposed unitary's total.",
        "The new-unitary decision is subject to a judicial review sought by Hampshire County Council, so these boundaries are the current best information, not guaranteed final."
      ]
    },
    "metric-toggle": {
      title: "Totals vs per-person figures",
      body: [
        "\"Totals\" is each region's raw figure — kt CO2e for emissions, GWh/ktoe for energy. \"Per person\" divides that same figure by the region's population, so different-sized areas can be compared on equal terms (Southampton's total emissions dwarf Winchester's largely because it has far more people, not because each resident emits more).",
        "The population used is DESNZ's own mid-year population estimate, published in the same dataset as the emissions figures (not a separate Census or ONS source). For a composite region — a proposed unitary, or Hampshire and the Solent — it's summed across the constituent local authorities the same way emissions are summed, including the same population-weighted scaling for the three historic districts split by the Local Government Reorganisation boundary change (see the region selector's \"i\" button, and \"Full methodology & sources\" below).",
        "Hover any chart while \"Per person\" is selected to see the actual population figure a given region/year was divided by, alongside the value itself."
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
    "energy-unit-toggle": {
      title: "MWh-based vs ktoe-based units",
      body: [
        "Renewable generation and energy consumption come from two different DESNZ datasets, each published in its own native unit: generation in MWh (shown here as GWh, or kWh per person), consumption in ktoe — kilotonnes of oil equivalent (shown as ktoe, or toe per person). This toggle picks one shared unit family for both charts, named after each dataset's own published unit, and converts whichever chart isn't already in that family using the standard DUKES/IEA factor of 1 toe = 11.63 MWh.",
        "\"MWh-based\" keeps generation as DESNZ publishes it and converts consumption into GWh / kWh per person. \"ktoe-based\" keeps consumption as DESNZ publishes it and converts generation into ktoe / toe per person. Neither option is more \"correct\" than the other — pick whichever makes the two charts easier to compare directly."
      ]
    },
    "scale-mode-toggle": {
      title: "Fixed vs auto scale",
      body: [
        "The sector, gas, generation and consumption charts' axes default to \"Fixed scale\": one shared axis maximum for every region in the same tier (historic districts share one scale, current unitaries another, proposed unitaries another — Hampshire and the Solent has no tier-mates, so it's unaffected either way). Switching the region selector between two areas in the same tier keeps the axis still, so a real difference in volume stays visible as a difference in bar height or line position, not just a number you'd otherwise have to read closely to notice.",
        "The trade-off: a small area's bar can end up short on a shared scale, which can make its own internal split (which sector, which technology, which fuel) harder to read at a glance. \"Auto scale\" switches back to sizing each chart to its own region's figures, trading that comparability away for a clearer read of one area on its own — useful if you want to see a smaller area's own composition rather than compare it against a much larger neighbour.",
        "The shared maximum is the highest single value seen for that chart, metric and breakdown across every region in the tier and every year of data available, not just the one currently on screen — so the axis doesn't jump around as you switch between the latest year and the historical trend, or between regions in the same tier. The sector chart's latest-year bars are the one case with a symmetric axis either side of zero (the largest magnitude in either direction, since a diverging bar's left/right length needs one consistent scale to stay comparable) — its historical trend line instead uses the tier's actual highest and lowest values independently, since a line's vertical position isn't a length comparison the same way. The sector chart's sub-sector detail view is the one further exception: sub-sector figures are only published for the latest year, so that view's shared maximum only scans the tier's regions for that one year, not the full history.",
        "The trend chart's \"Fixed scale\" isn't per-tier like the others — it can show a district alongside its own unitary and Hampshire and the Solent on one chart at once, spanning up to three tiers simultaneously, so there's no single tier to scale it to. Instead it uses one true maximum across all 19 regions, which is what keeps Hampshire and the Solent (present in every context view) the same size regardless of which region you're focused on — switching between two areas that share a parent (e.g. New Forest and Winchester, both under Mid-Hampshire) no longer changes how big the shared Mid-Hampshire and Hampshire and the Solent lines look, since neither their real values nor the axis have changed."
      ]
    },
    "trend-chart": {
      title: "Total emissions over time",
      body: [
        "Territorial greenhouse gas emissions (CO2, CH4 and N2O, combined as CO2e) for each year 2005–2024, summed across all sectors.",
        "This chart plots the selected region in its hierarchy context, not a fixed set of regions: it always shows Hampshire and the Solent, plus the selected region's own line, plus (for a historic district or current unitary) the proposed unitary it rolls up to — e.g. picking Eastleigh shows Eastleigh, South West Hampshire and Hampshire and the Solent. Tick \"Compare all constituents\" to switch instead to every sibling at the nearest useful level — all historic districts within the selected unitary, or all unitaries within Hampshire and the Solent.",
        "Use the control panel above to switch between totals (kt CO2e) and per-person figures (t CO2e per person), between a single latest-year comparison and the full historical trend, and between the 100-year and 20-year GWP time horizons (see the \"i\" button next to Time horizon above for what that means). The Fixed/Auto scale toggle above the chart applies here too — fixed to one true site-wide maximum, not a per-tier one, since this chart can mix tiers on one screen; see that toggle's own \"i\" button for why.",
        "Historic districts and current unitaries are the official DESNZ district figures, published directly. Every other region here — the four proposed unitaries and Hampshire and the Solent — is calculated by summing those same DESNZ district figures; none of them is an official published figure.",
        "In the historical trend view, dashed lines extend each region's latest actual figure out to zero at its own net-zero target — a straight-line \"required pathway\" showing the average pace of reduction still needed from here. Winchester's own line targets 2030, its more ambitious district-wide carbon-neutral target from its Carbon Neutrality Action Plan; every other region has no target of its own yet, so its line targets 2050 instead, the Hampshire County Council area target (aligned to the UK Government's own legally-binding 2050 target). This is the simplest honest read of the numbers, not a modelled decarbonisation forecast — real pathways are rarely a straight line.",
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
        "Renewable electricity generated within the area's boundary, split by technology: Solar (photovoltaics), Wind (onshore + offshore), Hydro, Bioenergy & waste (anaerobic digestion, sewage gas, landfill gas, municipal solid waste, animal and plant biomass, cofiring), and Other (wave/tidal, plus a small residual — see the note further down).",
        "This is generation, not consumption — how much renewable electricity is physically produced within the area, regardless of where it's ultimately used. The figure above compares this to local electricity demand (from DESNZ's separate energy consumption statistics) — but the two aren't directly connected: Great Britain runs on one shared national grid, so electricity generated by a local wind farm or solar array isn't routed to local homes and businesses, it's exported to the grid and pooled with generation from everywhere else, while local demand draws from that same shared pool. A ratio near or above 100% means an area generates roughly as much renewable electricity as it consumes in total, not that it's disconnected from the grid or self-sufficient in practice.",
        "DESNZ suppresses some small per-technology generation figures (shown as \"[X]\" in its source workbook) to avoid revealing individual plants' output — mainly affects Wind, Hydro and Bioenergy in these mostly solar-dominated local authorities. This site treats suppressed cells as 0 for their own technology and folds the (small) gap against DESNZ's own published total into \"Other\", so the bars always sum exactly to DESNZ's figure.",
        "Electricity consumption figures (used for the demand comparison above) are published in ktoe and converted here to MWh using the standard DUKES/IEA factor of 1 toe = 11.63 MWh.",
        "Generation data starts 2014, the first year DESNZ publishes local authority-level renewable generation; consumption data runs 2005–2024, so the demand comparison is only available from 2014 onward.",
        "Use the control panel above to switch between totals and per-person figures, and the energy unit toggle above the charts below to switch between GWh/kWh-per-person and ktoe/toe-per-person — see that toggle's own \"i\" button for why. Neither choice affects the demand-comparison percentage above, since it's a ratio of two totals.",
        "For Mid-Hampshire, each technology is the sum of that technology's figure across the four constituent districts, scaled the same way as the emissions charts (see the region selector's \"i\" button)."
      ],
      link: { href: "https://www.gov.uk/government/statistics/regional-renewable-statistics", label: "gov.uk statistical release" }
    },
    "consumption-chart": {
      title: "Energy consumption by fuel",
      body: [
        "Total final energy consumed within the area's boundary, covering every fuel — not just electricity: heating, cooking and industrial fuels, and road transport fuel. This is a different DESNZ dataset from the renewable generation chart above, and measures something different too: consumption of all fuel types, rather than local electricity generation. DESNZ publishes this dataset in ktoe (kilotonnes of oil equivalent) — the energy unit toggle just above lets you view it instead in the same GWh/kWh-per-person units as the generation chart; see that toggle's own \"i\" button for details.",
        "\"By fuel type\" (the default) groups DESNZ's six published fuel categories into three: Fossil fuels (Coal + Manufactured fuels + Petroleum + Gas), Electricity, and Bioenergy & waste — tick \"Show all fuel types\" for DESNZ's own six categories individually. \"By sector\" switches to a different split of the same total: Domestic, Transport, and Industrial, Commercial and other — useful for telling how much of an area's consumption is households and cars versus workplaces and industry.",
        "Electricity is kept separate from both \"Fossil fuels\" and \"Bioenergy & waste\" rather than folded into either — the electricity consumed locally is drawn from Great Britain's national grid, whose generation mix (gas, nuclear, wind, solar, imports, etc.) isn't attributed back to the area consuming it by this dataset, so this chart can't honestly label it either way. The \"Electricity: green vs fossil\" chart further down gives an indicative estimate instead, combining this figure with local renewable generation and the national grid mix — see that chart's own \"i\" button for the method.",
        "Oil (petroleum) is typically the largest category here, dominated by road transport fuel — DESNZ's road transport figures are modelled from national/regional fuel sales data apportioned to local authorities, not measured locally.",
        "This dataset counts every unit of fuel burned within a local authority's boundary, including fuel used by large industrial sites (e.g. oil refining) to make products that are consumed elsewhere — it measures fuel burned on-site, not fuel used by local residents and businesses. DESNZ's emissions statistics attribute CO2 by point-source location under separate rules, and don't necessarily move in step with this consumption total. New Forest is the clearest example: switch to \"By sector\" there and \"Industrial, Commercial and other\" dwarfs Domestic and Transport combined, driven by oil refining rather than local demand — which is also why New Forest's energy consumption looks high next to its emissions figures elsewhere on this site. A large \"Industrial, Commercial and other\" share relative to Domestic and Transport is the signal that a big non-household energy user, not local demand, is driving an area's total.",
        "Use the control panel above to switch between totals and per-person figures, and the energy unit toggle just above to switch between ktoe/toe-per-person and GWh/kWh-per-person.",
        "For Mid-Hampshire, each fuel or sector is the sum of that category's figure across the four constituent districts, scaled the same way as the emissions charts (see the region selector's \"i\" button)."
      ],
      link: { href: "https://www.gov.uk/government/collections/total-final-energy-consumption-at-sub-national-level", label: "gov.uk statistical release" }
    },
    "green-fossil-chart": {
      title: "Electricity: green vs fossil",
      dynamicIntro: () => greenFossilNoteText,
      body: [
        "How much of an area's electricity consumption is estimated to come from low-carbon sources versus fossil fuels — the question most people actually mean when they ask \"how green is my electricity\", as distinct from the generation chart's self-sufficiency figure above (how much renewable electricity an area generates relative to what it consumes, which says nothing about the mix it actually draws from the grid).",
        "The method: this area's own renewable generation is counted as green consumption first (the same logic behind \"market-based\" carbon accounting — known local generation nets off before anything else is assumed). Whatever's left of local electricity consumption is assumed to be drawn from the national grid, split at that year's DUKES table 6.5a renewable share for Great Britain as a whole — the grid pools generation nationally, so there's no way to measure a specific area's actual grid-drawn mix directly, and this national average is the closest honest substitute.",
        "\"Green\" here is specifically DUKES's own renewable-generation share (solar, wind, hydro, bioenergy) — \"Fossil fuel\" is the remainder, which strictly also includes nuclear and net electricity imports, not fossil fuel exclusively. This mirrors the two-way split DUKES itself publishes; a genuinely separate nuclear/fossil/renewable three-way split exists in a different DUKES table but isn't used here, to keep this chart a simple green/non-green comparison.",
        "This is a deliberately indicative estimate, not a metered figure — no dataset ties a specific unit of electricity consumed in one area back to where it was generated. Two simplifications worth knowing: it assumes 100% of local renewable generation is offsetting local consumption (in reality it's exported to the shared grid and pooled, the same caveat as the generation chart above), and the national DUKES ratio is a GB-wide average, not specific to this area's own grid connection.",
        "Available for every year with both a DUKES 6.5a figure and matching generation/consumption data — 2014 onward, since local renewable generation data only starts then. DUKES 6.5a itself is fetched and parsed automatically as part of this site's regular data refresh, the same as the generation and consumption datasets.",
        "Use the control panel above to switch between totals and per-person figures, a latest-year snapshot and the trend since 2014, and the energy unit toggle further up to switch between GWh/kWh-per-person and ktoe/toe-per-person.",
        "For Mid-Hampshire, this figure is derived from that region's own generation and consumption totals, each already the sum of the four constituent districts' figures — see the region selector's \"i\" button."
      ],
      link: { href: "https://www.gov.uk/government/statistics/renewable-sources-of-energy-chapter-6-digest-of-united-kingdom-energy-statistics-dukes", label: "DUKES chapter 6 (gov.uk)" }
    },
    "general-methodology": {
      title: "Full methodology & sources",
      dl: [
        ["Primary data source", "DESNZ (Department for Energy Security and Net Zero), “UK local authority and regional greenhouse gas emissions statistics, 2005–2024”, published 25 June 2026."],
        ["Basis", "Territorial emissions — what physically happens within the area's boundary — in kt CO2e (thousand tonnes carbon dioxide equivalent), combining CO2, methane (CH4) and nitrous oxide (N2O)."],
        ["Time horizon", "The default (\"100-year\") view is DESNZ's own published figures, which weight CH4 and N2O by their 100-year Global Warming Potential (GWP100, IPCC AR5: CH4=28, N2O=265, CO2=1) — the international reporting standard. The \"20-year\" view, toggled above the charts, is calculated by this site (not DESNZ) by reweighting the same gas quantities using GWP20 instead (IPCC AR5: CH4=84, N2O=264, CO2=1) — methane counts roughly 3x more heavily, which raises Agriculture- and Waste-heavy areas' figures noticeably. See the Time horizon \"i\" button for the full explanation."],
        ["Historic districts & current unitaries", "The 11 historic districts (Basingstoke and Deane, East Hampshire, Eastleigh, Fareham, Gosport, Hart, Havant, New Forest, Rushmoor, Test Valley, Winchester) and 3 current unitaries (Portsmouth, Southampton, Isle of Wight) are DESNZ's own published district figures, used whole and unadjusted — each represents the area as it exists today, not an LGR-adjusted fragment."],
        ["Mid-Hampshire boundary", "East Hampshire + Winchester + New Forest + Test Valley, per the Government's LGR decision of 25 March 2026, each scaled down to exclude the parishes moving to South East/South West Hampshire under the same decision. No official sub-district emissions data exists, so each district's contribution is reduced by its 2021 Census parish population share instead of using the whole district — East Hampshire to 82.0%, Winchester to 97.7%, New Forest to 61.0%, Test Valley to 88.8%. Decision subject to possible judicial review."],
        ["North Hampshire boundary", "Basingstoke and Deane + Hart + Rushmoor, whole districts — no parishes move in or out of this one, so no population weighting is needed."],
        ["South East Hampshire boundary", "Fareham + Gosport + Havant + Portsmouth, whole districts, plus the parishes moving in from Mid-Hampshire: 18.0% of East Hampshire (Clanfield, Horndean, Rowlands Castle) and 2.3% of Winchester (Newlands), by the same 2021 Census parish population share method as the Mid-Hampshire boundary above."],
        ["South West Hampshire boundary", "Eastleigh + Southampton, whole districts, plus the parishes moving in from Mid-Hampshire: 39.0% of New Forest (Totton and Eling, Marchwood, Hythe and Dibden, Fawley) and 11.2% of Test Valley (Chilworth, Nursling and Rownhams, Valley Park), by the same method."],
        ["Isle of Wight, Portsmouth, Southampton as current unitaries", "Unaffected by the LGR decision as separate regions in their own right — Isle of Wight stays a standalone unitary under the new structure too; Portsmouth and Southampton are absorbed into South East/South West Hampshire respectively from 1 April 2028, but their own figures here are simply today's DESNZ district totals."],
        ["Hampshire and the Solent boundary", "Hampshire County Council + Portsmouth + Southampton + Isle of Wight, per the Hampshire and the Solent Combined County Authority Regulations 2026 (SI 2026/595). Hampshire CC itself isn't a DESNZ-reporting unit, so this is modelled as the sum of all 11 current Hampshire districts plus Portsmouth, Southampton and Isle of Wight, using whole-district figures throughout (this total doesn't need any parish-level adjustment, since it doesn't matter which new unitary those parishes end up in — they stay inside Hampshire and the Solent either way). Equivalently, it's the sum of the four proposed unitaries plus Isle of Wight, which this site's own data pipeline checks against directly."],
        ["Population / per-person", "DESNZ mid-year population estimates, included in the same dataset, summed the same way as emissions for each region (and scaled down per district for Mid-Hampshire/South East/South West Hampshire, as above)."],
        ["Update cycle", () => "DESNZ typically publishes new figures each summer, roughly 18–24 months behind the current year. This site's data was last refreshed " + formatIsoDate(DATA.meta.generated) + " and is updated manually when a new release lands."],
        ["Comparing to other published figures", "DESNZ revises prior years' figures on every release, not just the newest year — so a district's total for a given year (e.g. 2023) can shift slightly between the release that first published it and each subsequent one. A figure quoted elsewhere (a council webpage, a climate action plan) may be citing an earlier DESNZ release than the one this site uses — check the release date before assuming a discrepancy is an error in either source."],
        ["Energy data", "Renewable electricity generation by technology (2014–2024) and energy consumption by fuel (2005–2024), both from DESNZ, at local authority level, aggregated to every region here the same way as the emissions figures above. See each energy chart's own \"i\" button for category grouping and unit conversions."],
        ["Data & code", "Every figure on this site traces back to the single published DESNZ CSV linked below, with the affected districts' contributions scaled using 2021 Census parish population shares (see the boundary notes above) — nothing else here is estimated or modelled."]
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
        const ddEl = document.createElement("dd"); ddEl.textContent = typeof dd === "function" ? dd() : dd;
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
    () => buildConsumptionChart(currentRegion),
    () => buildGreenFossilChart(currentRegion)
  ];

  // The subset of PAGE_WIDE_CHARTS that also needs re-rendering when the region selector
  // changes — now everything, including the trend chart: it used to always plot the same three
  // regions regardless of selection, but now shows the selected region in its hierarchy context
  // (see contextRegions() above), so it's as region-scoped as the rest.
  const REGION_SCOPED_CHARTS = [
    buildTrendChart,
    () => buildSectorChart(currentRegion),
    () => buildGasChart(currentRegion),
    () => buildGenerationChart(currentRegion),
    () => buildConsumptionChart(currentRegion),
    () => buildGreenFossilChart(currentRegion)
  ];

  function renderPageWideCharts() {
    PAGE_WIDE_CHARTS.forEach(fn => fn());
  }

  function renderRegionScopedCharts() {
    REGION_SCOPED_CHARTS.forEach(fn => fn());
  }

  // Reflects the current region in the URL as a "?region=" param, so a link can point straight
  // at any of the 19 regions — the point of promoting this site across every district and
  // unitary rather than just Winchester's original three geographies. Uses replaceState, not
  // pushState: switching regions is exploratory, like the other page controls, not something
  // that should give every click its own back-button stop. "winchester" (the default) is kept
  // param-free so the plain URL still works exactly as before.
  function syncUrl(regionKey) {
    const url = new URL(location.href);
    if (regionKey === "winchester") {
      url.searchParams.delete("region");
    } else {
      url.searchParams.set("region", regionKey);
    }
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function setRegion(regionKey) {
    currentRegion = regionKey;
    compareMode = "context";
    document.getElementById("region-select").value = regionKey;
    const compareToggle = document.getElementById("compare-constituents-toggle");
    if (compareToggle) compareToggle.checked = false;
    syncUrl(regionKey);
    renderRegionScopedCharts();
  }

  // Wired to the trend chart's "Compare all constituents" checkbox — independent of setRegion()
  // since toggling it shouldn't reset the selected region, only which set of regions the trend
  // chart plots (see contextRegionKeys()).
  function setCompareMode(mode) {
    compareMode = mode;
    buildTrendChart();
  }

  function setMetric(metric) {
    currentMetric = metric;
    document.querySelectorAll("[data-metric]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.metric === metric);
    });
    renderPageWideCharts();
  }

  // Page-wide (not per-chart) for the same reason as setMetric/setHorizon above: it's one
  // control-to-chart wiring answered by PAGE_WIDE_CHARTS rather than a hand-picked chart list,
  // even though only generation/consumption actually read currentEnergyUnit.
  function setEnergyUnit(unit) {
    currentEnergyUnit = unit;
    document.querySelectorAll("[data-energy-unit]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.energyUnit === unit);
    });
    renderPageWideCharts();
  }

  // Page-wide for the same reason as setEnergyUnit above — one wiring via PAGE_WIDE_CHARTS,
  // even though only generation/consumption read currentScaleMode.
  function setScaleMode(mode) {
    currentScaleMode = mode;
    document.querySelectorAll("[data-scale-mode]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.scaleMode === mode);
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

  // Keeps each sticky bar pinned directly under the one above it, whatever height each actually
  // renders at (the control panel wraps to two rows below ~640px wide, changing everything
  // stacked beneath it): control panel -> region toggle -> chart scale row -> energy unit toggle.
  function setupStickyOffset() {
    const panel = document.getElementById("control-panel");
    const regionRow = document.getElementById("region-scoped").querySelector(".region-toggle-row");
    const scaleRow = document.getElementById("chart-scale-row");
    const energyUnitRow = document.getElementById("energy-unit-row");
    const update = () => {
      document.documentElement.style.setProperty("--control-panel-h", panel.offsetHeight + "px");
      document.documentElement.style.setProperty("--region-toggle-h", regionRow.offsetHeight + "px");
      // Tracks the chart scale row's and energy-unit row's own heights too — see .card's
      // scroll-margin-top in style.css, which needs these (on top of the two above) to keep a
      // card's own heading clear of the sticky stack when a browser-driven jump (in-page search,
      // fragment link, Tab-to-focus) lands on it, wherever three or four bars stack.
      document.documentElement.style.setProperty("--chart-scale-row-h", scaleRow.offsetHeight + "px");
      document.documentElement.style.setProperty("--energy-unit-row-h", energyUnitRow.offsetHeight + "px");
    };
    update();
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(update);
      ro.observe(panel);
      ro.observe(regionRow);
      ro.observe(scaleRow);
      ro.observe(energyUnitRow);
    } else {
      window.addEventListener("resize", update);
    }
  }

  function wireEvents() {
    setupStickyOffset();

    document.getElementById("region-select").addEventListener("change", (ev) => setRegion(ev.target.value));

    document.getElementById("compare-constituents-toggle").addEventListener("change", (ev) => {
      setCompareMode(ev.target.checked ? "constituents" : "context");
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
    document.querySelectorAll("[data-energy-unit]").forEach(btn => {
      btn.addEventListener("click", () => setEnergyUnit(btn.dataset.energyUnit));
    });
    document.querySelectorAll("[data-scale-mode]").forEach(btn => {
      btn.addEventListener("click", () => setScaleMode(btn.dataset.scaleMode));
    });

    document.getElementById("sector-detail-toggle").addEventListener("change", (ev) => {
      currentDetail = ev.target.checked;
      buildSectorChart(currentRegion);
    });

    document.getElementById("consumption-detail-toggle").addEventListener("change", (ev) => {
      currentConsumptionDetail = ev.target.checked;
      buildConsumptionChart(currentRegion);
    });

    document.querySelectorAll("[data-consumption-view]").forEach(btn => {
      btn.addEventListener("click", () => {
        currentConsumptionView = btn.dataset.consumptionView;
        buildConsumptionChart(currentRegion);
      });
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
    initRegions();
    populateRegionSelect();
    wireEvents();
    // Deep link support: "?region=<key>" opens straight into that region instead of the default
    // Winchester — the point of promoting this site across every district and unitary, not just
    // Winchester's original three geographies. Falls back to Winchester for a missing/unknown key.
    const regionParam = new URLSearchParams(location.search).get("region");
    currentRegion = (regionParam && REGION_BY_KEY[regionParam]) ? regionParam : "winchester";
    document.getElementById("region-select").value = currentRegion;
    renderPageWideCharts();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
