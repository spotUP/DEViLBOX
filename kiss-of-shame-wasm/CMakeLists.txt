cmake_minimum_required(VERSION 3.13)
project(KissOfShameWASM)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Output directory
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/kissofshame")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(KissOfShame KissOfShameWASM.cpp)

target_compile_options(KissOfShame PRIVATE -O2 -fno-exceptions -fno-rtti)

set_target_properties(KissOfShame PROPERTIES
  OUTPUT_NAME "KissOfShame"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
)

target_link_options(KissOfShame PRIVATE
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createKissOfShameModule'"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_kiss_of_shame_create','_kiss_of_shame_destroy','_kiss_of_shame_process','_kiss_of_shame_set_drive','_kiss_of_shame_set_character','_kiss_of_shame_set_bias','_kiss_of_shame_set_shame','_kiss_of_shame_set_hiss','_kiss_of_shame_set_speed']"
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
