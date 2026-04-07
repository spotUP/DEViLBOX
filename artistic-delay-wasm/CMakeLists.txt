cmake_minimum_required(VERSION 3.20)
project(ArtisticDelay VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(ArtisticDelay ArtisticDelayWASM.cpp)
set_target_properties(ArtisticDelay PROPERTIES OUTPUT_NAME "ArtisticDelay" SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/artistic-delay")
target_link_options(ArtisticDelay PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createArtisticDelay'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_artistic_delay_create','_artistic_delay_destroy','_artistic_delay_process','_artistic_delay_set_timeL','_artistic_delay_set_timeR','_artistic_delay_set_feedback','_artistic_delay_set_pan','_artistic_delay_set_lpf','_artistic_delay_set_hpf','_artistic_delay_set_mix']"
  "SHELL:-s INITIAL_MEMORY=16777216"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2)
