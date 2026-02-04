# TIA (Atari) - Television Interface Adaptor Sound
# Polynomial counter-based synthesis with 16 audio modes
# Used in: Atari 2600 (1977) - Pitfall!, Space Invaders, Adventure, etc.

set(TIA_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/TIASynth.cpp
)

add_executable(TIA_WASM ${TIA_SOURCES})

set_target_properties(TIA_WASM PROPERTIES
    OUTPUT_NAME "TIA"
    SUFFIX ".js"
)

target_link_options(TIA_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createTIAModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:--bind"
    "SHELL:-O3"
)
