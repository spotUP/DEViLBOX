cmake_minimum_required(VERSION 3.14)
project(Fmplayer C)

set(CMAKE_C_STANDARD 11)

# Source root
set(SRC ${CMAKE_SOURCE_DIR}/src)

# ── libopna (YM2608 OPNA emulator) ──────────────────────────────────────
set(LIBOPNA_SRCS
  ${SRC}/libopna/opna.c
  ${SRC}/libopna/opnafm.c
  ${SRC}/libopna/opnassg.c
  ${SRC}/libopna/opnassg-sinc-c.c
  ${SRC}/libopna/opnadrum.c
  ${SRC}/libopna/opnaadpcm.c
  ${SRC}/libopna/opnatimer.c
)

# ── fmdriver (FMP format driver + PPZ8 PCM) ─────────────────────────────
set(FMDRIVER_SRCS
  ${SRC}/fmdriver/fmdriver_fmp.c
  ${SRC}/fmdriver/fmdriver_common.c
  ${SRC}/fmdriver/ppz8.c
)

# ── WASM bridge ─────────────────────────────────────────────────────────
set(BRIDGE_SRCS
  ${SRC}/fmplayer_wasm.c
)

add_executable(Fmplayer ${LIBOPNA_SRCS} ${FMDRIVER_SRCS} ${BRIDGE_SRCS})

target_include_directories(Fmplayer PRIVATE ${SRC})

# Output directory
set(OUTPUT_DIR ${CMAKE_SOURCE_DIR}/../public/fmplayer)
file(MAKE_DIRECTORY ${OUTPUT_DIR})

set_target_properties(Fmplayer PROPERTIES
  OUTPUT_NAME "Fmplayer"
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
  SUFFIX ".js"
)

# Emscripten flags
target_compile_options(Fmplayer PRIVATE
  -O2
  -fno-exceptions
)

# Exported functions
set(EXPORTED_FUNCTIONS
  "_fmplayer_wasm_init"
  "_fmplayer_wasm_load"
  "_fmplayer_wasm_render"
  "_fmplayer_wasm_get_loop_count"
  "_fmplayer_wasm_stop"
  "_fmplayer_wasm_set_mute_mask"
  "_fmplayer_wasm_get_fm_slot_param"
  "_fmplayer_wasm_set_fm_slot_param"
  "_fmplayer_wasm_get_fm_ch_param"
  "_fmplayer_wasm_set_fm_ch_param"
  "_fmplayer_wasm_get_ssg_param"
  "_fmplayer_wasm_set_ssg_param"
  "_fmplayer_wasm_get_fm_channel"
  "_malloc"
  "_free"
)
string(JOIN "," EXPORTS_STR ${EXPORTED_FUNCTIONS})

target_link_options(Fmplayer PRIVATE
  -O2
  "-sMODULARIZE=1"
  "-sEXPORT_NAME=createFmplayer"
  "-sEXPORTED_FUNCTIONS=[${EXPORTS_STR}]"
  "-sEXPORTED_RUNTIME_METHODS=[\"wasmMemory\"]"
  "-sALLOW_MEMORY_GROWTH=1"
  "-sINITIAL_MEMORY=4194304"
  "-sMAXIMUM_MEMORY=16777216"
  "-sSTACK_SIZE=65536"
  "-sNO_FILESYSTEM=1"
  "-sENVIRONMENT=web,worker"
  "-sWASM=1"
  --no-entry
)
