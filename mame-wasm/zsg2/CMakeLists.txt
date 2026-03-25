cmake_minimum_required(VERSION 3.10)
# ZOOM ZSG-2 Wavetable Synthesizer WASM Build
# Based on MAME's zsg2 emulator by Olivier Galibert, R. Belmont, hap, superctr
# Standalone version without MAME framework dependencies
#
# 48-channel wavetable synth with 2:1 compressed samples,
# emphasis filter, IIR lowpass with ramping, volume ramping,
# 4 output busses (reverb, chorus, left, right).

set(ZSG2_SOURCES
    ZSG2Synth.cpp
)

add_executable(ZSG2_WASM ${ZSG2_SOURCES})

target_include_directories(ZSG2_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${ZSG2_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(ZSG2_WASM PROPERTIES
    OUTPUT_NAME "ZSG2"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(ZSG2_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createZSG2Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
