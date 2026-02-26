cmake_minimum_required(VERSION 3.15)
project(fred_synth C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_executable(Fred
  src/fred_synth.c
)

target_compile_options(Fred PRIVATE
  -O2
  -ffast-math
)

set_target_properties(Fred PROPERTIES
  OUTPUT_NAME "Fred"
  SUFFIX ".js"
)

target_link_options(Fred PRIVATE
  -sWASM=1
  -sEXPORTED_FUNCTIONS=['_fred_init','_fred_dispose','_fred_create_player','_fred_destroy_player','_fred_load_instrument','_fred_note_on','_fred_note_off','_fred_render','_fred_set_param','_fred_get_param','_malloc','_free']
  -sEXPORTED_RUNTIME_METHODS=['cwrap','getValue','HEAPF32','HEAPU8']
  -sMODULARIZE=1
  -sEXPORT_NAME='createFred'
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=4194304
  -sSINGLE_FILE=0
  -sNO_FILESYSTEM=1
  -lm
)

# Copy output to public/fred/
add_custom_command(TARGET Fred POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/../public/fred
  COMMAND ${CMAKE_COMMAND} -E copy Fred.js   ${CMAKE_SOURCE_DIR}/../public/fred/Fred.js
  COMMAND ${CMAKE_COMMAND} -E copy Fred.wasm ${CMAKE_SOURCE_DIR}/../public/fred/Fred.wasm
  WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)
