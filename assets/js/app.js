(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  let DATA = null;
  let currentRegion = "winchester";
  let currentMetric = "per_capita"; // "total" | "per_capita"
  let currentView = "latest"; // "latest" | "historical"
  let currentDetail = false; // show sector chart as sub-sectors (latest view only)
  let tooltipEl = null;

  const REGION_LABEL = {
    "winchester": "Winchester",
    "mid-hampshire": "Mid-Hampshire"
  };

  const SECTOR_ORDER = ["Agriculture", "Commercial", "Domestic", "Industry", "LULUCF", "Public Sector", "Transport", "Waste"];

  // ---------------- helpers ----------------

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function seriesColor(slot) {
    return cssVar("--series-" + slot);
  }

  function regionColor(key) {
    return key === "winchester" ? seriesColor(1) : seriesColor(6);
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

  function regionSeriesTotals(regionKey) {
    const region = DATA.regions[regionKey];
    return DATA.meta.years.map(y => region.years[y].total_kt_co2e);
  }

  function latestYear() {
    return DATA.meta.years[DATA.meta.years.length - 1];
  }

  function regionMetricValue(regionKey, year, metric) {
    const yd = DATA.regions[regionKey].years[year];
    return metric === "total" ? yd.total_kt_co2e : yd.per_capita_t_co2e;
  }

  function sectorMetricValue(regionKey, year, sector, metric) {
    const yd = DATA.regions[regionKey].years[year];
    const raw = yd.sectors_kt_co2e[sector];
    return metric === "total" ? raw : raw / yd.population_thousands;
  }

  // Sub-sector detail only exists for the latest year (DATA.subsector_detail_latest_year),
  // grouped by parent sector (in SECTOR_ORDER) and sorted by magnitude within each sector.
  function sectorSubrows(regionKey, ly, metric) {
    const detailBySector = DATA.subsector_detail_latest_year[regionKey];
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

  // ---------------- KPI tiles ----------------

  function renderKPIs(regionKey) {
    const region = DATA.regions[regionKey];
    const years = DATA.meta.years;
    const ly = years[years.length - 1];
    const py = years[years.length - 2];
    const baseY = years[0];

    const latest = region.years[ly];
    const prev = region.years[py];
    const base = region.years[baseY];

    const totalDelta = ((latest.total_kt_co2e - prev.total_kt_co2e) / prev.total_kt_co2e) * 100;
    const capitaDelta = ((latest.per_capita_t_co2e - prev.per_capita_t_co2e) / prev.per_capita_t_co2e) * 100;
    const baseVal = currentMetric === "total" ? base.total_kt_co2e : base.per_capita_t_co2e;
    const latestVal = currentMetric === "total" ? latest.total_kt_co2e : latest.per_capita_t_co2e;
    const sinceBase = ((latestVal - baseVal) / baseVal) * 100;

    const color = regionColor(regionKey);
    const trend = years.map(y => region.years[y].total_kt_co2e);

    const row = document.getElementById("kpi-row");
    clearNode(row);

    row.appendChild(buildKpiTile(
      "Total emissions, " + ly,
      fmtInt(latest.total_kt_co2e), "kt CO2e",
      totalDelta, py,
      trend, color
    ));

    row.appendChild(buildKpiTile(
      "Per person, " + ly,
      fmtPerCapita(latest.per_capita_t_co2e), "t CO2e",
      capitaDelta, py,
      years.map(y => region.years[y].per_capita_t_co2e), color
    ));

    row.appendChild(buildKpiTileSimple(
      "Change since " + baseY + (currentMetric === "per_capita" ? " (per person)" : ""),
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
      metricLabel + ", " + (view === "historical" ? (years[0] + "–" + ly) : ly);

    if (view === "historical") {
      buildTrendChartHistorical(container, years, metric);
    } else {
      buildTrendChartLatest(container, ly, metric);
    }
  }

  function buildTrendChartHistorical(container, years, metric) {
    const wValues = years.map(y => regionMetricValue("winchester", y, metric));
    const mValues = years.map(y => regionMetricValue("mid-hampshire", y, metric));

    const W = 860, H = 320;
    const M = { top: 20, right: 128, bottom: 32, left: 56 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    container.appendChild(svg);

    const maxVal = Math.max(...mValues, ...wValues) * 1.08;
    const xScale = i => M.left + (i / (years.length - 1)) * plotW;
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
    const xTickYears = [years[0], years[Math.round((years.length - 1) * 0.25)], years[Math.round((years.length - 1) * 0.5)], years[Math.round((years.length - 1) * 0.75)], years[years.length - 1]];
    xTickYears.forEach(y => {
      const i = years.indexOf(y);
      const xx = xScale(i);
      const txt = el("text", { x: xx, y: M.top + plotH + 20, "text-anchor": "middle", fill: cssVar("--text-muted"), "font-size": "11" }, svg);
      txt.textContent = y;
    });

    el("line", { x1: M.left, x2: M.left + plotW, y1: M.top + plotH, y2: M.top + plotH, stroke: cssVar("--baseline"), "stroke-width": "1" }, svg);

    function drawLine(values, color) {
      let d = "";
      values.forEach((v, i) => { d += (i === 0 ? "M" : "L") + xScale(i).toFixed(1) + "," + yScale(v).toFixed(1) + " "; });
      el("path", { d: d, fill: "none", stroke: color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      const lastX = xScale(values.length - 1), lastY = yScale(values[values.length - 1]);
      el("circle", { cx: lastX, cy: lastY, r: "5", fill: color, stroke: cssVar("--surface-1"), "stroke-width": "2" }, svg);
    }

    drawLine(wValues, seriesColor(1));
    drawLine(mValues, seriesColor(6));

    // End-of-line labels: the circle markers stay at their true data position, but the
    // two-line name/value labels are pushed apart vertically when series end close
    // together in value, so they don't overlap (e.g. Winchester/Mid-Hampshire per-capita
    // figures converging by 2023). Colour-coding the name keeps a shifted label
    // identifiable even once it's no longer level with its marker.
    const lastX = xScale(years.length - 1);
    const MIN_LABEL_GAP = 30;
    const endLabels = [
      { values: wValues, color: seriesColor(1), label: "Winchester" },
      { values: mValues, color: seriesColor(6), label: "Mid-Hampshire" }
    ].map(s => ({ ...s, y: yScale(s.values[s.values.length - 1]) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < endLabels.length; i++) {
      if (endLabels[i].y - endLabels[i - 1].y < MIN_LABEL_GAP) {
        endLabels[i].y = endLabels[i - 1].y + MIN_LABEL_GAP;
      }
    }
    endLabels.forEach(item => {
      const nameText = el("text", { x: lastX + 10, y: item.y - 2, "font-size": "12", "font-weight": "700", fill: item.color }, svg);
      nameText.textContent = item.label;
      const valText = el("text", { x: lastX + 10, y: item.y + 13, "font-size": "11", fill: cssVar("--text-secondary") }, svg);
      valText.textContent = fmtAxisValue(metric, item.values[item.values.length - 1]) + " " + unitShort(metric);
    });

    // crosshair + hover
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
        ttRow(tt, seriesColor(1), "Winchester", fmtValue(metric, wValues[idx]) + " " + unitShort(metric));
        ttRow(tt, seriesColor(6), "Mid-Hampshire", fmtValue(metric, mValues[idx]) + " " + unitShort(metric));
      });
    });
    hitRect.addEventListener("pointerleave", () => { crosshair.setAttribute("opacity", "0"); hideTooltip(); });

    // legend
    const legendWrap = document.createElement("div");
    legendWrap.className = "legend";
    legendWrap.appendChild(legendItemLine(seriesColor(1), "Winchester"));
    legendWrap.appendChild(legendItemLine(seriesColor(6), "Mid-Hampshire (proposed)"));
    container.appendChild(legendWrap);

    buildTrendTableHistorical(years, wValues, mValues, metric);
  }

  function buildTrendChartLatest(container, ly, metric) {
    const regions = [
      { key: "winchester", label: "Winchester", color: seriesColor(1) },
      { key: "mid-hampshire", label: "Mid-Hampshire", color: seriesColor(6) }
    ];
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

  function buildTrendTableHistorical(years, wValues, mValues, metric) {
    const wrap = document.getElementById("trend-table");
    clearNode(wrap);
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    ["Year", "Winchester (" + unitLabel(metric) + ")", "Mid-Hampshire (" + unitLabel(metric) + ")"].forEach(h => {
      const th = document.createElement("th"); th.textContent = h; htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    years.forEach((y, i) => {
      const tr = document.createElement("tr");
      [y, fmtValue(metric, wValues[i]), fmtValue(metric, mValues[i])].forEach(v => {
        const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
      });
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
      REGION_LABEL[regionKey] + " " + metricLabel + ", " + (view === "historical" ? (DATA.meta.years[0] + "–" + ly) : ly);

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

  // ---------------- info modal ----------------

  const INFO_CONTENT = {
    "region-toggle": {
      title: "Winchester vs Mid-Hampshire",
      body: [
        "Winchester is the existing district council. Mid-Hampshire is the proposed new unitary authority, combining East Hampshire, Winchester, New Forest and Test Valley from 1 April 2028, following the Government's Local Government Reorganisation decision of 25 March 2026.",
        "This decision is subject to a judicial review sought by Hampshire County Council, so the boundary shown here is the current best information, not guaranteed final."
      ]
    },
    "trend-chart": {
      title: "Total emissions over time",
      body: [
        "Territorial greenhouse gas emissions (CO2, CH4 and N2O, combined as CO2e) for each year 2005–2023, summed across all sectors.",
        "Use the control panel above to switch between totals (kt CO2e) and per-person figures (t CO2e per person), and between a single latest-year comparison and the full historical trend.",
        "Winchester is the official district figure, published directly by DESNZ. Mid-Hampshire is calculated here by summing the same DESNZ figures for East Hampshire, Winchester, New Forest and Test Valley — it is not an official published figure.",
        "Source: DESNZ UK local authority and regional greenhouse gas emissions statistics, 2005–2023 (published 3 July 2025)."
      ],
      link: { href: "https://assets.publishing.service.gov.uk/media/68653c7ee6c3cc924228943f/2005-23-uk-local-authority-ghg-emissions-CSV-dataset.csv", label: "Download the source CSV" }
    },
    "sector-chart": {
      title: "Emissions by sector",
      body: [
        "Territorial emissions split by the eight DESNZ sectors (Agriculture, Commercial, Domestic, Industry, LULUCF, Public Sector, Transport, Waste), each summed across their sub-sectors and gases.",
        "Use the control panel above to switch between totals and per-person figures, and between a latest-year snapshot and each sector's trend since 2005. In the latest-year view, tick “Show sub-sector detail” to break each sector down further (e.g. Transport into road, rail and other) — sub-sector figures are only published for the latest year, so this detail isn't available in the historical trend view.",
        "LULUCF (land use, land-use change and forestry) is usually negative — it represents a net carbon sink from woodland, hedgerows and soils, which subtracts from the total rather than adding to it.",
        "For Mid-Hampshire, each sector is the sum of that sector's figure across the four constituent districts."
      ]
    },
    "general-methodology": {
      title: "Full methodology & sources",
      dl: [
        ["Primary data source", "DESNZ (Department for Energy Security and Net Zero), “UK local authority and regional greenhouse gas emissions statistics, 2005–2023”, published 3 July 2025."],
        ["Basis", "Territorial emissions — what physically happens within the area's boundary — in kt CO2e (thousand tonnes carbon dioxide equivalent), combining CO2, methane (CH4) and nitrous oxide (N2O)."],
        ["Mid-Hampshire boundary", "East Hampshire + Winchester + New Forest + Test Valley, per the Government's LGR decision of 25 March 2026, each scaled down to exclude the 11 parishes moving to neighbouring unitaries (South-West/South-East Hampshire) under the same decision. No official sub-district emissions data exists, so each district's contribution is reduced by its 2021 Census parish population share instead of using the whole district — East Hampshire to 82.0%, Winchester to 97.7%, New Forest to 61.0%, Test Valley to 88.8%. Decision subject to possible judicial review."],
        ["Population / per-person", "DESNZ mid-year population estimates, included in the same dataset, summed the same way as emissions for Mid-Hampshire (and scaled down per district, as above)."],
        ["Update cycle", "DESNZ typically publishes new figures each summer, roughly 18–24 months behind the current year. This site's data was last refreshed 29 July 2026 and is updated manually when a new release lands."],
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
  }

  function setMetric(metric) {
    currentMetric = metric;
    document.querySelectorAll("[data-metric]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.metric === metric);
    });
    renderKPIs(currentRegion);
    buildTrendChart();
    buildSectorChart(currentRegion);
  }

  function setView(view) {
    currentView = view;
    document.querySelectorAll("[data-view]").forEach(b => {
      b.classList.toggle("is-active", b.dataset.view === view);
    });
    buildTrendChart();
    buildSectorChart(currentRegion);
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
      });
    }
  }

  function init() {
    if (!window.MHE_DATA) {
      document.getElementById("kpi-row").textContent = "Could not load emissions data: data/mid_hampshire_emissions.js did not load.";
      return;
    }
    DATA = window.MHE_DATA;
    wireEvents();
    setRegion("winchester");
    buildTrendChart();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
