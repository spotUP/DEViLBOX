cmake_minimum_required(VERSION 3.20)
project(MultiSpread VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MultiSpread MultiSpreadWASM.cpp)
set_target_properties(MultiSpread PROPERTIES
  OUTPUT_NAME "MultiSpread"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multi-spread"
)

target_link_options(MultiSpread PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMultiSpread'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multi_spread_create','_multi_spread_destroy','_multi_spread_process','_multi_spread_set_bands','_multi_spread_set_spread','_multi_spread_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
