cmake_minimum_required(VERSION 3.15)
project(GranularFreezeWASM VERSION 1.0.0)

# GranularFreeze WASM Effect Build
# Live-capture granular freeze effect

set(GRANULAR_SOURCES
    GranularFreezeEffect.cpp
)

add_executable(GranularFreezeWASM ${GRANULAR_SOURCES})

target_include_directories(GranularFreezeWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../common
)

set_target_properties(GranularFreezeWASM PROPERTIES
    OUTPUT_NAME "GranularFreeze"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/granular-freeze"
)

target_link_options(GranularFreezeWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createGranularFreezeModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=0"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(GranularFreezeWASM PRIVATE -O3 -std=c++17)
