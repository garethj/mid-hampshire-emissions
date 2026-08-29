# What else could we add?

This dashboard deliberately starts small — a few headline figures, built on data we're confident in. This is the longer list of what the same underlying dataset (and some others) could support if there's interest. It used to live in an in-app tab; it's kept here instead so the idea isn't lost even though the tab is gone.

## More regions

- **Build-your-own region** — Let anyone tick any combination of current districts and get an instant combined chart — useful if boundaries change again, or to test other groupings.

## Targets

- **Compare against a net-zero pathway** — Add a target trajectory line — e.g. the Tyndall Centre's local carbon budget, or a locally agreed net-zero target — so the trend can be read against what's actually needed.

## Other data

- **Housing & retrofit (EPC data)** — Energy Performance Certificate data by district could show housing stock efficiency and retrofit progress, relevant to the large Domestic sector.
- **Transport specifics** — EV charge-point density, ULEV registrations and active travel mode share — useful given transport is the single largest sector here.
- **Green vs fossil electricity split (DUKES 6.5a)** — DUKES table 6.5a publishes GB's national low-carbon vs fossil share of electricity generation each year. Applied to an area's electricity consumption, it would give a "how green is the electricity I use" figure — a genuinely different question from the local generation chart's self-sufficiency ratio, since the grid pools generation nationally rather than routing it locally (see the local-vs-imported point below). Deliberately not built yet: it's a national ratio, not a local measurement, and risks reading as more locally precise than it is if it's not framed very carefully next to the local generation chart.
- **Local vs imported green energy** — Not really buildable: there's no metering anywhere that ties a unit of electricity consumed in one area back to a specific generator elsewhere, since the GB grid pools everything. The DUKES 6.5a split above is the closest honest answer to "how green is my electricity" — a national figure, not a local-origin one.

## Visuals

- **Map view** — A choropleth map of the constituent districts, using free ONS boundary files, showing each district's share of the Mid-Hampshire total.
- **Consumption-side sankey (fuel → sector)** — DESNZ's sub-national total final energy consumption dataset is structured as a genuine fuel × sector matrix (Coal/Oil/Gas/Electricity/Bioenergy, by domestic/industrial-commercial/transport), so a sankey from fuel type to sector would represent something DESNZ actually measures, not an inference. Deliberately **not** a sankey from local renewable generation to local consumption sectors — that would visually imply a local wind farm powers local homes directly, which the national grid doesn't do (locally generated power is exported/pooled, not routed to local sectors). Keep generation and consumption-by-fuel as separate charts, as now.
- **Fixed/shared chart scales** — Every chart currently auto-scales its axis to whatever's on screen, which can hide real differences in volume between regions or between charts. A fixed-scale option (e.g. a toggle alongside the existing Totals/Per person one) could keep one shared axis max per chart across regions, so switching regions doesn't rescale away a size difference — worth scoping to "fixed across regions within one chart" rather than across different charts/metrics, since those use different units and a shared scale there wouldn't mean much. Smaller regions would read worse in detail under a fixed scale, the usual small-multiples trade-off.

## Usability

- **Download the data** — A one-click CSV export of whatever's currently on screen, for anyone who wants to do their own analysis.
- **Interactive legends** — Click a legend entry to isolate that series on the chart — handy once there are more than two or three regions or sectors on screen at once.
