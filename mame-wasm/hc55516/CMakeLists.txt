cmake_minimum_required(VERSION 3.10)
# HC55516 (Harris CVSD Speech Codec - Williams arcade) WASM Build
# Based on MAME's HC55516 emulator by Aaron Giles, Jonathan Gevaryahu
# Standalone version without MAME framework dependencies

set(HC55516_SOURCES
    HC55516Synth.cpp
)

add_executable(HC55516_WASM ${HC55516_SOURCES})

target_include_directories(HC55516_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${HC55516_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(HC55516_WASM PROPERTIES
    OUTPUT_NAME "HC55516"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(HC55516_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createHC55516Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
