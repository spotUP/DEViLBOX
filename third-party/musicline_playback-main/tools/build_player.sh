#!/bin/bash
# Build MusiclineEditor from assembly source.
# Usage: ./tools/build_player.sh [output_path]
#
# Default output: musicline/uade/uade/players/MusiclineEditor

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VASM="${HOME}/Downloads/vasm/vasmm68k_mot"
ASM_SRC="${PROJECT_DIR}/musicline/uade/player/MusiclineEditor.asm"
ASM_DIR="${PROJECT_DIR}/musicline/uade/player"
NDK_INCLUDE="${ASM_DIR}/ndk"
OUTPUT="${1:-${PROJECT_DIR}/musicline/uade/uade/players/MusiclineEditor}"

if [ ! -f "$VASM" ]; then
    echo "Error: vasm not found at $VASM" >&2
    exit 1
fi

if [ ! -d "$NDK_INCLUDE" ]; then
    echo "Error: Amiga NDK includes not found at $NDK_INCLUDE" >&2
    exit 1
fi

echo "Assembling ${ASM_SRC}..."
"$VASM" -Fhunkexe -kick1hunks -nosym -devpac -opt-allbra \
    -I"$NDK_INCLUDE" -I"$ASM_DIR" \
    -o "$OUTPUT" "$ASM_SRC"

echo "Applying CHIP flag fixup..."
python3 "${SCRIPT_DIR}/fixup_chip_flag.py" "$OUTPUT"

echo "Built: $OUTPUT"
