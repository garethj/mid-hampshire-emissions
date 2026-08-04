(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  let DATA = null;
  let ENERGY_DATA = null;
  let currentRegion = "winchester";
  let currentMetric = "per_capita"; // "total" | "per_capita"
  let currentView = "latest"; // "latest" | "historical"
  let currentDetail = false; // show sector chart as sub-sectors (latest view only)
  let currentHorizon = "gwp100"; // "gwp100" (official DESNZ) | "gwp20"
  let tooltipEl = null;

  // Region display order for the trend chart, legends and tables — also the source of truth
  // for which regions exist. Each gets its own series colour slot, distinct from the 1-8 used
  // for sectors elsewhere (the two charts are never shown side by side, but keeping them
  // visually distinct avoids implying a relationship that isn't there).
  const REGIONS = [
    { key: "winchester", label: "Winchester", legendLabel: "Winchester", colorSlot: 1 },
    { key: "mid-hampshire", label: "Mid-Hampshire", legendLabel: "Mid-Hampshire (proposed)", colorSlot: 6 },
    { key: "hampshire-solent", label: "Hampshire and the Solent", legendLabel: "Hampshire and the Solent", colorSlot: 7 }
  ];
  const REGION_LABEL = Object.fromEntries(REGIONS.map(r => [r.key, r.label]));

  const SECTOR_ORDER = ["Agriculture", "Commercial", "Domestic", "Industry", "LULUCF", "Public Sector", "Transport", "Waste"];

  // Gas display order, colour-slotted 1/2/3 (blue/orange/aqua) — separate from the 1-8 sector
  // slots since the sector and gas charts are never shown side by side.
  const GAS_ORDER = ["CO2", "CH4", "N2O"];
  const GAS_LABEL = { CO2: "CO2", CH4: "CH4 (methane)", N2O: "N2O (nitrous oxide)" };

  // Matches ENERGY_DATA.meta.technology_groups (see process_energy.py) — order here controls
  // display order, colour-slotted 1-5 like sectors/gases (never shown alongside those charts).
  const ENERGY_TECH_ORDER = ["Solar", "Wind", "Hydro", "Bioenergy & waste", "Other"];

  // ---------------- helpers ----------------

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function seriesColor(slot) {
    return cssVar("--series-" + slot);
  }

  function regionColor(key) {
    const r = REGIONS.find(r => r.key === key);
    return seriesColor(r ? r.colorSlot : 1);
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

  // Appended to chart/KPI titles whenever the 20-year horizon is active, so it's never ambiguous
  // which set of figures is on screen — this is the one thing distinguishing an unofficial
  // GWP20 view from DESNZ's own published GWP100 numbers.
  function horizonTitleSuffix() {
    return currentHorizon === "gwp20" ? " (20-year GWP)" : "";
  }

  function deltaClass(changeValue) {
    if (Math.abs(changeValue) < 0.05) return "flat";
    return changeValue < 0 ? "down" : "up";
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
  function sectorSubrows(regionKey, ly, metric) {
    const detailRoot = currentHorizon === "gwp20" ? DATA.subsector_detail_latest_year.gwp20 : DATA.subsector_detail_latest_year;
    const detailBySector = detailRoot[regionKey];
    const population = DATA.regions[regionKey].years[ly].population_thousands;
    const rows = [];
    SECTOR_ORDER.forEach((sector, i) => {
      const subs = detailBySector[sector] || {};
      const subRows = Object.keys(subs).map(name => ({
        name: name,
        sector: sector,
        value: metric === "total" ? subs[name] : subs[name] / population,
        slot: i + 1
      })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      rows.push(...subRows);
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

  // Renewable generation as a % of local electricity demand — not the same as "how much of
  // this area's electricity is renewable", since the grid means generation isn't necessarily
  // consumed where it's produced (see the energy-kpi info modal). Null if either figure is
  // missing for that year (consumption data starts 2005, generation data starts 2014).
  function energyGenerationShareOfDemand(regionKey, year) {
    const gen = energyGeneration(regionKey, year);
    const con = energyConsumption(regionKey, year);
    if (!gen || !con) return null;
    return (gen.total_mwh / con.electricity_consumption_mwh) * 100;
  }

  // ---------------- KPI tiles ----------------

  function renderKPIs(regionKey) {
    const years = DATA.meta.years;
    const ly = years[years.length - 1];
    const py = years[years.length - 2];
    const baseY = years[0];

    const latest = yearData(regionKey, ly);
    const prev = yearData(regionKey, py);
    const base = yearData(regionKey, baseY);

    const totalDelta = ((latest.total_kt_co2e - prev.total_kt_co2e) / prev.total_kt_co2e) * 100;
    const capitaDelta = ((latest.per_capita_t_co2e - prev.per_capita_t_co2e) / prev.per_capita_t_co2e) * 100;
    const baseVal = currentMetric === "total" ? base.total_kt_co2e : base.per_capita_t_co2e;
    const latestVal = currentMetric === "total" ? latest.total_kt_co2e : latest.per_capita_t_co2e;
    const sinceBase = ((latestVal - baseVal) / baseVal) * 100;

    const color = regionColor(regionKey);
    const trend = years.map(y => yearData(regionKey, y).total_kt_co2e);

    const row = document.getElementById("kpi-row");
    clearNode(row);

    row.appendChild(buildKpiTile(
      "Total emissions, " + ly + horizonTitleSuffix(),
      fmtInt(latest.total_kt_co2e), "kt CO2e",
      totalDelta, py,
      trend, color
    ));

    row.appendChild(buildKpiTile(
      "Per person, " + ly + horizonTitleSuffix(),
      fmtPerCapita(latest.per_capita_t_co2e), "t CO2e",
      capitaDelta, py,
      years.map(y => yearData(regionKey, y).per_capita_t_co2e), color
    ));

    row.appendChild(buildKpiTileSimple(
      "Change since " + baseY + (currentMetric === "per_capita" ? " (per person)" : "") + horizonTitleSuffix(),
      fmtPct(sinceBase), "",
      sinceBase
    ));
  }

  function buildKpiTile(label, value, unit, deltaPct, deltaVsYear, trendValues, color) {
    const tile = document.createElement("div");
    tile.className = "kpi-tile";
    const head = document.createElement("div");
    head.className = "kpi-head";
    const labelEl = document.createElement("div");
    labelEl.className = "kpi-label";
    labelEl.textContent = label;
    head.appendChild(labelEl);
    tile.appendChild(head);

    const valueEl = document.createElement("div");
    valueEl.className = "kpi-value";
    valueEl.textContent = value;
    const unitEl = document.createElement("span");
    unitEl.className = "kpi-unit";
    unitEl.textContent = unit;
    valueEl.appendChild(unitEl);
    tile.appendChild(valueEl);

    const deltaEl = document.createElement("div");
    deltaEl.className = "kpi-delta " + deltaClass(deltaPct);
    deltaEl.textContent = fmtPct(deltaPct) + " vs " + deltaVsYear;
    tile.appendChild(deltaEl);

    tile.appendChild(buildSparkline(trendValues, color));
    return tile;
  }

  function buildKpiTileSimple(label, value, unit, deltaPct) {
    const tile = document.createElement("div");
    tile.className = "kpi-tile";
    const head = document.createElement("div");
    head.className = "kpi-head";
    const labelEl = document.createElement("div");
    labelEl.className = "kpi-label";
    labelEl.textContent = label;
    head.appendChild(labelEl);
    tile.appendChild(head);

    const valueEl = document.createElement("div");
    valueEl.className = "kpi-value " + (deltaClass(deltaPct) === "down" ? "kpi-value" : "");
    valueEl.style.color = deltaClass(deltaPct) === "down" ? cssVar("--success-text") : (deltaClass(deltaPct) === "up" ? seriesColor(8) : "");
    valueEl.textContent = value;
    tile.appendChild(valueEl);

    const note = document.createElement("div");
    note.className = "kpi-delta flat";
    note.textContent = deltaPct < 0 ? "reduction" : "increase";
    tile.appendChild(note);
    return tile;
  }

  function buildSparkline(values, color) {
    const w = 100, h = 24;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "24");
    svg.style.marginTop = "8px";
    const min = Math.min(...values), max = Math.max(...values);
    const pad = 2;
    const x = i => pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = v => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    let d = "";
    values.forEach((v, i) => { d += (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(v).toFixed(1) + " "; });
    el("path", { d: d, fill: "none", stroke: cssVar("--gridline"), "stroke-width": "1.5" }, svg);
    const lastIdx = values.length - 1;
    const secondLast = values.length - 2;
    el("path", {
      d: "M" + x(secondLast).toFixed(1) + "," + y(values[secondLast]).toFixed(1) + " L" + x(lastIdx).toFixed(1) + "," + y(values[lastIdx]).toFixed(1),
      fill: "none", stroke: color, "stroke-width": "2", "stroke-linecap": "round"
    }, svg);
    el("circle", { cx: x(lastIdx).toFixed(1), cy: y(values[lastIdx]).toFixed(1), r: "3", fill: color }, svg);
    return svg;
  }

  // ---------------- energy KPI tiles ----------------

  // Deliberately doesn't reuse buildKpiTile's up/down colouring (green=down, amber=up) — that
  // encodes "down is good", correct for emissions but backwards here, since more renewable
  // generation is the desirable direction. These tiles show the same shape (value + delta +
  // sparkline) but with a direction-neutral delta.
  function buildEnergyKpiTile(label, value, unit, deltaText, trendValues, color) {
    const tile = document.createElement("div");
    tile.className = "kpi-tile";
    const head = document.createElement("div");
    head.className = "kpi-head";
    const labelEl = document.createElement("div");
    labelEl.className = "kpi-label";
    labelEl.textContent = label;
    head.appendChild(labelEl);
    tile.appendChild(head);

    const valueEl = document.createElement("div");
    valueEl.className = "kpi-value";
    valueEl.textContent = value;
    if (unit) {
      const unitEl = document.createElement("span");
      unitEl.className = "kpi-unit";
      unitEl.textContent = unit;
      valueEl.appendChild(unitEl);
    }
    tile.appendChild(valueEl);

    const deltaEl = document.createElement("div");
    deltaEl.className = "kpi-delta flat";
    deltaEl.textContent = deltaText;
    tile.appendChild(deltaEl);

    tile.appendChild(buildSparkline(trendValues, color));
    return tile;
  }

  function renderEnergyKPIs(regionKey) {
    const row = document.getElementById("energy-kpi-row");
    if (!row || !ENERGY_DATA) return;
    clearNode(row);

    const years = energyGenerationYears();
    const gy = years[years.length - 1];
    const py = years[years.length - 2];
    const color = regionColor(regionKey);

    const gen = energyGeneration(regionKey, gy).total_mwh;
    const prevGen = energyGeneration(regionKey, py).total_mwh;
    const genDeltaPct = ((gen - prevGen) / prevGen) * 100;
    const genTrend = years.map(y => energyGeneration(regionKey, y).total_mwh);

    row.appendChild(buildEnergyKpiTile(
      "Renewable electricity generation, " + gy,
      fmtGwh(gen), "GWh",
      fmtPct(genDeltaPct) + " vs " + py,
      genTrend, color
    ));

    const ratio = energyGenerationShareOfDemand(regionKey, gy);
    const prevRatio = energyGenerationShareOfDemand(regionKey, py);
    const ratioTrend = years.map(y => energyGenerationShareOfDemand(regionKey, y));

    row.appendChild(buildEnergyKpiTile(
      "Renewable generation vs local electricity demand, " + gy,
      fmtRatioPct(ratio), "",
      (ratio - prevRatio >= 0 ? "+" : "") + (ratio - prevRatio).toFixed(1) + " pts vs " + py,
      ratioTrend, color
    ));
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
  const TARGET_WCC_YEAR = 2030; // Winchester City Council's own district-wide carbon-neutral target

  function buildTrendChartHistorical(container, years, metric) {
    const series = REGIONS.map(r => ({
      key: r.key,
      label: r.label,
      legendLabel: r.legendLabel,
      color: seriesColor(r.colorSlot),
      values: years.map(y => regionMetricValue(r.key, y, metric))
    }));

    const lastActualYear = years[years.length - 1];
    const chartMinYear = years[0];
    const chartMaxYear = TARGET_NET_ZERO_YEAR;

    // Straight-line "required" trajectory from each region's latest actual value to zero at
    // the net-zero target year — not a modelled decarbonisation pathway (real ones are rarely
    // linear), just the simplest honest read of the average pace still needed from here.
    function valueAtYear(s, year) {
      if (year <= lastActualYear) {
        const idx = years.indexOf(year);
        return idx >= 0 ? s.values[idx] : null;
      }
      const lastVal = s.values[s.values.length - 1];
      const t = (year - lastActualYear) / (TARGET_NET_ZERO_YEAR - lastActualYear);
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

    // WCC 2030 target marker (background layer, drawn before data lines so it doesn't
    // compete with them for attention).
    const wccX = xScale(TARGET_WCC_YEAR);
    el("line", { x1: wccX, x2: wccX, y1: M.top, y2: M.top + plotH, stroke: cssVar("--text-muted"), "stroke-width": "1", "stroke-dasharray": "3,3", opacity: "0.6" }, svg);
    const wccLabel1 = el("text", { x: wccX, y: M.top + 12, "text-anchor": "middle", "font-size": "10.5", "font-weight": "700", fill: cssVar("--text-muted") }, svg);
    wccLabel1.textContent = "WCC target:";
    const wccLabel2 = el("text", { x: wccX, y: M.top + 25, "text-anchor": "middle", "font-size": "10.5", fill: cssVar("--text-muted") }, svg);
    wccLabel2.textContent = "Winchester carbon-neutral";

    series.forEach(s => {
      let d = "";
      years.forEach((y, i) => { d += (i === 0 ? "M" : "L") + xScale(y).toFixed(1) + "," + yScale(s.values[i]).toFixed(1) + " "; });
      el("path", { d: d, fill: "none", stroke: s.color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      const lastX = xScale(lastActualYear), lastY = yScale(s.values[s.values.length - 1]);
      el("circle", { cx: lastX, cy: lastY, r: "5", fill: s.color, stroke: cssVar("--surface-1"), "stroke-width": "2" }, svg);

      // dashed "required pathway to net zero" continuation
      el("line", {
        x1: lastX, y1: lastY, x2: xScale(TARGET_NET_ZERO_YEAR), y2: yScale(0),
        stroke: s.color, "stroke-width": "2", "stroke-dasharray": "5,4", opacity: "0.5"
      }, svg);
    });

    // Net-zero target marker, shared since every region's dashed line converges on it.
    const nzX = xScale(TARGET_NET_ZERO_YEAR), nzY = yScale(0);
    el("circle", { cx: nzX, cy: nzY, r: "4", fill: cssVar("--text-muted") }, svg);
    const nzLabel = el("text", { x: nzX - 8, y: nzY - 10, "text-anchor": "end", "font-size": "11", "font-weight": "700", fill: cssVar("--text-secondary") }, svg);
    nzLabel.textContent = TARGET_NET_ZERO_YEAR + ": Net Zero";
    const nzLabel2 = el("text", { x: nzX - 8, y: nzY + 5, "text-anchor": "end", "font-size": "10", fill: cssVar("--text-muted") }, svg);
    nzLabel2.textContent = "HCC & UK Gov target";

    // End-of-line labels: sit at the latest actual year (not the chart's right edge, which is
    // now the 2050 target), and are pushed apart vertically as a group when series end close
    // together in value, so they don't overlap. Colour-coding the name keeps a shifted label
    // identifiable even once it's no longer level with its marker.
    const labelX = xScale(lastActualYear);
    const MIN_LABEL_GAP = 30;
    const endLabels = series.map(s => ({ ...s, y: yScale(s.values[s.values.length - 1]) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < endLabels.length; i++) {
      if (endLabels[i].y - endLabels[i - 1].y < MIN_LABEL_GAP) {
        endLabels[i].y = endLabels[i - 1].y + MIN_LABEL_GAP;
      }
    }
    endLabels.forEach(item => {
      const nameText = el("text", { x: labelX + 10, y: item.y - 2, "font-size": "12", "font-weight": "700", fill: item.color }, svg);
      nameText.textContent = item.label;
      const valText = el("text", { x: labelX + 10, y: item.y + 13, "font-size": "11", fill: cssVar("--text-secondary") }, svg);
      valText.textContent = fmtAxisValue(metric, item.values[item.values.length - 1]) + " " + unitShort(metric);
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
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(year) + (isFuture ? " — required pathway" : ""));
        series.forEach(s => {
          ttRow(tt, s.color, s.label, fmtValue(metric, valueAtYear(s, year)) + " " + unitShort(metric));
        });
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    // legend
    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.legendLabel)));
    container.appendChild(legendWrap);

    const note = document.createElement("p");
    note.className = "chart-note";
    note.textContent = "Dashed lines: straight-line pathway required to reach net zero by " + TARGET_NET_ZERO_YEAR + " from the latest actual figure — not a modelled forecast.";
    container.appendChild(note);

    buildTrendTableHistorical(years, series, metric);
  }

  function buildTrendChartLatest(container, ly, metric) {
    const regions = REGIONS.map(r => ({ key: r.key, label: r.label, color: seriesColor(r.colorSlot) }));
    const values = regions.map(r => regionMetricValue(r.key, ly, metric));

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
          ttRow(tt, r.color, unitLabel(metric), fmtValue(metric, value));
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
    const rows = detail
      ? sectorSubrows(regionKey, ly, metric)
      : SECTOR_ORDER.map((s, i) => ({ name: s, value: sectorMetricValue(regionKey, ly, s, metric), slot: i + 1 }))
          .sort((a, b) => b.value - a.value);

    const W = 860;
    const rowH = detail ? 26 : 34;
    const gap = detail ? 3 : 6;
    const barH = detail ? 18 : 24;
    const labelFontSize = detail ? "11" : "12.5";
    const M = { top: 10, right: 70, bottom: 10, left: detail ? 185 : 130 };
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
      const color = seriesColor(r.slot);
      const barY = y + (rowH - barH) / 2;

      const label = el("text", { x: M.left - 12, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": labelFontSize, fill: cssVar("--text-secondary") }, svg);
      label.textContent = detail ? shortSubsectorLabel(r.sector, r.name) : r.name;

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
          ttRow(tt, color, ly + "", fmtValue(metric, r.value) + " " + unitLabel(metric));
        });
      });
    });

    buildSectorTableLatest(regionKey, ly, rows, metric, detail);
  }

  function buildSectorChartHistorical(container, regionKey, metric) {
    const years = DATA.meta.years;
    const series = SECTOR_ORDER.map((s, i) => ({
      name: s,
      color: seriesColor(i + 1),
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
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(years[idx]));
        series.slice().sort((a, b) => b.values[idx] - a.values[idx]).forEach(s => {
          ttRow(tt, s.color, s.name, fmtValue(metric, s.values[idx]) + " " + unitShort(metric));
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
    const rows = GAS_ORDER.map((g, i) => ({ key: g, name: GAS_LABEL[g], value: gasMetricValue(regionKey, ly, g, metric), slot: i + 1 }));

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
      const color = seriesColor(r.slot);
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
          ttRow(tt, color, ly + "", fmtValue(metric, r.value) + " " + unitLabel(metric));
        });
      });
    });

    buildGasTableLatest(ly, rows, metric);
  }

  function buildGasChartHistorical(container, regionKey, metric) {
    const years = DATA.meta.years;
    const series = GAS_ORDER.map((g, i) => ({
      key: g,
      name: GAS_LABEL[g],
      color: seriesColor(i + 1),
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
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(years[idx]));
        series.slice().sort((a, b) => b.values[idx] - a.values[idx]).forEach(s => {
          ttRow(tt, s.color, s.name, fmtValue(metric, s.values[idx]) + " " + unitShort(metric));
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

  // ---------------- energy chart (latest bars / historical lines) ----------------
  // Structurally mirrors the gas chart above: technologies, like gases, are never negative, so
  // bars run left-to-right from a fixed edge rather than diverging from a centre zero line.

  function buildEnergyChart(regionKey) {
    const container = document.getElementById("energy-chart");
    if (!container || !ENERGY_DATA) return;
    clearNode(container);
    const years = energyGenerationYears();
    const gy = energyLatestGenerationYear();
    const view = currentView;

    document.getElementById("energy-chart-title").textContent =
      REGION_LABEL[regionKey] + " renewable electricity generation by technology, " +
      (view === "historical" ? (years[0] + "–" + gy) : gy);

    if (view === "historical") {
      buildEnergyChartHistorical(container, regionKey, years);
    } else {
      buildEnergyChartLatest(container, regionKey, gy);
    }
  }

  function buildEnergyChartLatest(container, regionKey, gy) {
    const gen = energyGeneration(regionKey, gy);
    const rows = ENERGY_TECH_ORDER.map((t, i) => ({ name: t, value: gen.by_technology_mwh[t], slot: i + 1 }))
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
      const color = seriesColor(r.slot);
      const barY = y + (rowH - barH) / 2;

      const label = el("text", { x: M.left - 12, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": labelFontSize, fill: cssVar("--text-secondary") }, svg);
      label.textContent = r.name;

      const rect = el("rect", { x: M.left, y: barY, width: Math.max(barW, 0), height: barH, rx: "4", fill: color }, svg);
      rect.style.cursor = "pointer";

      const valText = el("text", { x: M.left + barW + 8, y: y + rowH / 2 + 4, "text-anchor": "start", "font-size": labelFontSize, "font-weight": "700", fill: cssVar("--text-primary") }, svg);
      valText.textContent = fmtGwh(r.value) + " GWh";

      rect.addEventListener("pointerenter", () => rect.setAttribute("opacity", "0.82"));
      rect.addEventListener("pointerleave", () => { rect.setAttribute("opacity", "1"); hideTooltip(); });
      rect.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, (tt) => {
          ttTitle(tt, r.name);
          ttRow(tt, color, gy + "", fmtGwh(r.value) + " GWh");
        });
      });
    });

    buildEnergyTableLatest(gy, rows);
  }

  function buildEnergyChartHistorical(container, regionKey, years) {
    const series = ENERGY_TECH_ORDER.map((t, i) => ({
      name: t,
      color: seriesColor(i + 1),
      values: years.map(y => energyGeneration(regionKey, y).by_technology_mwh[t])
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
      txt.textContent = fmtGwh(val);
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
      showTooltip(ev.clientX, ev.clientY, (tt) => {
        ttTitle(tt, String(years[idx]));
        series.slice().sort((a, b) => b.values[idx] - a.values[idx]).forEach(s => {
          ttRow(tt, s.color, s.name, fmtGwh(s.values[idx]) + " GWh");
        });
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    series.forEach(s => legendWrap.appendChild(legendItemLine(s.color, s.name)));
    container.appendChild(legendWrap);

    buildEnergyTableHistorical(years, series);
  }

  function buildEnergyTableLatest(gy, rows) {
    const wrap = document.getElementById("energy-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Technology", "GWh (" + gy + ")"].forEach(h => { const th = document.createElement("th"); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      [r.name, fmtGwh(r.value)].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function buildEnergyTableHistorical(years, series) {
    const wrap = document.getElementById("energy-table");
    if (!wrap) return;
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year"].concat(series.map(s => s.name + " (GWh)")).forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      const cells = [y].concat(series.map(s => fmtGwh(s.values[i])));
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
        "In the historical trend view, dashed lines extend each region's latest actual figure out to zero at 2050 — a straight-line \"required pathway\" showing the average pace of reduction still needed to reach net zero by 2050, the target set by Hampshire County Council for the whole Hampshire area (aligned to the UK Government's own legally-binding 2050 target). This is the simplest honest read of the numbers, not a modelled decarbonisation forecast — real pathways are rarely a straight line. The vertical marker at 2030 is Winchester City Council's own, more ambitious, district-wide carbon-neutral target from its Carbon Neutrality Action Plan.",
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
    "energy-chart": {
      title: "Renewable electricity generation by technology",
      body: [
        "Renewable electricity generated within the area's boundary, in GWh, split by technology: Solar (photovoltaics), Wind (onshore + offshore), Hydro, Bioenergy & waste (anaerobic digestion, sewage gas, landfill gas, municipal solid waste, animal and plant biomass, cofiring), and Other (wave/tidal, plus a small residual — see the note below).",
        "This is generation, not consumption — how much renewable electricity is physically produced within the area, regardless of where it's ultimately used. See the \"Renewable generation vs local electricity demand\" KPI above the chart for how that compares to what the area actually consumes.",
        "DESNZ suppresses some small per-technology generation figures (shown as \"[X]\" in its source workbook) to avoid revealing individual plants' output — mainly affects Wind, Hydro and Bioenergy in these mostly solar-dominated local authorities. This site treats suppressed cells as 0 for their own technology and folds the (small) gap against DESNZ's own published total into \"Other\", so the bars always sum exactly to DESNZ's figure.",
        "Data starts 2014, the first year DESNZ publishes local authority-level renewable generation.",
        "For Mid-Hampshire, each technology is the sum of that technology's figure across the four constituent districts, scaled the same way as the emissions charts (see the region selector's \"i\" button)."
      ],
      link: { href: "https://www.gov.uk/government/statistics/regional-renewable-statistics", label: "gov.uk statistical release" }
    },
    "energy-kpi": {
      title: "Renewable generation vs local electricity demand",
      body: [
        "Local renewable electricity generation (the chart below) as a percentage of local electricity consumption (from DESNZ's sub-national total final energy consumption statistics) — a rough gauge of how self-sufficient the area is in renewable electricity, not a claim about where that electricity actually goes.",
        "These are not directly connected: Great Britain runs on one shared national grid, so electricity generated by a local wind farm or solar array isn't routed to local homes and businesses — it's exported to the grid and pooled with generation from everywhere else, while local demand draws from that same shared pool. A ratio near or above 100% means an area generates roughly as much renewable electricity as it consumes in total, not that it's disconnected from the grid or unaffected by outages elsewhere.",
        "Electricity consumption figures are published in ktoe (kilotonnes of oil equivalent) and converted here to MWh using the standard DUKES/IEA factor of 1 toe = 11.63 MWh.",
        "Consumption data runs 2005–2024; generation data starts 2014, so the ratio and its trend are only available from 2014 onward."
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
        ["Energy data", "Renewable electricity generation (2014–2024) and electricity consumption (2005–2024) both from DESNZ, at local authority level, aggregated to these three regions the same way as the emissions figures above. See the energy chart's own \"i\" button for technology grouping and suppression handling."],
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

  function setRegion(regionKey) {
    currentRegion = regionKey;
    document.querySelectorAll(".region-toggle .seg-btn").forEach(b => {
      b.classList.toggle("is-active", b.dataset.region === regionKey);
    });
    renderKPIs(regionKey);
    buildSectorChart(regionKey);
    buildGasChart(regionKey);
    renderEnergyKPIs(regionKey);
    buildEnergyChart(regionKey);
  }

  function setMetric(metric) {
    currentMetric = metric;
    document.querySelectorAll("[data-metric]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.metric === metric);
    });
    renderKPIs(currentRegion);
    buildTrendChart();
    buildSectorChart(currentRegion);
    buildGasChart(currentRegion);
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll("[data-view]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.view === view);
    });
    buildTrendChart();
    buildSectorChart(currentRegion);
    buildGasChart(currentRegion);
    buildEnergyChart(currentRegion);
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
    renderKPIs(currentRegion);
    buildTrendChart();
    buildSectorChart(currentRegion);
    buildGasChart(currentRegion);
  }

  function wireEvents() {
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
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        buildTrendChart();
        buildSectorChart(currentRegion);
        buildGasChart(currentRegion);
        buildEnergyChart(currentRegion);
      });
    }
  }

  function init() {
    if (!window.MHE_DATA) {
      document.getElementById("kpi-row").textContent = "Could not load emissions data: data/mid_hampshire_emissions.js did not load.";
      return;
    }
    DATA = window.MHE_DATA;
    ENERGY_DATA = window.MHE_ENERGY_DATA || null;
    wireEvents();
    setRegion("winchester");
    buildTrendChart();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
