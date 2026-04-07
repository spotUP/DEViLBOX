cmake_minimum_required(VERSION 3.20)
project(Panda VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Panda PandaWASM.cpp)
set_target_properties(Panda PROPERTIES
  OUTPUT_NAME "Panda"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/panda"
)

target_link_options(Panda PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createPanda'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_panda_create','_panda_destroy','_panda_process','_panda_set_threshold','_panda_set_factor','_panda_set_release','_panda_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
