cmake_minimum_required(VERSION 3.20)
project(MultiChorus VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MultiChorus MultiChorusWASM.cpp)
set_target_properties(MultiChorus PROPERTIES
  OUTPUT_NAME "MultiChorus"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multi-chorus"
)

target_link_options(MultiChorus PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMultiChorus'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multi_chorus_create','_multi_chorus_destroy','_multi_chorus_process','_multi_chorus_set_rate','_multi_chorus_set_depth','_multi_chorus_set_voices','_multi_chorus_set_stereoPhase','_multi_chorus_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
