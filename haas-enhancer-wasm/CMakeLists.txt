cmake_minimum_required(VERSION 3.20)
project(HaasEnhancer VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(HaasEnhancer HaasEnhancerWASM.cpp)
set_target_properties(HaasEnhancer PROPERTIES
  OUTPUT_NAME "HaasEnhancer"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/haas-enhancer"
)

target_link_options(HaasEnhancer PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createHaasEnhancer'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_haas_enhancer_create','_haas_enhancer_destroy','_haas_enhancer_process','_haas_enhancer_set_delay','_haas_enhancer_set_side','_haas_enhancer_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
