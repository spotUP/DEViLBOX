cmake_minimum_required(VERSION 3.20)
project(EQ5Band VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(EQ5Band EQ5BandWASM.cpp)
set_target_properties(EQ5Band PROPERTIES
  OUTPUT_NAME "EQ5Band"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/eq5"
)

target_link_options(EQ5Band PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createEQ5Band'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_eq5_create','_eq5_destroy','_eq5_process','_eq5_set_lowShelfFreq','_eq5_set_lowShelfGain','_eq5_set_peak1Freq','_eq5_set_peak1Gain','_eq5_set_peak1Q','_eq5_set_peak2Freq','_eq5_set_peak2Gain','_eq5_set_peak2Q','_eq5_set_peak3Freq','_eq5_set_peak3Gain','_eq5_set_peak3Q','_eq5_set_highShelfFreq','_eq5_set_highShelfGain','_eq5_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
