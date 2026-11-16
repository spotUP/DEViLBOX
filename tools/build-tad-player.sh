#!/bin/sh
# Builds the prebuilt SNES player ROMs (+ .json patch maps) with a placeholder audio region:
#  - public/tad/player-lorom.sfc: the Terrific Audio Driver ca65 "sound-test" program
#    (tad-wasm/audio-driver/ca65-api/tests/sound-test), exported as build/soundtest.sfc;
#  - public/tad/player-devilbox-lorom.sfc: the DEViLBOX player (tools/tad-player/devilbox/main.s),
#    exported as build/player.sfc; its "DVBXMETA" block (titles, author, comment) offset is metaOffset.
# Needs ca65, ld65, python3. Queue it: ~/.claude/bin/buildq --purpose "..." -- tools/build-tad-player.sh
# The ROM is built twice with different placeholder constants; the bytes that differ are the immediates
# (last song id, last sound effect id, data item count) that src/lib/export/tad/tadPlayerRom.ts patches.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$ROOT/tad-wasm/audio-driver/ca65-api/tests
W=$(mktemp -d)
trap 'rm -rf "$W" "$T/sound-test/gen/audio.inc"' EXIT
# Tad_Loader_SIZE / Tad_AudioDriver_SIZE of the vendored compiler (tadPlayerRom.ts checks them against the export).
LOADER=116
DRIVER=3381

build() { # last_song_id n_sfx n_data_items out main.s
  mkdir -p "$W/$4"
  printf 'LAST_SONG_ID = %s\nN_SOUND_EFFECTS = %s\n' "$1" "$2" > "$T/sound-test/gen/audio.inc"
  head -c 32768 /dev/zero > "$W/$4/zero.bin"
  for m in reset break-isr dma-forceblank; do ca65 -g -DLOROM -o "$W/$4/$m.o" "$T/_common/$m.s"; done
  ca65 -g -DLOROM -I "$T/sound-test/src" -I "$T" -I "$T/.." -I "$T/sound-test" -o "$W/$4/main.o" "$5"
  ca65 -g -DLOROM -o "$W/$4/text-buffer.o" "$T/sound-test/src/text-buffer.s"
  ca65 -g -DLOROM -o "$W/$4/tad-audio.o" "$T/../tad-audio.s"
  (cd "$W/$4" && ca65 -g -DLOROM -DTAD_LOADER_SIZE=$LOADER -DTAD_DRIVER_SIZE=$DRIVER -DSENTINEL_DATA_ITEMS="$3" \
    -o audio-data.o "$ROOT/tools/tad-player/audio-data-stub.s")
  (cd "$W/$4" && ld65 -o player.sfc -C "$T/_common/lorom256k.cfg" reset.o break-isr.o main.o dma-forceblank.o text-buffer.o tad-audio.o audio-data.o)
  /opt/homebrew/bin/python3.12 -bb "$T/_tools/write-sfc-checksum.py" --lorom "$W/$4/player.sfc"
}
rom() { # main.s output-name
  build 100 121 142 a "$1"
  build 60 81 62 b "$1"
cp "$W/a/player.sfc" "$ROOT/public/tad/$2.sfc"
python3 - "$W/a/player.sfc" "$W/b/player.sfc" "$ROOT/public/tad/$2.json" $LOADER $DRIVER <<'PY'
import json, sys
a, b = open(sys.argv[1], 'rb').read(), open(sys.argv[2], 'rb').read()
assert len(a) == len(b)
kinds = {100: 'lastSongId', 120: 'lastSfxId', 142: 'dataItems'}  # value in build a -> patch group
HDR = 0x7FB0 + 0x2C  # checksum + complement bytes
patches = {k: [] for k in kinds.values()}
for i in range(len(a)):
    if a[i] != b[i] and not HDR <= i < HDR + 4:
        patches[kinds[a[i]]].append(i)  # KeyError = an unexpected differing byte: the stub changed
for k, v in patches.items():
    assert v or k == 'lastSfxId', k  # the DEViLBOX player plays no sound effects
meta = a.find(b'DVBXMETA')
extra = {'metaOffset': meta} if meta >= 0 else {}
json.dump({**extra, 'romSize': len(a), 'dataOffset': 0x10000 + 51, 'dataCapacity': 6 * 0x8000 - 51,
           'loaderSize': int(sys.argv[4]), 'driverSize': int(sys.argv[5]), 'headerOffset': 0x7FB0, 'patches': patches},
          open(sys.argv[3], 'w'), indent=1)
PY
  echo "[OK] public/tad/$2.sfc"
}
rom "$T/sound-test/src/main.s" player-lorom
rom "$ROOT/tools/tad-player/devilbox/main.s" player-devilbox-lorom
