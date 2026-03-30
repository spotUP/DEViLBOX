cmake_minimum_required(VERSION 3.13)
project(MdaJX10 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)

add_executable(MdaJX10
  common/jx10_bridge.cpp
  src/mdaJX10_standalone.cpp
)

target_include_directories(MdaJX10 PRIVATE src)

# Output to public/mda-jx10/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/mda-jx10")
set_target_properties(MdaJX10 PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
  OUTPUT_NAME "MdaJX10"
  SUFFIX ".js"
)

# Emscripten flags
set(EXPORTED_FUNCTIONS
  "_jx10_create"
  "_jx10_destroy"
  "_jx10_process"
  "_jx10_note_on"
  "_jx10_note_off"
  "_jx10_all_notes_off"
  "_jx10_set_param"
  "_jx10_get_param"
  "_jx10_set_program"
  "_jx10_get_num_programs"
  "_jx10_get_num_params"
  "_jx10_get_active_voices"
  "_malloc"
  "_free"
)

# Join list with commas for Emscripten
string(JOIN "," EXPORTED_FUNCS_STR ${EXPORTED_FUNCTIONS})

target_link_options(MdaJX10 PRIVATE
  -O2
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME=createMdaJX10"
  "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS_STR}]"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAPF32,wasmMemory]"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s ENVIRONMENT=web,worker"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
)

target_compile_options(MdaJX10 PRIVATE -O2)
