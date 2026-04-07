cmake_minimum_required(VERSION 3.20)
project(Clipper VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Clipper ClipperWASM.cpp)
set_target_properties(Clipper PROPERTIES
  OUTPUT_NAME "Clipper"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/clipper"
)

target_link_options(Clipper PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createClipper'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_clipper_create','_clipper_destroy','_clipper_process','_clipper_set_inputGain','_clipper_set_ceiling','_clipper_set_softness','_clipper_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
