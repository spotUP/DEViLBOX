// Tunefish 4 WASM Wrapper
// Exposes Tunefish synth for web audio

#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <cstdio>

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

// Default params for a basic saw-like init patch
// Based on factory patch 0 structure
static void setDefaultParams(eTfInstrument& instr) {
    // Clear all params first
    for (int i = 0; i < TF_PARAM_COUNT; i++) {
        instr.params[i] = 0.5f;  // Default to center
    }
    
    // Generator params (oscillator)
    // Note: TF_GLOBAL_GAIN uses special mapping: 0-0.5 = (val*2)^2, 0.5-1.0 = (val-0.5)*20+1
    // So 0.5 = unity gain, 0.0 = silence, 1.0 = 11x gain
    instr.params[TF_GLOBAL_GAIN] = 0.15f;     // Low gain for reasonable output
    instr.params[TF_GEN_BANDWIDTH] = 0.4f;    // Bandwidth
    instr.params[TF_GEN_NUMHARMONICS] = 0.3f; // Reduced harmonics for lower output
    instr.params[TF_GEN_DAMP] = 0.9f;         // Damping
    instr.params[TF_GEN_MODULATION] = 0.1f;   // Modulation
    instr.params[TF_GEN_VOLUME] = 0.4f;       // Lower volume
    instr.params[TF_GEN_PANNING] = 0.5f;      // Center pan
    instr.params[TF_GEN_SLOP] = 0.5f;         // Slop
    instr.params[TF_GEN_OCTAVE] = 0.5f;       // Middle octave
    instr.params[TF_GEN_GLIDE] = 0.0f;        // No glide
    instr.params[TF_GEN_DETUNE] = 0.2f;       // Small detune
    instr.params[TF_GEN_FREQ] = 0.0f;         // Base freq
    instr.params[TF_GEN_POLYPHONY] = 1.0f;    // CRITICAL: Enable polyphony (12 voices)
    instr.params[TF_GEN_DRIVE] = 0.1f;        // Small drive
    instr.params[TF_GEN_UNISONO] = 1.0f;      // Unison voices
    instr.params[TF_GEN_SPREAD] = 0.5f;       // Stereo spread
    instr.params[TF_GEN_SCALE] = 0.5f;        // Scale
    
    // Noise
    instr.params[TF_NOISE_AMOUNT] = 0.0f;     // No noise
    instr.params[TF_NOISE_FREQ] = 0.0f;
    instr.params[TF_NOISE_BW] = 0.5f;
    
    // Low-pass filter (simple setup)
    instr.params[TF_LP_FILTER_ON] = 1.0f;     // Filter on
    instr.params[TF_LP_FILTER_CUTOFF] = 0.8f; // High cutoff
    instr.params[TF_LP_FILTER_RESONANCE] = 0.2f; // Low resonance
    
    // ADSR - simple attack, sustain, release
    instr.params[TF_ADSR1_ATTACK] = 0.1f;
    instr.params[TF_ADSR1_DECAY] = 0.2f;
    instr.params[TF_ADSR1_SUSTAIN] = 0.8f;
    instr.params[TF_ADSR1_RELEASE] = 0.3f;
    instr.params[TF_ADSR1_SLOPE] = 0.5f;
    
    instr.params[TF_ADSR2_ATTACK] = 0.1f;
    instr.params[TF_ADSR2_DECAY] = 0.2f;
    instr.params[TF_ADSR2_SUSTAIN] = 0.7f;
    instr.params[TF_ADSR2_RELEASE] = 0.3f;
    instr.params[TF_ADSR2_SLOPE] = 0.5f;
}

EXPORT void* tunefish_create(float sampleRate) {
    auto wrapper = new TunefishWrapper();
    
    // Initialize synth using the proper init function
    eTfSynthInit(wrapper->synth);
    wrapper->synth.sampleRate = static_cast<eU32>(sampleRate);
    
    // Initialize instrument
    eTfInstrumentInit(wrapper->instrument);
    
    // Set default params for sound output
    setDefaultParams(wrapper->instrument);
    
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
