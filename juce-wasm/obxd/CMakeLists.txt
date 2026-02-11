cmake_minimum_required(VERSION 3.15)
project(OBXdWASM VERSION 1.0.0)

# OB-Xd (Oberheim Synthesizer) WASM Build
# Based on the discoDSP OB-Xd synthesizer

set(OBXD_SOURCES
    OBXdSynth.cpp
)

add_executable(OBXdWASM ${OBXD_SOURCES})

target_include_directories(OBXdWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/../common
)

set_target_properties(OBXdWASM PROPERTIES
    OUTPUT_NAME "OBXd"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/obxd"
)

target_link_options(OBXdWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOBXdModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(OBXdWASM PRIVATE -O3 -std=c++17)
