cmake_minimum_required(VERSION 3.10)
# VLM5030 (Sanyo Konami LPC Speech) WASM Build
# Based on MAME's VLM5030 emulator by Tatsuyuki Satoh
# Standalone version without MAME framework dependencies

set(VLM5030_SOURCES
    VLM5030Synth.cpp
)

add_executable(VLM5030_WASM ${VLM5030_SOURCES})

target_include_directories(VLM5030_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${VLM5030_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(VLM5030_WASM PROPERTIES
    OUTPUT_NAME "VLM5030"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(VLM5030_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createVLM5030Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
