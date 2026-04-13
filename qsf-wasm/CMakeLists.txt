cmake_minimum_required(VERSION 3.16)
project(qsf_wasm C)

set(CMAKE_C_STANDARD 11)

# ── Source files ─────────────────────────────────────────────────────────────

# psflib - PSF container parser
set(PSFLIB_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/psflib)
set(PSFLIB_SOURCES
    ${PSFLIB_DIR}/psflib.c
    ${PSFLIB_DIR}/psf2fs.c
)

# highly_quixotic - Z80 + QSound DSP emulator
set(HQ_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/highly_quixotic)
file(GLOB HQ_SOURCES ${HQ_DIR}/*.c)

# WASM bridge
set(BRIDGE_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/src/qsf_wasm.c)

# ── Build target ─────────────────────────────────────────────────────────────

add_executable(Qsf ${PSFLIB_SOURCES} ${HQ_SOURCES} ${BRIDGE_SOURCES})

target_include_directories(Qsf PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${PSFLIB_DIR}
    ${HQ_DIR}
)

target_compile_definitions(Qsf PRIVATE
    EMU_COMPILE
    EMU_LITTLE_ENDIAN
    HAVE_STDINT_H
)

# Suppress warnings from third-party code
target_compile_options(Qsf PRIVATE
    -w
)

# Output directory
set(OUTPUT_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../public/qsf)

# ── Emscripten link flags ────────────────────────────────────────────────────

set_target_properties(Qsf PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
    SUFFIX ".js"
)

target_link_options(Qsf PRIVATE
    -sEXPORTED_FUNCTIONS=['_malloc','_free','_qsf_wasm_init','_qsf_wasm_load','_qsf_wasm_render','_qsf_wasm_get_length','_qsf_wasm_stop','_qsf_wasm_dispose']
    -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap']
    -sMODULARIZE=1
    -sEXPORT_NAME='createQsf'
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=16777216
    -sSTACK_SIZE=1048576
    -sUSE_ZLIB=1
    -sENVIRONMENT=web,worker
    -sINVOKE_RUN=0
    -sNO_EXIT_RUNTIME=1
    -sFILESYSTEM=0
    -O2
)
