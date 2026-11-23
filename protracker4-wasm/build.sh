#!/bin/bash
# Builds libpt4 (ProTracker 4 replayer, vendored in libpt4/) plus glue.c to public/protracker4/.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../public/protracker4"
mkdir -p "$OUT_DIR"

emcc -O2 -std=c99 \
  -I"$SCRIPT_DIR/libpt4/include" -I"$SCRIPT_DIR/libpt4/src" \
  "$SCRIPT_DIR"/libpt4/src/*.c "$SCRIPT_DIR/glue.c" \
  -sEXPORTED_FUNCTIONS="['_player_load','_player_render','_player_stop','_player_set_sample_rate','_player_set_channel_gain','_player_get_channels','_player_get_position','_player_voice_peak','_player_voice_scope','_malloc','_free']" \
  -sEXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPU8','HEAPF32']" \
  -sMODULARIZE=1 -sEXPORT_NAME=createProTracker4 -sENVIRONMENT=worker \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sINVOKE_RUN=0 \
  -o "$OUT_DIR/ProTracker4.js"
echo "Built $OUT_DIR/ProTracker4.js + .wasm"
