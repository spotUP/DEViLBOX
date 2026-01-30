#!/bin/bash

# Buzzmachines Build Script for DEViLBOX
# Compiles selected buzzmachines to WASM modules
#
# Effects:
# - Arguru Distortion (distortion)
# - Elak SVF (state variable filter)
# - Jeskola Freeverb (reverb)
# - Jeskola Delay (delay)
# - Bigyo FrequencyShifter (frequency shifter)
# - FSM Chorus (chorus)

# Exit on error (but allow individual machine builds to fail)
set +e

echo "🚀 Starting Buzzmachines build..."

# 1. Define paths
BUZZ_BASE="Reference Code/buzzmachines-master"
OUTPUT_DIR="public/buzzmachines"
WRAPPER_SRC="src/engine/buzzmachines"

# 2. Create output directory
mkdir -p "$OUTPUT_DIR"

# 3. Check for Emscripten
if ! command -v emcc &> /dev/null; then
    echo "❌ Error: Emscripten not found. Please install emsdk first."
    echo "   Visit: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

echo "✓ Emscripten found: $(emcc --version | head -1)"

# 4. Common build flags
COMMON_FLAGS=(
    -O3                                    # Optimize for speed
    -s WASM=1                             # Output WASM
    -s ALLOW_MEMORY_GROWTH=1              # Dynamic memory allocation
    -s MODULARIZE=1                       # ES6 module
    -s EXPORT_ES6=1                       # ES6 export
    -s EXPORTED_RUNTIME_METHODS='["cwrap","ccall","setValue","getValue","HEAPF32","HEAP8"]'
    -fno-rtti                             # Disable RTTI (CMICallbacks has no typeinfo)
    -fno-exceptions                       # Disable exceptions (not used)
    -I "$BUZZ_BASE/common"                # MachineInterface.h
    -I "$BUZZ_BASE/common/dsplib"         # DSP utilities
    -I "$BUZZ_BASE/common/windef"         # Windows compatibility
    -DEMSCRIPTEN                          # Define for conditional compilation
    -Wno-deprecated-declarations          # Suppress warnings
    -Wno-array-bounds                     # Suppress array bounds warning (we know the array size)
)

# 5. Build Arguru Distortion (simplest machine - pure DSP)
echo ""
echo "Building Arguru Distortion..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="ArguruDistortion" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Arguru/Distortion/Distortion.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Arguru_Distortion.js"

if [ -f "$OUTPUT_DIR/Arguru_Distortion.wasm" ]; then
    echo "✓ Arguru Distortion built successfully"
else
    echo "❌ Failed to build Arguru Distortion"
    exit 1
fi

# 6. Build Elak SVF (State Variable Filter)
echo ""
echo "Building Elak SVF..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="ElakSVF" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Elak/SVF/svf.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Elak_SVF.js"

if [ -f "$OUTPUT_DIR/Elak_SVF.wasm" ]; then
    echo "✓ Elak SVF built successfully"
else
    echo "❌ Failed to build Elak SVF (continuing...)"
fi

# 7. Build Jeskola Freeverb (Industry-standard reverb) - requires MDK
echo ""
echo "Building Jeskola Freeverb (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="JeskolaFreeverb" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Jeskola/Freeverb/main.cpp" \
    "$BUZZ_BASE/Jeskola/Freeverb/revmodel.cpp" \
    "$BUZZ_BASE/Jeskola/Freeverb/allpass.cpp" \
    "$BUZZ_BASE/Jeskola/Freeverb/comb.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Jeskola_Freeverb.js"

if [ -f "$OUTPUT_DIR/Jeskola_Freeverb.wasm" ]; then
    echo "✓ Jeskola Freeverb built successfully"
else
    echo "❌ Failed to build Jeskola Freeverb (continuing...)"
fi

# 8. Build Jeskola Delay (Simple delay)
echo ""
echo "Building Jeskola Delay..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="JeskolaDelay" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Jeskola/Delay/Delay.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Jeskola_Delay.js"

if [ -f "$OUTPUT_DIR/Jeskola_Delay.wasm" ]; then
    echo "✓ Jeskola Delay built successfully"
else
    echo "❌ Failed to build Jeskola Delay (continuing...)"
fi

# 9. Build Bigyo FrequencyShifter (Hilbert transform freq shifter) - requires MDK
echo ""
echo "Building Bigyo FrequencyShifter (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="BigyoFrequencyShifter" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Bigyo/FrequencyShifter/Bigyo_FrequencyShifter.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Bigyo_FrequencyShifter.js"

if [ -f "$OUTPUT_DIR/Bigyo_FrequencyShifter.wasm" ]; then
    echo "✓ Bigyo FrequencyShifter built successfully"
else
    echo "❌ Failed to build Bigyo FrequencyShifter (continuing...)"
fi

# 10. Build FSM Chorus (Chorus effect)
echo ""
echo "Building FSM Chorus..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="FSMChorus" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/FSM/Chorus/Chorus.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/FSM_Chorus.js"

if [ -f "$OUTPUT_DIR/FSM_Chorus.wasm" ]; then
    echo "✓ FSM Chorus built successfully"
else
    echo "❌ Failed to build FSM Chorus (continuing...)"
fi

# 11. Build Geonik Compressor
echo ""
echo "Building Geonik Compressor..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/Geonik/DspClasses" \
    -s EXPORT_NAME="GeonikCompressor" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Geonik/BuzzMachines/Compressor.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Geonik_Compressor.js"

if [ -f "$OUTPUT_DIR/Geonik_Compressor.wasm" ]; then
    echo "✓ Geonik Compressor built successfully"
else
    echo "❌ Failed to build Geonik Compressor (continuing...)"
fi

# 12. Build Geonik Overdrive
echo ""
echo "Building Geonik Overdrive..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/Geonik/DspClasses" \
    -s EXPORT_NAME="GeonikOverdrive" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Geonik/BuzzMachines/Overdrive.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Geonik_Overdrive.js"

if [ -f "$OUTPUT_DIR/Geonik_Overdrive.wasm" ]; then
    echo "✓ Geonik Overdrive built successfully"
else
    echo "❌ Failed to build Geonik Overdrive (continuing...)"
fi

# 13. Build Jeskola Distortion
echo ""
echo "Building Jeskola Distortion..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="JeskolaDistortion" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Jeskola/Distortion/Distortion.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Jeskola_Distortion.js"

if [ -f "$OUTPUT_DIR/Jeskola_Distortion.wasm" ]; then
    echo "✓ Jeskola Distortion built successfully"
else
    echo "❌ Failed to build Jeskola Distortion (continuing...)"
fi

# 14. Build Jeskola CrossDelay
echo ""
echo "Building Jeskola CrossDelay..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="JeskolaCrossDelay" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Jeskola/CrossDelay/CrossDelay.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Jeskola_CrossDelay.js"

if [ -f "$OUTPUT_DIR/Jeskola_CrossDelay.wasm" ]; then
    echo "✓ Jeskola CrossDelay built successfully"
else
    echo "❌ Failed to build Jeskola CrossDelay (continuing...)"
fi

# 15. Build FSM Philta (Filter)
echo ""
echo "Building FSM Philta..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/FSM/dspchips" \
    -s EXPORT_NAME="FSMPhilta" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/FSM/Philta/Philta.cpp" \
    "$BUZZ_BASE/FSM/Philta/Filters.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/FSM_Philta.js"

if [ -f "$OUTPUT_DIR/FSM_Philta.wasm" ]; then
    echo "✓ FSM Philta built successfully"
else
    echo "❌ Failed to build FSM Philta (continuing...)"
fi

# 16. Build Elak Dist2
echo ""
echo "Building Elak Dist2..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="ElakDist2" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Elak/Dist2/dist2.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Elak_Dist2.js"

if [ -f "$OUTPUT_DIR/Elak_Dist2.wasm" ]; then
    echo "✓ Elak Dist2 built successfully"
else
    echo "❌ Failed to build Elak Dist2 (continuing...)"
fi

# 17. Skip Arguru Compressor (uses zzub API, not compatible)
echo ""
echo "Skipping Arguru Compressor (uses zzub API)..."

# 18. Skip Arguru Reverb (uses Psycle API, not compatible)
echo ""
echo "Skipping Arguru Reverb (uses Psycle API)..."

# 19. Build CyanPhase Notch (requires MDK)
echo ""
echo "Building CyanPhase Notch (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="CyanPhaseNotch" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/CyanPhase/Notch/Notch.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/CyanPhase_Notch.js"

if [ -f "$OUTPUT_DIR/CyanPhase_Notch.wasm" ]; then
    echo "✓ CyanPhase Notch built successfully"
else
    echo "❌ Failed to build CyanPhase Notch (continuing...)"
fi

# 20. Build DedaCode StereoGain (requires MDK)
echo ""
echo "Building DedaCode StereoGain (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="DedaCodeStereoGain" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/DedaCode/StereoGain/DedaCode_StereoGain_v2.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/DedaCode_StereoGain.js"

if [ -f "$OUTPUT_DIR/DedaCode_StereoGain.wasm" ]; then
    echo "✓ DedaCode StereoGain built successfully"
else
    echo "❌ Failed to build DedaCode StereoGain (continuing...)"
fi

# 21. Build Graue SoftSat (requires MDK)
echo ""
echo "Building Graue SoftSat (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="GraueSoftSat" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Graue/SoftSat/SoftSat.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Graue_SoftSat.js"

if [ -f "$OUTPUT_DIR/Graue_SoftSat.wasm" ]; then
    echo "✓ Graue SoftSat built successfully"
else
    echo "❌ Failed to build Graue SoftSat (continuing...)"
fi

# 22. Skip Ld Gate (uses AudioBus API, not compatible)
echo ""
echo "Skipping Ld Gate (uses AudioBus API)..."

# 23. Build Ld SoftLimiter (requires MDK)
echo ""
echo "Building Ld SoftLimiter (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="LdSLimit" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Ld/SLimit/SLimit.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Ld_SLimit.js"

if [ -f "$OUTPUT_DIR/Ld_SLimit.wasm" ]; then
    echo "✓ Ld SoftLimiter built successfully"
else
    echo "❌ Failed to build Ld SoftLimiter (continuing...)"
fi

# 24. Build Oomek Exciter (requires MDK)
echo ""
echo "Building Oomek Exciter (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="OomekExciter" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Oomek/Exciter/Exciter.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Oomek_Exciter.js"

if [ -f "$OUTPUT_DIR/Oomek_Exciter.wasm" ]; then
    echo "✓ Oomek Exciter built successfully"
else
    echo "❌ Failed to build Oomek Exciter (continuing...)"
fi

# 25. Build Oomek Masterizer (requires MDK)
echo ""
echo "Building Oomek Masterizer (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="OomekMasterizer" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Oomek/Masterizer/Masterizer.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Oomek_Masterizer.js"

if [ -f "$OUTPUT_DIR/Oomek_Masterizer.wasm" ]; then
    echo "✓ Oomek Masterizer built successfully"
else
    echo "❌ Failed to build Oomek Masterizer (continuing...)"
fi

# 26. Build WhiteNoise StereoDist (requires MDK)
echo ""
echo "Building WhiteNoise StereoDist (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="WhiteNoiseStereoDist" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/WhiteNoise/StereoDist/Dist.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/WhiteNoise_StereoDist.js"

if [ -f "$OUTPUT_DIR/WhiteNoise_StereoDist.wasm" ]; then
    echo "✓ WhiteNoise StereoDist built successfully"
else
    echo "❌ Failed to build WhiteNoise StereoDist (continuing...)"
fi

# 27. Build WhiteNoise WhiteChorus (requires MDK)
echo ""
echo "Building WhiteNoise WhiteChorus (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="WhiteNoiseWhiteChorus" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/WhiteNoise/WhiteChorus/Chorus.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/WhiteNoise_WhiteChorus.js"

if [ -f "$OUTPUT_DIR/WhiteNoise_WhiteChorus.wasm" ]; then
    echo "✓ WhiteNoise WhiteChorus built successfully"
else
    echo "❌ Failed to build WhiteNoise WhiteChorus (continuing...)"
fi

# 28. Build Q Zfilter
echo ""
echo "Building Q Zfilter..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="QZfilter" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Q/Zfilter/Zfilter.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Q_Zfilter.js"

if [ -f "$OUTPUT_DIR/Q_Zfilter.wasm" ]; then
    echo "✓ Q Zfilter built successfully"
else
    echo "❌ Failed to build Q Zfilter (continuing...)"
fi

# 29. Build FSM Chorus2 (requires MDK)
echo ""
echo "Building FSM Chorus2 (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -I "$BUZZ_BASE/FSM/dspchips" \
    -s EXPORT_NAME="FSMChorus2" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/FSM/Chorus2/Chorus2.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/FSM_Chorus2.js"

if [ -f "$OUTPUT_DIR/FSM_Chorus2.wasm" ]; then
    echo "✓ FSM Chorus2 built successfully"
else
    echo "❌ Failed to build FSM Chorus2 (continuing...)"
fi

# 30. Build FSM PanzerDelay (requires MDK)
echo ""
echo "Building FSM PanzerDelay (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -I "$BUZZ_BASE/FSM/dspchips" \
    -s EXPORT_NAME="FSMPanzerDelay" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/FSM/PanzerDelay/PanzerDelay.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/FSM_PanzerDelay.js"

if [ -f "$OUTPUT_DIR/FSM_PanzerDelay.wasm" ]; then
    echo "✓ FSM PanzerDelay built successfully"
else
    echo "❌ Failed to build FSM PanzerDelay (continuing...)"
fi

# 31. Skip Jeskola Mul (uses AudioBus API, not compatible)
echo ""
echo "Skipping Jeskola Mul (uses AudioBus API)..."

# ============================================================================
# GENERATORS
# ============================================================================

# 32. Build CyanPhase DTMF (Tone generator, needs dsplib)
echo ""
echo "Building CyanPhase DTMF..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="CyanPhaseDTMF" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/CyanPhase/DTMF/DTMF-1.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/CyanPhase_DTMF.js"

if [ -f "$OUTPUT_DIR/CyanPhase_DTMF.wasm" ]; then
    echo "✓ CyanPhase DTMF built successfully"
else
    echo "❌ Failed to build CyanPhase DTMF (continuing...)"
fi

# 33. Build Elenzil FrequencyBomb
echo ""
echo "Building Elenzil FrequencyBomb..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="ElenzilFrequencyBomb" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Elenzil/FrequencyBomb/freqbomb.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Elenzil_FrequencyBomb.js"

if [ -f "$OUTPUT_DIR/Elenzil_FrequencyBomb.wasm" ]; then
    echo "✓ Elenzil FrequencyBomb built successfully"
else
    echo "❌ Failed to build Elenzil FrequencyBomb (continuing...)"
fi

# 34. Build FSM Kick (Drum synth)
echo ""
echo "Building FSM Kick..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/FSM/dspchips" \
    -s EXPORT_NAME="FSMKick" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/FSM/Kick/Kick.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/FSM_Kick.js"

if [ -f "$OUTPUT_DIR/FSM_Kick.wasm" ]; then
    echo "✓ FSM Kick built successfully"
else
    echo "❌ Failed to build FSM Kick (continuing...)"
fi

# 35. Build FSM KickXP (Enhanced drum synth)
echo ""
echo "Building FSM KickXP..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/FSM/dspchips" \
    -s EXPORT_NAME="FSMKickXP" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/FSM/KickXP/KickXP.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/FSM_KickXP.js"

if [ -f "$OUTPUT_DIR/FSM_KickXP.wasm" ]; then
    echo "✓ FSM KickXP built successfully"
else
    echo "❌ Failed to build FSM KickXP (continuing...)"
fi

# 36. Build Jeskola Noise (needs dsplib)
echo ""
echo "Building Jeskola Noise..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="JeskolaNoise" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Jeskola/Noise/Noise.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Jeskola_Noise.js"

if [ -f "$OUTPUT_DIR/Jeskola_Noise.wasm" ]; then
    echo "✓ Jeskola Noise built successfully"
else
    echo "❌ Failed to build Jeskola Noise (continuing...)"
fi

# 37. Build Jeskola Trilok (Drum machine)
echo ""
echo "Building Jeskola Trilok..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="JeskolaTrilok" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Jeskola/Trilok/Trilok.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Jeskola_Trilok.js"

if [ -f "$OUTPUT_DIR/Jeskola_Trilok.wasm" ]; then
    echo "✓ Jeskola Trilok built successfully"
else
    echo "❌ Failed to build Jeskola Trilok (continuing...)"
fi

# 38. Build MadBrain 4FM2F (FM synth)
echo ""
echo "Building MadBrain 4FM2F..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="MadBrain4FM2F" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/MadBrain/4fm2f/4fm2f.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/MadBrain_4FM2F.js"

if [ -f "$OUTPUT_DIR/MadBrain_4FM2F.wasm" ]; then
    echo "✓ MadBrain 4FM2F built successfully"
else
    echo "❌ Failed to build MadBrain 4FM2F (continuing...)"
fi

# 39. Build MadBrain Dynamite6 (Synth)
echo ""
echo "Building MadBrain Dynamite6..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="MadBrainDynamite6" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/MadBrain/Dynamite6/Dynamite6.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/MadBrain_Dynamite6.js"

if [ -f "$OUTPUT_DIR/MadBrain_Dynamite6.wasm" ]; then
    echo "✓ MadBrain Dynamite6 built successfully"
else
    echo "❌ Failed to build MadBrain Dynamite6 (continuing...)"
fi

# 40. Build Makk M3 (Synth, needs dsplib)
echo ""
echo "Building Makk M3..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="MakkM3" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Makk/M3/M3.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Makk_M3.js"

if [ -f "$OUTPUT_DIR/Makk_M3.wasm" ]; then
    echo "✓ Makk M3 built successfully"
else
    echo "❌ Failed to build Makk M3 (continuing...)"
fi

# 41. Build Makk M4 (Synth, needs dsplib)
echo ""
echo "Building Makk M4..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -s EXPORT_NAME="MakkM4" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Makk/M4/M4.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Makk_M4.js"

if [ -f "$OUTPUT_DIR/Makk_M4.wasm" ]; then
    echo "✓ Makk M4 built successfully"
else
    echo "❌ Failed to build Makk M4 (continuing...)"
fi

# 42. Build Oomek Aggressor (303-style synth, requires MDK)
echo ""
echo "Building Oomek Aggressor (with MDK)..."
emcc \
    "${COMMON_FLAGS[@]}" \
    -I "$BUZZ_BASE/common/mdk" \
    -s EXPORT_NAME="OomekAggressor" \
    -s EXPORTED_FUNCTIONS='["_buzz_get_info","_buzz_create_machine","_buzz_delete_machine","_buzz_init","_buzz_tick","_buzz_work","_buzz_stop","_buzz_set_parameter","_buzz_get_global_vals","_buzz_set_num_tracks","_buzz_get_track_vals","_buzz_set_sample_rate","_buzz_set_bpm","_buzz_get_attr_vals","_buzz_get_num_attributes","_buzz_debug_check_audio","_malloc","_free"]' \
    "$BUZZ_BASE/Oomek/Aggressor/303.cpp" \
    "$BUZZ_BASE/common/mdk/mdkimp.cpp" \
    "$BUZZ_BASE/common/dsplib/dsplib.cpp" \
    "$WRAPPER_SRC/BuzzmachineWrapper.cpp" \
    -o "$OUTPUT_DIR/Oomek_Aggressor.js"

if [ -f "$OUTPUT_DIR/Oomek_Aggressor.wasm" ]; then
    echo "✓ Oomek Aggressor built successfully"
else
    echo "❌ Failed to build Oomek Aggressor (continuing...)"
fi

# Summary
echo ""
echo "✅ Build complete! Files generated in $OUTPUT_DIR:"
ls -lh "$OUTPUT_DIR"/*.{js,wasm} 2>/dev/null || echo "No files generated"

echo ""
echo "Next steps:"
echo "  1. Test WASM loading in browser console"
echo "  2. Create BuzzmachineEngine.ts wrapper"
echo "  3. Implement AudioWorklet processor"
echo ""
