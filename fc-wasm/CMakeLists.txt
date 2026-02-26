cmake_minimum_required(VERSION 3.15)
project(fc_synth C)

set(CMAKE_C_STANDARD 11)

add_executable(FC src/fc_synth.c)

target_include_directories(FC PRIVATE include)

target_compile_options(FC PRIVATE
  -O2
  -ffast-math
)

set_target_properties(FC PROPERTIES
  OUTPUT_NAME "FC"
  SUFFIX ".js"
)

target_link_options(FC PRIVATE
  -sWASM=1
  -sEXPORTED_FUNCTIONS=['_fc_init','_fc_dispose','_fc_create_player','_fc_destroy_player','_fc_load_instrument','_fc_note_on','_fc_note_off','_fc_render','_fc_set_param','_fc_get_param','_malloc','_free']
  -sEXPORTED_RUNTIME_METHODS=['cwrap','getValue','HEAPF32','HEAPU8']
  -sMODULARIZE=1
  -sEXPORT_NAME='createFC'
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=4194304
  -sSINGLE_FILE=0
)

# Copy output to public/fc/
add_custom_command(TARGET FC POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/../public/fc
  COMMAND ${CMAKE_COMMAND} -E copy FC.js ${CMAKE_SOURCE_DIR}/../public/fc/FC.js
  COMMAND ${CMAKE_COMMAND} -E copy FC.wasm ${CMAKE_SOURCE_DIR}/../public/fc/FC.wasm
  WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)
