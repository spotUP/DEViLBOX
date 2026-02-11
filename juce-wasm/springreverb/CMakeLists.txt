# Spring Reverb WASM Effect Build
# Built from scratch for DEViLBOX - classic dub spring tank

set(SPRINGREVERB_SOURCES
    SpringReverbEffect.cpp
)

add_executable(SpringReverbWASM ${SPRINGREVERB_SOURCES})

target_include_directories(SpringReverbWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_target_properties(SpringReverbWASM PROPERTIES
    OUTPUT_NAME "SpringReverb"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/springreverb"
)

target_link_options(SpringReverbWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSpringReverbModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(SpringReverbWASM PRIVATE -O3 -std=c++17)
