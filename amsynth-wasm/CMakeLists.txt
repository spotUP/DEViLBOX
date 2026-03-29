cmake_minimum_required(VERSION 3.13)
project(AMSynth LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(AMSYNTH_SRC "${CMAKE_SOURCE_DIR}/../third-party/amsynth-master")

add_executable(AMSynth
    common/amsynth_bridge.cpp
    ${AMSYNTH_SRC}/src/core/synth/Synthesizer.cpp
    ${AMSYNTH_SRC}/src/core/synth/VoiceAllocationUnit.cpp
    ${AMSYNTH_SRC}/src/core/synth/VoiceBoard.cpp
    ${AMSYNTH_SRC}/src/core/synth/Oscillator.cpp
    ${AMSYNTH_SRC}/src/core/synth/ADSR.cpp
    ${AMSYNTH_SRC}/src/core/synth/LowPassFilter.cpp
    ${AMSYNTH_SRC}/src/core/synth/Distortion.cpp
    ${AMSYNTH_SRC}/src/core/synth/SoftLimiter.cpp
    ${AMSYNTH_SRC}/src/core/synth/MidiController.cpp
    ${AMSYNTH_SRC}/src/core/synth/Parameter.cpp
    ${AMSYNTH_SRC}/src/core/synth/Preset.cpp
    ${AMSYNTH_SRC}/src/core/synth/PresetController.cpp
    ${AMSYNTH_SRC}/src/core/synth/TuningMap.cpp
    ${AMSYNTH_SRC}/src/core/Configuration.cpp
    ${AMSYNTH_SRC}/src/core/filesystem.cpp
    ${AMSYNTH_SRC}/external/freeverb/revmodel.cpp
    ${AMSYNTH_SRC}/external/freeverb/comb.cpp
    ${AMSYNTH_SRC}/external/freeverb/allpass.cpp
)

target_include_directories(AMSynth PRIVATE
    ${AMSYNTH_SRC}/src
    ${AMSYNTH_SRC}/src/core
    ${AMSYNTH_SRC}/src/core/synth
    ${AMSYNTH_SRC}/external
    common
)

# Disable NLS (gettext), config.h requirement, and MTS-ESP
target_compile_definitions(AMSynth PRIVATE
    HAVE_CONFIG_H=0
    ENABLE_NLS=0
    NDEBUG
)

if(EMSCRIPTEN)
    set(OUTPUT_DIR "${CMAKE_SOURCE_DIR}/../public/amsynth")

    set_target_properties(AMSynth PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${OUTPUT_DIR}"
        OUTPUT_NAME "AMSynth"
        SUFFIX ".js"
    )

    set(EXPORTED_FUNCTIONS
        "_amsynth_create"
        "_amsynth_destroy"
        "_amsynth_process"
        "_amsynth_note_on"
        "_amsynth_note_off"
        "_amsynth_set_param"
        "_amsynth_get_param"
        "_amsynth_set_normalized_param"
        "_amsynth_get_normalized_param"
        "_amsynth_get_num_params"
        "_amsynth_all_notes_off"
        "_amsynth_set_sample_rate"
        "_amsynth_pitch_bend"
        "_amsynth_get_preset"
        "_amsynth_set_preset"
        "_amsynth_randomize"
        "_malloc"
        "_free"
    )

    string(JOIN "," EXPORTED_FUNCS_STR ${EXPORTED_FUNCTIONS})

    target_link_options(AMSynth PRIVATE
        "SHELL:-s MODULARIZE=1"
        "SHELL:-s EXPORT_NAME='createAMSynth'"
        "SHELL:-s EXPORTED_FUNCTIONS=[${EXPORTED_FUNCS_STR}]"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPF32']"
        "SHELL:-s ALLOW_MEMORY_GROWTH=1"
        "SHELL:-s INITIAL_MEMORY=16777216"
        "SHELL:-s STACK_SIZE=1048576"
        "SHELL:-s WASM=1"
        "SHELL:-s SINGLE_FILE=0"
        "SHELL:-s ENVIRONMENT='web,worker'"
        "SHELL:-s NO_FILESYSTEM=0"
        "SHELL:-s DISABLE_EXCEPTION_CATCHING=1"
        "SHELL:-O2"
    )
endif()
