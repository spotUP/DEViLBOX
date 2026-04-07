cmake_minimum_required(VERSION 3.20)
project(Masha VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Masha MashaWASM.cpp)
set_target_properties(Masha PROPERTIES
  OUTPUT_NAME "Masha"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/masha"
)

target_link_options(Masha PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMasha'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_masha_create','_masha_destroy','_masha_process','_masha_set_time','_masha_set_volume','_masha_set_passthrough','_masha_set_active','_masha_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
