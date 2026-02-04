# Dexed (DX7 FM Synthesizer) WASM Build
# Uses the msfa engine from music-synthesizer-for-android (Apache 2.0)

set(DEXED_SOURCES
    DexedSynth.cpp
    EngineMkI.cpp
    msfa/dx7note.cc
    msfa/env.cc
    msfa/exp2.cc
    msfa/fm_core.cc
    msfa/fm_op_kernel.cc
    msfa/freqlut.cc
    msfa/lfo.cc
    msfa/pitchenv.cc
    msfa/porta.cpp
    msfa/sin.cc
    msfa/tuning.cc
)

add_executable(DexedWASM ${DEXED_SOURCES})

target_include_directories(DexedWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/msfa
    ${CMAKE_SOURCE_DIR}/common
)

# Define WASM-specific macros
target_compile_definitions(DexedWASM PRIVATE
    DEXED_WASM=1
)

set_target_properties(DexedWASM PROPERTIES
    OUTPUT_NAME "Dexed"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/dexed"
)

target_link_options(DexedWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createDexedModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(DexedWASM PRIVATE -O3 -std=c++17)
