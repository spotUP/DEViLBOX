# Helm Synth - WASM Build
# Based on Helm by Matt Tytel (GPL3)
# Helm's DSP (mopo framework) is pure C++ with zero JUCE dependencies.
#
# Build:
#   cd juce-wasm/helm && mkdir -p build && cd build
#   emcmake cmake .. && emmake make -j$(nproc)

cmake_minimum_required(VERSION 3.15)
project(HelmWASM VERSION 1.0.0)

set(HELM_ROOT "${CMAKE_SOURCE_DIR}/../../Reference Code/helm-master")
set(MOPO_SRC "${HELM_ROOT}/mopo/src")
set(SYNTH_SRC "${HELM_ROOT}/src/synthesis")
set(COMMON_SRC "${HELM_ROOT}/src/common")

# --- mopo DSP framework sources ---
set(MOPO_SOURCES
    "${MOPO_SRC}/alias.cpp"
    "${MOPO_SRC}/arpeggiator.cpp"
    "${MOPO_SRC}/biquad_filter.cpp"
    "${MOPO_SRC}/bit_crush.cpp"
    "${MOPO_SRC}/bypass_router.cpp"
    "${MOPO_SRC}/delay.cpp"
    "${MOPO_SRC}/distortion.cpp"
    "${MOPO_SRC}/envelope.cpp"
    "${MOPO_SRC}/feedback.cpp"
    "${MOPO_SRC}/formant_manager.cpp"
    "${MOPO_SRC}/ladder_filter.cpp"
    "${MOPO_SRC}/linear_slope.cpp"
    "${MOPO_SRC}/magnitude_lookup.cpp"
    "${MOPO_SRC}/memory.cpp"
    "${MOPO_SRC}/midi_lookup.cpp"
    "${MOPO_SRC}/mono_panner.cpp"
    "${MOPO_SRC}/operators.cpp"
    "${MOPO_SRC}/oscillator.cpp"
    "${MOPO_SRC}/portamento_slope.cpp"
    "${MOPO_SRC}/processor_router.cpp"
    "${MOPO_SRC}/processor.cpp"
    "${MOPO_SRC}/resonance_lookup.cpp"
    "${MOPO_SRC}/reverb_all_pass.cpp"
    "${MOPO_SRC}/reverb_comb.cpp"
    "${MOPO_SRC}/reverb.cpp"
    "${MOPO_SRC}/sample_decay_lookup.cpp"
    "${MOPO_SRC}/simple_delay.cpp"
    "${MOPO_SRC}/smooth_filter.cpp"
    "${MOPO_SRC}/smooth_value.cpp"
    "${MOPO_SRC}/state_variable_filter.cpp"
    "${MOPO_SRC}/step_generator.cpp"
    "${MOPO_SRC}/stutter.cpp"
    "${MOPO_SRC}/trigger_operators.cpp"
    "${MOPO_SRC}/value.cpp"
    "${MOPO_SRC}/voice_handler.cpp"
)

# --- Helm synthesis layer sources ---
set(HELM_SYNTH_SOURCES
    "${SYNTH_SRC}/dc_filter.cpp"
    "${SYNTH_SRC}/detune_lookup.cpp"
    "${SYNTH_SRC}/fixed_point_oscillator.cpp"
    "${SYNTH_SRC}/fixed_point_wave.cpp"
    "${SYNTH_SRC}/gate.cpp"
    "${SYNTH_SRC}/helm_engine.cpp"
    "${SYNTH_SRC}/helm_lfo.cpp"
    "${SYNTH_SRC}/helm_module.cpp"
    "${SYNTH_SRC}/helm_oscillators.cpp"
    "${SYNTH_SRC}/helm_voice_handler.cpp"
    "${SYNTH_SRC}/noise_oscillator.cpp"
    "${SYNTH_SRC}/peak_meter.cpp"
    "${SYNTH_SRC}/resonance_cancel.cpp"
    "${SYNTH_SRC}/trigger_random.cpp"
    "${SYNTH_SRC}/value_switch.cpp"
    "${COMMON_SRC}/helm_common.cpp"
)

# WASM Wrapper
set(WRAPPER_SOURCES
    "${CMAKE_SOURCE_DIR}/HelmWASM.cpp"
)

add_executable(HelmWASMBuild
    ${WRAPPER_SOURCES}
    ${MOPO_SOURCES}
    ${HELM_SYNTH_SOURCES}
)

target_include_directories(HelmWASMBuild PRIVATE
    "${MOPO_SRC}"                          # mopo framework headers
    "${SYNTH_SRC}"                         # Helm synthesis headers
    "${COMMON_SRC}"                        # helm_common.h
    "${CMAKE_SOURCE_DIR}/../common"        # WASMSynthBase.h, WASMExports.h
)

target_compile_definitions(HelmWASMBuild PRIVATE
    HELM_WASM=1
    NDEBUG=1
)

set_target_properties(HelmWASMBuild PROPERTIES
    OUTPUT_NAME "Helm"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../../public/helm"
)

target_link_options(HelmWASMBuild PRIVATE
    "SHELL:-s WASM=1"
    "SHELL:-s EXPORT_ES6=1"
    "SHELL:-s MODULARIZE=1"
    "SHELL:-s EXPORT_NAME='createHelmModule'"
    "SHELL:-s ALLOW_MEMORY_GROWTH=1"
    "SHELL:-s ENVIRONMENT='web,worker'"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','setValue','getValue']"
    "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
    "SHELL:-s NO_EXIT_RUNTIME=1"
    "SHELL:-s INITIAL_MEMORY=33554432"  # 32MB initial (polyphonic synth)
    "SHELL:--bind"
    -O3
)

target_compile_options(HelmWASMBuild PRIVATE
    -O3
    -std=c++17
    -fno-exceptions
    -Wno-deprecated-declarations
    -Wno-unused-function
    -Wno-unused-variable
    -Wno-sign-compare
    -Wno-reorder
    -Wno-c++11-narrowing
)
