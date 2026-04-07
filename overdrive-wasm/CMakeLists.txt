cmake_minimum_required(VERSION 3.20)
project(Overdrive VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Overdrive OverdriveWASM.cpp)
set_target_properties(Overdrive PROPERTIES
  OUTPUT_NAME "Overdrive"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/overdrive"
)

target_link_options(Overdrive PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createOverdrive'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_overdrive_create','_overdrive_destroy','_overdrive_process','_overdrive_set_drive','_overdrive_set_tone','_overdrive_set_mix','_overdrive_set_level']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
