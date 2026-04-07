cmake_minimum_required(VERSION 3.20)
project(MultibandEnhancer VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MultibandEnhancer MultibandEnhancerWASM.cpp)
set_target_properties(MultibandEnhancer PROPERTIES
  OUTPUT_NAME "MultibandEnhancer"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multiband-enhancer"
)

target_link_options(MultibandEnhancer PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMultibandEnhancer'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multiband_enhancer_create','_multiband_enhancer_destroy','_multiband_enhancer_process','_multiband_enhancer_set_lowCross','_multiband_enhancer_set_midCross','_multiband_enhancer_set_highCross','_multiband_enhancer_set_lowWidth','_multiband_enhancer_set_midWidth','_multiband_enhancer_set_highWidth','_multiband_enhancer_set_topWidth','_multiband_enhancer_set_harmonics','_multiband_enhancer_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
