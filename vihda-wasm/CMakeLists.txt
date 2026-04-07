cmake_minimum_required(VERSION 3.20)
project(Vihda VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Vihda VihdaWASM.cpp)
set_target_properties(Vihda PROPERTIES
  OUTPUT_NAME "Vihda"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/vihda"
)

target_link_options(Vihda PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createVihda'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_vihda_create','_vihda_destroy','_vihda_process','_vihda_set_width','_vihda_set_invert','_vihda_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
