cmake_minimum_required(VERSION 3.16)
project(OpenWurli LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source root for retromulator
set(RETRO_SRC "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/retromulator/source")

# OpenWurli is entirely header-only DSP — only the bridge needs compiling
add_executable(OpenWurli
    openwurli_bridge.cpp
)

target_include_directories(OpenWurli PRIVATE
    ${RETRO_SRC}/openWurliLib
)

# No synthLib dependency — bridge directly uses OpenWurli DSP headers

target_compile_definitions(OpenWurli PRIVATE
    SYNTHLIB_DEMO_MODE=0
)

# Emscripten flags
if(EMSCRIPTEN)
    set_target_properties(OpenWurli PROPERTIES
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/openwurli"
    )

    target_link_options(OpenWurli PRIVATE
        "SHELL:-s WASM=1"
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME=createOpenWurliModule"
        "SHELL:-s EXPORT_ES6=0"
        "SHELL:-s ENVIRONMENT=web,worker"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s INITIAL_MEMORY=16777216"
        "SHELL:-s EXPORTED_FUNCTIONS=[_owInit,_owDestroy,_owNoteOn,_owNoteOff,_owSustainPedal,_owAllNotesOff,_owSetParam,_owGetParam,_owProcess,_owGetActiveVoiceCount,_malloc,_free]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,setValue,getValue,HEAPF32]"
        -O3
        --no-entry
    )
endif()
