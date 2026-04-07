cmake_minimum_required(VERSION 3.20)
project(VintageDelay VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(VintageDelay VintageDelayWASM.cpp)
set_target_properties(VintageDelay PROPERTIES OUTPUT_NAME "VintageDelay" SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/vintage-delay")
target_link_options(VintageDelay PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createVintageDelay'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_vintage_delay_create','_vintage_delay_destroy','_vintage_delay_process','_vintage_delay_set_time','_vintage_delay_set_feedback','_vintage_delay_set_cutoff','_vintage_delay_set_drive','_vintage_delay_set_mix']"
  "SHELL:-s INITIAL_MEMORY=16777216"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2)
