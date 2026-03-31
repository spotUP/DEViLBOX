cmake_minimum_required(VERSION 3.16)
project(OPL3 LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(RETRO_SRC "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/retromulator/source")

add_executable(OPL3
    opl3_bridge.cpp
    ${RETRO_SRC}/opl3Lib/opl3.c
)

target_include_directories(OPL3 PRIVATE
    ${RETRO_SRC}/opl3Lib
)

target_compile_definitions(OPL3 PRIVATE
    SYNTHLIB_DEMO_MODE=0
)

if(EMSCRIPTEN)
    set_target_properties(OPL3 PROPERTIES
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/opl3"
    )

    target_link_options(OPL3 PRIVATE
        "SHELL:-s WASM=1"
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME=createOPL3Module"
        "SHELL:-s EXPORT_ES6=0"
        "SHELL:-s ENVIRONMENT=web,worker"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s INITIAL_MEMORY=4194304"
        "SHELL:-s EXPORTED_FUNCTIONS=[_oplInit,_oplDestroy,_oplNoteOn,_oplNoteOff,_oplSustainPedal,_oplPitchBend,_oplAllNotesOff,_oplLoadSbi,_oplSetPatchRegisters,_oplProcess,_oplGetActiveVoiceCount,_malloc,_free]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAPF32,HEAPU8]"
        -O3
        --no-entry
    )
endif()
