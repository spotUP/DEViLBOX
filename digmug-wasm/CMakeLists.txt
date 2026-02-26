cmake_minimum_required(VERSION 3.15)
project(digmug_synth C)

set(CMAKE_C_STANDARD 11)

add_executable(DigMug src/digmug_synth.c)

target_include_directories(DigMug PRIVATE include)

target_compile_options(DigMug PRIVATE
  -O2
  -ffast-math
)

set_target_properties(DigMug PROPERTIES
  OUTPUT_NAME "DigMug"
  SUFFIX ".js"
)

target_link_options(DigMug PRIVATE
  -sWASM=1
  -sEXPORTED_FUNCTIONS=['_dm_init','_dm_dispose','_dm_create_player','_dm_destroy_player','_dm_load_instrument','_dm_note_on','_dm_note_off','_dm_render','_dm_set_param','_dm_get_param','_malloc','_free']
  -sEXPORTED_RUNTIME_METHODS=['cwrap','getValue','HEAPF32','HEAPU8']
  -sMODULARIZE=1
  -sEXPORT_NAME='createDigMug'
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=4194304
  -sSINGLE_FILE=0
)

# Copy output to public/digmug/
add_custom_command(TARGET DigMug POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/../public/digmug
  COMMAND ${CMAKE_COMMAND} -E copy DigMug.js ${CMAKE_SOURCE_DIR}/../public/digmug/DigMug.js
  COMMAND ${CMAKE_COMMAND} -E copy DigMug.wasm ${CMAKE_SOURCE_DIR}/../public/digmug/DigMug.wasm
  WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)
