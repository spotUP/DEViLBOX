cmake_minimum_required(VERSION 3.20)
project(SpaceyDelayer VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Must build with Emscripten: emcmake cmake ..")
endif()

add_executable(SpaceyDelayer SpaceyDelayerWASM.cpp)

set_target_properties(SpaceyDelayer PROPERTIES
  OUTPUT_NAME "SpaceyDelayer"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/spacey-delayer"
)

target_link_options(SpaceyDelayer PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createSpaceyDelayer'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_spacey_delayer_create','_spacey_delayer_destroy','_spacey_delayer_process','_spacey_delayer_set_first_tap','_spacey_delayer_set_tap_size','_spacey_delayer_set_feedback','_spacey_delayer_set_wetness','_spacey_delayer_set_multi_tap','_spacey_delayer_set_tape_filter']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  -O2
)
