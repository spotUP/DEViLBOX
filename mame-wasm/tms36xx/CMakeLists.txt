cmake_minimum_required(VERSION 3.10)
# TMS36XX (TMS3615/TMS3617) - Tone Matrix Synthesizer
# 6-note polyphonic organ tone generator with square wave oscillators
# Used in: Phoenix, Naughty Boy, Pleiads, Monster Bash

set(TMS36XX_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/TMS36XXSynth.cpp
)

add_executable(TMS36XX_WASM ${TMS36XX_SOURCES})

set_target_properties(TMS36XX_WASM PROPERTIES
    OUTPUT_NAME "TMS36XX"
    SUFFIX ".js"
)

target_link_options(TMS36XX_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createTMS36XXModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:--bind"
    "SHELL:-O3"
)
