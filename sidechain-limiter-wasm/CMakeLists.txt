cmake_minimum_required(VERSION 3.20)
project(SidechainLimiter VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(SidechainLimiter SidechainLimiterWASM.cpp)
set_target_properties(SidechainLimiter PROPERTIES
  OUTPUT_NAME "SidechainLimiter"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/sidechain-limiter"
)

target_link_options(SidechainLimiter PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createSidechainLimiter'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_sidechain_limiter_create','_sidechain_limiter_destroy','_sidechain_limiter_process','_sidechain_limiter_process_ext','_sidechain_limiter_set_ceiling','_sidechain_limiter_set_release','_sidechain_limiter_set_scFreq','_sidechain_limiter_set_scGain','_sidechain_limiter_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
