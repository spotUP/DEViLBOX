#!/bin/bash

# Furnace Chips Build Script for DEViLBOX
# Compiles the C emulators into a single WASM module

# Exit on error
set -e

echo "🚀 Starting Furnace Chips build..."

# 1. Define paths
BASE_DIR="Reference Code/furnace-master/extern"
SOUND_DIR="Reference Code/furnace-master/src/engine/platform/sound"
VGSOUND_BASE="Reference Code/furnace-master/extern/vgsound_emu-modified/vgsound_emu/src"
OUTPUT_DIR="public"
TEMP_BUILD_DIR="src/engine/chips/build"

# 2. Create temp build directory
mkdir -p "$TEMP_BUILD_DIR"

# 3. Compile everything together with emcc
# We include the source files directly in the command
emcc src/engine/chips/FurnaceChips.cpp \
    "$BASE_DIR/opn/ym3438.c" \
    "$BASE_DIR/opm/opm.c" \
    "$BASE_DIR/opl/opl3.c" \
    "$BASE_DIR/Nuked-PSG/ympsg.c" \
    "$SOUND_DIR/gb/apu.c" \
    "$SOUND_DIR/gb/timing.c" \
    "$SOUND_DIR/nes_nsfplay/nes_apu.cpp" \
    "$SOUND_DIR/nes_nsfplay/nes_dmc.cpp" \
    "$SOUND_DIR/pce_psg.cpp" \
    "$SOUND_DIR/sid3.c" \
    "src/engine/chips/furnace/dsid.c" \
    "$SOUND_DIR/ay8910.cpp" \
    "$BASE_DIR/Nuked-OPLL/opll.c" \
    "$SOUND_DIR/ymfm/ymfm_opn.cpp" \
    "$SOUND_DIR/ymfm/ymfm_adpcm.cpp" \
    "$SOUND_DIR/ymfm/ymfm_ssg.cpp" \
    "$SOUND_DIR/ymfm/ymfm_opz.cpp" \
    "$SOUND_DIR/ymfm/ymfm_opl.cpp" \
    "$SOUND_DIR/ymfm/ymfm_pcm.cpp" \
    "$SOUND_DIR/ymf278b/ymf278.cpp" \
    "$SOUND_DIR/snes/SPC_DSP.cpp" \
    "$SOUND_DIR/segapcm.cpp" \
    "$SOUND_DIR/qsound.c" \
    "$SOUND_DIR/ymz280b.cpp" \
    "$SOUND_DIR/rf5c68.cpp" \
    "$SOUND_DIR/ga20/iremga20.cpp" \
    "$SOUND_DIR/c140_c219.c" \
    "$SOUND_DIR/vic20sound.c" \
    "$SOUND_DIR/lynx/Mikey.cpp" \
    "$SOUND_DIR/vsu.cpp" \
    "$SOUND_DIR/nds.cpp" \
    "$SOUND_DIR/supervision.c" \
    "$SOUND_DIR/vera_psg.c" \
    "$SOUND_DIR/vera_pcm.c" \
    "$SOUND_DIR/ted-sound.c" \
    "$SOUND_DIR/sm8521.c" \
    "$SOUND_DIR/upd1771.cpp" \
    "$SOUND_DIR/t6w28/T6W28_Apu.cpp" \
    "$SOUND_DIR/tia/Audio.cpp" \
    "$SOUND_DIR/tia/AudioChannel.cpp" \
    "$SOUND_DIR/pokey/AltASAP.cpp" \
    "$SOUND_DIR/pokey/mzpokeysnd.c" \
    "$SOUND_DIR/saa1099.cpp" \
    "$SOUND_DIR/nes_nsfplay/nes_fds.cpp" \
    "$SOUND_DIR/nes_nsfplay/nes_mmc5.cpp" \
    "$SOUND_DIR/swan_mdfn.cpp" \
    "$SOUND_DIR/swan.c" \
    "$SOUND_DIR/namco.cpp" \
    "$SOUND_DIR/oki/okim6258.cpp" \
    "$SOUND_DIR/oki/msm5232.cpp" \
    "$VGSOUND_BASE/msm6295/msm6295.cpp" \
    "$VGSOUND_BASE/es550x/es5506.cpp" \
    "$VGSOUND_BASE/es550x/es550x.cpp" \
    "$VGSOUND_BASE/es550x/es550x_alu.cpp" \
    "$VGSOUND_BASE/es550x/es550x_filter.cpp" \
    "$VGSOUND_BASE/scc/scc.cpp" \
    "$VGSOUND_BASE/n163/n163.cpp" \
    "$VGSOUND_BASE/vrcvi/vrcvi.cpp" \
    "$VGSOUND_BASE/k005289/k005289.cpp" \
    "$VGSOUND_BASE/k007232/k007232.cpp" \
    "$VGSOUND_BASE/k053260/k053260.cpp" \
    "$VGSOUND_BASE/x1_010/x1_010.cpp" \
    "$VGSOUND_BASE/core/vox/vox.cpp" \
    "$BASE_DIR/blip_buf/blip_buf.c" \
    "$BASE_DIR/ESFMu/esfm.c" \
    "$BASE_DIR/ESFMu/esfm_registers.c" \
    -I "$BASE_DIR/opn" \
    -I "$BASE_DIR/ESFMu" \
    -I "$BASE_DIR/opm" \
    -I "$BASE_DIR/opl" \
    -I "$BASE_DIR/Nuked-PSG" \
    -I "$BASE_DIR/Nuked-OPLL" \
    -I "$SOUND_DIR/gb" \
    -I "$SOUND_DIR/nes_nsfplay" \
    -I "$SOUND_DIR/tia" \
    -I "$SOUND_DIR/pokey" \
    -I "$SOUND_DIR/snes" \
    -I "$SOUND_DIR/lynx" \
    -I "$SOUND_DIR/ymf278b" \
    -I "$SOUND_DIR/t6w28" \
    -I "$SOUND_DIR/ga20" \
    -I "$SOUND_DIR" \
    -I "$SOUND_DIR/oki" \
    -I "$SOUND_DIR/c64_d" \
    -I "$SOUND_DIR/ymfm" \
    -I "$VGSOUND_BASE" \
    -I "Reference Code/furnace-master/extern/vgsound_emu-modified/vgsound_emu" \
    -I "$BASE_DIR/blip_buf" \
    -I "$BASE_DIR/fmt/include" \
    -I "src/engine/chips/include" \
    -I "Reference Code/furnace-master/src/engine" \
    -I "Reference Code/furnace-master/src" \
    -O3 \
    -s WASM=1 \
    -s EXPORTED_FUNCTIONS='["_furnace_init_chips", "_furnace_chip_write", "_furnace_chip_render", "_furnace_set_wavetable", "_furnace_upload_sample", "_furnace_set_logging", "_furnace_get_log_size", "_furnace_get_log_data", "_malloc", "_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["cwrap", "setValue", "getValue", "HEAPU8", "HEAPF32", "wasmMemory"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="FurnaceChips" \
    -o "$OUTPUT_DIR/FurnaceChips.js"

echo "✅ Build complete! Files generated in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"/FurnaceChips.*
