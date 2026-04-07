cmake_minimum_required(VERSION 3.20)
project(GEQ31 VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(GEQ31 GEQ31WASM.cpp)
set_target_properties(GEQ31 PROPERTIES
  OUTPUT_NAME "GEQ31"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/geq31"
)

target_link_options(GEQ31 PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createGEQ31'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_geq31_create','_geq31_destroy','_geq31_process','_geq31_set_band','_geq31_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
