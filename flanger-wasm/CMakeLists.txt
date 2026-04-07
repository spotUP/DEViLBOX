cmake_minimum_required(VERSION 3.20)
project(Flanger VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Flanger FlangerWASM.cpp)
set_target_properties(Flanger PROPERTIES
  OUTPUT_NAME "Flanger"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/flanger"
)

target_link_options(Flanger PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createFlanger'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_flanger_create','_flanger_destroy','_flanger_process','_flanger_set_rate','_flanger_set_depth','_flanger_set_delay','_flanger_set_feedback','_flanger_set_stereo','_flanger_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
