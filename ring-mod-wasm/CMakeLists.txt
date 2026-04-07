cmake_minimum_required(VERSION 3.20)
project(RingMod VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(RingMod RingModWASM.cpp)
set_target_properties(RingMod PROPERTIES
  OUTPUT_NAME "RingMod"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/ring-mod"
)

target_link_options(RingMod PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createRingMod'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_ring_mod_create','_ring_mod_destroy','_ring_mod_process','_ring_mod_set_frequency','_ring_mod_set_mix','_ring_mod_set_waveform','_ring_mod_set_lfo_rate','_ring_mod_set_lfo_depth']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
