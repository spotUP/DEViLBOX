cmake_minimum_required(VERSION 3.20)
project(EQ12Band VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(EQ12Band EQ12BandWASM.cpp)
set_target_properties(EQ12Band PROPERTIES
  OUTPUT_NAME "EQ12Band"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/eq12"
)

target_link_options(EQ12Band PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createEQ12Band'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_eq12_create','_eq12_destroy','_eq12_process','_eq12_set_freq','_eq12_set_gain','_eq12_set_q','_eq12_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
