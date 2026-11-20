#!/bin/sh
# Phase 0 proof: build MDSDRV + shell ROMs at three tempos, boot each headless in MAME, decode YM/PSG writes.
# Usage: tools/md-phase0/run.sh <scratch-dir>
set -eu
D=$(cd "$(dirname "$0")" && pwd); W=$1; mkdir -p "$W"; cd "$W"
Q="$HOME/.claude/bin/buildq --purpose DEViLBOX_Mega_Drive_Phase_0:_driver_build --"
$Q "$D/../build-mdsdrv.sh" "$W/drv" > build.log 2>&1
cp drv/mdsdrv.bin .
for T in 7F 3F FF; do
  $Q vasmm68k_mot -quiet -Fbin -m68000 -no-opt -spaces "-DTEMPO=\$$T" -o rom_$T.bin "$D/shell.68k"
  TAPOUT="$W/tap_$T.txt" nice -n 19 mame genesis -cart rom_$T.bin -video none -sound none -nothrottle \
    -seconds_to_run 5 -autoboot_script "$D/tap.lua" -cfg_directory "$W/cfg" -nvram_directory "$W/nv" -skip_gameinfo > mame_$T.log 2>&1 || true
  python3 -I "$D/decode.py" tap_$T.txt > dec_$T.txt
  echo "tempo \$$T: $(wc -l < tap_$T.txt) writes, $(grep -c KEYON dec_$T.txt || true) key-ons"
done
