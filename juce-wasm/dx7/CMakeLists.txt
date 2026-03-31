cmake_minimum_required(VERSION 3.16)
project(DX7 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(RETRO_SRC "${CMAKE_CURRENT_SOURCE_DIR}/../../third-party/retromulator/source")

add_executable(DX7
    dx7_bridge.cpp
    ${RETRO_SRC}/dx7Lib/dx7.cpp
    ${RETRO_SRC}/dx7Lib/HD6303R.cpp
    ${RETRO_SRC}/dx7Lib/HD6303R_inst.cpp
)

target_include_directories(DX7 PRIVATE
    ${RETRO_SRC}/dx7Lib
)

# Stub out synthLib dependencies — we bypass Device entirely
target_compile_definitions(DX7 PRIVATE
    SYNTHLIB_DEMO_MODE=0
)

if(EMSCRIPTEN)
    set_target_properties(DX7 PROPERTIES
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../../public/dx7"
    )

    target_link_options(DX7 PRIVATE
        "SHELL:-s WASM=1"
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME=createDX7Module"
        "SHELL:-s EXPORT_ES6=0"
        "SHELL:-s ENVIRONMENT=web,worker"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s INITIAL_MEMORY=16777216"
        "SHELL:-s EXPORTED_FUNCTIONS=[_dx7Init,_dx7Destroy,_dx7LoadFirmware,_dx7LoadVoices,_dx7LoadSysex,_dx7NoteOn,_dx7NoteOff,_dx7AllNotesOff,_dx7Sustain,_dx7PitchBend,_dx7ModWheel,_dx7SetBank,_dx7ProgramChange,_dx7SetVolume,_dx7GetNativeSamplerate,_dx7IsReady,_dx7Process,_dx7GetPatchName,_malloc,_free]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=[ccall,cwrap,HEAPF32,HEAPU8,UTF8ToString]"
        -O3
        --no-entry
    )
endif()
