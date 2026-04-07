cmake_minimum_required(VERSION 3.20)
project(NoiseGate VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(NoiseGate NoiseGateWASM.cpp)
set_target_properties(NoiseGate PROPERTIES
  OUTPUT_NAME "NoiseGate"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/noise-gate"
)

target_link_options(NoiseGate PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createNoiseGate'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_noise_gate_create','_noise_gate_destroy','_noise_gate_process','_noise_gate_set_threshold','_noise_gate_set_attack','_noise_gate_set_hold','_noise_gate_set_release','_noise_gate_set_range','_noise_gate_set_hpf']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
