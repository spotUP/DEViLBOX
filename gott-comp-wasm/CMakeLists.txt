cmake_minimum_required(VERSION 3.20)
project(GOTTComp VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(GOTTComp GOTTCompWASM.cpp)
set_target_properties(GOTTComp PROPERTIES
  OUTPUT_NAME "GOTTComp"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/gott-comp"
)

target_link_options(GOTTComp PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createGOTTComp'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_gott_comp_create','_gott_comp_destroy','_gott_comp_process','_gott_comp_set_lowCross','_gott_comp_set_highCross','_gott_comp_set_lowThresh','_gott_comp_set_midThresh','_gott_comp_set_highThresh','_gott_comp_set_lowRatio','_gott_comp_set_midRatio','_gott_comp_set_highRatio','_gott_comp_set_attack','_gott_comp_set_release','_gott_comp_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
