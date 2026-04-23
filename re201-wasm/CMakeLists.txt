cmake_minimum_required(VERSION 3.13)
project(RE201WASM)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Output directory
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/re201")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(RE201 RE201WASM.cpp)

target_compile_options(RE201 PRIVATE -O2 -fno-exceptions -fno-rtti)

set_target_properties(RE201 PROPERTIES
  OUTPUT_NAME "RE201"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_link_options(RE201 PRIVATE
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createRE201'"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_re201_create','_re201_destroy','_re201_process','_re201_set_bass','_re201_set_treble','_re201_set_delay_mode','_re201_set_repeat_rate','_re201_set_intensity','_re201_set_echo_volume','_re201_set_reverb_volume','_re201_set_input_level']"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','wasmMemory','HEAPF32','HEAPU8']"
  "SHELL:-s ALLOW_MEMORY_GROWTH=0"
  "SHELL:-s INITIAL_MEMORY=16777216"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s FILESYSTEM=0"
  "SHELL:-s SINGLE_FILE=0"
  "SHELL:-s WASM=1"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:--no-entry"
)
