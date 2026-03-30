cmake_minimum_required(VERSION 3.13)
project(MdaEPiano LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)

add_executable(MdaEPiano
  common/epiano_bridge.cpp
  src/mdaEPiano_standalone.cpp
)

target_include_directories(MdaEPiano PRIVATE src)

# Output to public/mda-epiano/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/mda-epiano")
set_target_properties(MdaEPiano PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
  OUTPUT_NAME "MdaEPiano"
  SUFFIX ".js"
)

# Emscripten flags
set(EXPORTED_FUNCTIONS
  "_epiano_create"
  "_epiano_destroy"
  "_epiano_process"
  "_epiano_note_on"
  "_epiano_note_off"
  "_epiano_sustain"
  "_epiano_all_notes_off"
  "_epiano_set_param"
  "_epiano_get_param"
  "_epiano_set_program"
  "_epiano_get_num_programs"
  "_epiano_get_num_params"
  "_epiano_get_active_voices"
  "_malloc"
  "_free"
)

# Join list with commas for Emscripten
string(JOIN "," EXPORTED_FUNCS_STR ${EXPORTED_FUNCTIONS})

target_link_options(MdaEPiano PRIVATE
  -O2
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME=createMdaEPiano"
  "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS_STR}]"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAPF32,wasmMemory]"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s ENVIRONMENT=web,worker"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
)

target_compile_options(MdaEPiano PRIVATE -O2)
