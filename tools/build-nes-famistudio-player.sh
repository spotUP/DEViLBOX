#!/bin/bash
# Builds public/nes/famistudio/player.nes (NROM-256, FamiStudio sound engine) + player.json
# from public/nes/famistudio/player.s. Dev-time only; run through buildq.
# player.json: musicAddr/musicCap (song data area), dpcmAddr/dpcmCap, tickAddr (after famistudio_update),
# titleAddr/authorAddr/textLen: 32-byte uppercase ASCII slots shown on screen (see player.s); chipAddr/chipLen (16),
# scrollAddr/scrollLen (128), nsubAddr (1 byte subsong count), nmiAddr (NMI entry).
# Font and logo: public/nes/screen.chr, shared with public/nes/player.s.
# sourceHash (sha1 of player.s + fs.cfg + engine) for the staleness test.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/public/nes/famistudio"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
ENG="$ROOT/third-party/famistudio"
# Variants: player.nes (NROM), player-vrc6.nes (mapper 24, -D VRC6=1: 2A03 + 3 VRC6 channels) and
# player-fme7.nes (mapper 69, -D FME7=1, fs-fme7.cfg: 24 KB music at $6000 for 2A03 songs past the 16 KB NROM area).
for V in "" vrc6 fme7; do
CFG=fs.cfg; DEF=""; OUT="player"
if [ "$V" = vrc6 ]; then DEF="-D VRC6=1"; OUT="player-$V"; fi
if [ "$V" = fme7 ]; then DEF="-D FME7=1"; OUT="player-$V"; CFG=fs-fme7.cfg; fi
ca65 -g $DEF -I "$ENG" --bin-include-dir "$ENG" --bin-include-dir "$ROOT/public/nes" player.s -o "$W/p.o"
ld65 -C $CFG -Ln "$W/p.lbl" -m "$W/p.map" "$W/p.o" -o $OUT.nes
grep -A3 "^CODE " "$W/p.map" | head -2 || true
python3 - "$W/p.lbl" "$ENG/famistudio_ca65.s" "$OUT.json" "$V" "$CFG" <<'PY'
import hashlib, json, re, sys
lab = {}
for line in open(sys.argv[1]):
    m = re.match(r'^al\s+([0-9A-Fa-f]+)\s+\.(\w+)', line)
    if m: lab[m.group(2)] = int(m.group(1), 16)
fme7 = sys.argv[4] == 'fme7'
music = 0x6000 if fme7 else 0x8000
assert lab['fs_music'] == music and lab['fs_dpcm'] == 0xC000, lab
h = hashlib.sha1()
for f in ['player.s', sys.argv[5], sys.argv[2], '../screen.chr']: h.update(open(f, 'rb').read())
# prgOffset = file offset of CPU $8000 (fs-fme7.cfg: file offset = 16 + CPU address)
meta = {'musicAddr': music, 'musicCap': 0x6000 if fme7 else 0x4000, 'dpcmAddr': 0xC000, 'dpcmCap': 0x2000,
        'prgOffset': 16 + 0x8000 if fme7 else 16, 'tickAddr': lab['fs_tick'], 'titleAddr': lab['fs_title'], 'authorAddr': lab['fs_author'], 'textLen': 32,
        'chipAddr': lab['fs_chip'], 'chipLen': 16, 'scrollAddr': lab['fs_scroll'], 'scrollLen': 128, 'nsubAddr': lab['fs_nsub'], 'nmiAddr': lab['fs_nmi'], 'sourceHash': h.hexdigest()}
meta['sourceHash'] = hashlib.sha1((meta['sourceHash'] + sys.argv[4]).encode()).hexdigest() if sys.argv[4] else meta['sourceHash']
json.dump(meta, open(sys.argv[3], 'w'), indent=1)
print(meta)
PY
done
