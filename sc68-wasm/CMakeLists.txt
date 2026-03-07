cmake_minimum_required(VERSION 3.13)
project(sc68_wasm C)

set(CMAKE_C_STANDARD 99)

# SC68 source root (wothke's Emscripten-ready port)
set(SC68_SRC /tmp/sc68-wothke)

# --- Source files (matching wothke's makeEmscripten.sh) ---

set(SC68_SOURCES
    # API (high-level)
    ${SC68_SRC}/api68/api68.c
    ${SC68_SRC}/api68/conf68.c
    ${SC68_SRC}/api68/mixer68.c
    # EMU68 (68000 CPU emulator)
    ${SC68_SRC}/emu68/cc68.c
    ${SC68_SRC}/emu68/emu68.c
    ${SC68_SRC}/emu68/error68.c
    ${SC68_SRC}/emu68/getea68.c
    ${SC68_SRC}/emu68/inst68.c
    ${SC68_SRC}/emu68/ioplug68.c
    ${SC68_SRC}/emu68/mem68.c
    ${SC68_SRC}/emu68/line0_68.c
    ${SC68_SRC}/emu68/line1_68.c
    ${SC68_SRC}/emu68/line2_68.c
    ${SC68_SRC}/emu68/line3_68.c
    ${SC68_SRC}/emu68/line4_68.c
    ${SC68_SRC}/emu68/line5_68.c
    ${SC68_SRC}/emu68/line6_68.c
    ${SC68_SRC}/emu68/line7_68.c
    ${SC68_SRC}/emu68/line8_68.c
    ${SC68_SRC}/emu68/line9_68.c
    ${SC68_SRC}/emu68/lineA_68.c
    ${SC68_SRC}/emu68/lineB_68.c
    ${SC68_SRC}/emu68/lineC_68.c
    ${SC68_SRC}/emu68/lineD_68.c
    ${SC68_SRC}/emu68/lineE_68.c
    ${SC68_SRC}/emu68/lineF_68.c
    ${SC68_SRC}/emu68/table68.c
    # FILE68 (file format support)
    ${SC68_SRC}/file68/alloc68.c
    ${SC68_SRC}/file68/debugmsg68.c
    ${SC68_SRC}/file68/endian68.c
    ${SC68_SRC}/file68/error68.c
    ${SC68_SRC}/file68/file68.c
    ${SC68_SRC}/file68/gzip68.c
    ${SC68_SRC}/file68/ice68.c
    ${SC68_SRC}/file68/istream68.c
    ${SC68_SRC}/file68/istream68_fd.c
    ${SC68_SRC}/file68/istream68_file.c
    ${SC68_SRC}/file68/istream68_mem.c
    ${SC68_SRC}/file68/string68.c
    # IO68 (YM2149, MFP, Paula, MW, Shifter)
    ${SC68_SRC}/io68/mfp_io.c
    ${SC68_SRC}/io68/mfpemul.c
    ${SC68_SRC}/io68/mw_io.c
    ${SC68_SRC}/io68/mwemul.c
    ${SC68_SRC}/io68/paula_io.c
    ${SC68_SRC}/io68/paulaemul.c
    ${SC68_SRC}/io68/shifter_io.c
    ${SC68_SRC}/io68/ym_io.c
    ${SC68_SRC}/io68/ymemul.c
    # UNICE68 (ICE depacker)
    ${SC68_SRC}/unice68/unice68_native.c
    # SC68 high-level player
    ${SC68_SRC}/sc68/sc68.c
    # Wrapper
    ${CMAKE_SOURCE_DIR}/src/sc68_wrapper.c
)

add_executable(sc68_wasm ${SC68_SOURCES})

target_include_directories(sc68_wasm PRIVATE
    ${SC68_SRC}                    # config68.h and all sub-dirs
)

target_compile_definitions(sc68_wasm PRIVATE
    ONDEMAND=1
    EMSCRIPTEN=1
)

target_compile_options(sc68_wasm PRIVATE
    -O2
    -Wno-pointer-sign
    -Wno-implicit-function-declaration
    -Wno-int-conversion
    -Wno-incompatible-pointer-types
)

# Emscripten output
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/sc68")

set_target_properties(sc68_wasm PROPERTIES
    OUTPUT_NAME "Sc68"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
    LINK_FLAGS "\
        -s MODULARIZE=1 \
        -s EXPORT_NAME='createSc68' \
        -s EXPORTED_FUNCTIONS='[\"_malloc\",\"_free\",\"_sc68_wasm_init\",\"_sc68_wasm_render\",\"_sc68_wasm_stop\",\"_sc68_wasm_set_channel_gain\"]' \
        -s EXPORTED_RUNTIME_METHODS='[\"ccall\",\"cwrap\"]' \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=16777216 \
        --no-entry \
        -O2 \
    "
)
