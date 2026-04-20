cmake_minimum_required(VERSION 3.15)
project(DattorroPlateWASM VERSION 1.0.0)

# Dattorro Plate WASM Effect Build
# el-visio/dattorro-verb (MIT) — Jon Dattorro 1997 plate reverb

# Compile the C source as C99 (it uses <stdbool.h>, designated init, etc.)
set_source_files_properties(verb.c PROPERTIES LANGUAGE C)

set(DATTORRO_SOURCES
    DattorroPlateEffect.cpp
    verb.c
)

add_executable(DattorroPlateWASM ${DATTORRO_SOURCES})

target_include_directories(DattorroPlateWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../common
)

set_target_properties(DattorroPlateWASM PROPERTIES
    OUTPUT_NAME "DattorroPlate"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/dattorro-plate"
)

target_link_options(DattorroPlateWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createDattorroPlateModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=0"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(DattorroPlateWASM PRIVATE -O3)

# The C source needs -std=c99 explicitly since the wrapper is C++ 17 and
# CMake would otherwise apply C++ flags to verb.c.
set_source_files_properties(verb.c PROPERTIES COMPILE_FLAGS "-std=c99")
set_source_files_properties(DattorroPlateEffect.cpp PROPERTIES COMPILE_FLAGS "-std=c++17")
