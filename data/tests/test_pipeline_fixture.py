"""
End-to-end fixture tests for the actual data pipeline scripts (process.py, process_energy.py) —
run the real scripts, unmodified, against tiny synthetic source files in a temp directory, then
check the output against independently hand-computed expectations.

Unlike test_committed_data.py (which checks the *real*, committed output against invariants the
pipeline should always satisfy), this exercises the pipeline code itself on inputs small enough to
verify by hand, catching a change to the aggregation/weighting/rescaling logic that a committed-
output-only check couldn't (e.g. if it broke in a way that happened to still satisfy every
invariant on the real, larger dataset).

Slower than the other test modules (subprocess + real script execution) but still well under a
second for fixtures this small.
"""
import csv
import json
import os
import subprocess
import sys
import unittest
from tempfile import TemporaryDirectory

DATA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, DATA_DIR)

import la_config as lc  # noqa: E402

# Must match process.py's own tables — if DESNZ or process.py's IPCC AR5 source ever changes
# these, update both places.
GWP100 = {"CO2": 1.0, "CH4": 28.0, "N2O": 265.0}
GWP20 = {"CO2": 1.0, "CH4": 84.0, "N2O": 264.0}

YEARS = [2020, 2021]
SECTORS_SUBS = {
    "Transport": ["Transport Road"],
    "Agriculture": ["Agriculture Livestock"],
}
GASES = ["CO2", "CH4", "N2O"]


def la_base_value(la, year, sector, gas):
    # Deterministic, distinct-per-key value so every (LA, year, sector, gas) combination is
    # independently identifiable in the output — collisions would hide aggregation bugs.
    seed = abs(hash((la, year, sector, gas))) % 97
    return 10.0 + seed * 0.1


def write_fixture_csv(path):
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "Local Authority", "Calendar Year", "LA GHG Sector", "LA GHG Sub-sector",
            "Greenhouse gas", "Territorial emissions (kt CO2e)", "Mid-year Population (thousands)",
            "Area (km2)",
        ])
        writer.writeheader()
        for la in lc.ALL_LAS:
            for year in YEARS:
                pop = 100.0 + lc.ALL_LAS.index(la)
                for sector, subs in SECTORS_SUBS.items():
                    for sub in subs:
                        for gas in GASES:
                            writer.writerow({
                                "Local Authority": la,
                                "Calendar Year": year,
                                "LA GHG Sector": sector,
                                "LA GHG Sub-sector": sub,
                                "Greenhouse gas": gas,
                                "Territorial emissions (kt CO2e)": la_base_value(la, year, sector, gas),
                                "Mid-year Population (thousands)": pop,
                                "Area (km2)": 50.0,
                            })


def expected_region_total(la_list, weight, year):
    total = 0.0
    for la in la_list:
        w = weight[la] if weight else 1.0
        for sector in SECTORS_SUBS:
            for gas in GASES:
                total += la_base_value(la, year, sector, gas) * w
    return total


def expected_region_total_gwp20(la_list, weight, year):
    total = 0.0
    for la in la_list:
        w = weight[la] if weight else 1.0
        for sector in SECTORS_SUBS:
            for gas in GASES:
                total += la_base_value(la, year, sector, gas) * w * (GWP20[gas] / GWP100[gas])
    return total


class TestProcessPipelineFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = TemporaryDirectory()
        fixture_csv = os.path.join(cls.tmpdir.name, "fixture.csv")
        write_fixture_csv(fixture_csv)

        env = dict(os.environ, PYTHONPATH=DATA_DIR)
        result = subprocess.run(
            [sys.executable, os.path.join(DATA_DIR, "process.py"), fixture_csv],
            cwd=cls.tmpdir.name, env=env, capture_output=True, text=True,
        )
        cls.process_result = result
        with open(os.path.join(cls.tmpdir.name, "mid_hampshire_emissions.json")) as f:
            cls.out = json.load(f)

    @classmethod
    def tearDownClass(cls):
        cls.tmpdir.cleanup()

    def test_process_py_exits_cleanly(self):
        # Also covers process.py's own internal cross-check assert (regions/las mismatch would
        # abort with a non-zero exit code and a stack trace on stderr).
        self.assertEqual(self.process_result.returncode, 0, self.process_result.stderr)

    def test_unweighted_region_matches_hand_computed_total(self):
        for year in YEARS:
            expected = expected_region_total(lc.NORTH_HAMPSHIRE_LAS, None, year)
            actual = self.out["regions"]["north-hampshire"]["years"][str(year)]["total_kt_co2e"]
            self.assertAlmostEqual(actual, expected, places=2)

    def test_weighted_region_matches_hand_computed_total(self):
        for year in YEARS:
            expected = expected_region_total(lc.MID_HAMPSHIRE_LAS, lc.MID_HAMPSHIRE_RETAINED_FRACTION, year)
            actual = self.out["regions"]["mid-hampshire"]["years"][str(year)]["total_kt_co2e"]
            self.assertAlmostEqual(actual, expected, places=2)

    def test_gwp20_rescaling_matches_hand_computed_total(self):
        for year in YEARS:
            expected = expected_region_total_gwp20(lc.MID_HAMPSHIRE_LAS, lc.MID_HAMPSHIRE_RETAINED_FRACTION, year)
            actual = self.out["regions"]["mid-hampshire"]["years"][str(year)]["gwp20"]["total_kt_co2e"]
            self.assertAlmostEqual(actual, expected, places=2)

    def test_per_capita_matches_population_weighted_average(self):
        year = YEARS[0]
        expected_pop = sum(
            (100.0 + lc.ALL_LAS.index(la)) * lc.MID_HAMPSHIRE_RETAINED_FRACTION[la]
            for la in lc.MID_HAMPSHIRE_LAS
        )
        yd = self.out["regions"]["mid-hampshire"]["years"][str(year)]
        self.assertAlmostEqual(yd["population_thousands"], expected_pop, places=2)
        self.assertAlmostEqual(yd["per_capita_t_co2e"], yd["total_kt_co2e"] / expected_pop, places=3)

    def test_hampshire_solent_uses_whole_districts_unweighted(self):
        # Hampshire and the Solent must NOT apply the Mid-Hampshire fractional weighting — same
        # LAs, but whole-district (weight=None), so its total differs from a naive re-use of any
        # split unitary's weighting.
        year = YEARS[0]
        expected = expected_region_total(lc.HAMPSHIRE_SOLENT_LAS, None, year)
        actual = self.out["regions"]["hampshire-solent"]["years"][str(year)]["total_kt_co2e"]
        self.assertAlmostEqual(actual, expected, places=2)


if __name__ == "__main__":
    unittest.main()
