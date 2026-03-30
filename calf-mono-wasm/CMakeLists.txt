cmake_minimum_required(VERSION 3.13)
project(CalfMonoSynth)
set(CMAKE_CXX_STANDARD 14)

set(SOURCES
    src/calf_mono_standalone.cpp
    common/calf_mono_bridge.cpp
)

add_executable(CalfMonoSynth ${SOURCES})

set_target_properties(CalfMonoSynth PROPERTIES
    OUTPUT_NAME "CalfMonoSynth"
    SUFFIX ".js"
)

target_compile_options(CalfMonoSynth PRIVATE -O2 -fno-exceptions -Wno-deprecated)
target_include_directories(CalfMonoSynth PRIVATE src common)

target_link_options(CalfMonoSynth PRIVATE
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createCalfMonoSynth'"
    "SHELL:-s EXPORTED_FUNCTIONS=['_calf_mono_create','_calf_mono_destroy','_calf_mono_process','_calf_mono_note_on','_calf_mono_note_off','_calf_mono_set_param','_calf_mono_get_param','_calf_mono_get_num_params','_calf_mono_all_notes_off','_calf_mono_pitch_bend','_calf_mono_control_change','_malloc','_free']"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s INITIAL_MEMORY=16777216"
    "SHELL:-s FILESYSTEM=0"
    "SHELL:-s ENVIRONMENT='web'"
    "SHELL:-s SINGLE_FILE=0"
)
