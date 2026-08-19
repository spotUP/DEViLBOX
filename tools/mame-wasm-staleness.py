#!/usr/bin/env python3
"""Fail when a MAME chip's sources changed but its committed wasm did not.

Nothing in `npm run build` compiles mame-wasm/, so the artifacts in public/mame are
hand-built and committed. Two of them (TMS5220, Votrax) shipped for months built from
sources that had since moved on — the TMS5220 one ran 2x hot and clipped every word.

A byte-for-byte rebuild check is not usable here: emcc -O3 output is not reproducible
across toolchain versions, so it would fail on every emsdk bump. This checks the thing
that actually went wrong instead — a source edit that never reached the artifact.

Usage: mame-wasm-staleness.py <base-ref> <head-ref>
       mame-wasm-staleness.py --files <path> [<path> ...]   (check a given change set)
       mame-wasm-staleness.py --list                        (print the chip -> artifact mapping)
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHIP_ROOT = ROOT / 'mame-wasm'
ARTIFACT_ROOT = ROOT / 'public' / 'mame'
OUTPUT_NAME = re.compile(r'OUTPUT_NAME\s+"([^"]+)"')


def chip_map():
    """Every mame-wasm/<chip>/ directory paired with the artifact its CMakeLists names."""
    chips = {}
    for cmakelists in sorted(CHIP_ROOT.glob('*/CMakeLists.txt')):
        match = OUTPUT_NAME.search(cmakelists.read_text(encoding='utf-8'))
        if match:
            chips[cmakelists.parent.name] = match.group(1)
    return chips


def changed_files(base, head):
    out = subprocess.run(['git', 'diff', '--name-only', base, head],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    return set(out.stdout.split())


def main():
    chips = chip_map()
    if not chips:
        print('No chip directories found — check the mame-wasm layout.', file=sys.stderr)
        return 1

    if len(sys.argv) == 2 and sys.argv[1] == '--list':
        for directory, artifact in chips.items():
            print(f'{directory}\t{artifact}')
        return 0

    if len(sys.argv) >= 2 and sys.argv[1] == '--files':
        # No paths means no change set: only the artifact inventory is checked.
        changed = set(sys.argv[2:])
    elif len(sys.argv) == 3:
        changed = changed_files(sys.argv[1], sys.argv[2])
    else:
        print(__doc__, file=sys.stderr)
        return 2

    # A chip is wired into the app once its hand-written worklet glue is committed;
    # from then on the loader fetches public/mame/<name>.wasm and a missing one is a 404.
    wired = {d: a for d, a in chips.items() if (ARTIFACT_ROOT / f'{a}.worklet.js').exists()}
    missing = [(d, a) for d, a in wired.items() if not (ARTIFACT_ROOT / f'{a}.wasm').exists()]
    for directory, artifact in missing:
        print(f'::error::mame-wasm/{directory} is wired into the app ({artifact}.worklet.js is '
              f'committed) but public/mame/{artifact}.wasm is not — the chip would 404 at runtime.')

    for directory, artifact in chips.items():
        if directory not in wired:
            print(f'::notice::mame-wasm/{directory} builds {artifact}.wasm but has no committed '
                  f'{artifact}.worklet.js, so nothing in the app can load it.')

    stale = []
    for directory, artifact in chips.items():
        prefix = f'mame-wasm/{directory}/'
        # build/ holds local CMake output, not sources. CMakeLists.txt counts: its link
        # flags (-O3, INITIAL_MEMORY, exports) are baked into the artifact.
        sources = [f for f in changed if f.startswith(prefix) and '/build/' not in f]
        if not sources:
            continue
        if f'public/mame/{artifact}.wasm' not in changed:
            stale.append((directory, artifact, sorted(sources)))

    for directory, artifact, sources in stale:
        print(f'::error::{directory} sources changed but public/mame/{artifact}.wasm did not:')
        for source in sources:
            print(f'  {source}')
        print(f'  Rebuild: emcmake cmake -S mame-wasm -B mame-wasm/build && '
              f'cmake --build mame-wasm/build --target {directory.upper()}_WASM')
    return 1 if (stale or missing) else 0


if __name__ == '__main__':
    sys.exit(main())
