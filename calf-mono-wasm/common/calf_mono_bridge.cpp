/* Calf Monosynth - C bridge for WASM
 * Provides extern "C" API for JavaScript/WASM interop
 */
#include "../src/calf_mono_standalone.h"
#include <cstring>

using namespace calf_plugins;

extern "C" {

void* calf_mono_create(int sampleRate) {
    auto *synth = new monosynth_audio_module();
    synth->set_sample_rate(sampleRate);
    synth->activate();
    synth->params_changed();
    return synth;
}

void calf_mono_destroy(void* ptr) {
    if (ptr) {
        auto *synth = static_cast<monosynth_audio_module*>(ptr);
        synth->deactivate();
        delete synth;
    }
}

void calf_mono_process(void* ptr, float* left, float* right, int nframes) {
    if (!ptr) return;
    auto *synth = static_cast<monosynth_audio_module*>(ptr);

    // Point output buffers to the caller's buffers
    synth->outs[0] = left;
    synth->outs[1] = right;

    // Call params_changed before processing to update derived state
    synth->params_changed();

    // Process audio
    synth->process(0, nframes, 0, 3);
}

void calf_mono_note_on(void* ptr, int note, int velocity) {
    if (!ptr) return;
    auto *synth = static_cast<monosynth_audio_module*>(ptr);
    synth->note_on(0, note, velocity);
}

void calf_mono_note_off(void* ptr, int note) {
    if (!ptr) return;
    auto *synth = static_cast<monosynth_audio_module*>(ptr);
    synth->note_off(0, note, 0);
}

void calf_mono_set_param(void* ptr, int index, float value) {
    if (!ptr) return;
    auto *synth = static_cast<monosynth_audio_module*>(ptr);
    if (index >= 0 && index < monosynth_metadata::param_count) {
        // Clamp to valid range
        const auto &props = monosynth_param_defaults[index];
        if (value < props.min) value = props.min;
        if (value > props.max) value = props.max;
        synth->param_values[index] = value;
    }
}

float calf_mono_get_param(void* ptr, int index) {
    if (!ptr) return 0;
    auto *synth = static_cast<monosynth_audio_module*>(ptr);
    if (index >= 0 && index < monosynth_metadata::param_count) {
        return synth->param_values[index];
    }
    return 0;
}

int calf_mono_get_num_params(void* ptr) {
    return monosynth_metadata::param_count;
}

void calf_mono_all_notes_off(void* ptr) {
    if (!ptr) return;
    auto *synth = static_cast<monosynth_audio_module*>(ptr);
    synth->all_notes_off();
}

void calf_mono_pitch_bend(void* ptr, int value) {
    if (!ptr) return;
    auto *synth = static_cast<monosynth_audio_module*>(ptr);
    synth->pitch_bend(0, value);
}

void calf_mono_control_change(void* ptr, int controller, int value) {
    if (!ptr) return;
    auto *synth = static_cast<monosynth_audio_module*>(ptr);
    synth->control_change(0, controller, value);
}

} // extern "C"
