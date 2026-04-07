cmake_minimum_required(VERSION 3.20)
project(Satma VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(Satma SatmaWASM.cpp)
set_target_properties(Satma PROPERTIES OUTPUT_NAME "Satma" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/satma")
target_link_options(Satma PRIVATE
  "SHELL:-s WASM=1" "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME='createSatma'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_satma_create','_satma_destroy','_satma_process','_satma_set_distortion','_satma_set_tone','_satma_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304" "SHELL:-s STACK_SIZE=262144" "SHELL:-s NO_EXIT_RUNTIME=1" "SHELL:-s FILESYSTEM=0" -O2)
