cmake_minimum_required(VERSION 3.20)
project(DynamicsProc VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(DynamicsProc DynamicsProcWASM.cpp)
set_target_properties(DynamicsProc PROPERTIES
  OUTPUT_NAME "DynamicsProc"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/dynamics-proc"
)

target_link_options(DynamicsProc PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createDynamicsProc'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_dynamics_proc_create','_dynamics_proc_destroy','_dynamics_proc_process','_dynamics_proc_set_lowerThresh','_dynamics_proc_set_upperThresh','_dynamics_proc_set_ratio','_dynamics_proc_set_attack','_dynamics_proc_set_release','_dynamics_proc_set_makeup','_dynamics_proc_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
