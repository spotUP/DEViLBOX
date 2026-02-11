// Stub MTS-ESP client header for Monique WASM build — no microtuning support
#pragma once
#include <cmath>

// Forward declaration matches monique_core_Datastructures.h: "struct MTSClient;"
struct MTSClient {};

static inline MTSClient* MTS_RegisterClient() { return nullptr; }
static inline void MTS_DeregisterClient(MTSClient*) {}
static inline bool MTS_HasMaster(MTSClient*) { return false; }
static inline double MTS_NoteToFrequency(MTSClient*, char note, char channel) {
    (void)channel;
    return 440.0 * std::pow(2.0, ((double)note - 69.0) / 12.0);
}
static inline double MTS_RetuningInSemitones(MTSClient*, char, char) { return 0.0; }
static inline bool MTS_ShouldFilterNote(MTSClient*, char, char) { return false; }
