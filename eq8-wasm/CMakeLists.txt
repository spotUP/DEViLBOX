cmake_minimum_required(VERSION 3.20)
project(EQ8Band VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(EQ8Band EQ8BandWASM.cpp)
set_target_properties(EQ8Band PROPERTIES
  OUTPUT_NAME "EQ8Band"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/eq8"
)

target_link_options(EQ8Band PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createEQ8Band'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_eq8_create','_eq8_destroy','_eq8_process','_eq8_set_hpFreq','_eq8_set_lpFreq','_eq8_set_lowShelfFreq','_eq8_set_lowShelfGain','_eq8_set_peak1Freq','_eq8_set_peak1Gain','_eq8_set_peak1Q','_eq8_set_peak2Freq','_eq8_set_peak2Gain','_eq8_set_peak2Q','_eq8_set_peak3Freq','_eq8_set_peak3Gain','_eq8_set_peak3Q','_eq8_set_peak4Freq','_eq8_set_peak4Gain','_eq8_set_peak4Q','_eq8_set_highShelfFreq','_eq8_set_highShelfGain','_eq8_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
