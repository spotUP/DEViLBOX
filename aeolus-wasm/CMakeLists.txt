cmake_minimum_required(VERSION 3.13)
project(aeolus_wasm LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)

add_executable(Aeolus
    src/aeolus_bridge.cpp
    src/addsynth.cc
    src/rankwave.cc
    src/division.cc
    src/asection.cc
    src/reverb.cc
    src/scales.cc
    src/rngen.cc
    src/exp2ap.cc
    src/lfqueue.cc
)

target_include_directories(Aeolus PRIVATE src)
target_compile_definitions(Aeolus PRIVATE
    __BYTE_ORDER=1234
    __LITTLE_ENDIAN=1234
    __BIG_ENDIAN=4321
)

if(EMSCRIPTEN)
    set_target_properties(Aeolus PROPERTIES
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../public/aeolus"
    )
    set(EXPORTED_FUNCS "_aeolus_create,_aeolus_destroy,_aeolus_note_on,_aeolus_note_off,_aeolus_all_notes_off,_aeolus_set_param,_aeolus_get_param,_aeolus_process,_aeolus_get_num_params,_aeolus_get_param_name,_aeolus_get_stop_name,_aeolus_get_num_stops,_aeolus_get_stop_division,_aeolus_get_division_name,_aeolus_get_num_divisions,_aeolus_get_block_size,_aeolus_get_temperament_name,_aeolus_get_num_temperaments,_malloc,_free")
    target_link_options(Aeolus PRIVATE
        -sWASM=1
        -sMODULARIZE=1
        -sEXPORT_ES6=0
        -sEXPORT_NAME=createAeolus
        -sALLOW_MEMORY_GROWTH=1
        -sINITIAL_MEMORY=67108864
        -sSTACK_SIZE=1048576
        "-sEXPORTED_FUNCTIONS=[${EXPORTED_FUNCS}]"
        "-sEXPORTED_RUNTIME_METHODS=[ccall,cwrap,getValue,setValue,UTF8ToString]"
        -sENVIRONMENT=web,worker
        -sNO_FILESYSTEM=1
        --no-entry
        -O2
    )
    target_compile_options(Aeolus PRIVATE
        -O2
        -fno-exceptions
        -fno-rtti
        -Wno-deprecated-declarations
    )
endif()
