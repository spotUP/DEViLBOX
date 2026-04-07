cmake_minimum_required(VERSION 3.20)
project(DistortionShaper VERSION 1.0.0)
set(CMAKE_CXX_STANDARD 17)
add_executable(DistortionShaper DistortionShaperWASM.cpp)
set_target_properties(DistortionShaper PROPERTIES OUTPUT_NAME "DistortionShaper" SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/distortion-shaper")
target_link_options(DistortionShaper PRIVATE
  "SHELL:-s WASM=1" "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_NAME='createDistortionShaper'"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s ENVIRONMENT='web,worker'"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free','_distortion_shaper_create','_distortion_shaper_destroy','_distortion_shaper_process','_distortion_shaper_set_inputGain','_distortion_shaper_set_point1x','_distortion_shaper_set_point1y','_distortion_shaper_set_point2x','_distortion_shaper_set_point2y','_distortion_shaper_set_outputGain','_distortion_shaper_set_preLpf','_distortion_shaper_set_postLpf','_distortion_shaper_set_mix']"
  "SHELL:-s INITIAL_MEMORY=4194304" "SHELL:-s STACK_SIZE=262144" "SHELL:-s NO_EXIT_RUNTIME=1" "SHELL:-s FILESYSTEM=0" -O2)
