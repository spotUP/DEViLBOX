cmake_minimum_required(VERSION 3.20)
project(Driva VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Driva DrivaWASM.cpp)
set_target_properties(Driva PROPERTIES
  OUTPUT_NAME "Driva"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/driva"
)

target_link_options(Driva PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createDriva'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_driva_create','_driva_destroy','_driva_process','_driva_set_amount','_driva_set_tone','_driva_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
