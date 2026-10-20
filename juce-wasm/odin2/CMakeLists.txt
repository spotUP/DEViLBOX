# Odin2 audio engine - WASM build of the REAL upstream OdinAudioProcessor.
# Based on Odin2 by The Wave Warden (GPL v3).
#
# Source list, include dirs and defines are shared with the editor build (../odin2-ui) via
# Odin2Sources.cmake, so the two modules can never diverge.
#
# Build:
#   cd juce-wasm/odin2 && mkdir -p build && cd build
#   emcmake cmake .. && emmake make -j8

cmake_minimum_required(VERSION 3.15)
project(Odin2WASM VERSION 2.4.1 LANGUAGES CXX)

set(ODIN2_UI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../odin2-ui")
include("${ODIN2_UI_DIR}/Odin2Sources.cmake")

add_executable(Odin2WASMBuild ${ODIN2_ALL_SOURCES} "${CMAKE_CURRENT_SOURCE_DIR}/Odin2WASM.cpp")

target_include_directories(Odin2WASMBuild PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/../common"   # WASMSynthBase.h
    ${ODIN2_INCLUDE_DIRS}
)
target_compile_definitions(Odin2WASMBuild PRIVATE ${ODIN2_COMPILE_DEFS})
target_compile_options(Odin2WASMBuild PRIVATE ${ODIN2_COMPILE_OPTS})

target_link_libraries(Odin2WASMBuild PRIVATE "${JUCE_LIB}")

set_target_properties(Odin2WASMBuild PROPERTIES
    OUTPUT_NAME "Odin2"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/odin2"
)

target_link_options(Odin2WASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOdin2Module'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s STACK_SIZE=1048576"
    "SHELL:-s INITIAL_MEMORY=134217728"
    "SHELL:-s USE_FREETYPE=1"
    "SHELL:--bind"
    -fexceptions
    -O2
)
