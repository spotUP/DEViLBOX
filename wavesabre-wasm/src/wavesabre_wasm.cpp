// WaveSabre WASM Wrapper
// Exposes Falcon and Slaughter synths for web audio

#include <cstdint>
#include <cstring>
#include <cmath>
#include <math.h>

#ifdef WASM_BUILD
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

// The voice report reads state the engine keeps private (the voices and their envelopes, the filter's frequency). The
// vendored sources are a pinned upstream checkout, so the wrapper opens the access for the WaveSabreCore headers only
// rather than patching them.
#define private public
#define protected public
#include "WaveSabreCore/Falcon.h"
#include "WaveSabreCore/Slaughter.h"
#include "WaveSabreCore/Adultery.h"
#include "WaveSabreCore/Helpers.h"
#undef private
#undef protected

using namespace WaveSabreCore;

// Synth type enum
enum SynthType {
    SYNTH_FALCON = 0,
    SYNTH_SLAUGHTER = 1,
    SYNTH_ADULTERY = 2
};

// Wrapper struct to hold any synth type
struct SynthWrapper {
    SynthType type;
    Device* device;
    float sampleRate;
    float* inputBuffer[2]; // Dummy input for Run()
    // Samples each voice slot has been sounding since its note started (the engine keeps no age).
    unsigned int voiceAge[256];
    bool voiceWasOn[256];
};

static float globalSampleRate = 44100.0f;
static float dummyInput[256] = {0};

static bool g_helpersInitialized = false;

// Initialize sample rate and lookup tables
EXPORT void wavesabre_set_sample_rate(float sr) {
    globalSampleRate = sr;
    Helpers::CurrentSampleRate = sr;
    
    // Initialize the FastSin lookup table (required before any synth can produce audio)
    if (!g_helpersInitialized) {
        Helpers::Init();
        g_helpersInitialized = true;
    }
}

EXPORT void* wavesabre_create_falcon() {
    auto wrapper = new SynthWrapper();
    wrapper->type = SYNTH_FALCON;
    wrapper->device = new Falcon();
    wrapper->sampleRate = globalSampleRate;
    wrapper->inputBuffer[0] = dummyInput;
    wrapper->inputBuffer[1] = dummyInput;
    memset(wrapper->voiceAge, 0, sizeof(wrapper->voiceAge));
    memset(wrapper->voiceWasOn, 0, sizeof(wrapper->voiceWasOn));
    return wrapper;
}

EXPORT void* wavesabre_create_slaughter() {
    auto wrapper = new SynthWrapper();
    wrapper->type = SYNTH_SLAUGHTER;
    wrapper->device = new Slaughter();
    wrapper->sampleRate = globalSampleRate;
    wrapper->inputBuffer[0] = dummyInput;
    wrapper->inputBuffer[1] = dummyInput;
    memset(wrapper->voiceAge, 0, sizeof(wrapper->voiceAge));
    memset(wrapper->voiceWasOn, 0, sizeof(wrapper->voiceWasOn));
    return wrapper;
}

EXPORT void* wavesabre_create_adultery() {
    auto wrapper = new SynthWrapper();
    wrapper->type = SYNTH_ADULTERY;
    wrapper->device = new Adultery();
    wrapper->sampleRate = globalSampleRate;
    wrapper->inputBuffer[0] = dummyInput;
    wrapper->inputBuffer[1] = dummyInput;
    memset(wrapper->voiceAge, 0, sizeof(wrapper->voiceAge));
    memset(wrapper->voiceWasOn, 0, sizeof(wrapper->voiceWasOn));
    return wrapper;
}

EXPORT void wavesabre_destroy(void* ptr) {
    auto wrapper = static_cast<SynthWrapper*>(ptr);
    if (wrapper) {
        delete wrapper->device;
        delete wrapper;
    }
}

EXPORT void wavesabre_set_param(void* ptr, int index, float value) {
    auto wrapper = static_cast<SynthWrapper*>(ptr);
    if (wrapper && wrapper->device) {
        wrapper->device->SetParam(index, value);
    }
}

EXPORT float wavesabre_get_param(void* ptr, int index) {
    auto wrapper = static_cast<SynthWrapper*>(ptr);
    if (wrapper && wrapper->device) {
        return wrapper->device->GetParam(index);
    }
    return 0.0f;
}

EXPORT void wavesabre_note_on(void* ptr, int note, int velocity, int deltaSamples) {
    auto wrapper = static_cast<SynthWrapper*>(ptr);
    if (wrapper && wrapper->device) {
        auto synthDevice = static_cast<SynthDevice*>(wrapper->device);
        synthDevice->NoteOn(note, velocity, deltaSamples);
    }
}

EXPORT void wavesabre_note_off(void* ptr, int note) {
    auto wrapper = static_cast<SynthWrapper*>(ptr);
    if (wrapper && wrapper->device) {
        auto synthDevice = static_cast<SynthDevice*>(wrapper->device);
        synthDevice->NoteOff(note, 0); // deltaSamples = 0
    }
}

EXPORT void wavesabre_render(void* ptr, float* outputL, float* outputR, int numSamples) {
    auto wrapper = static_cast<SynthWrapper*>(ptr);
    if (wrapper && wrapper->device) {
        float* outputs[2] = { outputL, outputR };
        memset(outputL, 0, numSamples * sizeof(float));
        memset(outputR, 0, numSamples * sizeof(float));
        wrapper->device->Run(0.0, wrapper->inputBuffer, outputs, numSamples);

        // voice ages: a slot that has just turned on starts at zero
        SynthDevice* synthDevice = static_cast<SynthDevice*>(wrapper->device);
        for (int i = 0; i < SynthDevice::maxVoices; i++) {
            const bool on = synthDevice->voices[i] && synthDevice->voices[i]->IsOn;
            if (on && !wrapper->voiceWasOn[i]) wrapper->voiceAge[i] = 0;
            if (on) wrapper->voiceAge[i] += (unsigned int)numSamples;
            wrapper->voiceWasOn[i] = on;
        }
    }
}

// Load chunk data (binary preset state from VST)
EXPORT void wavesabre_set_chunk(void* ptr, void* data, int size) {
    auto wrapper = static_cast<SynthWrapper*>(ptr);
    if (wrapper && wrapper->device && data && size > 0) {
        wrapper->device->SetChunk(data, size);
    }
}

// Get number of parameters for each synth type
EXPORT int wavesabre_get_num_params(int synthType) {
    switch (synthType) {
        case SYNTH_FALCON:
            return static_cast<int>(Falcon::ParamIndices::NumParams);
        case SYNTH_SLAUGHTER:
            return static_cast<int>(Slaughter::ParamIndices::NumParams);
        case SYNTH_ADULTERY:
            return static_cast<int>(Adultery::ParamIndices::NumParams);
        default:
            return 32;
    }
}

// Live voice report for the editor curves (src/engine/voiceStatus/wasmVoiceStatus.ts): 8 floats per sounding voice.
//   Falcon:    note, carrier (oscillator 2) envelope stage and value, seconds since the note, 0 (no filter), modulator
//              (oscillator 1) envelope value, vibrato phase in cycles, modulator envelope stage.
//   Slaughter: note, amplitude envelope stage and value, seconds since the note, the filter frequency in Hz as the voice
//              last handed it to the filter (after the modulation envelope), modulation envelope value, vibrato phase,
//              modulation envelope stage.
// Stage codes follow EnvelopeState: 0 attack 1 decay 2 sustain 3 release 4 finished.
EXPORT int wavesabre_get_voices(void* ptr, float* out, int maxVoices) {
    auto wrapper = static_cast<SynthWrapper*>(ptr);
    if (!wrapper || !wrapper->device || wrapper->type == SYNTH_ADULTERY) return 0;
    SynthDevice* device = static_cast<SynthDevice*>(wrapper->device);
    int n = 0;
    for (int i = 0; i < SynthDevice::maxVoices && n < maxVoices; i++) {
        SynthDevice::Voice* voice = device->voices[i];
        if (!voice || !voice->IsOn) continue;
        float* o = out + n * 8;
        o[0] = (float)voice->Note;
        o[3] = (float)wrapper->voiceAge[i] / globalSampleRate;
        double phase = voice->vibratoPhase;
        o[6] = (float)(phase - floor(phase));
        if (wrapper->type == SYNTH_FALCON) {
            Falcon::FalconVoice* v = static_cast<Falcon::FalconVoice*>(voice);
            o[1] = (float)(int)v->osc2Env.State;
            o[2] = v->osc2Env.GetValue();
            o[4] = 0.0f;
            o[5] = v->osc1Env.GetValue();
            o[7] = (float)(int)v->osc1Env.State;
        } else {
            Slaughter::SlaughterVoice* v = static_cast<Slaughter::SlaughterVoice*>(voice);
            o[1] = (float)(int)v->ampEnv.State;
            o[2] = v->ampEnv.GetValue();
            o[4] = v->filter.freq;
            o[5] = v->modEnv.GetValue();
            o[7] = (float)(int)v->modEnv.State;
        }
        n++;
    }
    return n;
}
