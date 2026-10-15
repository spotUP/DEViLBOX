/*
 * AMSynth WASM Bridge
 * Wraps the amsynth Synthesizer class for Emscripten/AudioWorklet use.
 */

// The voice report reads state the engine keeps private (the envelopes' stage and value, the filter's cutoff
// factors). The vendored sources are a pinned upstream checkout, so rather than patch them the bridge opens the access
// for the amsynth headers only: every standard header the amsynth headers pull in is included first, so the macro
// never reaches them.
#include <algorithm>
#include <cassert>
#include <climits>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#define private public
#include "synth/Synthesizer.h"
#include "synth/PresetController.h"
#include "synth/VoiceAllocationUnit.h"
#include "synth/VoiceBoard.h"
#include "controls.h"
#include "types.h"
#undef private

static unsigned char s_midi_buf[4];

// Frames rendered so far and the frame each note was struck at: the engine keeps no voice age.
static uint64_t s_frames = 0;
static uint64_t s_note_on_frame[128];
static int s_sample_rate = 44100;

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
    s_sample_rate = sampleRate;
    s_frames = 0;
    memset(s_note_on_frame, 0, sizeof(s_note_on_frame));
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
    s_frames += (uint64_t)frames;
}

void amsynth_note_on(void *h, int note, int velocity) {
    s_note_on_frame[note & 0x7F] = s_frames;
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
    s_sample_rate = rate;
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

// Live voice report for the editor curves (src/engine/voiceStatus/wasmVoiceStatus.ts): 8 floats per sounding voice,
// at most maxVoices of them, lowest note first. Fields: note, amplitude stage (ADSR::State: 0 attack 1 decay 2 sustain
// 3 release 4 off), amplitude envelope value, seconds since the note was struck, the filter cutoff in Hz that
// VoiceBoard::ProcessSamplesMix computes (cpp:156-166, rebuilt here from the voice's own members and the last LFO and
// envelope values), the filter envelope value, the LFO phase in cycles, the filter envelope stage.
int amsynth_get_voices(void *h, float *out, int maxVoices) {
    auto *synth = static_cast<Synthesizer *>(h);
    VoiceAllocationUnit *vau = synth->_voiceAllocationUnit;
    int n = 0;
    for (int note = 0; note < 128 && n < maxVoices; note++) {
        if (!vau->active[note]) continue;
        VoiceBoard *v = vau->_voices[note];
        float *o = out + n * 8;
        const float frequency = v->mFrequency.getValue();
        const float cutoffBase = v->mFilterKbdTrack * frequency + (1.f - v->mFilterKbdTrack) * 261.626f;
        const float velMult = v->mFilterVelSens * v->mKeyVelocity + (1.f - v->mFilterVelSens);
        const float lfo = v->mProcessBuffers.lfo_osc_1[0];
        const float lfoMult = (lfo * 0.5f + 0.5f) * v->mFilterModAmt + 1.f - v->mFilterModAmt;
        const float envF = v->mFilterADSR.m_value;
        float cutoff = v->mFilterCutoff * cutoffBase * velMult * lfoMult;
        if (v->mFilterEnvAmt > 0.f) cutoff += frequency * envF * v->mFilterEnvAmt;
        else cutoff += cutoff * (1.f / 16.f) * v->mFilterEnvAmt * envF;
        cutoff = std::max(std::min(cutoff, v->mSampleRate * 0.5f * 0.99f), 10.0f);
        if (v->mFilterType == SynthFilter::Type::kBypass) cutoff = 0.f;
        o[0] = (float)note;
        o[1] = (float)(int)v->mAmpADSR.m_state;
        o[2] = v->mAmpADSR.m_value;
        o[3] = (float)(s_frames - s_note_on_frame[note]) / (float)s_sample_rate;
        o[4] = cutoff;
        o[5] = envF;
        o[6] = v->lfo1.rads / 6.2831853f;
        o[7] = (float)(int)v->mFilterADSR.m_state;
        n++;
    }
    return n;
}

} // extern "C"
