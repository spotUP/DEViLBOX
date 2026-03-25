cmake_minimum_required(VERSION 3.10)
# Casio FZ Series PCM WASM Build
# Based on MAME's fz_pcm emulator by Devin Acker
# Standalone version without MAME framework dependencies
#
# The Casio FZ-1/FZ-20M (1987) PCM engine: 8-voice sample playback
# with fractional pitch, loop with trace/skip modes, reverse playback.

set(FZ_SOURCES
    FZSynth.cpp
)

add_executable(FZ_WASM ${FZ_SOURCES})

target_include_directories(FZ_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${FZ_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(FZ_WASM PROPERTIES
    OUTPUT_NAME "FZ"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(FZ_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFZModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
