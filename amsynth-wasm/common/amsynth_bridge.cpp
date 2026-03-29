/*
 * AMSynth WASM Bridge
 * Wraps the amsynth Synthesizer class for Emscripten/AudioWorklet use.
 */

#include "synth/Synthesizer.h"
#include "synth/PresetController.h"
#include "controls.h"
#include "types.h"

#include <cstring>
#include <vector>

static unsigned char s_midi_buf[4];

static void send_midi(Synthesizer *synth, unsigned char status, unsigned char d1, unsigned char d2) {
    s_midi_buf[0] = status;
    s_midi_buf[1] = d1;
    s_midi_buf[2] = d2;

    amsynth_midi_event_t evt;
    evt.offset_frames = 0;
    evt.length = 3;
    evt.buffer = s_midi_buf;

    std::vector<amsynth_midi_event_t> midi_in = {evt};
    std::vector<amsynth_midi_cc_t> midi_out;
    float dummy_l = 0, dummy_r = 0;
    synth->process(0, midi_in, midi_out, &dummy_l, &dummy_r);
}

extern "C" {

void *amsynth_create(int sampleRate) {
    auto *synth = new Synthesizer();
    synth->setSampleRate(sampleRate);
    return synth;
}

void amsynth_destroy(void *h) {
    delete static_cast<Synthesizer *>(h);
}

void amsynth_process(void *h, float *outL, float *outR, int frames) {
    auto *synth = static_cast<Synthesizer *>(h);
    std::vector<amsynth_midi_event_t> midi_in;
    std::vector<amsynth_midi_cc_t> midi_out;
    memset(outL, 0, frames * sizeof(float));
    memset(outR, 0, frames * sizeof(float));
    synth->process(frames, midi_in, midi_out, outL, outR);
}

void amsynth_note_on(void *h, int note, int velocity) {
    send_midi(static_cast<Synthesizer *>(h), 0x90, note & 0x7F, velocity & 0x7F);
}

void amsynth_note_off(void *h, int note) {
    send_midi(static_cast<Synthesizer *>(h), 0x80, note & 0x7F, 0);
}

void amsynth_set_param(void *h, int index, float value) {
    static_cast<Synthesizer *>(h)->setParameterValue((Param)index, value);
}

float amsynth_get_param(void *h, int index) {
    return static_cast<Synthesizer *>(h)->getParameterValue((Param)index);
}

void amsynth_set_normalized_param(void *h, int index, float value) {
    static_cast<Synthesizer *>(h)->setNormalizedParameterValue((Param)index, value);
}

float amsynth_get_normalized_param(void *h, int index) {
    return static_cast<Synthesizer *>(h)->getNormalizedParameterValue((Param)index);
}

int amsynth_get_num_params() {
    return kAmsynthParameterCount;
}

void amsynth_all_notes_off(void *h) {
    send_midi(static_cast<Synthesizer *>(h), 0xB0, 123, 0);
}

void amsynth_set_sample_rate(void *h, int rate) {
    static_cast<Synthesizer *>(h)->setSampleRate(rate);
}

void amsynth_pitch_bend(void *h, int value) {
    auto *synth = static_cast<Synthesizer *>(h);
    s_midi_buf[0] = 0xE0;
    s_midi_buf[1] = value & 0x7F;
    s_midi_buf[2] = (value >> 7) & 0x7F;

    amsynth_midi_event_t evt;
    evt.offset_frames = 0;
    evt.length = 3;
    evt.buffer = s_midi_buf;

    std::vector<amsynth_midi_event_t> midi_in = {evt};
    std::vector<amsynth_midi_cc_t> midi_out;
    float dummy_l = 0, dummy_r = 0;
    synth->process(0, midi_in, midi_out, &dummy_l, &dummy_r);
}

int amsynth_get_preset(void *h) {
    return static_cast<Synthesizer *>(h)->getPresetNumber();
}

void amsynth_set_preset(void *h, int number) {
    static_cast<Synthesizer *>(h)->setPresetNumber(number);
}

void amsynth_randomize(void *h) {
    static_cast<Synthesizer *>(h)->getPresetController()->randomiseCurrentPreset();
}

} // extern "C"
