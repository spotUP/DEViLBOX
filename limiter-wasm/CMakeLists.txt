cmake_minimum_required(VERSION 3.20)
project(Limiter VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(Limiter LimiterWASM.cpp)
set_target_properties(Limiter PROPERTIES
  OUTPUT_NAME "Limiter"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/limiter"
)

target_link_options(Limiter PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createLimiter'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_limiter_create','_limiter_destroy','_limiter_process','_limiter_set_threshold','_limiter_set_ceiling','_limiter_set_attack','_limiter_set_release','_limiter_set_lookahead','_limiter_set_knee']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
