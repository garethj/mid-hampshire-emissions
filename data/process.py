import csv
import json
import sys
from collections import defaultdict
from datetime import date

SRC = sys.argv[1] if len(sys.argv) > 1 else "emissions_source.csv"
LAS = ["Winchester", "East Hampshire", "New Forest", "Test Valley"]

# 2021 Census parish population (ONS/Nomis "Parish data, England and Wales: Census 2021",
# dataset NM_2352_1, boundaries as at December 2022), for the 11 parishes moving from these
# four districts to South-West/South-East Hampshire under the LGR decision of 25 March 2026.
# Sourced/cross-checked directly from the Nomis API (https://www.nomisweb.co.uk), not scraped.
# Households are the finest-grained alternative ONS publishes at parish level (true dwelling
# counts only go down to district level) and land within 0.1 percentage points of the
# population-based ratios below, so population alone is used to keep this simple.
MOVING_PARISHES = {
    "East Hampshire": {"Clanfield": 6015, "Horndean": 13488, "Rowlands Castle": 3190},  # -> South-East Hampshire
    "Winchester": {"Newlands": 2899},  # -> South-East Hampshire
    "New Forest": {"Totton and Eling": 28653, "Marchwood": 5775, "Hythe and Dibden": 20182, "Fawley": 14013},  # -> South-West Hampshire
    "Test Valley": {"Chilworth": 1278, "Nursling and Rownhams": 5968, "Valley Park": 7366},  # -> South-West Hampshire
}
DISTRICT_POPULATION_2021 = {"East Hampshire": 125744, "Winchester": 127444, "New Forest": 175785, "Test Valley": 130492}
# Fraction of each district's 2021 population that stays within Mid-Hampshire's true post-LGR
# boundary. No official sub-district emissions data exists, so each district's contribution to
# Mid-Hampshire is scaled down by this fraction as the best available proxy — applied uniformly
# across all years, since only a single Census snapshot is available, not a time series.
MID_HAMPSHIRE_RETAINED_FRACTION = {
    la: 1 - sum(parishes.values()) / DISTRICT_POPULATION_2021[la]
    for la, parishes in MOVING_PARISHES.items()
}

detail = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(float))))
population = defaultdict(dict)
area = {}

with open(SRC, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        la = row["Local Authority"]
        if la not in LAS:
            continue
        year = int(row["Calendar Year"])
        sector = row["LA GHG Sector"]
        subsector = row["LA GHG Sub-sector"]
        val = float(row["Territorial emissions (kt CO2e)"])
        detail[year][la][sector][subsector] += val
        population[year][la] = float(row["Mid-year Population (thousands)"])
        area[la] = float(row["Area (km2)"])

years = sorted(detail.keys())
sectors = sorted({s for y in detail for la in detail[y] for s in detail[y][la]})

def la_year_sector(year, la, sector):
    if sector not in detail[year][la]:
        return 0.0
    return sum(detail[year][la][sector].values())

out = {
    "meta": {
        "source": "DESNZ UK local authority and regional greenhouse gas emissions statistics",
        "source_url": "https://www.gov.uk/government/collections/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics",
        "units": "kt CO2e (thousand tonnes carbon dioxide equivalent), territorial basis",
        "years": years,
        "sectors": sectors,
        "constituent_las": LAS,
        "note_boundary": "Mid-Hampshire (proposed unitary, decision 25 March 2026) = East Hampshire + Winchester + New Forest + Test Valley, adjusted to exclude the 11 parishes moving to South-West/South-East Hampshire under the same decision (Clanfield, Horndean, Rowlands Castle from East Hampshire; Newlands from Winchester; Totton and Eling, Marchwood, Hythe and Dibden, Fawley from New Forest; Chilworth, Nursling and Rownhams, Valley Park from Test Valley). No official sub-district emissions data exists, so each district's contribution is scaled down by its 2021 Census parish population share instead of using the whole district — see mid_hampshire_retained_fraction.",
        "mid_hampshire_retained_fraction": {la: round(f, 4) for la, f in MID_HAMPSHIRE_RETAINED_FRACTION.items()},
        "generated": date.today().isoformat()
    },
    "areas_km2": area,
    "regions": {}
}

def build_region(name, la_list, la_weight=None):
    r = {"name": name, "las": la_list, "years": {}}
    for y in years:
        pop = sum(population[y][la] * (la_weight[la] if la_weight else 1.0) for la in la_list if la in population[y])
        sector_totals = {
            s: round(sum(la_year_sector(y, la, s) * (la_weight[la] if la_weight else 1.0) for la in la_list), 4)
            for s in sectors
        }
        total = round(sum(sector_totals.values()), 4)
        r["years"][y] = {
            "total_kt_co2e": total,
            "population_thousands": round(pop, 3),
            "per_capita_t_co2e": round((total * 1000) / (pop * 1000), 4) if pop else None,
            "sectors_kt_co2e": sector_totals
        }
    return r

out["regions"]["winchester"] = build_region("Winchester", ["Winchester"])
out["regions"]["mid-hampshire"] = build_region("Mid-Hampshire (proposed)", LAS, MID_HAMPSHIRE_RETAINED_FRACTION)

latest = years[-1]
def subsector_detail(la_list, year, la_weight=None):
    agg = defaultdict(lambda: defaultdict(float))
    for la in la_list:
        w = la_weight[la] if la_weight else 1.0
        for sector, subs in detail[year][la].items():
            for sub, v in subs.items():
                agg[sector][sub] += v * w
    return {s: {k: round(v, 4) for k, v in subs.items()} for s, subs in agg.items()}

out["subsector_detail_latest_year"] = {
    "year": latest,
    "winchester": subsector_detail(["Winchester"], latest),
    "mid-hampshire": subsector_detail(LAS, latest, MID_HAMPSHIRE_RETAINED_FRACTION)
}

with open("mid_hampshire_emissions.json", "w") as f:
    json.dump(out, f, indent=1)

with open("mid_hampshire_emissions.js", "w") as f:
    f.write("window.MHE_DATA = ")
    json.dump(out, f, indent=1)
    f.write(";\n")

print("years:", years[0], "-", years[-1])
print("Mid-Hampshire retained fraction per district:", {la: round(f, 4) for la, f in MID_HAMPSHIRE_RETAINED_FRACTION.items()})
print("Winchester latest total:", out["regions"]["winchester"]["years"][latest]["total_kt_co2e"], "kt CO2e")
print("Mid-Hampshire latest total:", out["regions"]["mid-hampshire"]["years"][latest]["total_kt_co2e"], "kt CO2e")
