#!/bin/sh
# usage: run.sh <fur> <seconds> <tag> ; events in $M/<tag>.fur.ev / <tag>.mame.ev, PCM taps in <tag>.pcm
set -eu
M=${M:?set M to a scratch dir holding mdsdrv.bin (tools/build-mdsdrv.sh)}; R=/Users/spot/Code/DEViLBOX/tools/md-phase0; cd $M; cp $R/shell_pcm.68k shell1.68k; cp $R/tap_pcm.lua tap.lua
FUR=$1; SEC=$2; T=$3
(cd /Users/spot/Code/DEViLBOX && nice -n 19 npx tsx --tsconfig tsconfig.app.json tools/md-phase0/conv_pcm.mts "$FUR" $M/$T.seq $M/$T.pcmbin 2>&1 | grep RESULT)
[ -f $T.vgm ] || nice -n 19 /Applications/Furnace.app/Contents/MacOS/furnace -console -nostatus -nocontrols -noreport -loglevel error -loops 0 -vgmout $T.vgm "$FUR" >/dev/null 2>&1 || true
python3 -I /Users/spot/Code/DEViLBOX/tools/md-phase0/events.py $T.vgm > $T.fur.ev
cp $T.seq seq.bin; cp $T.pcmbin pcm.bin
~/.claude/bin/buildq --purpose "DEViLBOX MD agent 1t: shell rom" -- vasmm68k_mot -quiet -Fbin -m68000 -no-opt -spaces '-DTEMPO=$7F' -o $T.rom shell1.68k
TAPOUT=$M/$T.raw nice -n 19 mame genesis -cart $T.rom -video none -sound none -nothrottle -seconds_to_run $SEC \
  -autoboot_script $M/tap.lua -cfg_directory $M/cfg -nvram_directory $M/nv -skip_gameinfo > $T.mame.log 2>&1 || true
grep ' [PQ] ' $T.raw > $T.pcm || true; grep -v ' [PQ] ' $T.raw > $T.tap; rm $T.raw
python3 -I /Users/spot/Code/DEViLBOX/tools/md-phase0/events.py $T.tap > $T.mame.ev
wc -l $T.fur.ev $T.mame.ev $T.pcm
