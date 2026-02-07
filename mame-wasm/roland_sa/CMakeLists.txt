cmake_minimum_required(VERSION 3.10)
# Roland SA Sound Generator WASM Build
# Silicon-accurate gate array emulation from Roland SA-synthesis digital pianos
# 16 voices x 10 parts, 3 wave ROMs (384KB total)

set(ROLANDSA_SOURCES
    RolandSASynth.cpp
)

add_executable(RolandSA_WASM ${ROLANDSA_SOURCES})

target_include_directories(RolandSA_WASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_SOURCE_DIR}/common
)

set_source_files_properties(${ROLANDSA_SOURCES} PROPERTIES COMPILE_FLAGS
    "-O3 -std=c++17 -Wno-deprecated-declarations -Wno-unused-variable -Wno-sign-compare -Wno-constant-logical-operand"
)

set_target_properties(RolandSA_WASM PROPERTIES
    OUTPUT_NAME "RolandSA"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mame"
)

target_link_options(RolandSA_WASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createRolandSAModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)
