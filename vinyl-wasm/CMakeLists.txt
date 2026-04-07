cmake_minimum_required(VERSION 3.20)
project(Vinyl VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Vinyl VinylWASM.cpp)
set_target_properties(Vinyl PROPERTIES
  OUTPUT_NAME "Vinyl"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/vinyl"
)

target_link_options(Vinyl PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createVinyl'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_vinyl_create','_vinyl_destroy','_vinyl_process','_vinyl_set_crackle','_vinyl_set_noise','_vinyl_set_rumble','_vinyl_set_wear','_vinyl_set_speed','_vinyl_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
