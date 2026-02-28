cmake_minimum_required(VERSION 3.13)
project(SunVox CXX)

set(CMAKE_CXX_STANDARD 11)

set(SUNVOX_SRC "${CMAKE_SOURCE_DIR}/../Reference Code/sunvox_sources-master/sunvox_engine")
set(SUNDOG_SRC "${CMAKE_SOURCE_DIR}/../Reference Code/sunvox_sources-master/sundog_engine")

set(SOURCES
    src/SunVoxWrapper.cpp
    ${SUNVOX_SRC}/sunvox_engine.cpp
    ${SUNVOX_SRC}/psynth/psynth_net.cpp
    ${SUNVOX_SRC}/psynth/psynths_echo.cpp
    ${SUNVOX_SRC}/psynth/psynths_filter.cpp
    ${SUNVOX_SRC}/psynth/psynths_generator.cpp
    ${SUNVOX_SRC}/psynth/psynths_kicker.cpp
    ${SUNVOX_SRC}/psynth/psynths_sampler.cpp
    ${SUNVOX_SRC}/psynth/psynths_distortion.cpp
    ${SUNVOX_SRC}/psynth/psynths_flanger.cpp
    ${SUNVOX_SRC}/psynth/psynths_spectravoice.cpp
    ${SUNVOX_SRC}/psynth/psynths_loop.cpp
    ${SUNVOX_SRC}/psynth/psynths_delay.cpp
    ${SUNVOX_SRC}/psynth/psynths_fm.cpp
    ${SUNVOX_SRC}/psynth/psynths_lfo.cpp
    ${SUNVOX_SRC}/psynth/psynths_reverb.cpp
    ${SUNVOX_SRC}/psynth/psynths_vocal_filter.cpp
    ${SUNDOG_SRC}/core/code/debug.cpp
    ${SUNDOG_SRC}/memory/code/memory.cpp
    ${SUNDOG_SRC}/time/code/timemanager.cpp
)

set(OUTPUT_NAME "SunVox")
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/sunvox")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME} ${SOURCES})

target_include_directories(${OUTPUT_NAME} PRIVATE
    src
    "${CMAKE_SOURCE_DIR}/../Reference Code/sunvox_sources-master"
    "${SUNVOX_SRC}"
    "${SUNDOG_SRC}"
)

target_compile_definitions(${OUTPUT_NAME} PRIVATE STYPE_FLOAT)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_sunvox_wasm_create"
        "_sunvox_wasm_destroy"
        "_sunvox_wasm_load_song"
        "_sunvox_wasm_save_song"
        "_sunvox_wasm_load_synth"
        "_sunvox_wasm_save_synth"
        "_sunvox_wasm_get_control_count"
        "_sunvox_wasm_get_control_name"
        "_sunvox_wasm_get_control_min"
        "_sunvox_wasm_get_control_max"
        "_sunvox_wasm_get_control_value"
        "_sunvox_wasm_set_control"
        "_sunvox_wasm_get_module_name"
        "_sunvox_wasm_get_module_count"
        "_sunvox_wasm_note_on"
        "_sunvox_wasm_note_off"
        "_sunvox_wasm_render"
        "_sunvox_wasm_play"
        "_sunvox_wasm_stop"
    )

    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createSunVox'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=16777216"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString','FS']"
        "SHELL:-s FILESYSTEM=1"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake)")
endif()
