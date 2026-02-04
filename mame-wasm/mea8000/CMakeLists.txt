# MEA8000 (Philips/Signetics) - 4-Formant Speech Synthesizer
# Vocoder-style synthesis with sawtooth/noise excitation and 4 cascade filters
# Used in: Thomson MO5/TO7, Amstrad CPC, Oric Atmos (French speech extensions)

set(MEA8000_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/MEA8000Synth.cpp
)

add_executable(MEA8000_WASM ${MEA8000_SOURCES})

set_target_properties(MEA8000_WASM PROPERTIES
    OUTPUT_NAME "MEA8000"
    SUFFIX ".js"
)

target_link_options(MEA8000_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createMEA8000Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:--bind"
    "SHELL:-O3"
)
