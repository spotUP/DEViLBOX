cmake_minimum_required(VERSION 3.20)
project(EarlyReflections VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(EarlyReflections EarlyReflectionsWASM.cpp)
set_target_properties(EarlyReflections PROPERTIES
  OUTPUT_NAME "EarlyReflections"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/early-reflections"
)

target_link_options(EarlyReflections PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createEarlyReflections'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_early_reflections_create','_early_reflections_destroy','_early_reflections_process','_early_reflections_set_size','_early_reflections_set_damping','_early_reflections_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
