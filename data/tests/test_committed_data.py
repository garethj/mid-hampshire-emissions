"""
Validates the *committed* data/mid_hampshire_emissions.json and data/mid_hampshire_energy.json
against the invariants their own build logic (process.py / process_energy.py) guarantees by
construction. This is the primary pre-commit gate: it runs directly against whatever is about to
be committed, needs no raw source data (the 85MB CSV / xlsx files are gitignored and usually
absent), and takes well under a second.

A failure here means one of:
  - the committed JSON is stale/hand-edited and no longer matches what process.py would produce
  - process.py / process_energy.py was changed in a way that breaks one of its own invariants
  - la_config.py's REGION_DEFS was edited inconsistently (bad parent/weight/las)
"""
import json
import math
import os
import unittest

DATA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(DATA_DIR, "mid_hampshire_emissions.json")) as f:
    EMISSIONS = json.load(f)

with open(os.path.join(DATA_DIR, "mid_hampshire_energy.json")) as f:
    ENERGY = json.load(f)

YEARS = [str(y) for y in EMISSIONS["meta"]["years"]]
SECTORS = EMISSIONS["meta"]["sectors"]
GASES = EMISSIONS["meta"]["gases"]
REGION_INDEX = EMISSIONS["meta"]["region_index"]
REGION_KEYS = [r["key"] for r in REGION_INDEX]
GWP100 = EMISSIONS["meta"]["gwp100_factors"]
GWP20 = EMISSIONS["meta"]["gwp20_factors"]


def assertClose(test, a, b, tol, msg):
    test.assertLessEqual(abs(a - b), tol, msg + f" (got {a}, expected ~{b}, diff {abs(a - b)})")


class TestEmissionsShape(unittest.TestCase):
    def test_region_index_matches_regions(self):
        self.assertEqual(set(REGION_KEYS), set(EMISSIONS["regions"].keys()))

    def test_every_region_has_every_year(self):
        for key in REGION_KEYS:
            years_present = set(EMISSIONS["regions"][key]["years"].keys())
            self.assertEqual(years_present, set(YEARS), f"{key} is missing years")

    def test_years_sorted_and_contiguous(self):
        years = EMISSIONS["meta"]["years"]
        self.assertEqual(years, sorted(years))
        self.assertEqual(years, list(range(years[0], years[-1] + 1)), "gap in year sequence")

    def test_parent_keys_resolve(self):
        for r in REGION_INDEX:
            if r["parent"] is not None:
                self.assertIn(r["parent"], REGION_KEYS, f"{r['key']}'s parent {r['parent']} doesn't exist")

    def test_group_values_known(self):
        allowed = {"aggregate", "proposed-unitary", "current-unitary", "historic-district"}
        for r in REGION_INDEX:
            self.assertIn(r["group"], allowed)

    def test_gwp20_ratio_matches_gwp100_over_gwp100(self):
        # GWP20 factors must be the ones documented (CH4 3x GWP100's, N2O actually *lower*, CO2 flat)
        self.assertEqual(GWP100["CO2"], 1.0)
        self.assertEqual(GWP20["CO2"], 1.0)
        self.assertGreater(GWP20["CH4"], GWP100["CH4"])
        self.assertLess(GWP20["N2O"], GWP100["N2O"])


class TestEmissionsInvariants(unittest.TestCase):
    """Per region/year/horizon arithmetic that process.py's build_region() guarantees."""

    def iter_year_data(self):
        for key in REGION_KEYS:
            for year in YEARS:
                yd = EMISSIONS["regions"][key]["years"][year]
                yield key, year, "gwp100", yd
                yield key, year, "gwp20", dict(yd, **yd["gwp20"])

    def test_sectors_sum_to_total(self):
        for key, year, horizon, yd in self.iter_year_data():
            total = sum(yd["sectors_kt_co2e"].values())
            assertClose(self, total, yd["total_kt_co2e"], 0.05,
                        f"{key} {year} ({horizon}): sectors don't sum to total")

    def test_gases_sum_to_total(self):
        for key, year, horizon, yd in self.iter_year_data():
            total = sum(yd["gases_kt_co2e"].values())
            assertClose(self, total, yd["total_kt_co2e"], 0.05,
                        f"{key} {year} ({horizon}): gases don't sum to total")

    def test_per_capita_matches_total_over_population(self):
        for key, year, horizon, yd in self.iter_year_data():
            pop = yd["population_thousands"]
            if not pop:
                continue
            expected = yd["total_kt_co2e"] / pop
            assertClose(self, yd["per_capita_t_co2e"], expected, max(0.01, expected * 0.001),
                        f"{key} {year} ({horizon}): per-capita doesn't match total/population")

    def test_only_lulucf_can_be_negative(self):
        for key, year, horizon, yd in self.iter_year_data():
            for sector, value in yd["sectors_kt_co2e"].items():
                if sector == "LULUCF":
                    continue
                self.assertGreaterEqual(value, -0.01,
                                         f"{key} {year} ({horizon}): {sector} is negative ({value})")

    def test_gwp20_gas_rescaling_is_exact_per_gas(self):
        # Sector totals can't be checked this way (they mix gases), but each gas's own gwp20
        # figure must be its gwp100 figure times that gas's fixed GWP20/GWP100 ratio.
        for key in REGION_KEYS:
            for year in YEARS:
                yd = EMISSIONS["regions"][key]["years"][year]
                for gas in GASES:
                    g100 = yd["gases_kt_co2e"][gas]
                    g20 = yd["gwp20"]["gases_kt_co2e"][gas]
                    expected = g100 * GWP20[gas] / GWP100[gas]
                    assertClose(self, g20, expected, max(0.02, abs(expected) * 0.002),
                                f"{key} {year}: {gas} gwp20 doesn't match gwp100 * GWP20/GWP100 ratio")

    def test_subsector_detail_sums_to_sector_total_latest_year(self):
        latest = str(EMISSIONS["subsector_detail_latest_year"]["year"])
        for key in REGION_KEYS:
            detail = EMISSIONS["subsector_detail_latest_year"][key]
            yd = EMISSIONS["regions"][key]["years"][latest]
            for sector, subs in detail.items():
                assertClose(self, sum(subs.values()), yd["sectors_kt_co2e"][sector], 0.05,
                            f"{key} {sector}: sub-sectors don't sum to sector total")

    def test_gwp20_subsector_detail_sums_to_sector_total(self):
        latest = str(EMISSIONS["subsector_detail_latest_year"]["year"])
        for key in REGION_KEYS:
            detail = EMISSIONS["subsector_detail_latest_year"]["gwp20"][key]
            yd = EMISSIONS["regions"][key]["years"][latest]
            for sector, subs in detail.items():
                assertClose(self, sum(subs.values()), yd["gwp20"]["sectors_kt_co2e"][sector], 0.05,
                            f"{key} {sector} (gwp20): sub-sectors don't sum to sector total")


class TestEmissionsHierarchy(unittest.TestCase):
    """The four proposed unitaries + Isle of Wight are built from the same 14 LAs as Hampshire
    and the Solent, just regrouped — every year, both horizons, they must sum to the same total.
    process.py only asserts this at the latest year, at build time; this repeats it for every
    year against the committed file, so a stale/hand-edited JSON is caught too."""

    SPLIT_KEYS = ["north-hampshire", "mid-hampshire", "south-east-hampshire", "south-west-hampshire", "isle-of-wight"]

    def test_split_unitaries_sum_to_hampshire_solent(self):
        for year in YEARS:
            for horizon in ("gwp100", "gwp20"):
                def total_of(key):
                    yd = EMISSIONS["regions"][key]["years"][year]
                    return yd["gwp20"]["total_kt_co2e"] if horizon == "gwp20" else yd["total_kt_co2e"]

                split_total = sum(total_of(k) for k in self.SPLIT_KEYS)
                solent_total = total_of("hampshire-solent")
                assertClose(self, split_total, solent_total, 1.0,
                            f"{year} ({horizon}): split unitaries don't sum to Hampshire and the Solent")

    def test_unweighted_historic_districts_sum_to_their_unitary(self):
        # Only valid for unitaries with weight=None in REGION_DEFS (no fractional districts):
        # North Hampshire's three constituent districts are used whole, so they must sum exactly.
        children = {"basingstoke-and-deane", "hart", "rushmoor"}
        for year in YEARS:
            child_total = sum(EMISSIONS["regions"][c]["years"][year]["total_kt_co2e"] for c in children)
            parent_total = EMISSIONS["regions"]["north-hampshire"]["years"][year]["total_kt_co2e"]
            assertClose(self, child_total, parent_total, 0.5,
                        f"{year}: Basingstoke+Hart+Rushmoor don't sum to North Hampshire")


class TestEnergyShape(unittest.TestCase):
    def test_region_keys_match_emissions(self):
        self.assertEqual(set(ENERGY["regions"].keys()), set(REGION_KEYS))

    def test_generation_years_sorted(self):
        years = ENERGY["meta"]["generation_years"]
        self.assertEqual(years, sorted(years))

    def test_consumption_years_sorted(self):
        years = ENERGY["meta"]["consumption_years"]
        self.assertEqual(years, sorted(years))

    def test_dukes_electricity_mix_covers_consumption_years(self):
        # Not every DUKES year needs a matching consumption year (DUKES 6.5a goes back to 1996,
        # consumption only to 2005) — but every consumption year needs a DUKES figure, since the
        # consumption chart splits each year's own Electricity ktoe by that year's DUKES share
        # (see electricityFuelSplitKtoe in app.js, which falls back to treating a missing year as
        # entirely non-renewable rather than assume an unevidenced green share).
        mix_years = set(int(y) for y in ENERGY["meta"]["dukes_electricity_mix"].keys())
        for year in ENERGY["meta"]["consumption_years"]:
            self.assertIn(year, mix_years, f"DUKES electricity mix is missing consumption year {year}")


class TestEnergyInvariants(unittest.TestCase):
    def test_technology_groups_sum_to_total_generation(self):
        for key, r in ENERGY["regions"].items():
            for year, g in r["generation"].items():
                total = sum(g["by_technology_mwh"].values())
                assertClose(self, total, g["total_mwh"], 0.5,
                            f"{key} {year}: technology groups don't sum to total_mwh")

    def test_fuel_categories_approx_sum_to_all_fuels(self):
        # Not exact (DESNZ's own "All fuels: Total" column doesn't tie perfectly to the sum of
        # the six published fuel categories, off by a few hundredths of a ktoe even in the source
        # data) — loose relative tolerance, tight enough to catch a missing/duplicated category.
        for key, r in ENERGY["regions"].items():
            for year, c in r["consumption"].items():
                total = sum(c["fuels_ktoe"].values())
                if c["all_fuels_ktoe"]:
                    rel = abs(total - c["all_fuels_ktoe"]) / c["all_fuels_ktoe"]
                    self.assertLess(rel, 0.01,
                                     f"{key} {year}: fuel categories sum ({total}) vs "
                                     f"all_fuels_ktoe ({c['all_fuels_ktoe']}) differ by {rel:.2%}")

    def test_sector_categories_approx_sum_to_all_fuels(self):
        # Same loose tolerance as test_fuel_categories_approx_sum_to_all_fuels above — this is
        # DESNZ's other published split of the same "All fuels: Total" figure (Domestic /
        # Transport / Industrial, Commercial and other instead of by fuel type), so it should tie
        # out the same way.
        for key, r in ENERGY["regions"].items():
            for year, c in r["consumption"].items():
                total = sum(c["sector_ktoe"].values())
                if c["all_fuels_ktoe"]:
                    rel = abs(total - c["all_fuels_ktoe"]) / c["all_fuels_ktoe"]
                    self.assertLess(rel, 0.01,
                                     f"{key} {year}: sector categories sum ({total}) vs "
                                     f"all_fuels_ktoe ({c['all_fuels_ktoe']}) differ by {rel:.2%}")

    def test_dukes_electricity_mix_green_and_fossil_pct_sum_to_100(self):
        for year, entry in ENERGY["meta"]["dukes_electricity_mix"].items():
            assertClose(self, entry["greenPct"] + entry["fossilPct"], 100.0, 0.01,
                        f"DUKES {year}: greenPct + fossilPct should sum to 100")
            self.assertGreaterEqual(entry["greenPct"], 0)
            self.assertLessEqual(entry["greenPct"], 100)

    def test_electricity_consumption_matches_ktoe_conversion(self):
        KTOE_TO_MWH = 11630.0
        for key, r in ENERGY["regions"].items():
            for year, c in r["consumption"].items():
                expected = c["fuels_ktoe"]["Electricity"] * KTOE_TO_MWH
                assertClose(self, c["electricity_consumption_mwh"], expected, max(1.0, expected * 0.001),
                            f"{key} {year}: electricity_consumption_mwh doesn't match ktoe*11630")

    def test_split_unitaries_sum_to_hampshire_solent_generation(self):
        split_keys = ["north-hampshire", "mid-hampshire", "south-east-hampshire", "south-west-hampshire", "isle-of-wight"]
        for year in ENERGY["meta"]["generation_years"]:
            year = str(year)
            regions = ENERGY["regions"]
            if not all(year in regions[k]["generation"] for k in split_keys + ["hampshire-solent"]):
                continue
            split_total = sum(regions[k]["generation"][year]["total_mwh"] for k in split_keys)
            solent_total = regions["hampshire-solent"]["generation"][year]["total_mwh"]
            assertClose(self, split_total, solent_total, 5.0,
                        f"{year}: split unitaries' generation doesn't sum to Hampshire and the Solent")


if __name__ == "__main__":
    unittest.main()
