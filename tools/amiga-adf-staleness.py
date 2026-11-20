#!/usr/bin/env python3
"""Fail when a published Amiga ADF template no longer matches what it is built from.

public/amiga-adf/<player>.adf is built offline by third-party/amiga-adf/build_adf.py --publish
and committed; nothing in `npm run build` makes it. manifest.json records the sha256 of each
ADF and of its sources (the build tool tree + UADE score includes, and the player binary).
This recomputes both and lists every template that is stale.
Usage: amiga-adf-staleness.py
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'third-party' / 'amiga-adf'))
import build_adf  # noqa: E402

PUB = ROOT / 'public' / 'amiga-adf'


def main():
    man = json.loads((PUB / 'manifest.json').read_text())
    stale = []
    for player, t in man['templates'].items():
        adf = PUB / t['adf']
        if not adf.exists() or hashlib.sha256(adf.read_bytes()).hexdigest() != t['adfSha256']:
            stale.append(f'{player}: {t["adf"]} missing or differs from manifest adfSha256')
        now = build_adf.source_hashes(player)
        for k, v in now.items():
            if t['sources'].get(k) != v:
                stale.append(f'{player}: {k} sources changed since the template was built')
    for line in stale:
        print(line, file=sys.stderr)
    if stale:
        print('rebuild with build_adf.py --publish public/amiga-adf (and re-prove on the target)', file=sys.stderr)
        return 1
    print(f'[OK] {len(man["templates"])} ADF templates up to date')
    return 0


sys.exit(main())
