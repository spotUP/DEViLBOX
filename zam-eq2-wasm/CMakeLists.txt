cmake_minimum_required(VERSION 3.20)
project(ZamEQ2 VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(ZamEQ2 ZamEQ2WASM.cpp)
set_target_properties(ZamEQ2 PROPERTIES
  OUTPUT_NAME "ZamEQ2"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/zam-eq2"
)

target_link_options(ZamEQ2 PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createZamEQ2'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_zam_eq2_create','_zam_eq2_destroy','_zam_eq2_process','_zam_eq2_set_lowFreq','_zam_eq2_set_lowGain','_zam_eq2_set_lowBw','_zam_eq2_set_highFreq','_zam_eq2_set_highGain','_zam_eq2_set_highBw','_zam_eq2_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
