cmake_minimum_required(VERSION 3.20)
project(MultibandLimiter VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)

add_executable(MultibandLimiter MultibandLimiterWASM.cpp)
set_target_properties(MultibandLimiter PROPERTIES
  OUTPUT_NAME "MultibandLimiter"
  SUFFIX ".js"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/multiband-limiter"
)

target_link_options(MultibandLimiter PRIVATE
  "SHELL:-s WASM=1"
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_NAME='createMultibandLimiter'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_multiband_limiter_create','_multiband_limiter_destroy','_multiband_limiter_process','_multiband_limiter_set_lowCross','_multiband_limiter_set_highCross','_multiband_limiter_set_lowCeil','_multiband_limiter_set_midCeil','_multiband_limiter_set_highCeil','_multiband_limiter_set_lowGain','_multiband_limiter_set_midGain','_multiband_limiter_set_highGain','_multiband_limiter_set_release','_multiband_limiter_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304"
  "SHELL:-s STACK_SIZE=262144"
  "SHELL:-s NO_EXIT_RUNTIME=1"
  "SHELL:-s FILESYSTEM=0"
  -O2
)
