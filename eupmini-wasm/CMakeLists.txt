cmake_minimum_required(VERSION 3.13)
project(Eupmini CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Core eupmini library
add_library(eupmini_static STATIC
    src/eupmini/eupplayer.cpp
    src/eupmini/eupplayer_townsEmulator.cpp
    src/eupmini/sintbl.cpp
)

target_include_directories(eupmini_static BEFORE PRIVATE
    src/sdl_shim
)
target_include_directories(eupmini_static PUBLIC
    src/eupmini
)
target_compile_definitions(eupmini_static PRIVATE EUPPLAYER_LITTLE_ENDIAN=1)
target_compile_options(eupmini_static PRIVATE -w)

# WASM harness
add_executable(Eupmini src/eupmini_harness.cpp)
target_include_directories(Eupmini PRIVATE src src/sdl_shim)
target_compile_definitions(Eupmini PRIVATE EUPPLAYER_LITTLE_ENDIAN=1)
target_link_libraries(Eupmini PRIVATE eupmini_static)

if(EMSCRIPTEN)
  set_target_properties(Eupmini PROPERTIES
    OUTPUT_NAME "Eupmini"
    SUFFIX ".js"
  )
  target_link_options(Eupmini PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createEupmini'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_eupmini_init','_eupmini_stop','_eupmini_render','_eupmini_get_sample_rate','_eupmini_set_channel_mute','_eupmini_get_num_fm_instruments','_eupmini_get_fm_slot_param','_eupmini_set_fm_slot_param','_eupmini_get_fm_ch_param','_eupmini_set_fm_ch_param','_eupmini_get_fm_instrument','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPF32']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=8388608"
    "SHELL:-s STACK_SIZE=65536"
    -O2
  )
endif()
