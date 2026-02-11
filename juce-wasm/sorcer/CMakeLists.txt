# Sorcer Synth - WASM Build
# Based on OpenAV Sorcer (GPL2) by OpenAV Productions
# FAUST-generated DSP — no external dependencies beyond wavetable data.
#
# Build:
#   cd juce-wasm/sorcer && mkdir -p build && cd build
#   emcmake cmake .. && emmake make -j$(nproc)

cmake_minimum_required(VERSION 3.15)
project(SorcerWASM VERSION 1.0.0)

set(SORCER_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/sorcer-master")

add_executable(SorcerWASMBuild
    "${CMAKE_SOURCE_DIR}/SorcerWASM.cpp"
)

target_include_directories(SorcerWASMBuild PRIVATE
    "${SORCER_ROOT}/wavetables"            # wavetable_shout_0.h etc.
    "${CMAKE_SOURCE_DIR}/../common"        # WASMSynthBase.h, WASMExports.h
)

target_compile_definitions(SorcerWASMBuild PRIVATE
    SORCER_WASM=1
    NDEBUG=1
)

set_target_properties(SorcerWASMBuild PROPERTIES
    OUTPUT_NAME "Sorcer"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/sorcer"
)

target_link_options(SorcerWASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSorcerModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=16777216"  # 16MB initial
    "SHELL:--bind"
    -O3
)

target_compile_options(SorcerWASMBuild PRIVATE
    -O3
    -std=c++17
    -fno-exceptions
    -Wno-deprecated-declarations
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-sign-compare
    -Wno-c++11-narrowing
    -Wno-implicit-int-float-conversion
)
