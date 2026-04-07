cmake_minimum_required(VERSION 3.20)
project(Della VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Della DellaWASM.cpp)
set_target_properties(Della PROPERTIES
  OUTPUT_NAME "Della"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/della"
)

target_link_options(Della PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createDella'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_della_create','_della_destroy','_della_process','_della_set_time','_della_set_feedback','_della_set_volume','_della_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
