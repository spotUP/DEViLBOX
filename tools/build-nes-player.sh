#!/bin/sh
# Builds the NES cartridge player public/nes/player.bin (iNES mapper 31 (32 KB, 8 banks) image) + player.json from public/nes/player.s.
# Needs cc65 (brew install cc65). Queue it:
#   ~/.claude/bin/buildq --purpose "..." -- tools/build-nes-player.sh
# player.json carries the offsets (file offsets into player.bin) the cartridge builder patches stream/title/start subsong at.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
cd "$ROOT/public/nes"
ca65 player.s -o "$W/player.o"
ld65 -C nes.cfg -Ln "$W/player.lbl" "$W/player.o" -o "$W/player.bin"
cp "$W/player.bin" player.bin
python3 - "$W/player.lbl" player.bin player.json <<'PY'
import json, os, re, sys
sym = {}
for line in open(sys.argv[1]):
    m = re.match(r'^al\s+([0-9A-Fa-f]+)\s+\.(\w+)', line)
    if m: sym[m.group(2)] = int(m.group(1), 16)
size = os.path.getsize(sys.argv[2])
assert size == 16 + 0x8000, size
fo = lambda a: a - 0x8000 + 16
meta = {'size': size, 'dataOffset': fo(0x8000), 'dataCapacity': 0x7000, 'titleOffset': fo(sym['title']), 'titleLength': 32,
        'startSubsongOffset': fo(sym['startsong']), 'regbankOffset': fo(sym['regbank']), 'nmiAddress': sym['nmi'], 'irqAddress': sym['irq'], 'idleAddress': sym['idle'], 'authorOffset': fo(sym['author']), 'authorLength': 32, 'chipNameOffset': fo(sym['chipname']), 'chipNameLength': 16, 'scrollOffset': fo(sym['scrolltext']), 'scrollLength': 128, 'subsongCountOffset': fo(sym['nsub']), 'nmiEndAddress': sym['nmiend'], 'nsfInitAddress': sym['nsfinit'], 'nsfPlayAddress': sym['nsfplay'], 'bankSize': 4096, 'maxStreamBanks': 255}
json.dump(meta, open(sys.argv[3], 'w'), indent=1)
open(sys.argv[3], 'a').write('\n')
print(meta)
PY
