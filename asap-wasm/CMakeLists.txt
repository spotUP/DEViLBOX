cmake_minimum_required(VERSION 3.13)
project(AsapWasm C)

set(CMAKE_C_STANDARD 11)

add_executable(Asap
  src/asap.c
  src/asap_wasm.c
)

target_include_directories(Asap PRIVATE src)

# Emscripten settings
set_target_properties(Asap PROPERTIES
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/asap"
)

target_link_options(Asap PRIVATE
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME=createAsap"
  "SHELL:-s EXPORTED_FUNCTIONS=[_malloc,_free,_asap_wasm_init,_asap_wasm_load,_asap_wasm_render,_asap_wasm_get_channels,_asap_wasm_get_songs,_asap_wasm_get_duration,_asap_wasm_get_position,_asap_wasm_seek,_asap_wasm_play_song,_asap_wasm_stop,_asap_wasm_get_pokey_volume,_asap_wasm_mute_channels]"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=[wasmMemory]"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s MAXIMUM_MEMORY=16777216"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT=web,worker"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
  -O2
)
