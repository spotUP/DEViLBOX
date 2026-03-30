cmake_minimum_required(VERSION 3.13)
project(MdaDX10 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)

add_executable(MdaDX10
  common/dx10_bridge.cpp
  src/mdaDX10_standalone.cpp
)

target_include_directories(MdaDX10 PRIVATE src)

# Output to public/mda-dx10/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/mda-dx10")
set_target_properties(MdaDX10 PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
  OUTPUT_NAME "MdaDX10"
  SUFFIX ".js"
)

# Emscripten flags
set(EXPORTED_FUNCTIONS
  "_dx10_create"
  "_dx10_destroy"
  "_dx10_process"
  "_dx10_note_on"
  "_dx10_note_off"
  "_dx10_all_notes_off"
  "_dx10_set_param"
  "_dx10_get_param"
  "_dx10_set_program"
  "_dx10_get_num_programs"
  "_dx10_get_num_params"
  "_dx10_get_active_voices"
  "_malloc"
  "_free"
)

# Join list with commas for Emscripten
string(JOIN "," EXPORTED_FUNCS_STR ${EXPORTED_FUNCTIONS})

target_link_options(MdaDX10 PRIVATE
  -O2
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME=createMdaDX10"
  "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS_STR}]"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAPF32,wasmMemory]"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s ENVIRONMENT=web,worker"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
)

target_compile_options(MdaDX10 PRIVATE -O2)
