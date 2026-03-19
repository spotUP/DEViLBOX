cmake_minimum_required(VERSION 3.10)
# S14001A (SSi TSI Speech IC - Berzerk) WASM Build
# Based on MAME's S14001A emulator by Ed Bernard, Jonathan Gevaryahu, hap
# Standalone version without MAME framework dependencies

set(S14001A_SOURCES
    S14001ASynth.cpp
)

add_executable(S14001A_WASM ${S14001A_SOURCES})

target_include_directories(S14001A_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${S14001A_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(S14001A_WASM PROPERTIES
    OUTPUT_NAME "S14001A"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(S14001A_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createS14001AModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
