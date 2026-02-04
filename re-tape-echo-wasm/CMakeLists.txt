cmake_minimum_required(VERSION 3.13)
project(RETapeEchoWASM)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Output directory
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/re-tape-echo")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(RETapeEcho RETapeEchoWASM.cpp)

target_compile_options(RETapeEcho PRIVATE -O2 -fno-exceptions -fno-rtti)

set_target_properties(RETapeEcho PROPERTIES
  OUTPUT_NAME "RETapeEcho"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_link_options(RETapeEcho PRIVATE
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createRETapeEcho'"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_re_tape_echo_create','_re_tape_echo_destroy','_re_tape_echo_process','_re_tape_echo_set_mode','_re_tape_echo_set_repeat_rate','_re_tape_echo_set_intensity','_re_tape_echo_set_echo_volume','_re_tape_echo_set_wow','_re_tape_echo_set_flutter','_re_tape_echo_set_dirt','_re_tape_echo_set_input_bleed','_re_tape_echo_set_loop_amount','_re_tape_echo_set_playhead_filter']"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s ALLOW_MEMORY_GROWTH=0"
  "SHELL:-s INITIAL_MEMORY=16777216"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:--no-entry"
)
