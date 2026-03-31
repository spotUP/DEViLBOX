# Monique Morphing Monosynth - WASM Build
# Based on Monique by Surge Synth Team (dual GPL3/MIT)
#
# Build:
#   cd juce-wasm/juce-lib && mkdir -p build && cd build && emcmake cmake .. -DCMAKE_BUILD_TYPE=Release && emmake make -j4
#   cd juce-wasm/monique && mkdir -p build && cd build && emcmake cmake .. && emmake make -j4
#
# Uses real JUCE for core types (String, AudioBuffer, MidiMessage, Synthesiser, etc.)
# from libjuce-wasm.a. AudioProcessor and GUI types use minimal stubs.

cmake_minimum_required(VERSION 3.15)
project(MoniqueWASM VERSION 1.1.0)

set(MONIQUE_ROOT "${CMAKE_SOURCE_DIR}/../../third-party/monique-monosynth")
set(MONIQUE_SRC "${MONIQUE_ROOT}/src")
set(MONIQUE_CORE "${MONIQUE_SRC}/core")
set(JUCE_MODULES_DIR "${CMAKE_SOURCE_DIR}/../../third-party/surge-xt/libs/JUCE/modules")
set(JUCE_LIB_DIR "${CMAKE_SOURCE_DIR}/../juce-lib")

# --- Monique Core Sources (all 5 core .cpp files) ---
set(MONIQUE_CORE_SOURCES
    "${MONIQUE_CORE}/monique_core_Synth.cpp"
    "${MONIQUE_CORE}/monique_core_Datastructures.cpp"
    "${MONIQUE_CORE}/monique_core_Parameters.cpp"
    "${MONIQUE_CORE}/monique_core_Processor.cpp"
    "${MONIQUE_CORE}/mono_AudioDeviceManager.cpp"
)

# UI source needed by Processor (Refresher has non-inline methods)
set(MONIQUE_UI_SOURCES
    "${MONIQUE_SRC}/ui/monique_ui_Refresher.cpp"
)

# WASM Wrapper
set(WRAPPER_SOURCES
    "${CMAKE_SOURCE_DIR}/MoniqueSynth.cpp"
)

add_executable(MoniqueWASMBuild
    ${WRAPPER_SOURCES}
    ${MONIQUE_CORE_SOURCES}
    ${MONIQUE_UI_SOURCES}
)

# Include directories — ORDER MATTERS for stub overrides
# 1. Our stub module headers (juce_audio_processors/, juce_gui_basics/, etc.) — MUST be first
#    These intercept includes for modules we DON'T compile with real JUCE.
# 2. Real JUCE module headers (juce_core/, juce_audio_basics/, juce_events/, juce_data_structures/)
#    These provide the actual implementations backed by libjuce-wasm.a.
# 3. Our source stubs (Monique UI headers, version.h, BinaryData.h, etc.)
# 4. JUCE lib dir (for JuceWasmConfig.h)
# 5. Common WASMSynthBase
# 6. Monique source root and core dir
target_include_directories(MoniqueWASMBuild PRIVATE
    "${CMAKE_SOURCE_DIR}/juce_shim_headers_v2"   # Stub module headers (audio_processors, gui_basics, etc.)
    "${JUCE_MODULES_DIR}"                         # Real JUCE module headers (core, audio_basics, etc.)
    "${CMAKE_SOURCE_DIR}/source_stubs"            # UI stubs, version.h, BinaryData.h, libMTSClient.h
    "${JUCE_LIB_DIR}"                             # JuceWasmConfig.h
    "${CMAKE_SOURCE_DIR}/../common"               # WASMSynthBase.h, WASMExports.h
    "${MONIQUE_SRC}"                              # App.h, and resolution base for core/ and ui/
    "${MONIQUE_CORE}"                             # Sibling headers in core/
)

target_compile_definitions(MoniqueWASMBuild PRIVATE
    MONIQUE_WASM=1
    NDEBUG=1
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    # App.h's ROOT_FOLDER #if chain has no WASM case — define it here
    ROOT_FOLDER=userApplicationDataDirectory
    # Ensure non-standalone path in mono_AudioDeviceManager.h
    # (IS_STANDALONE_WITH_OWN_AUDIO_MANAGER_AND_MIDI_HANDLING must NOT be defined)
)

set_target_properties(MoniqueWASMBuild PROPERTIES
    OUTPUT_NAME "Monique"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/monique"
)

# Link against the real JUCE WASM static library
target_link_libraries(MoniqueWASMBuild PRIVATE
    "${JUCE_LIB_DIR}/build/libjuce-wasm.a"
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
    "SHELL:-s INITIAL_MEMORY=67108864"  # 64MB initial (with factory preset data)
    "SHELL:--bind"
    -O3
)

target_compile_options(MoniqueWASMBuild PRIVATE
    -O3
    -std=c++17
    -fexceptions
    -include "${JUCE_LIB_DIR}/JuceWasmConfig.h"
    -Wno-deprecated-declarations
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-sign-compare
    -Wno-reorder
)
