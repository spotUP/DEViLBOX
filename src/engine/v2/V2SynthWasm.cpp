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
    
    // V2::InitDefs(); // We don't really need the editor defs for just playing
    
    unsigned int size = synthGetSize();
    g_synthInstance = malloc(size);
    memset(g_synthInstance, 0, size);
    
    // Initialize with a default patch map (InitSound)
    // In V2, the patchmap is basically the concatenated parameters for all 128 programs
    // For our tracker, we'll mostly use Program 0.
    memset(g_patchMap, 0, sizeof(g_patchMap));
    
    // synthInit(instance, patchmap, samplerate)
    synthInit(g_synthInstance, g_patchMap, samplerate);
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
    
    // To update parameters in real-time, V2 usually expects MIDI CC or 
    // a full patch re-init. However, we can send a MIDI SysEx or CC 
    // for standard V2 parameters if we map them.
    // Classic V2 uses CCs for many things.
    
    // For direct parameter access, we'd need to poke into the synth's internal state
    // which is complex. Easier: send MIDI CC.
    // Most V2 params map to CCs in a specific way.
    
    // Alternatively, poke into the patchmap and call synthInit again? 
    // No, that's too slow.
    
    // Let's use the MIDI CC approach for now as it's built-in.
    // Status 0xB0 | channel 0
    processMIDI(0xB0, index, value);
}

}

// Binding for better JS integration
EMSCRIPTEN_BINDINGS(v2_synth) {
    function("initSynth", &initSynth);
    function("processMIDI", &processMIDI);
    function("render", &render, allow_raw_pointers());
    function("setParameter", &setParameter);
}
