cmake_minimum_required(VERSION 3.20)
project(Roomy VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Roomy RoomyWASM.cpp)
set_target_properties(Roomy PROPERTIES
  OUTPUT_NAME "Roomy"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/roomy"
)

target_link_options(Roomy PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createRoomy'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_roomy_create','_roomy_destroy','_roomy_process','_roomy_set_time','_roomy_set_damping','_roomy_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
