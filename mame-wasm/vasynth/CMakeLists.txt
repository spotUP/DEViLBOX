cmake_minimum_required(VERSION 3.10)
# VASynth - Virtual Analog Subtractive Synthesizer
# Combines MAME VA building blocks: RC envelope, VCA, 4th-order TPT LPF
# Based on: CEM3320/CEM3360/CA3280 analog synth IC emulations

set(VASYNTH_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/VASynth.cpp
)

add_executable(VASYNTH_WASM ${VASYNTH_SOURCES})

set_target_properties(VASYNTH_WASM PROPERTIES
    OUTPUT_NAME "VASynth"
    SUFFIX ".js"
)

target_link_options(VASYNTH_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createVASynthModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:--bind"
    "SHELL:-O3"
)
