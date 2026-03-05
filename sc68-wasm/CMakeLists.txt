cmake_minimum_required(VERSION 3.10)
project(sc68-wasm C)

set(CMAKE_C_STANDARD 11)

# sc68 source directories
set(SC68_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/sc68)

file(GLOB_RECURSE SC68_SOURCES
  ${SC68_SRC_DIR}/libsc68/*.c
  ${SC68_SRC_DIR}/file68/*.c
  ${SC68_SRC_DIR}/emu68/*.c
  ${SC68_SRC_DIR}/io68/*.c
)

set(BRIDGE_SRC ${CMAKE_CURRENT_SOURCE_DIR}/src/sc68_bridge.c)

add_executable(SC68 ${SC68_SOURCES} ${BRIDGE_SRC})

target_include_directories(SC68 PRIVATE
  ${SC68_SRC_DIR}
  ${SC68_SRC_DIR}/libsc68
  ${SC68_SRC_DIR}/file68
  ${SC68_SRC_DIR}/emu68
  ${SC68_SRC_DIR}/io68
)

set_target_properties(SC68 PROPERTIES
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../public/sc68
)

target_link_options(SC68 PRIVATE
  -s MODULARIZE=1
  -s EXPORT_NAME='createSC68'
  -s EXPORTED_FUNCTIONS='[
    "_sc68_bridge_init",
    "_sc68_bridge_load",
    "_sc68_bridge_close",
    "_sc68_bridge_play",
    "_sc68_bridge_process",
    "_sc68_bridge_stop",
    "_sc68_bridge_get_tracks",
    "_sc68_bridge_get_title",
    "_sc68_bridge_get_author",
    "_sc68_bridge_get_duration",
    "_sc68_bridge_tell",
    "_sc68_bridge_track_ended",
    "_malloc",
    "_free"
  ]'
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","UTF8ToString","HEAPU8","HEAP16"]'
  -s ALLOW_MEMORY_GROWTH=1
  -s INITIAL_MEMORY=8388608
  -s ENVIRONMENT='web,worker'
  -s NO_EXIT_RUNTIME=1
  -s FILESYSTEM=0
  -O2
)
