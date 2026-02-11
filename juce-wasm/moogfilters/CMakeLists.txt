# MoogFilters WASM Effect Build
# 6 analog-modeled Moog ladder filter implementations

set(MOOGFILTERS_SOURCES
    MoogFiltersEffect.cpp
)

add_executable(MoogFiltersWASM ${MOOGFILTERS_SOURCES})

target_include_directories(MoogFiltersWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_target_properties(MoogFiltersWASM PROPERTIES
    OUTPUT_NAME "MoogFilters"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/moogfilters"
)

target_link_options(MoogFiltersWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createMoogFiltersModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(MoogFiltersWASM PRIVATE -O3 -std=c++17)
