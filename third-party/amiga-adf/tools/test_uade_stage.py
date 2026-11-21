"""Regression test for uade_stage.find_companions fixed-name companions (commit 544568391).

Run: python3 third-party/amiga-adf/tools/test_uade_stage.py
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from uade_stage import find_companions  # noqa: E402


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


if __name__ == '__main__':
    unittest.main()
