# OB-Xf - WASM Build
# Based on OB-Xf by Surge Synth Team / Vadim Filatov (GPL3)
# Header-only DSP engine, no .cpp files needed.
#
# Build:
#   cd juce-wasm/obxf && mkdir -p build && cd build
#   emcmake cmake .. && emmake make -j$(nproc)

cmake_minimum_required(VERSION 3.15)
project(OBXfWASM VERSION 1.0.0)

set(OBXF_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/OB-Xf-main")

add_executable(OBXfWASMBuild
    "${CMAKE_SOURCE_DIR}/OBXfWASM.cpp"
)

# Include order matters: stubs and shims BEFORE real engine headers
# so our stub Program.h / MidiMap.h take precedence over the real ones.
target_include_directories(OBXfWASMBuild PRIVATE
    "${CMAKE_SOURCE_DIR}/stubs"             # Stub Program.h, MidiMap.h (override real ones)
    "${CMAKE_SOURCE_DIR}/shims"             # JUCE shims (juce_core/, juce_dsp/, libMTSClient.h)
    "${OBXF_ROOT}/src/engine"               # SynthEngine.h, Voice.h, Filter.h, etc.
    "${OBXF_ROOT}/src/core"                 # Constants.h
    "${OBXF_ROOT}/src"                      # configuration.h
    "${CMAKE_SOURCE_DIR}/../common"         # WASMSynthBase.h, WASMExports.h
)

target_compile_definitions(OBXfWASMBuild PRIVATE
    OBXF_WASM=1
    NDEBUG=1
)

set_target_properties(OBXfWASMBuild PROPERTIES
    OUTPUT_NAME "OBXf"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/obxf"
)

target_link_options(OBXfWASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOBXfModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=16777216"  # 16MB initial
    "SHELL:--bind"
    -O3
)

target_compile_options(OBXfWASMBuild PRIVATE
    -O3
    -std=c++17
    -fno-exceptions
    -include "${CMAKE_SOURCE_DIR}/wasm_predefines.h"
    -Wno-deprecated-declarations
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-sign-compare
    -Wno-reorder
    -Wno-unused-private-field
    -Wno-missing-field-initializers
)
