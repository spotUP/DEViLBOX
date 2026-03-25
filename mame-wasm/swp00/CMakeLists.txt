cmake_minimum_required(VERSION 3.10)
# Yamaha SWP00 AWM2/MEG WASM Build
# Based on MAME's swp00 emulator by Olivier Galibert
# Standalone version without MAME framework dependencies
#
# The SWP00 (MU50): 32-voice rompler/DSP combo with multi-format
# sample decoding (16/12/8-bit + DPCM), LFO, filter, envelope,
# and volume ramping. MEG effects deferred.

set(SWP00_SOURCES
    SWP00Synth.cpp
)

add_executable(SWP00_WASM ${SWP00_SOURCES})

target_include_directories(SWP00_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${SWP00_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(SWP00_WASM PROPERTIES
    OUTPUT_NAME "SWP00"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(SWP00_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSWP00Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
