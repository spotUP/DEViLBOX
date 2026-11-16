#!/bin/sh
# Builds the ZX Spectrum 128K beeper player public/zx/beeper.bin + beeper.json from public/zx/beeper.asm.
# Needs sjasmplus (https://github.com/z00m128/sjasmplus). Queue it:
#   ~/.claude/bin/buildq --purpose "..." -- tools/build-zx-beeper.sh
# beeper.json carries the addresses and loop timings src/lib/export/zx/zxBeeperData.ts checks against its constants.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
cd "$ROOT/public/zx"
sjasmplus --nologo --msg=war --raw="$W/beeper.bin" --sym="$W/beeper.sym" beeper.asm
cp "$W/beeper.bin" beeper.bin
python3 - "$W/beeper.sym" beeper.bin beeper.json <<'PY'
import json, os, re, sys
sym = {}
for line in open(sys.argv[1]):
    m = re.match(r'^(\w+):\s+EQU\s+0x([0-9A-Fa-f]+)', line)
    if m: sym[m.group(1)] = int(m.group(2), 16)
size = os.path.getsize(sys.argv[2])
load = 0x8000
assert sym['drumdata'] - load == size, (sym['drumdata'], size)
meta = {
    'loadAddress': load, 'entry': sym['entry'], 'size': size, 'dataOffset': size,
    'maxDrumBytes': 0xC000 - load - size, 'dataAddress': 0xC000, 'bankSize': 16384, 'usableBanks': [0, 1, 3, 4, 6, 7],
    'iterT': sym['ITER_T'], 'drumByteT': sym['DRUM_BYTE_T'], 'clock': 3546900,
}
json.dump(meta, open(sys.argv[3], 'w'), indent=1)
open(sys.argv[3], 'a').write('\n')
print(meta)
PY
