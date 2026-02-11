# MVerb WASM Effect Build
# Martin Eastwood's MVerb plate reverb (GPL v3)

set(MVERB_SOURCES
    MVerbEffect.cpp
)

add_executable(MVerbWASM ${MVERB_SOURCES})

target_include_directories(MVerbWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_target_properties(MVerbWASM PROPERTIES
    OUTPUT_NAME "MVerb"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mverb"
)

target_link_options(MVerbWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createMVerbModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(MVerbWASM PRIVATE -O3 -std=c++17)
