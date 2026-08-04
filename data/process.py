import csv
import json
import sys
from collections import defaultdict
from datetime import date

SRC = sys.argv[1] if len(sys.argv) > 1 else "emissions_source.csv"
MID_HAMPSHIRE_LAS = ["Winchester", "East Hampshire", "New Forest", "Test Valley"]

# Hampshire and the Solent Combined County Authority (established 4 June 2026 under SI 2026/595)
# = Hampshire County Council + Portsmouth + Southampton + Isle of Wight. Hampshire CC is an
# upper-tier county, not itself a DESNZ-reporting unit, so at DESNZ's district-level granularity
# this is all 11 current Hampshire districts plus the two unitary cities and the Isle of Wight.
HAMPSHIRE_SOLENT_LAS = [
    "Basingstoke and Deane", "East Hampshire", "Eastleigh", "Fareham", "Gosport", "Hart", "Havant",
    "New Forest", "Rushmoor", "Test Valley", "Winchester", "Portsmouth", "Southampton", "Isle of Wight"
]
ALL_LAS = sorted(set(MID_HAMPSHIRE_LAS) | set(HAMPSHIRE_SOLENT_LAS))

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

# DESNZ's published "Territorial emissions (kt CO2e)" already applies 100-year Global Warming
# Potentials (GWP100, IPCC AR5 Table 8.A.1 without climate-carbon feedbacks: CH4=28, N2O=265,
# CO2=1) to convert each gas to CO2 equivalent. Methane is short-lived but far more potent while
# it lasts, so a 20-year horizon (GWP20, same AR5 table: CH4=84, N2O=264, CO2=1) tells a
# materially different story for methane-heavy sectors (chiefly Agriculture and Waste). Since
# CO2e_gwp20 = native_gas_mass * GWP20 = (CO2e_gwp100 / GWP100) * GWP20, each row's already-
# published CO2e figure can be rescaled directly by GWP20/GWP100 per gas, without needing the
# native tonnage.
GWP100 = {"CO2": 1.0, "CH4": 28.0, "N2O": 265.0}
GWP20 = {"CO2": 1.0, "CH4": 84.0, "N2O": 264.0}
GWP20_OVER_GWP100 = {gas: GWP20[gas] / GWP100[gas] for gas in GWP100}
GASES = ["CO2", "CH4", "N2O"]

detail = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(float))))
detail_gwp20 = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(float))))
detail_gas = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
detail_gas_gwp20 = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
population = defaultdict(dict)
area = {}

with open(SRC, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        la = row["Local Authority"]
        if la not in ALL_LAS:
            continue
        year = int(row["Calendar Year"])
        sector = row["LA GHG Sector"]
        subsector = row["LA GHG Sub-sector"]
        gas = row["Greenhouse gas"]
        val = float(row["Territorial emissions (kt CO2e)"])
        detail[year][la][sector][subsector] += val
        detail_gwp20[year][la][sector][subsector] += val * GWP20_OVER_GWP100.get(gas, 1.0)
        detail_gas[year][la][gas] += val
        detail_gas_gwp20[year][la][gas] += val * GWP20_OVER_GWP100.get(gas, 1.0)
        population[year][la] = float(row["Mid-year Population (thousands)"])
        area[la] = float(row["Area (km2)"])

years = sorted(detail.keys())
sectors = sorted({s for y in detail for la in detail[y] for s in detail[y][la]})

def la_year_sector(detail_map, year, la, sector):
    if sector not in detail_map[year][la]:
        return 0.0
    return sum(detail_map[year][la][sector].values())

out = {
    "meta": {
        "source": "DESNZ UK local authority and regional greenhouse gas emissions statistics",
        "source_url": "https://www.gov.uk/government/collections/uk-local-authority-and-regional-greenhouse-gas-emissions-statistics",
        "units": "kt CO2e (thousand tonnes carbon dioxide equivalent), territorial basis",
        "years": years,
        "sectors": sectors,
        "gases": GASES,
        "constituent_las": MID_HAMPSHIRE_LAS,
        "note_boundary": "Mid-Hampshire (proposed unitary, decision 25 March 2026) = East Hampshire + Winchester + New Forest + Test Valley, adjusted to exclude the 11 parishes moving to South-West/South-East Hampshire under the same decision (Clanfield, Horndean, Rowlands Castle from East Hampshire; Newlands from Winchester; Totton and Eling, Marchwood, Hythe and Dibden, Fawley from New Forest; Chilworth, Nursling and Rownhams, Valley Park from Test Valley). No official sub-district emissions data exists, so each district's contribution is scaled down by its 2021 Census parish population share instead of using the whole district — see mid_hampshire_retained_fraction.",
        "mid_hampshire_retained_fraction": {la: round(f, 4) for la, f in MID_HAMPSHIRE_RETAINED_FRACTION.items()},
        "note_hampshire_solent": "Hampshire and the Solent Combined County Authority (established 4 June 2026 under SI 2026/595) = Hampshire County Council + Portsmouth City Council + Southampton City Council + Isle of Wight Council. Modelled here as the sum of all 11 current Hampshire districts plus Portsmouth, Southampton and Isle of Wight (Hampshire CC itself isn't a DESNZ-reporting unit). This total isn't affected by the 11-parish boundary change above, since those parishes stay within the CCA regardless of which new unitary they land in.",
        "note_gwp20": "DESNZ's published figures (everything outside the 'gwp20' keys below) use 100-year Global Warming Potentials (GWP100), the international reporting standard, converting CH4 and N2O to CO2e using IPCC AR5 values. This site additionally computes an unofficial 20-year-horizon view (GWP20, same AR5 table) by rescaling each gas's already-published CO2e contribution by GWP20/GWP100 for that gas — methane is ~3x more potent on a 20-year view than on the standard 100-year one, so this shifts sectors, gases and regions with more Agriculture (livestock) and Waste (landfill) noticeably higher relative to their official figure. Nested 'gwp20' objects mirror the shape of their parent (same keys: total_kt_co2e, per_capita_t_co2e, sectors_kt_co2e, gases_kt_co2e).",
        "gwp100_factors": {"CO2": GWP100["CO2"], "CH4": GWP100["CH4"], "N2O": GWP100["N2O"]},
        "gwp20_factors": {"CO2": GWP20["CO2"], "CH4": GWP20["CH4"], "N2O": GWP20["N2O"]},
        "generated": date.today().isoformat()
    },
    "areas_km2": area,
    "regions": {}
}

def sector_totals_for(detail_map, y, la_list, la_weight):
    return {
        s: round(sum(la_year_sector(detail_map, y, la, s) * (la_weight[la] if la_weight else 1.0) for la in la_list), 4)
        for s in sectors
    }

def gas_totals_for(detail_map, y, la_list, la_weight):
    return {
        g: round(sum(detail_map[y][la].get(g, 0.0) * (la_weight[la] if la_weight else 1.0) for la in la_list), 4)
        for g in GASES
    }

def build_region(name, la_list, la_weight=None):
    r = {"name": name, "las": la_list, "years": {}}
    for y in years:
        pop = sum(population[y][la] * (la_weight[la] if la_weight else 1.0) for la in la_list if la in population[y])
        sector_totals = sector_totals_for(detail, y, la_list, la_weight)
        sector_totals_gwp20 = sector_totals_for(detail_gwp20, y, la_list, la_weight)
        gas_totals = gas_totals_for(detail_gas, y, la_list, la_weight)
        gas_totals_gwp20 = gas_totals_for(detail_gas_gwp20, y, la_list, la_weight)
        total = round(sum(sector_totals.values()), 4)
        total_gwp20 = round(sum(sector_totals_gwp20.values()), 4)
        r["years"][y] = {
            "total_kt_co2e": total,
            "population_thousands": round(pop, 3),
            "per_capita_t_co2e": round((total * 1000) / (pop * 1000), 4) if pop else None,
            "sectors_kt_co2e": sector_totals,
            "gases_kt_co2e": gas_totals,
            "gwp20": {
                "total_kt_co2e": total_gwp20,
                "per_capita_t_co2e": round((total_gwp20 * 1000) / (pop * 1000), 4) if pop else None,
                "sectors_kt_co2e": sector_totals_gwp20,
                "gases_kt_co2e": gas_totals_gwp20
            }
        }
    return r

out["regions"]["winchester"] = build_region("Winchester", ["Winchester"])
out["regions"]["mid-hampshire"] = build_region("Mid-Hampshire (proposed)", MID_HAMPSHIRE_LAS, MID_HAMPSHIRE_RETAINED_FRACTION)
out["regions"]["hampshire-solent"] = build_region("Hampshire and the Solent", HAMPSHIRE_SOLENT_LAS)

latest = years[-1]
def subsector_detail(detail_map, la_list, year, la_weight=None):
    agg = defaultdict(lambda: defaultdict(float))
    for la in la_list:
        w = la_weight[la] if la_weight else 1.0
        for sector, subs in detail_map[year][la].items():
            for sub, v in subs.items():
                agg[sector][sub] += v * w
    return {s: {k: round(v, 4) for k, v in subs.items()} for s, subs in agg.items()}

out["subsector_detail_latest_year"] = {
    "year": latest,
    "winchester": subsector_detail(detail, ["Winchester"], latest),
    "mid-hampshire": subsector_detail(detail, MID_HAMPSHIRE_LAS, latest, MID_HAMPSHIRE_RETAINED_FRACTION),
    "hampshire-solent": subsector_detail(detail, HAMPSHIRE_SOLENT_LAS, latest),
    "gwp20": {
        "winchester": subsector_detail(detail_gwp20, ["Winchester"], latest),
        "mid-hampshire": subsector_detail(detail_gwp20, MID_HAMPSHIRE_LAS, latest, MID_HAMPSHIRE_RETAINED_FRACTION),
        "hampshire-solent": subsector_detail(detail_gwp20, HAMPSHIRE_SOLENT_LAS, latest)
    }
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
print("Hampshire and the Solent latest total:", out["regions"]["hampshire-solent"]["years"][latest]["total_kt_co2e"], "kt CO2e")
