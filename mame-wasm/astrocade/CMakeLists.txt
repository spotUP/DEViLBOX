cmake_minimum_required(VERSION 3.10)
# Astrocade Custom I/O Sound Chip WASM Build
# Based on MAME's Astrocade emulator by Aaron Giles / Frank Palazzolo
# Standalone version without MAME framework dependencies

set(ASTROCADE_SOURCES
    AstrocadeSynth.cpp
)

add_executable(ASTROCADE_WASM ${ASTROCADE_SOURCES})

target_include_directories(ASTROCADE_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${ASTROCADE_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(ASTROCADE_WASM PROPERTIES
    OUTPUT_NAME "Astrocade"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(ASTROCADE_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createAstrocadeModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
