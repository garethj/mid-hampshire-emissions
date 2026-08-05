# Project instructions — Hampshire Emissions Explorer

## Don't clutter the main page — put explanatory/derived text in the chart's (i) dialog instead

When a chart needs a sentence of context, a derived headline figure, or an explanation of what it's comparing (e.g. "this generation total is equivalent to X% of local demand"), it belongs in that chart's info modal (`INFO_CONTENT` in `assets/js/app.js`, opened via the "i" button) — not as a permanent element on the page next to the chart.

**Why:** The main page is meant to stay a small set of charts and controls. An on-page note next to every chart that needs explaining would turn it into a wall of text before long. The "i" dialog already exists specifically to hold this kind of detail on demand, without competing for space on the page itself.

**How to apply:** For text that's dynamic (depends on region/year/metric/etc.), store the computed string in a module-level variable, updated whenever the chart rebuilds, and expose it via an `INFO_CONTENT[key].dynamicIntro` function that `openModal()` calls and renders as the modal's first paragraph — see the generation chart's demand-comparison figure for the reference implementation. Static explanatory text goes straight into that chart's `INFO_CONTENT[key].body` array. Reserve genuine on-page real estate for load-bearing UI only — chart titles, axis labels, legends — not commentary or supporting detail.
