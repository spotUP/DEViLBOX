cmake_minimum_required(VERSION 3.20)
project(Kuiza VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Kuiza KuizaWASM.cpp)
set_target_properties(Kuiza PROPERTIES
  OUTPUT_NAME "Kuiza"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/kuiza"
)

target_link_options(Kuiza PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createKuiza'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_kuiza_create','_kuiza_destroy','_kuiza_process','_kuiza_set_low','_kuiza_set_lowMid','_kuiza_set_highMid','_kuiza_set_high','_kuiza_set_gain','_kuiza_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
