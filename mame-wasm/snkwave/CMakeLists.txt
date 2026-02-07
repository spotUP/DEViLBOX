cmake_minimum_required(VERSION 3.10)
# SNKWave (SNK Wave Sound Generator) WASM Build
# Based on MAME's SNKWave emulator by Nicola Salmoria
# Standalone version without MAME framework dependencies

set(SNKWAVE_SOURCES
    SNKWaveSynth.cpp
)

add_executable(SNKWAVE_WASM ${SNKWAVE_SOURCES})

target_include_directories(SNKWAVE_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${SNKWAVE_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(SNKWAVE_WASM PROPERTIES
    OUTPUT_NAME "SNKWave"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(SNKWAVE_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSNKWaveModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
