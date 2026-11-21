"""Regression test for uade_stage.find_companions fixed-name companions (commit 544568391).

Run: python3 third-party/amiga-adf/tools/test_uade_stage.py
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import uade_stage  # noqa: E402
from uade_stage import check_player, find_companions  # noqa: E402


class FixedNameCompanions(unittest.TestCase):
    def stage(self, song, companion):
        d = tempfile.mkdtemp()
        for name in (song, companion, 'unrelated.txt'):
            with open(os.path.join(d, name), 'wb') as f:
                f.write(b'\x00' * 64)
        return [os.path.basename(p) for p in find_companions(os.path.join(d, song))]

    def test_kris_hatlelid_stages_songplay(self):
        got = self.stage('tune.kh', 'songplay')
        self.assertIn('songplay', got)
        self.assertNotIn('unrelated.txt', got)

    def test_wanted_team_stages_bin(self):
        self.assertIn('WantedTeam.bin', self.stage('tune.jo', 'WantedTeam.bin'))

    def test_other_extension_ignores_songplay(self):
        self.assertNotIn('songplay', self.stage('tune.mod', 'songplay'))


class CustomPlayerCheck(unittest.TestCase):
    """uade123 names a custom module itself as its player; that is not a mismatch."""
    def check(self, oracle, player):
        real = uade_stage.uade_lookup.cross_check
        uade_stage.uade_lookup.cross_check = lambda m, p: oracle
        try:
            check_player('/x/skyfox2.cus', player, None, 'skyfox2.cus')
        finally:
            uade_stage.uade_lookup.cross_check = real

    def test_custom_module_named_as_player_passes(self):
        self.check('skyfox2.cus', 'custom')

    def test_real_mismatch_still_fails(self):
        with self.assertRaises(SystemExit):
            self.check('ProTracker', 'custom')


class MeasuredArenaRows(unittest.TestCase):

    def test_musicmaker_8v_any_pool_holds_pins_buffer(self):
        # house2.mm8 asks 106021 B MEMF_ANY; the 64K default died with "AllocMem past end of pool".
        import uade_arena_table
        row = uade_arena_table.load().get('MusicMaker-8V')
        self.assertIsNotNone(row)
        self.assertGreaterEqual(row['any_hw'], 106021)
        self.assertGreater(row['chip_hw'], 0)


if __name__ == '__main__':
    unittest.main()
