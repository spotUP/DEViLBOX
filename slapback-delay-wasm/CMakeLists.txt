cmake_minimum_required(VERSION 3.20)
project(SlapbackDelay VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(SlapbackDelay SlapbackDelayWASM.cpp)
set_target_properties(SlapbackDelay PROPERTIES OUTPUT_NAME "SlapbackDelay" SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/slapback-delay")
target_link_options(SlapbackDelay PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createSlapbackDelay'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_slapback_delay_create','_slapback_delay_destroy','_slapback_delay_process','_slapback_delay_set_time','_slapback_delay_set_feedback','_slapback_delay_set_tone','_slapback_delay_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2)
