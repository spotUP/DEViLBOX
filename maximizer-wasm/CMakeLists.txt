cmake_minimum_required(VERSION 3.20)
project(Maximizer VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Maximizer MaximizerWASM.cpp)
set_target_properties(Maximizer PROPERTIES
  OUTPUT_NAME "Maximizer"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/maximizer"
)

target_link_options(Maximizer PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMaximizer'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_maximizer_create','_maximizer_destroy','_maximizer_process','_maximizer_set_ceiling','_maximizer_set_release','_maximizer_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
