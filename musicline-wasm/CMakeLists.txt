cmake_minimum_required(VERSION 3.13)
project(MusicLine CXX)

set(CMAKE_CXX_STANDARD 17)

# CMAKE_SOURCE_DIR is the musicline-wasm/ directory (where this CMakeLists.txt lives).
# The repo root is one level up; Reference Code is a sibling of musicline-wasm/.
set(ML_SRC "${CMAKE_SOURCE_DIR}/../Reference Code/musicline_playback-main/musicline")

# Replayer .cpp files (all that exist in the musicline/ root + mline_backend)
set(ML_SOURCES
    "${ML_SRC}/player/mline_backend.cpp"
    "${ML_SRC}/arpeggio.cpp"
    "${ML_SRC}/channel.cpp"
    "${ML_SRC}/file.cpp"
    "${ML_SRC}/fx.cpp"
    "${ML_SRC}/init.cpp"
    "${ML_SRC}/inst.cpp"
    "${ML_SRC}/module.cpp"
    "${ML_SRC}/musicline.cpp"
    "${ML_SRC}/playinst_256_effects.cpp"
    "${ML_SRC}/playinst_filter.cpp"
    "${ML_SRC}/playinst_render.cpp"
    "${ML_SRC}/playinst_resonance.cpp"
    "${ML_SRC}/playinst.cpp"
    "${ML_SRC}/sfx.cpp"
    "${ML_SRC}/tables.cpp"
    "${ML_SRC}/target_math.cpp"
)

set(OUTPUT_NAME "MusicLine")
set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/musicline")
file(MAKE_DIRECTORY ${OUTPUT_DIR})

add_executable(${OUTPUT_NAME}
    common/MusicLineWrapper.cpp
    ${ML_SOURCES}
)

target_include_directories(${OUTPUT_NAME} PRIVATE
    "${ML_SRC}"
    "${ML_SRC}/player"
)

if(EMSCRIPTEN)
    set(EXPORTED_FUNCTIONS
        "_malloc"
        "_free"
        "_ml_get_sample_rate"
        "_ml_init"
        "_ml_load"
        "_ml_render"
        "_ml_stop"
        "_ml_is_finished"
        "_ml_get_subsong_count"
        "_ml_set_subsong"
        "_ml_get_title"
        "_ml_get_author"
        "_ml_detect_duration"
        "_ml_get_position"
        "_ml_get_row"
        "_ml_get_speed"
        "_ml_preview_load"
        "_ml_preview_note_on"
        "_ml_preview_note_off"
        "_ml_preview_render"
        "_ml_preview_stop"
    )

    string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

    set_target_properties(${OUTPUT_NAME} PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${OUTPUT_DIR}
        OUTPUT_NAME ${OUTPUT_NAME}
        SUFFIX ".js"
    )

    target_link_options(${OUTPUT_NAME} PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createMusicLine'"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s INITIAL_MEMORY=8388608"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCTIONS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue','UTF8ToString']"
        "SHELL:-s FILESYSTEM=0"
        "SHELL:-s INVOKE_RUN=0"
        "-O2"
    )
else()
    message(WARNING "This project is designed to be built with Emscripten (emcmake)")
endif()
