cmake_minimum_required(VERSION 3.20)
project(BinauralPanner VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(BinauralPanner BinauralPannerWASM.cpp)
set_target_properties(BinauralPanner PROPERTIES
  OUTPUT_NAME "BinauralPanner"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/binaural-panner"
)

target_link_options(BinauralPanner PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createBinauralPanner'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_binaural_panner_create','_binaural_panner_destroy','_binaural_panner_process','_binaural_panner_set_azimuth','_binaural_panner_set_elevation','_binaural_panner_set_distance','_binaural_panner_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
