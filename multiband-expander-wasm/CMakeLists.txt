cmake_minimum_required(VERSION 3.20)
project(MultibandExpander VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MultibandExpander MultibandExpanderWASM.cpp)
set_target_properties(MultibandExpander PROPERTIES
  OUTPUT_NAME "MultibandExpander"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multiband-expander"
)

target_link_options(MultibandExpander PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMultibandExpander'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multiband_expander_create','_multiband_expander_destroy','_multiband_expander_process','_multiband_expander_set_lowCross','_multiband_expander_set_highCross','_multiband_expander_set_lowThresh','_multiband_expander_set_midThresh','_multiband_expander_set_highThresh','_multiband_expander_set_ratio','_multiband_expander_set_attack','_multiband_expander_set_release','_multiband_expander_set_range','_multiband_expander_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
