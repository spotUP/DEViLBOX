// WaveSabre WASM Wrapper
// Exposes Falcon and Slaughter synths for web audio

#include <cstdint>
#include <cstring>
#include <cmath>

#ifdef WASM_BUILD
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

#include "WaveSabreCore/Falcon.h"
#include "WaveSabreCore/Slaughter.h"
#include "WaveSabreCore/Adultery.h"
#include "WaveSabreCore/Helpers.h"

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
    return wrapper;
}

EXPORT void* wavesabre_create_slaughter() {
    auto wrapper = new SynthWrapper();
    wrapper->type = SYNTH_SLAUGHTER;
    wrapper->device = new Slaughter();
    wrapper->sampleRate = globalSampleRate;
    wrapper->inputBuffer[0] = dummyInput;
    wrapper->inputBuffer[1] = dummyInput;
    return wrapper;
}

EXPORT void* wavesabre_create_adultery() {
    auto wrapper = new SynthWrapper();
    wrapper->type = SYNTH_ADULTERY;
    wrapper->device = new Adultery();
    wrapper->sampleRate = globalSampleRate;
    wrapper->inputBuffer[0] = dummyInput;
    wrapper->inputBuffer[1] = dummyInput;
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
