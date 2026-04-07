cmake_minimum_required(VERSION 3.20)
project(BeatBreather VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(BeatBreather BeatBreatherWASM.cpp)
set_target_properties(BeatBreather PROPERTIES
  OUTPUT_NAME "BeatBreather"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/beat-breather"
)

target_link_options(BeatBreather PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createBeatBreather'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_beat_breather_create','_beat_breather_destroy','_beat_breather_process','_beat_breather_set_transientBoost','_beat_breather_set_sustainBoost','_beat_breather_set_sensitivity','_beat_breather_set_attack','_beat_breather_set_release','_beat_breather_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
