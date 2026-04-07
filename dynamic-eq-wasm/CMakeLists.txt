cmake_minimum_required(VERSION 3.20)
project(DynamicEQ VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(DynamicEQ DynamicEQWASM.cpp)
set_target_properties(DynamicEQ PROPERTIES
  OUTPUT_NAME "DynamicEQ"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/dynamic-eq"
)

target_link_options(DynamicEQ PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createDynamicEQ'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_dynamic_eq_create','_dynamic_eq_destroy','_dynamic_eq_process','_dynamic_eq_set_detectFreq','_dynamic_eq_set_detectQ','_dynamic_eq_set_processFreq','_dynamic_eq_set_processQ','_dynamic_eq_set_threshold','_dynamic_eq_set_maxGain','_dynamic_eq_set_attack','_dynamic_eq_set_release','_dynamic_eq_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
