cmake_minimum_required(VERSION 3.20)
project(Pulsator VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Pulsator PulsatorWASM.cpp)
set_target_properties(Pulsator PROPERTIES
  OUTPUT_NAME "Pulsator"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/pulsator"
)

target_link_options(Pulsator PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createPulsator'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_pulsator_create','_pulsator_destroy','_pulsator_process','_pulsator_set_rate','_pulsator_set_depth','_pulsator_set_waveform','_pulsator_set_stereoPhase','_pulsator_set_offset','_pulsator_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
