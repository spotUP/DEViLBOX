cmake_minimum_required(VERSION 3.20)
project(MultibandDynamics VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MultibandDynamics MultibandDynamicsWASM.cpp)
set_target_properties(MultibandDynamics PROPERTIES
  OUTPUT_NAME "MultibandDynamics"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multiband-dynamics"
)

target_link_options(MultibandDynamics PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMultibandDynamics'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multiband_dynamics_create','_multiband_dynamics_destroy','_multiband_dynamics_process','_multiband_dynamics_set_lowCross','_multiband_dynamics_set_highCross','_multiband_dynamics_set_lowExpThresh','_multiband_dynamics_set_midExpThresh','_multiband_dynamics_set_highExpThresh','_multiband_dynamics_set_lowCompThresh','_multiband_dynamics_set_midCompThresh','_multiband_dynamics_set_highCompThresh','_multiband_dynamics_set_ratio','_multiband_dynamics_set_attack','_multiband_dynamics_set_release','_multiband_dynamics_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
