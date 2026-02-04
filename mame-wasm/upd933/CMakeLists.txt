# uPD933 (NEC/Casio) - Phase Distortion Synthesis Chip
# Casio CZ-series PD synthesis with 8 waveforms, 3 envelope generators per voice
# Used in: Casio CZ-101, CZ-1000, CZ-1, CZ-3000, CZ-5000

set(UPD933_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/UPD933Synth.cpp
)

add_executable(UPD933_WASM ${UPD933_SOURCES})

set_target_properties(UPD933_WASM PROPERTIES
    OUTPUT_NAME "UPD933"
    SUFFIX ".js"
)

target_link_options(UPD933_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createUPD933Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:--bind"
    "SHELL:-O3"
)
