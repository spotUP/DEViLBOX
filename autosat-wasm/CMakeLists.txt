cmake_minimum_required(VERSION 3.20)
project(AutoSat VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(AutoSat AutoSatWASM.cpp)
set_target_properties(AutoSat PROPERTIES OUTPUT_NAME "AutoSat" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/autosat")
target_link_options(AutoSat PRIVATE
  "SHELL:-s WASM=1" "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME='createAutoSat'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_autosat_create','_autosat_destroy','_autosat_process','_autosat_set_amount','_autosat_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304" "SHELL:-s STACK_SIZE=262144" "SHELL:-s NO_EXIT_RUNTIME=1" "SHELL:-s FILESYSTEM=0" -O2)
