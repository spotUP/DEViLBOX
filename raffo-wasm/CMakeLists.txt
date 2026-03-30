cmake_minimum_required(VERSION 3.13)
project(RaffoSynth LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)

add_executable(RaffoSynth
  common/raffo_bridge.cpp
  src/raffo_standalone.cpp
)

target_include_directories(RaffoSynth PRIVATE src)

# Output to public/raffo/
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/raffo")
set_target_properties(RaffoSynth PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
  OUTPUT_NAME "RaffoSynth"
  SUFFIX ".js"
)

# Emscripten flags
set(EXPORTED_FUNCTIONS
  "_raffo_create"
  "_raffo_destroy"
  "_raffo_process"
  "_raffo_note_on"
  "_raffo_note_off"
  "_raffo_all_notes_off"
  "_raffo_set_param"
  "_raffo_get_param"
  "_raffo_pitch_bend"
  "_raffo_get_num_params"
  "_malloc"
  "_free"
)

# Join list with commas for Emscripten
string(JOIN "," EXPORTED_FUNCS_STR ${EXPORTED_FUNCTIONS})

target_link_options(RaffoSynth PRIVATE
  -O2
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME=createRaffoSynth"
  "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS_STR}]"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAPF32,wasmMemory]"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s ENVIRONMENT=web,worker"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
)

target_compile_options(RaffoSynth PRIVATE -O2)
