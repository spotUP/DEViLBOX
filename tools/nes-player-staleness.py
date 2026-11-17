#!/usr/bin/env python3
"""Fail when the NES player sources changed but the committed public/nes/player.bin did not.

Nothing in `npm run build` assembles public/nes/player.s, so player.bin is hand-built and committed.
Usage: nes-player-staleness.py <base-ref> <head-ref>
       nes-player-staleness.py --files <path> [<path> ...]
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {'public/nes/player.s', 'public/nes/nes.cfg', 'public/nes/screen.chr', 'tools/build-nes-player.sh'}
ARTIFACTS = {'public/nes/player.bin', 'public/nes/player.json'}


def main():
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == '--files':
        changed = set(a[1:])
    elif len(a) == 2:
        out = subprocess.run(['git', 'diff', '--name-only', a[0], a[1]], cwd=ROOT, capture_output=True, text=True, check=True)
        changed = set(out.stdout.split())
    else:
        print(__doc__, file=sys.stderr)
        return 2
    if changed & SOURCES and not ARTIFACTS <= changed:
        print('NES player sources changed without a rebuilt player.bin/player.json: run tools/build-nes-player.sh', file=sys.stderr)
        return 1
    return 0


sys.exit(main())
