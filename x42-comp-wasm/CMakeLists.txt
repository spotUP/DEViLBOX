cmake_minimum_required(VERSION 3.20)
project(X42Comp VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(X42Comp X42CompWASM.cpp)
set_target_properties(X42Comp PROPERTIES
  OUTPUT_NAME "X42Comp"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/x42-comp"
)

target_link_options(X42Comp PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createX42Comp'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_x42_comp_create','_x42_comp_destroy','_x42_comp_process','_x42_comp_set_threshold','_x42_comp_set_ratio','_x42_comp_set_attack','_x42_comp_set_release','_x42_comp_set_hold','_x42_comp_set_inputGain','_x42_comp_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
