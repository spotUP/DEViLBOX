# Odin2 Semi-Modular Synthesizer - WASM Build
# Based on Odin2 by The Wave Warden (GPL v3)
#
# Build:
#   cd juce-wasm/odin2 && mkdir -p build && cd build
#   emcmake cmake .. && emmake make -j$(nproc)
#
# Odin2's DSP code only uses 5 JUCE math functions which are shimmed
# via JuceLibraryCode/JuceHeader.h with standard C++ equivalents.
# No actual JUCE modules are compiled.

cmake_minimum_required(VERSION 3.15)
project(Odin2WASM VERSION 2.4.1)

set(ODIN2_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/odin2-master")
set(ODIN2_SRC "${ODIN2_ROOT}/Source")

# --- Odin2 Audio DSP Sources ---
file(GLOB ODIN2_AUDIO_SOURCES
    "${ODIN2_SRC}/audio/*.cpp"
)
# Exclude ImpulseResponseCreator — uses JUCE audio file I/O (WavAudioFormat, etc.)
list(FILTER ODIN2_AUDIO_SOURCES EXCLUDE REGEX ".*ImpulseResponseCreator.*")
file(GLOB ODIN2_FILTER_SOURCES
    "${ODIN2_SRC}/audio/Filters/*.cpp"
)
file(GLOB ODIN2_FX_SOURCES
    "${ODIN2_SRC}/audio/FX/*.cpp"
)
file(GLOB ODIN2_OSC_SOURCES
    "${ODIN2_SRC}/audio/Oscillators/*.cpp"
)
file(GLOB ODIN2_WAVETABLE_SOURCES
    "${ODIN2_SRC}/audio/Oscillators/Wavetables/*.cpp"
    "${ODIN2_SRC}/audio/Oscillators/Wavetables/Tables/*.cpp"
    "${ODIN2_SRC}/audio/Oscillators/Wavetables/Coefficients/*.cpp"
)

# WASM Wrapper (replaces PluginProcessor — manages Voice objects directly)
set(WRAPPER_SOURCES
    "${CMAKE_SOURCE_DIR}/Odin2WASM.cpp"
)

add_executable(Odin2WASMBuild
    ${WRAPPER_SOURCES}
    ${ODIN2_AUDIO_SOURCES}
    ${ODIN2_FILTER_SOURCES}
    ${ODIN2_FX_SOURCES}
    ${ODIN2_OSC_SOURCES}
    ${ODIN2_WAVETABLE_SOURCES}
)

target_include_directories(Odin2WASMBuild PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/../common              # WASMSynthBase.h
    ${ODIN2_SRC}                               # GlobalIncludes.h, etc.
    ${ODIN2_SRC}/audio
    ${ODIN2_SRC}/audio/Filters
    ${ODIN2_SRC}/audio/FX
    ${ODIN2_SRC}/audio/Oscillators
    ${ODIN2_SRC}/audio/Oscillators/Wavetables
    ${ODIN2_SRC}/audio/Oscillators/Wavetables/Tables
    ${ODIN2_SRC}/audio/Oscillators/Wavetables/Coefficients
    ${ODIN2_ROOT}                              # For ../JuceLibraryCode/JuceHeader.h resolution
    ${ODIN2_ROOT}/JuceLibraryCode             # For #include "JuceHeader.h" (no prefix)
    ${ODIN2_ROOT}/libs/json
    ${ODIN2_ROOT}/libs/tuning-library/include
)

target_compile_definitions(Odin2WASMBuild PRIVATE
    ODIN2_WASM=1
    NDEBUG=1
)

set_target_properties(Odin2WASMBuild PROPERTIES
    OUTPUT_NAME "Odin2"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/odin2"
)

target_link_options(Odin2WASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOdin2Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=33554432"  # 32MB initial
    "SHELL:--bind"
    -O3
)

target_compile_options(Odin2WASMBuild PRIVATE
    -O3
    -std=c++17
    -fno-exceptions
    -Wno-deprecated-declarations
)
