cmake_minimum_required(VERSION 3.10)
project(gme-wasm C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 14)

# GME source directory (clone game-music-emu here)
set(GME_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/src/game-music-emu/gme)

# Collect GME sources
file(GLOB GME_SOURCES
  ${GME_SRC_DIR}/*.cpp
  ${GME_SRC_DIR}/*.c
  ${GME_SRC_DIR}/*.h
)

# Bridge source
set(BRIDGE_SRC ${CMAKE_CURRENT_SOURCE_DIR}/src/gme_bridge.c)

add_executable(GME ${GME_SOURCES} ${BRIDGE_SRC})

target_include_directories(GME PRIVATE
  ${GME_SRC_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/src/game-music-emu
)

target_compile_definitions(GME PRIVATE
  HAVE_STDINT_H=1
  BLARGG_BUILD_DLL=0
)

# Emscripten flags
set_target_properties(GME PROPERTIES
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../public/gme
)

target_link_options(GME PRIVATE
  -s MODULARIZE=1
  -s EXPORT_NAME='createGME'
  -s EXPORTED_FUNCTIONS='[
    "_gme_bridge_open",
    "_gme_bridge_close",
    "_gme_bridge_track_count",
    "_gme_bridge_start_track",
    "_gme_bridge_play",
    "_gme_bridge_track_ended",
    "_gme_bridge_tell",
    "_gme_bridge_seek",
    "_gme_bridge_set_tempo",
    "_gme_bridge_voice_count",
    "_gme_bridge_mute_voice",
    "_gme_bridge_get_title",
    "_gme_bridge_get_author",
    "_gme_bridge_get_game",
    "_gme_bridge_get_system",
    "_gme_bridge_get_length",
    "_gme_bridge_get_intro_length",
    "_gme_bridge_get_loop_length",
    "_gme_bridge_enable_register_log",
    "_gme_bridge_get_register_log",
    "_gme_bridge_get_register_log_count",
    "_gme_bridge_clear_register_log",
    "_malloc",
    "_free"
  ]'
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue","UTF8ToString","HEAPU8","HEAP16"]'
  -s ALLOW_MEMORY_GROWTH=1
  -s INITIAL_MEMORY=4194304
  -s MAXIMUM_MEMORY=33554432
  -s ENVIRONMENT='web,worker'
  -s NO_EXIT_RUNTIME=1
  -s FILESYSTEM=0
  -s ASSERTIONS=0
  -O2
)
