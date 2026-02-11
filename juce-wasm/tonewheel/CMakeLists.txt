# Tonewheel Organ WASM Synth Build
# Built from scratch for DEViLBOX - Hammond-style tonewheel organ
#
# Build:
#   cd juce-wasm/tonewheel && mkdir -p build && cd build
#   emcmake cmake .. && emmake make -j$(nproc)

cmake_minimum_required(VERSION 3.15)
project(TonewheelWASM VERSION 1.0.0)

set(TONEWHEEL_SOURCES
    "${CMAKE_SOURCE_DIR}/TonewheelOrganSynth.cpp"
)

add_executable(TonewheelWASM ${TONEWHEEL_SOURCES})

target_include_directories(TonewheelWASM PRIVATE
    ${CMAKE_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/../common
)

set_target_properties(TonewheelWASM PROPERTIES
    OUTPUT_NAME "Tonewheel"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/tonewheel"
)

target_link_options(TonewheelWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createTonewheelModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(TonewheelWASM PRIVATE -O3 -std=c++17)
