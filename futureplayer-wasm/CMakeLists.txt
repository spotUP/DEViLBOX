cmake_minimum_required(VERSION 3.13)
project(FuturePlayer C)

set(CMAKE_C_STANDARD 11)

add_executable(FuturePlayer src/fp_harness.c src/FuturePlayer.c src/paula_soft.c)
target_include_directories(FuturePlayer PRIVATE src)

# Emscripten settings
if(EMSCRIPTEN)
  set_target_properties(FuturePlayer PROPERTIES
    OUTPUT_NAME "FuturePlayer"
    SUFFIX ".js"
  )
  target_link_options(FuturePlayer PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createFuturePlayer'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_fp_wasm_init','_fp_wasm_render','_fp_wasm_stop','_fp_wasm_get_sample_rate','_fp_wasm_get_num_subsongs','_fp_wasm_set_subsong','_fp_wasm_get_voice_length','_fp_wasm_get_cell','_fp_wasm_set_cell','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPF32']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s STACK_SIZE=65536"
    -O2
  )
endif()
