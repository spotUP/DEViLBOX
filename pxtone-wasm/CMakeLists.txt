cmake_minimum_required(VERSION 3.13)
project(pxtone-wasm C CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_C_STANDARD 99)

set(PXTONE_DIR "${CMAKE_SOURCE_DIR}/src/pxtone")
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/pxtone")

file(GLOB PXTONE_SOURCES "${PXTONE_DIR}/*.cpp")

add_executable(Pxtone
    src/pxtone_harness.cpp
    ${PXTONE_SOURCES}
)

target_include_directories(Pxtone PRIVATE
    src
    src/stb_vorbis
)

# stb_vorbis is header-only, included by pxtnPulse_Oggv.cpp via pxtnPulse_Oggv.h
# Check if it needs STB_VORBIS_HEADER_ONLY or implementation
# pxtnPulse_Oggv.cpp includes it directly, we may need an impl compilation unit

target_compile_definitions(Pxtone PRIVATE
    _WASM
    pxINCLUDE_OGGVORBIS
    pxINCLUDE_OGGVORBIS_STB
)

target_compile_options(Pxtone PRIVATE
    -O2
    -Wno-deprecated
)

set_target_properties(Pxtone PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
    SUFFIX ".js"
)

target_link_options(Pxtone PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createPxtone'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_pxtone_init','_pxtone_stop','_pxtone_render','_pxtone_get_sample_rate']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32','HEAPU8','wasmMemory']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s SINGLE_FILE=0"
)
