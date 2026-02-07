cmake_minimum_required(VERSION 3.10)
# TMS5220 (Texas Instruments) - LPC Speech Synthesizer (Speak & Spell)
# 10-pole digital lattice filter with chirp/noise excitation
# Used in: Speak & Spell (1978), arcade games (Berzerk, Star Wars, Bagman)

set(TMS5220_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/TMS5220Synth.cpp
)

add_executable(TMS5220_WASM ${TMS5220_SOURCES})

set_target_properties(TMS5220_WASM PROPERTIES
    OUTPUT_NAME "TMS5220"
    SUFFIX ".js"
)

target_link_options(TMS5220_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createTMS5220Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:--bind"
    "SHELL:-O3"
)
