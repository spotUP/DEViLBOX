// Tunefish 4 WASM Wrapper
// Exposes Tunefish synth for web audio

#include <cstdint>
#include <cstring>
#include <cstdlib>

#ifdef WASM_BUILD
#include <emscripten.h>
#define EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT extern "C"
#endif

// Include full Tunefish runtime (types, memory, arrays, etc.)
#include "types.hpp"
#include "runtime.hpp"
#include "random.hpp"
#include "array.hpp"
#include "tf4.hpp"

// Wrapper struct
struct TunefishWrapper {
    eTfSynth synth;
    eTfInstrument instrument;
    eF32* tempBufferL;
    eF32* tempBufferR;
    eU32 bufferSize;
};

EXPORT void* tunefish_create(float sampleRate) {
    auto wrapper = new TunefishWrapper();
    
    // Initialize synth using the proper init function
    eTfSynthInit(wrapper->synth);
    wrapper->synth.sampleRate = static_cast<eU32>(sampleRate);
    
    // Initialize instrument
    eTfInstrumentInit(wrapper->instrument);
    
    // Allocate temp buffers
    wrapper->bufferSize = 256;
    wrapper->tempBufferL = new eF32[wrapper->bufferSize];
    wrapper->tempBufferR = new eF32[wrapper->bufferSize];
    
    return wrapper;
}

EXPORT void tunefish_destroy(void* ptr) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper) {
        eTfInstrumentFree(wrapper->instrument);
        delete[] wrapper->tempBufferL;
        delete[] wrapper->tempBufferR;
        delete wrapper;
    }
}

EXPORT void tunefish_set_sample_rate(void* ptr, float sampleRate) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper) {
        wrapper->synth.sampleRate = static_cast<eU32>(sampleRate);
    }
}

EXPORT void tunefish_set_param(void* ptr, int index, float value) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper && index >= 0 && index < TF_PARAM_COUNT) {
        wrapper->instrument.params[index] = value;
    }
}

EXPORT float tunefish_get_param(void* ptr, int index) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper && index >= 0 && index < TF_PARAM_COUNT) {
        return wrapper->instrument.params[index];
    }
    return 0.0f;
}

EXPORT void tunefish_note_on(void* ptr, int note, int velocity) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper) {
        eTfInstrumentNoteOn(wrapper->instrument, note, velocity);
    }
}

EXPORT void tunefish_note_off(void* ptr, int note) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper) {
        eTfInstrumentNoteOff(wrapper->instrument, note);
    }
}

EXPORT void tunefish_all_notes_off(void* ptr) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper) {
        eTfInstrumentAllNotesOff(wrapper->instrument);
    }
}

EXPORT void tunefish_pitch_bend(void* ptr, float semitones, float cents) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper) {
        eTfInstrumentPitchBend(wrapper->instrument, semitones, cents);
    }
}

EXPORT void tunefish_mod_wheel(void* ptr, float amount) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (wrapper) {
        eTfInstrumentModWheel(wrapper->instrument, amount);
    }
}

EXPORT void tunefish_render(void* ptr, float* outputL, float* outputR, int numSamples) {
    auto wrapper = static_cast<TunefishWrapper*>(ptr);
    if (!wrapper) return;
    
    // Ensure buffer is large enough
    if (static_cast<eU32>(numSamples) > wrapper->bufferSize) {
        delete[] wrapper->tempBufferL;
        delete[] wrapper->tempBufferR;
        wrapper->bufferSize = numSamples;
        wrapper->tempBufferL = new eF32[wrapper->bufferSize];
        wrapper->tempBufferR = new eF32[wrapper->bufferSize];
    }
    
    // Clear output
    memset(outputL, 0, numSamples * sizeof(float));
    memset(outputR, 0, numSamples * sizeof(float));
    
    // Process in chunks of TF_FRAMESIZE
    eU32 processed = 0;
    while (processed < static_cast<eU32>(numSamples)) {
        eU32 chunkSize = (numSamples - processed);
        if (chunkSize > TF_FRAMESIZE) chunkSize = TF_FRAMESIZE;
        
        eF32* outputs[2] = { wrapper->tempBufferL, wrapper->tempBufferR };
        memset(wrapper->tempBufferL, 0, chunkSize * sizeof(eF32));
        memset(wrapper->tempBufferR, 0, chunkSize * sizeof(eF32));
        
        eTfInstrumentProcess(wrapper->synth, wrapper->instrument, outputs, chunkSize);
        
        // Copy to output
        for (eU32 i = 0; i < chunkSize; i++) {
            outputL[processed + i] = wrapper->tempBufferL[i];
            outputR[processed + i] = wrapper->tempBufferR[i];
        }
        
        processed += chunkSize;
    }
}

EXPORT int tunefish_get_num_params() {
    return TF_PARAM_COUNT;
}
