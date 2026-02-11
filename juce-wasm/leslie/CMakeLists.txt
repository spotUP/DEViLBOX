# Leslie Rotary Speaker WASM Effect Build
# Built from scratch for DEViLBOX

set(LESLIE_SOURCES
    LeslieEffect.cpp
)

add_executable(LeslieWASM ${LESLIE_SOURCES})

target_include_directories(LeslieWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_target_properties(LeslieWASM PROPERTIES
    OUTPUT_NAME "Leslie"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/leslie"
)

target_link_options(LeslieWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createLeslieModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(LeslieWASM PRIVATE -O3 -std=c++17)
