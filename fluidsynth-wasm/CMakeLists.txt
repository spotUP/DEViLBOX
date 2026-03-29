cmake_minimum_required(VERSION 3.13)
project(FluidSynthWASM C)

set(FLUIDSYNTH_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../third-party/fluidsynth")
set(FLUIDSYNTH_BUILD "${FLUIDSYNTH_ROOT}/build-wasm")

add_executable(FluidSynth
    common/fluidsynth_bridge.c
)

target_include_directories(FluidSynth PRIVATE
    ${FLUIDSYNTH_ROOT}/include
    ${FLUIDSYNTH_BUILD}/include
)

target_link_libraries(FluidSynth PRIVATE
    ${FLUIDSYNTH_BUILD}/src/libfluidsynth.a
)

set(EXPORTED_FUNCTIONS
    "_fluidsynth_create"
    "_fluidsynth_destroy"
    "_fluidsynth_load_sf2"
    "_fluidsynth_process"
    "_fluidsynth_note_on"
    "_fluidsynth_note_off"
    "_fluidsynth_program_change"
    "_fluidsynth_bank_select"
    "_fluidsynth_cc"
    "_fluidsynth_pitch_bend"
    "_fluidsynth_pitch_wheel_sens"
    "_fluidsynth_channel_pressure"
    "_fluidsynth_all_notes_off"
    "_fluidsynth_all_sounds_off"
    "_fluidsynth_set_param"
    "_fluidsynth_get_param"
    "_fluidsynth_get_sfont_id"
    "_fluidsynth_get_preset_name"
    "_malloc"
    "_free"
)

string(JOIN "," EXPORTED_FUNCTIONS_STR ${EXPORTED_FUNCTIONS})

set(EXPORTED_RUNTIME
    "ccall"
    "cwrap"
    "UTF8ToString"
    "stringToUTF8"
    "HEAPF32"
    "FS"
)

string(JOIN "," EXPORTED_RUNTIME_STR ${EXPORTED_RUNTIME})

set_target_properties(FluidSynth PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "\
        -s MODULARIZE=1 \
        -s EXPORT_NAME='createFluidSynth' \
        -s EXPORTED_FUNCTIONS='[${EXPORTED_FUNCTIONS_STR}]' \
        -s EXPORTED_RUNTIME_METHODS='[${EXPORTED_RUNTIME_STR}]' \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=33554432 \
        -s STACK_SIZE=1048576 \
        -s FILESYSTEM=1 \
        -s FORCE_FILESYSTEM=1 \
        -s SINGLE_FILE=0 \
        -s ENVIRONMENT='web,worker' \
        -s NO_EXIT_RUNTIME=1 \
        -O3 \
    "
)
