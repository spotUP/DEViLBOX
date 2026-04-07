cmake_minimum_required(VERSION 3.20)
project(PhonoFilter VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(PhonoFilter PhonoFilterWASM.cpp)
set_target_properties(PhonoFilter PROPERTIES
  OUTPUT_NAME "PhonoFilter"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/phono-filter"
)

target_link_options(PhonoFilter PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createPhonoFilter'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_phono_filter_create','_phono_filter_destroy','_phono_filter_process','_phono_filter_set_mode','_phono_filter_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
