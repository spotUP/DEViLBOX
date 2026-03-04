cmake_minimum_required(VERSION 3.13)
project(GTUltraWASM C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 14)

# Silence warnings for legacy C code
add_compile_options(
    -Wno-implicit-function-declaration
    -Wno-incompatible-pointer-types
    -Wno-int-conversion
    -Wno-pointer-sign
    -Wno-return-type
    -Wno-unused-variable
    -Wno-unused-but-set-variable
    -Wno-sign-compare
    -Wno-parentheses
    -Wno-format
    -Wno-writable-strings
    -Wno-deprecated-non-prototype
)

# Define guards so engine .c files don't try to define their own globals
# (we define them in GTUltraBridge.cpp)
# Actually — the engine files use their own #ifndef guards, so we DON'T
# define these here. Each .c file defines its own globals when not guarded.

# Emscripten filesystem for temp file I/O
add_compile_definitions(
    __EMSCRIPTEN__
)

# Source files — engine core
set(ENGINE_SOURCES
    src/gplay.c
    src/gsound.c
    src/gsid.cpp
    src/gsong.c
    src/ginstr.c
    src/gtable.c
    src/gorder.c
    src/gundo.c
    src/gfile.c
    src/gpattern.c
    src/greloc.c
    src/goatdata.c
    src/ginfo.c
    src/gfkeys.c
)

# reSID (standard)
file(GLOB RESID_SOURCES src/resid/*.cpp)

# reSID-fp (floating point)
file(GLOB RESIDFP_SOURCES src/resid-fp/*.cpp)

# 6510 assembler (for .sid export)
file(GLOB ASM_SOURCES src/asm/*.c)

# WASM bridge
set(BRIDGE_SOURCES
    src/GTUltraBridge.cpp
    src/bme_end.c
    src/bme_io_stub.c
)

add_executable(GTUltra
    ${ENGINE_SOURCES}
    ${RESID_SOURCES}
    ${RESIDFP_SOURCES}
    ${ASM_SOURCES}
    ${BRIDGE_SOURCES}
)

target_include_directories(GTUltra PRIVATE
    src
    src/resid
    src/resid-fp
    src/asm
)

target_compile_definitions(GTUltra PRIVATE
    VERSION="1.0.0"
)

# Emscripten link flags
set_target_properties(GTUltra PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "\
        -s MODULARIZE=1 \
        -s EXPORT_NAME='createGTUltra' \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s EXPORTED_RUNTIME_METHODS=['cwrap','ccall','HEAPU8','HEAPU16','HEAPU32','UTF8ToString'] \
        -s EXPORTED_FUNCTIONS=['_malloc','_free'] \
        -s FILESYSTEM=1 \
        -s FORCE_FILESYSTEM=1 \
        -s NO_EXIT_RUNTIME=1 \
        -s INITIAL_MEMORY=67108864 \
        -O3 \
        --no-entry \
        --embed-file ${CMAKE_SOURCE_DIR}/players/player.s@player.s \
        --embed-file ${CMAKE_SOURCE_DIR}/players/player3.s@player3.s \
        --embed-file ${CMAKE_SOURCE_DIR}/players/player9.s@player9.s \
        --embed-file ${CMAKE_SOURCE_DIR}/players/player12.s@player12.s \
        --embed-file ${CMAKE_SOURCE_DIR}/players/altplayer.s@altplayer.s \
        --embed-file ${CMAKE_SOURCE_DIR}/players/altplayer3.s@altplayer3.s \
        --embed-file ${CMAKE_SOURCE_DIR}/players/altplayer9.s@altplayer9.s \
        --embed-file ${CMAKE_SOURCE_DIR}/players/altplayer12.s@altplayer12.s \
    "
)
