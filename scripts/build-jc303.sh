#!/bin/bash

# Define paths
JC303_ROOT="Reference Code/jc303-main/src/dsp/open303"
WRAPPER="src/engine/jc303/JC303Wrapper.cpp"
OUTPUT_DIR="public/jc303"
OUTPUT_FILE="$OUTPUT_DIR/JC303.js"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Source files (all .cpp files in the open303 directory)
SOURCES=(
    "$JC303_ROOT/GlobalFunctions.cpp"
    "$JC303_ROOT/rosic_AcidPattern.cpp"
    "$JC303_ROOT/rosic_AcidSequencer.cpp"
    "$JC303_ROOT/rosic_AnalogEnvelope.cpp"
    "$JC303_ROOT/rosic_BiquadFilter.cpp"
    "$JC303_ROOT/rosic_BlendOscillator.cpp"
    "$JC303_ROOT/rosic_Complex.cpp"
    "$JC303_ROOT/rosic_DecayEnvelope.cpp"
    "$JC303_ROOT/rosic_EllipticQuarterBandFilter.cpp"
    "$JC303_ROOT/rosic_FourierTransformerRadix2.cpp"
    "$JC303_ROOT/rosic_FunctionTemplates.cpp"
    "$JC303_ROOT/rosic_LeakyIntegrator.cpp"
    "$JC303_ROOT/rosic_MidiNoteEvent.cpp"
    "$JC303_ROOT/rosic_MipMappedWaveTable.cpp"
    "$JC303_ROOT/rosic_NumberManipulations.cpp"
    "$JC303_ROOT/rosic_OnePoleFilter.cpp"
    "$JC303_ROOT/rosic_Open303.cpp"
    "$JC303_ROOT/rosic_RealFunctions.cpp"
    "$JC303_ROOT/rosic_TeeBeeFilter.cpp"
    "$WRAPPER"
)

# Exported functions
EXPORTED_FUNCTIONS="[
    '_jc303_init',
    '_jc303_set_buffer_size',
    '_jc303_get_buffer_pointer',
    '_jc303_note_on',
    '_jc303_all_notes_off',
    '_jc303_set_waveform',
    '_jc303_set_tuning',
    '_jc303_set_cutoff',
    '_jc303_set_resonance',
    '_jc303_set_env_mod',
    '_jc303_set_decay',
    '_jc303_set_accent',
    '_jc303_set_volume',
    '_jc303_set_slide_time',
    '_jc303_process',
    '_jc303_destroy',
    '_malloc',
    '_free'
]"

echo "Compiling JC303 to WebAssembly..."

emcc "${SOURCES[@]}" \
    -I "$JC303_ROOT" \
    -O3 \
    -s "EXPORTED_FUNCTIONS=$EXPORTED_FUNCTIONS" \
    -s "EXPORTED_RUNTIME_METHODS=['ccall', 'cwrap']" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME='JC303Module' \
    -s ENVIRONMENT=web,worker \
    -s SINGLE_FILE=0 \
    -o "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    echo "Build successful! Output: $OUTPUT_FILE"
    echo "WASM file: $OUTPUT_DIR/JC303.wasm"
else
    echo "Build failed!"
    exit 1
fi
