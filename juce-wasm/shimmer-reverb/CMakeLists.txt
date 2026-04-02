cmake_minimum_required(VERSION 3.15)
project(ShimmerReverbWASM VERSION 1.0.0)

# Shimmer Reverb WASM Effect Build
# Dattorro plate reverb with grain-based pitch shifter in feedback loop

set(SHIMMER_SOURCES
    ShimmerReverbEffect.cpp
)

add_executable(ShimmerReverbWASM ${SHIMMER_SOURCES})

target_include_directories(ShimmerReverbWASM PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../common
)

set_target_properties(ShimmerReverbWASM PROPERTIES
    OUTPUT_NAME "ShimmerReverb"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/shimmer-reverb"
)

target_link_options(ShimmerReverbWASM PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=0"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createShimmerReverbModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:--bind"
    -O3
)

target_compile_options(ShimmerReverbWASM PRIVATE -O3 -std=c++17)
