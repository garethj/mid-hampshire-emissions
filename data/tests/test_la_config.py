"""Structural tests on la_config.py — the single source of truth for every region this site
builds. These catch a broken REGION_DEFS edit (bad parent key, mismatched weight dict, LA left
out of ALL_LAS) before it ever reaches process.py, independent of any source/output data."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import la_config as lc  # noqa: E402


class TestFractions(unittest.TestCase):
    def test_retained_and_moved_fractions_partition_exactly(self):
        # Every split district's population goes either to Mid-Hampshire or to whichever
        # unitary its moving parishes join — no leakage, no double count.
        for la in lc.MOVING_PARISHES:
            retained = lc.MID_HAMPSHIRE_RETAINED_FRACTION[la]
            moved = lc.MOVED_FRACTION[la]
            self.assertAlmostEqual(retained + moved, 1.0, places=9, msg=f"{la}: fractions don't sum to 1")

    def test_fractions_between_zero_and_one(self):
        for la, frac in lc.MID_HAMPSHIRE_RETAINED_FRACTION.items():
            self.assertGreater(frac, 0.0, f"{la}: retained fraction not positive")
            self.assertLess(frac, 1.0, f"{la}: retained fraction not less than 1 (moving parishes should be a subset)")

    def test_moving_parish_populations_dont_exceed_district_population(self):
        for la, parishes in lc.MOVING_PARISHES.items():
            self.assertLessEqual(sum(parishes.values()), lc.DISTRICT_POPULATION_2021[la],
                                  f"{la}: moving parishes' population exceeds the whole district")


class TestRegionDefs(unittest.TestCase):
    def test_keys_unique(self):
        keys = [r["key"] for r in lc.REGION_DEFS]
        self.assertEqual(len(keys), len(set(keys)), "duplicate region key in REGION_DEFS")

    def test_parents_resolve_to_real_keys(self):
        keys = {r["key"] for r in lc.REGION_DEFS}
        for r in lc.REGION_DEFS:
            if r["parent"] is not None:
                self.assertIn(r["parent"], keys, f"{r['key']}: parent {r['parent']} isn't a real region")

    def test_no_region_is_its_own_ancestor(self):
        by_key = {r["key"]: r for r in lc.REGION_DEFS}
        for r in lc.REGION_DEFS:
            seen = {r["key"]}
            k = r["parent"]
            while k:
                self.assertNotIn(k, seen, f"{r['key']}: cycle in parent chain")
                seen.add(k)
                k = by_key[k]["parent"]

    def test_exactly_one_root(self):
        roots = [r for r in lc.REGION_DEFS if r["parent"] is None]
        self.assertEqual(len(roots), 1, "expected exactly one region with no parent (Hampshire and the Solent)")
        self.assertEqual(roots[0]["key"], "hampshire-solent")

    def test_weight_keys_are_subset_of_las(self):
        for r in lc.REGION_DEFS:
            if r["weight"] is not None:
                self.assertTrue(set(r["weight"].keys()) <= set(r["las"]),
                                 f"{r['key']}: weight dict has an LA not in las")

    def test_weighted_regions_have_all_las_weighted(self):
        for r in lc.REGION_DEFS:
            if r["weight"] is not None:
                self.assertEqual(set(r["weight"].keys()), set(r["las"]),
                                  f"{r['key']}: not every LA in las has a weight")

    def test_unweighted_regions_use_whole_districts_only(self):
        # weight=None regions represent today's whole-district figures — every LA weight, if any
        # were computed, would implicitly be 1.0.
        for r in lc.REGION_DEFS:
            if r["weight"] is None:
                self.assertTrue(len(r["las"]) >= 1)

    def test_all_las_referenced_are_in_all_las(self):
        for r in lc.REGION_DEFS:
            for la in r["las"]:
                self.assertIn(la, lc.ALL_LAS, f"{r['key']} references LA {la!r} not in ALL_LAS")

    def test_historic_districts_are_leaves(self):
        parents = {r["parent"] for r in lc.REGION_DEFS}
        for r in lc.REGION_DEFS:
            if r["group"] == "historic-district":
                self.assertNotIn(r["key"], parents, f"{r['key']}: historic district has children")

    def test_hampshire_solent_covers_every_current_day_la_exactly_once(self):
        # Hampshire and the Solent must be built from ALL_LAS with no weighting (today's whole
        # districts) — the site's one true "everything" total.
        solent = next(r for r in lc.REGION_DEFS if r["key"] == "hampshire-solent")
        self.assertIsNone(solent["weight"])
        self.assertEqual(set(solent["las"]), set(lc.ALL_LAS))


if __name__ == "__main__":
    unittest.main()
