cmake_minimum_required(VERSION 3.13)
project(Organya C)

set(CMAKE_C_STANDARD 11)

add_executable(Organya src/organya_harness.c)
target_include_directories(Organya PRIVATE src)
target_compile_definitions(Organya PRIVATE ORG_USE_STDINT ORG_NO_STDIO)

if(EMSCRIPTEN)
  set_target_properties(Organya PROPERTIES
    OUTPUT_NAME "Organya"
    SUFFIX ".js"
  )
  target_link_options(Organya PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createOrganya'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_organya_init','_organya_stop','_organya_render','_organya_set_sample_rate','_organya_get_tempo','_organya_get_num_channels','_organya_load_soundbank','_organya_set_channel_gain','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPF32']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s STACK_SIZE=65536"
    -O2
  )
endif()
