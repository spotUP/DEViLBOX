#!/usr/bin/env python3
"""Turn a format sweep into the measured arena table the build sizes from.

tools/uade_stage.py used one pair of numbers for every format -- 64 KB chip
pool, 448 KB MEMF_ANY -- taken from the AHX pilot. Measured on device across 31
formats, that is wrong in both directions at once:

  * TWENTY-SEVEN of 31 allocate NO MEMF_ANY AT ALL. AHX is the only format that
    wants the 412 KB the default was sized for (MusiclineEditor wants 31 KB,
    MugicianII and TFMX-Pro want 264 bytes). On a machine with no fast RAM that
    448 KB arena is the whole reason a uade demo does not fit, so carrying it
    for a SidMon tune costs the demo its target.
  * QuadraComposer's chip high-water is 1.77 MB and PreTracker's is 329 KB --
    both far past the 64 KB pool. They played anyway because the pool is only
    the tail of the chip arena, but nothing was checking.

So the sizes come from measurement, per player. This script reads a sweep TSV
(tools/uade_format_sweep.py --out) and writes amiga/uade_arena_sizes.tsv.

What is stored is the POOL's own high-water, measured, not the chip arena's.
The arena also holds the relocated player and the module, and the module is
page-aligned with a round-DOWN, so the pool's base cannot be reconstructed from
the arena base and the sizes -- an attempt to do exactly that produced a
NEGATIVE pool for SIDMon1.0. The sweep reads score's own pool base instead
(chippoint = (mod_base + module + 1024) & ~$FF, published via _uade_mod_base)
and subtracts, so the number here needs no arithmetic to use.

The table is keyed by PLAYER, because a player outlives any one tune. The
module it was measured with is recorded for provenance only.

    python3 tools/uade_arena_table.py [--sweep TSV] [--out TSV]
"""
import argparse
import csv
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

DEFAULT_SWEEP = os.path.join(ROOT, 'out', 'uade_sweep_arena.tsv')
DEFAULT_OUT = os.path.join(ROOT, 'amiga', 'uade_arena_sizes.tsv')
CORPUS = os.path.join(ROOT, 'Data', 'Music', 'uade-songs')

HEADER = "player\tpool_hw\tany_hw\tchip_hw\tcpu\tmodule\n"


def load(path=DEFAULT_OUT):
    """player -> {'pool_hw','any_hw','chip_hw','module'}.

    {} when the table is absent, and a malformed row is skipped rather than
    raised: an unmeasured player falls back to the stager's defaults, which is
    a size decision, not a reason to fail somebody's build.
    """
    out = {}
    if not os.path.exists(path):
        return out
    for r in csv.DictReader(open(path), delimiter='\t'):
        try:
            row = {k: int(r[k]) for k in ('pool_hw', 'any_hw', 'chip_hw')}
        except (KeyError, ValueError, TypeError):
            continue
        row['module'] = r.get('module', '')
        out[r['player']] = row
    return out


def find_by_name(basename):
    if not basename or not os.path.isdir(CORPUS):
        return None
    for cur, _d, files in os.walk(CORPUS):
        if basename in files:
            return os.path.join(cur, basename)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sweep', default=DEFAULT_SWEEP)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--merge', action='store_true',
                    help='keep rows already in --out that this sweep did not '
                         'remeasure, instead of dropping them')
    args = ap.parse_args()

    rows = {} if not args.merge else {
        p: dict(v, cpu='') for p, v in load(args.out).items()}
    kept = 0
    for r in csv.DictReader(open(args.sweep), delimiter='\t'):
        if r.get('result') != 'PLAYS':
            continue
        try:
            pool, any_, chip = (int(r['pool_hw']), int(r['any_hw']),
                                int(r['chip_hw']))
        except (KeyError, ValueError, TypeError):
            continue
        if chip <= 0:
            # chip_hw is 0 only when the locator read failed outright, and a
            # row built from a failed read would size the arenas to nothing.
            # pool_hw of 0 is NOT that: score starts chippoint AT the pool base
            # (chippoint = (mod_base + module + 1024) & ~$FF), so a player that
            # never AllocMem(MEMF_CHIP)s leaves it exactly there and zero is the
            # honest answer. The stager's floor covers those.
            print(f"  skip {r['player']}: PLAYS but the locator read failed")
            continue
        pool = max(pool, 0)
        rows[r['player']] = {
            'pool_hw': pool, 'any_hw': any_, 'chip_hw': chip,
            'cpu': r.get('cpu', ''), 'module': r.get('module', ''),
        }
        kept += 1

    with open(args.out, 'w') as fh:
        fh.write(HEADER)
        for player in sorted(rows):
            v = rows[player]
            fh.write("%s\t%d\t%d\t%d\t%s\t%s\n"
                     % (player, v['pool_hw'], v['any_hw'], v['chip_hw'],
                        v.get('cpu', ''), v.get('module', '')))
    zero_any = sum(1 for v in rows.values() if not v['any_hw'])
    print(f"uade_arena_table: {kept} measured, {len(rows)} rows -> {args.out}"
          f"  ({zero_any} need no MEMF_ANY at all)")


if __name__ == '__main__':
    main()
