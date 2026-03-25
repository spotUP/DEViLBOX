cmake_minimum_required(VERSION 3.10)
# Samsung KS0164 Wavetable Synthesizer WASM Build
# Based on MAME's ks0164 emulator by Olivier Galibert
# Standalone version without MAME framework dependencies
#
# 32-voice wavetable synth with 16-bit linear + 8-bit compressed
# sample playback, pitch interpolation, loop, volume ramping.
# Bypasses the embedded CPU — drives voice registers directly from MIDI.

set(KS0164_SOURCES
    KS0164Synth.cpp
)

add_executable(KS0164_WASM ${KS0164_SOURCES})

target_include_directories(KS0164_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${KS0164_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(KS0164_WASM PROPERTIES
    OUTPUT_NAME "KS0164"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(KS0164_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createKS0164Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
