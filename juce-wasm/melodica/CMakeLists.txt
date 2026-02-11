# Melodica WASM Synth Build
# Built from scratch for DEViLBOX - monophonic reed instrument physical model

set(MELODICA_SOURCES
    MelodicaSynth.cpp
)

add_executable(MelodicaWASM ${MELODICA_SOURCES})

target_include_directories(MelodicaWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_target_properties(MelodicaWASM PROPERTIES
    OUTPUT_NAME "Melodica"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/melodica"
)

target_link_options(MelodicaWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createMelodicaModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(MelodicaWASM PRIVATE -O3 -std=c++17)
