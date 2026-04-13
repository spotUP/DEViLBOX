cmake_minimum_required(VERSION 3.16)
project(V2MPlayer LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(V2M_SOURCES
    src/ronan.cpp
    src/v2mplayer.cpp
    src/v2mconv.cpp
    src/synth_core.cpp
    src/sounddef.cpp
    src/v2m_wasm.cpp
)

# Create the WASM library
add_executable(V2MPlayer ${V2M_SOURCES})

target_include_directories(V2MPlayer PRIVATE src)

# Emscripten settings for AudioWorklet compatibility
set(EMSCRIPTEN_FLAGS
    "-s MODULARIZE=1"
    "-s EXPORT_NAME='createV2MPlayer'"
    "-s EXPORTED_FUNCTIONS=['_v2m_init','_v2m_shutdown','_v2m_load','_v2m_play','_v2m_stop','_v2m_render','_v2m_is_playing','_v2m_get_length','_v2m_alloc','_v2m_free','_v2m_set_channel_gain','_malloc','_free']"
    "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8','HEAPF32']"
    "-s ALLOW_MEMORY_GROWTH=1"
    "-s INITIAL_MEMORY=16777216"
    "-s MAXIMUM_MEMORY=67108864"
    "-s STACK_SIZE=262144"
    "-s ENVIRONMENT='web,worker'"
    "-s SINGLE_FILE=0"
    "-s NO_EXIT_RUNTIME=1"
    "-s ASSERTIONS=0"
    "-s WASM=1"
    "-O3"
    "-flto"
)

# Join flags with spaces
string(REPLACE ";" " " EMSCRIPTEN_FLAGS_STR "${EMSCRIPTEN_FLAGS}")

set_target_properties(V2MPlayer PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "${EMSCRIPTEN_FLAGS_STR}"
)

# Suppress warnings for third-party code
target_compile_options(V2MPlayer PRIVATE
    -Wno-unused-parameter
    -Wno-sign-compare
    -O3
    -flto
)
