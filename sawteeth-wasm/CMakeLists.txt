cmake_minimum_required(VERSION 3.13)
project(Sawteeth C)

set(CMAKE_C_STANDARD 11)

add_executable(Sawteeth src/sawteeth.c)
target_include_directories(Sawteeth PRIVATE src)
target_link_libraries(Sawteeth m)

if(EMSCRIPTEN)
  set_target_properties(Sawteeth PROPERTIES
    OUTPUT_NAME "Sawteeth"
    SUFFIX ".js"
  )
  target_link_options(Sawteeth PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createSawteeth'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_sawteeth_init','_sawteeth_stop','_sawteeth_render','_sawteeth_set_sample_rate','_sawteeth_get_num_channels','_sawteeth_set_channel_gain','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPF32']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=4194304"
    "SHELL:-s STACK_SIZE=65536"
    -O2
  )
endif()
