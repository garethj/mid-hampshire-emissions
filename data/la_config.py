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
