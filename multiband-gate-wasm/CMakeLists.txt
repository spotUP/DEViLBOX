cmake_minimum_required(VERSION 3.20)
project(MultibandGate VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MultibandGate MultibandGateWASM.cpp)
set_target_properties(MultibandGate PROPERTIES
  OUTPUT_NAME "MultibandGate"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multiband-gate"
)

target_link_options(MultibandGate PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMultibandGate'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multiband_gate_create','_multiband_gate_destroy','_multiband_gate_process','_multiband_gate_set_lowCross','_multiband_gate_set_highCross','_multiband_gate_set_lowThresh','_multiband_gate_set_midThresh','_multiband_gate_set_highThresh','_multiband_gate_set_lowRange','_multiband_gate_set_midRange','_multiband_gate_set_highRange','_multiband_gate_set_attack','_multiband_gate_set_release','_multiband_gate_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
