# amsynth - WASM Build
# Based on amsynth by Nick Dowell (GPL2)
# Pure C++ DSP with Freeverb reverb, no JUCE dependencies.
#
# Build:
#   cd juce-wasm/amsynth && mkdir -p build && cd build
#   emcmake cmake .. && emmake make -j$(nproc)

cmake_minimum_required(VERSION 3.15)
project(AmsynthWASM VERSION 1.0.0)

set(AMSYNTH_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/amsynth-master")
set(SYNTH_SRC "${AMSYNTH_ROOT}/src/core/synth")
set(FREEVERB_SRC "${AMSYNTH_ROOT}/external/freeverb")

# --- amsynth core DSP sources ---
set(AMSYNTH_SOURCES
    "${SYNTH_SRC}/Synthesizer.cpp"
    "${SYNTH_SRC}/VoiceAllocationUnit.cpp"
    "${SYNTH_SRC}/VoiceBoard.cpp"
    "${SYNTH_SRC}/MidiController.cpp"
    "${SYNTH_SRC}/Parameter.cpp"
    "${SYNTH_SRC}/Preset.cpp"
    "${SYNTH_SRC}/PresetController.cpp"
    "${SYNTH_SRC}/Oscillator.cpp"
    "${SYNTH_SRC}/LowPassFilter.cpp"
    "${SYNTH_SRC}/ADSR.cpp"
    "${SYNTH_SRC}/Distortion.cpp"
    "${SYNTH_SRC}/SoftLimiter.cpp"
    "${SYNTH_SRC}/TuningMap.cpp"
    "${AMSYNTH_ROOT}/src/core/filesystem.cpp"
)

# --- Freeverb reverb ---
set(FREEVERB_SOURCES
    "${FREEVERB_SRC}/allpass.cpp"
    "${FREEVERB_SRC}/comb.cpp"
    "${FREEVERB_SRC}/revmodel.cpp"
)

# --- WASM Wrapper ---
set(WRAPPER_SOURCES
    "${CMAKE_SOURCE_DIR}/AmsynthWASM.cpp"
)

add_executable(AmsynthWASMBuild
    ${WRAPPER_SOURCES}
    ${AMSYNTH_SOURCES}
    ${FREEVERB_SOURCES}
)

target_include_directories(AmsynthWASMBuild PRIVATE
    "${AMSYNTH_ROOT}/src"              # core/controls.h, core/types.h, core/gettext.h
    "${SYNTH_SRC}"                     # Synthesizer.h, VoiceBoard.h, etc.
    "${AMSYNTH_ROOT}/external"         # freeverb/revmodel.hpp
    "${CMAKE_SOURCE_DIR}/../common"    # WASMSynthBase.h, WASMExports.h
)

target_compile_definitions(AmsynthWASMBuild PRIVATE
    AMSYNTH_WASM=1
    NDEBUG=1
    # NLS and autoconf not used in WASM build
)

set_target_properties(AmsynthWASMBuild PROPERTIES
    OUTPUT_NAME "Amsynth"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/amsynth"
)

target_link_options(AmsynthWASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createAmsynthModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=16777216"  # 16MB initial
    "SHELL:--bind"
    -O3
)

target_compile_options(AmsynthWASMBuild PRIVATE
    -O3
    -std=c++17
    -fexceptions
    -Wno-deprecated-declarations
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-sign-compare
    -Wno-c++11-narrowing
    -Wno-reorder
    -Wno-unused-private-field
    -Wno-missing-field-initializers
)
