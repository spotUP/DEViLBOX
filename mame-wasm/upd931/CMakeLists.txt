cmake_minimum_required(VERSION 3.10)
# uPD931 (NEC/Casio) - Dual Waveform Keyboard Synthesizer
# Step-based waveform accumulation with mirror/invert modes
# Used in: Casio CT-8000, MT-65 keyboards (1981)

set(UPD931_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/UPD931Synth.cpp
)

add_executable(UPD931_WASM ${UPD931_SOURCES})

set_target_properties(UPD931_WASM PROPERTIES
    OUTPUT_NAME "UPD931"
    SUFFIX ".js"
)

target_link_options(UPD931_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createUPD931Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:--bind"
    "SHELL:-O3"
)
