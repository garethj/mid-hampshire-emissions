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
# boundary. No official sub-district data exists for any dataset used across this repo, so each
# district's contribution to Mid-Hampshire is scaled down by this fraction as the best available
# proxy — applied uniformly across all years, since only a single Census snapshot is available,
# not a time series.
MID_HAMPSHIRE_RETAINED_FRACTION = {
    la: 1 - sum(parishes.values()) / DISTRICT_POPULATION_2021[la]
    for la, parishes in MOVING_PARISHES.items()
}
# Complement of the retained fraction above: the population share of each split district that
# moves to South-East/South-West Hampshire (see MOVING_PARISHES) rather than staying in
# Mid-Hampshire — same proxy, used to weight that district's contribution into whichever new
# unitary its moving parishes join.
MOVED_FRACTION = {la: 1 - frac for la, frac in MID_HAMPSHIRE_RETAINED_FRACTION.items()}

# The other three new unitaries created by the same 25 March 2026 decision (SI TBC), alongside
# Mid-Hampshire above. Isle of Wight is unaffected by this decision and stays a standalone
# unitary. Portsmouth and Southampton, notably, do NOT remain standalone — they're absorbed into
# South-East and South-West Hampshire respectively. Sourced/cross-checked against two independent
# accounts of the decision (Winchester Action on Climate Crisis and Hart District Council), both
# consistent with each other and with the moving-parish destinations already recorded above:
# https://www.winacc.org.uk/new-unitary-councils-in-hampshire-and-the-solent/
# https://www.hart.gov.uk/local-government-reorganisation/what-happening-across-hampshire
# No parish-level boundary changes affect these three districts, so North Hampshire needs no
# population weighting at all.
NORTH_HAMPSHIRE_LAS = ["Basingstoke and Deane", "Hart", "Rushmoor"]

# South-East and South-West Hampshire each combine whole districts (Fareham/Gosport/Havant/
# Portsmouth; Eastleigh/Southampton) with the moving-parish fraction of a Mid-Hampshire district
# (East Hampshire/Winchester; New Forest/Test Valley) — see MOVING_PARISHES for which parishes.
SOUTH_EAST_HAMPSHIRE_LAS = ["Fareham", "Gosport", "Havant", "Portsmouth", "East Hampshire", "Winchester"]
SOUTH_EAST_HAMPSHIRE_WEIGHT = {
    "Fareham": 1.0, "Gosport": 1.0, "Havant": 1.0, "Portsmouth": 1.0,
    "East Hampshire": MOVED_FRACTION["East Hampshire"], "Winchester": MOVED_FRACTION["Winchester"],
}
SOUTH_WEST_HAMPSHIRE_LAS = ["Eastleigh", "Southampton", "New Forest", "Test Valley"]
SOUTH_WEST_HAMPSHIRE_WEIGHT = {
    "Eastleigh": 1.0, "Southampton": 1.0,
    "New Forest": MOVED_FRACTION["New Forest"], "Test Valley": MOVED_FRACTION["Test Valley"],
}

# Single source of truth for every region this site builds — both process.py and
# process_energy.py loop over this instead of each hardcoding their own region list. Two
# different notions of "parent" are both present here and shouldn't be conflated: `las`/`weight`
# say which local authorities (and what population-weighted share of each) sum into a region's
# own figures; `parent` instead says which single region this one rolls up to for the app's UI
# hierarchy (the dropdown grouping and the "compare in context" chart's ancestor chain) — e.g.
# East Hampshire's `parent` is Mid-Hampshire (where it lives 100% for hierarchy purposes), even
# though a small population slice of it also feeds South-East Hampshire's `weight` above.
# Standalone historic-district/current-unitary regions always use the whole current-day district
# (weight None) — they represent the area as it exists today, not an LGR-adjusted fragment.
REGION_DEFS = [
    {"key": "hampshire-solent", "name": "Hampshire and the Solent", "las": HAMPSHIRE_SOLENT_LAS, "weight": None,
     "group": "aggregate", "parent": None},

    {"key": "north-hampshire", "name": "North Hampshire", "las": NORTH_HAMPSHIRE_LAS, "weight": None,
     "group": "proposed-unitary", "parent": "hampshire-solent"},
    {"key": "mid-hampshire", "name": "Mid-Hampshire", "las": MID_HAMPSHIRE_LAS, "weight": MID_HAMPSHIRE_RETAINED_FRACTION,
     "group": "proposed-unitary", "parent": "hampshire-solent"},
    {"key": "south-east-hampshire", "name": "South East Hampshire", "las": SOUTH_EAST_HAMPSHIRE_LAS, "weight": SOUTH_EAST_HAMPSHIRE_WEIGHT,
     "group": "proposed-unitary", "parent": "hampshire-solent"},
    {"key": "south-west-hampshire", "name": "South West Hampshire", "las": SOUTH_WEST_HAMPSHIRE_LAS, "weight": SOUTH_WEST_HAMPSHIRE_WEIGHT,
     "group": "proposed-unitary", "parent": "hampshire-solent"},

    {"key": "isle-of-wight", "name": "Isle of Wight", "las": ["Isle of Wight"], "weight": None,
     "group": "current-unitary", "parent": "hampshire-solent"},
    {"key": "portsmouth", "name": "Portsmouth", "las": ["Portsmouth"], "weight": None,
     "group": "current-unitary", "parent": "south-east-hampshire"},
    {"key": "southampton", "name": "Southampton", "las": ["Southampton"], "weight": None,
     "group": "current-unitary", "parent": "south-west-hampshire"},

    {"key": "winchester", "name": "Winchester", "las": ["Winchester"], "weight": None,
     "group": "historic-district", "parent": "mid-hampshire"},
    {"key": "east-hampshire", "name": "East Hampshire", "las": ["East Hampshire"], "weight": None,
     "group": "historic-district", "parent": "mid-hampshire"},
    {"key": "new-forest", "name": "New Forest", "las": ["New Forest"], "weight": None,
     "group": "historic-district", "parent": "mid-hampshire"},
    {"key": "test-valley", "name": "Test Valley", "las": ["Test Valley"], "weight": None,
     "group": "historic-district", "parent": "mid-hampshire"},

    {"key": "basingstoke-and-deane", "name": "Basingstoke and Deane", "las": ["Basingstoke and Deane"], "weight": None,
     "group": "historic-district", "parent": "north-hampshire"},
    {"key": "hart", "name": "Hart", "las": ["Hart"], "weight": None,
     "group": "historic-district", "parent": "north-hampshire"},
    {"key": "rushmoor", "name": "Rushmoor", "las": ["Rushmoor"], "weight": None,
     "group": "historic-district", "parent": "north-hampshire"},

    {"key": "fareham", "name": "Fareham", "las": ["Fareham"], "weight": None,
     "group": "historic-district", "parent": "south-east-hampshire"},
    {"key": "gosport", "name": "Gosport", "las": ["Gosport"], "weight": None,
     "group": "historic-district", "parent": "south-east-hampshire"},
    {"key": "havant", "name": "Havant", "las": ["Havant"], "weight": None,
     "group": "historic-district", "parent": "south-east-hampshire"},

    {"key": "eastleigh", "name": "Eastleigh", "las": ["Eastleigh"], "weight": None,
     "group": "historic-district", "parent": "south-west-hampshire"},
]
