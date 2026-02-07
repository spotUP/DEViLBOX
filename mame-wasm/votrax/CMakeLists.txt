cmake_minimum_required(VERSION 3.10)
# Votrax SC-01 (Formant Speech Synthesizer) WASM Build
# Based on MAME's Votrax SC-01A simulation by Olivier Galibert
# Standalone version without MAME framework dependencies

set(VOTRAX_SOURCES
    VotraxSynth.cpp
)

add_executable(VOTRAX_WASM ${VOTRAX_SOURCES})

target_include_directories(VOTRAX_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${VOTRAX_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare"
)

set_target_properties(VOTRAX_WASM PROPERTIES
    OUTPUT_NAME "Votrax"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(VOTRAX_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createVotraxModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
