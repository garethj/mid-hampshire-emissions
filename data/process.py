import csv
import json
import sys
from collections import defaultdict
from datetime import date

SRC = sys.argv[1] if len(sys.argv) > 1 else "emissions_source.csv"
LAS = ["Winchester", "East Hampshire", "New Forest", "Test Valley"]

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

def la_year_total(year, la):
    return sum(sum(sub.values()) for sub in detail[year][la].values())

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
        "note_boundary": "Mid-Hampshire (proposed unitary, decision 25 March 2026) = East Hampshire + Winchester + New Forest + Test Valley in full, minus 11 parishes moving to South-West/South-East Hampshire (incl. Chilworth, Nursling, Rownhams, Valley Park from Test Valley). No official sub-district emissions data exists, so this parish-level adjustment is not applied here; the Mid-Hampshire figures are a straight sum of the four whole districts and will slightly overstate the true final-boundary footprint.",
        "generated": date.today().isoformat()
    },
    "areas_km2": area,
    "regions": {}
}

def build_region(name, la_list):
    r = {"name": name, "las": la_list, "years": {}}
    for y in years:
        pop = sum(population[y][la] for la in la_list if la in population[y])
        sector_totals = {s: round(sum(la_year_sector(y, la, s) for la in la_list), 4) for s in sectors}
        total = round(sum(sector_totals.values()), 4)
        r["years"][y] = {
            "total_kt_co2e": total,
            "population_thousands": round(pop, 3),
            "per_capita_t_co2e": round((total * 1000) / (pop * 1000), 4) if pop else None,
            "sectors_kt_co2e": sector_totals
        }
    return r

out["regions"]["winchester"] = build_region("Winchester", ["Winchester"])
out["regions"]["mid-hampshire"] = build_region("Mid-Hampshire (proposed)", LAS)

contrib = {}
for y in years:
    contrib[y] = {la: round(la_year_total(y, la), 4) for la in LAS}
out["district_contributions"] = contrib

latest = years[-1]
def subsector_detail(la_list, year):
    agg = defaultdict(lambda: defaultdict(float))
    for la in la_list:
        for sector, subs in detail[year][la].items():
            for sub, v in subs.items():
                agg[sector][sub] += v
    return {s: {k: round(v, 4) for k, v in subs.items()} for s, subs in agg.items()}

out["subsector_detail_latest_year"] = {
    "year": latest,
    "winchester": subsector_detail(["Winchester"], latest),
    "mid-hampshire": subsector_detail(LAS, latest)
}

with open("mid_hampshire_emissions.json", "w") as f:
    json.dump(out, f, indent=1)

print("years:", years[0], "-", years[-1])
print("Winchester latest total:", out["regions"]["winchester"]["years"][latest]["total_kt_co2e"], "kt CO2e")
print("Mid-Hampshire latest total:", out["regions"]["mid-hampshire"]["years"][latest]["total_kt_co2e"], "kt CO2e")
