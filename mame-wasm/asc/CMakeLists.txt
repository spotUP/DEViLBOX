cmake_minimum_required(VERSION 3.10)
# ASC (Apple Sound Chip) - 4-Voice Wavetable Synthesizer
# 512-sample wavetable with 9.15 fixed-point phase accumulator
# Used in: Macintosh SE, II, LC, Classic (1987-1993)

set(ASC_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/ASCSynth.cpp
)

add_executable(ASC_WASM ${ASC_SOURCES})

set_target_properties(ASC_WASM PROPERTIES
    OUTPUT_NAME "ASC"
    SUFFIX ".js"
)

target_link_options(ASC_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createASCModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:--bind"
    "SHELL:-O3"
)
