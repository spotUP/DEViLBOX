cmake_minimum_required(VERSION 3.20)
project(CalfPhaser VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(CalfPhaser CalfPhaserWASM.cpp)
set_target_properties(CalfPhaser PROPERTIES
  OUTPUT_NAME "CalfPhaser"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/calf-phaser"
)

target_link_options(CalfPhaser PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createCalfPhaser'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_calf_phaser_create','_calf_phaser_destroy','_calf_phaser_process','_calf_phaser_set_rate','_calf_phaser_set_depth','_calf_phaser_set_stages','_calf_phaser_set_feedback','_calf_phaser_set_stereoPhase','_calf_phaser_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
