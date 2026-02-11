# Monique Morphing Monosynth - WASM Build
# Based on Monique by Surge Synth Team (dual GPL3/MIT)
#
# Build:
#   cd juce-wasm/monique && mkdir -p build && cd build
#   emcmake cmake .. && emmake make -j$(nproc)
#
# Monique's DSP code heavily uses JUCE types which are shimmed via
# monique_juce_shim.h. UI classes are stubbed out.

cmake_minimum_required(VERSION 3.15)
project(MoniqueWASM VERSION 1.1.0)

set(MONIQUE_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/monique-monosynth")
set(MONIQUE_SRC "${MONIQUE_ROOT}/src")
set(MONIQUE_CORE "${MONIQUE_SRC}/core")

# --- Monique Core DSP Sources ---
# Only the 3 core DSP files — Processor and AudioDeviceManager are replaced by our wrapper
set(MONIQUE_CORE_SOURCES
    "${MONIQUE_CORE}/monique_core_Synth.cpp"
    "${MONIQUE_CORE}/monique_core_Datastructures.cpp"
    "${MONIQUE_CORE}/monique_core_Parameters.cpp"
)

# WASM Wrapper (replaces MoniqueAudioProcessor)
set(WRAPPER_SOURCES
    "${CMAKE_SOURCE_DIR}/MoniqueSynth.cpp"
)

add_executable(MoniqueWASMBuild
    ${WRAPPER_SOURCES}
    ${MONIQUE_CORE_SOURCES}
)

# Include directories — ORDER MATTERS for stub overrides
# 1. Our JUCE shim headers (fake juce_audio_processors/ etc.) — MUST be first
# 2. Our source stubs (UI headers, version.h, BinaryData.h, etc.)
# 3. Our build dir (for monique_juce_shim.h direct includes)
# 4. Common WASMSynthBase
# 5. Monique source root (for App.h, and resolving core/ and ui/ from App.h)
# 6. Monique core dir (for sibling includes within core/)
target_include_directories(MoniqueWASMBuild PRIVATE
    "${CMAKE_SOURCE_DIR}/juce_shim_headers"     # Fake JUCE module headers
    "${CMAKE_SOURCE_DIR}/source_stubs"           # UI stubs, version.h, BinaryData.h, libMTSClient.h
    "${CMAKE_SOURCE_DIR}"                        # monique_juce_shim.h
    "${CMAKE_SOURCE_DIR}/../common"              # WASMSynthBase.h, WASMExports.h
    "${MONIQUE_SRC}"                             # App.h, and resolution base for core/ and ui/
    "${MONIQUE_CORE}"                            # Sibling headers in core/
)

target_compile_definitions(MoniqueWASMBuild PRIVATE
    MONIQUE_WASM=1
    NDEBUG=1
    # Ensure non-standalone path in mono_AudioDeviceManager.h
    # (IS_STANDALONE_WITH_OWN_AUDIO_MANAGER_AND_MIDI_HANDLING must NOT be defined)
)

set_target_properties(MoniqueWASMBuild PROPERTIES
    OUTPUT_NAME "Monique"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/monique"
)

target_link_options(MoniqueWASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createMoniqueModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=33554432"  # 32MB initial (mono synth)
    "SHELL:--bind"
    -O3
)

target_compile_options(MoniqueWASMBuild PRIVATE
    -O3
    -std=c++17
    -fno-exceptions
    -Wno-deprecated-declarations
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-sign-compare
    -Wno-reorder
)
