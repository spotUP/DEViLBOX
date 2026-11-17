#!/bin/sh
# Builds public/zx/pt3player.bin + pt3player.json (PT3 player for the ZX Spectrum 128) from public/zx/pt3player.asm.
# Needs sjasmplus. Queue it: ~/.claude/bin/buildq --purpose "..." -- tools/build-zx-pt3.sh
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
cd "$ROOT/public/zx"
sjasmplus --nologo --msg=err --raw="$W/p.bin" --sym="$W/p.sym" pt3player.asm
cp "$W/p.bin" pt3player.bin
python3 - "$W/p.sym" pt3player.bin pt3player.json <<'PY'
import json, os, re, sys
sym = {}
for line in open(sys.argv[1]):
    m = re.match(r'^(\w+):\s+EQU\s+0x([0-9A-Fa-f]+)', line)
    if m: sym[m.group(1)] = int(m.group(2), 16)
load = 0x8000
json.dump({'loadAddress': load, 'entry': load, 'size': os.path.getsize(sys.argv[2]), 'bankOffset': sym['BANK'] - load,
           'dataAddress': 0xC000, 'bankSize': 16384, 'usableBanks': [0, 1, 3, 4, 6, 7], 'setupAddress': sym['START'] + 10,
           'vars': sym['VARS'], 'varsEnd': sym['VARSEND']}, open(sys.argv[3], 'w'), indent=1)
PY
