cmake_minimum_required(VERSION 3.20)
project(MonoComp VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MonoComp MonoCompWASM.cpp)
set_target_properties(MonoComp PROPERTIES
  OUTPUT_NAME "MonoComp"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/mono-comp"
)

target_link_options(MonoComp PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMonoComp'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_mono_comp_create','_mono_comp_destroy','_mono_comp_process','_mono_comp_set_threshold','_mono_comp_set_ratio','_mono_comp_set_attack','_mono_comp_set_release','_mono_comp_set_knee','_mono_comp_set_makeup','_mono_comp_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
