cmake_minimum_required(VERSION 3.20)
project(MultibandClipper VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MultibandClipper MultibandClipperWASM.cpp)
set_target_properties(MultibandClipper PROPERTIES
  OUTPUT_NAME "MultibandClipper"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multiband-clipper"
)

target_link_options(MultibandClipper PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMultibandClipper'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multiband_clipper_create','_multiband_clipper_destroy','_multiband_clipper_process','_multiband_clipper_set_lowCross','_multiband_clipper_set_highCross','_multiband_clipper_set_lowCeil','_multiband_clipper_set_midCeil','_multiband_clipper_set_highCeil','_multiband_clipper_set_softness','_multiband_clipper_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
