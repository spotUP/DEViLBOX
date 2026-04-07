cmake_minimum_required(VERSION 3.20)
project(SidechainGate VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(SidechainGate SidechainGateWASM.cpp)
set_target_properties(SidechainGate PROPERTIES
  OUTPUT_NAME "SidechainGate"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/sidechain-gate"
)

target_link_options(SidechainGate PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createSidechainGate'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_sidechain_gate_create','_sidechain_gate_destroy','_sidechain_gate_process','_sidechain_gate_set_threshold','_sidechain_gate_set_attack','_sidechain_gate_set_hold','_sidechain_gate_set_release','_sidechain_gate_set_range','_sidechain_gate_set_scFreq','_sidechain_gate_set_scQ','_sidechain_gate_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
