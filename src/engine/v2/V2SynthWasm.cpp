#include <emscripten.h>
#include <emscripten/bind.h>
#include "synth.h"
#include "v2defs.h"
#include <string.h>
#include <vector>

using namespace emscripten;

// The V2 synth instance memory
static void* g_synthInstance = nullptr;
static unsigned char g_patchMap[128 * 1024]; // Large enough for patches

extern "C" {

EMSCRIPTEN_KEEPALIVE
void initSynth(int samplerate) {
    if (g_synthInstance) return;

    unsigned int size = synthGetSize();
    g_synthInstance = malloc(size);
    memset(g_synthInstance, 0, size);

    // Initialize patchmap: zero it, then copy the default V2 InitSound into program 0.
    // V2::InitSound contains a working sawtooth patch with velocity->amplify modulation,
    // which is essential for producing audio on Note On.
    memset(g_patchMap, 0, sizeof(g_patchMap));
    memcpy(g_patchMap, V2::InitSound, V2::SoundSize);

    // synthInit(instance, patchmap, samplerate)
    synthInit(g_synthInstance, g_patchMap, samplerate);

    // Set global parameters (reverb, delay, compressor, etc.)
    synthSetGlobals(g_synthInstance, V2::InitGlobals);

    // Select program 0 on channel 0 via MIDI Program Change
    unsigned char pgmChange[3] = { 0xC0, 0, 0 };
    synthProcessMIDI(g_synthInstance, pgmChange);
}

EMSCRIPTEN_KEEPALIVE
void processMIDI(int status, int data1, int data2) {
    if (!g_synthInstance) return;

    unsigned char msg[3];
    msg[0] = (unsigned char)status;
    msg[1] = (unsigned char)data1;
    msg[2] = (unsigned char)data2;

    synthProcessMIDI(g_synthInstance, msg);
}

EMSCRIPTEN_KEEPALIVE
void render(float* outputL, float* outputR, int numSamples) {
    if (!g_synthInstance) return;

    // V2 renders interleaved or to two buffers
    // void __stdcall synthRender(void *pthis, void *buf, int smp, void *buf2=0, int add=0);
    // If buf2 is provided, it's non-interleaved L and R
    synthRender(g_synthInstance, outputL, numSamples, outputR, 0);
}

EMSCRIPTEN_KEEPALIVE
void setParameter(int program, int index, int value) {
    if (!g_synthInstance) return;

    // Write parameter directly into the patchmap at the correct offset.
    // V2 reads patch data from the patchmap on Note On, so parameters
    // must be set BEFORE triggering notes for them to take effect.
    int offset = program * V2::SoundSize + index;
    if (offset >= 0 && offset < (int)sizeof(g_patchMap)) {
        g_patchMap[offset] = (unsigned char)value;
    }
}

}

// Binding for better JS integration
EMSCRIPTEN_BINDINGS(v2_synth) {
    function("initSynth", &initSynth);
    function("processMIDI", &processMIDI);
    function("render", &render, allow_raw_pointers());
    function("setParameter", &setParameter);
}
