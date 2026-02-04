/*
 * libMTSClient.h - Stub header for MTS-ESP microtuning support
 * For DEViLBOX WASM build - provides null implementation
 */

#ifndef LIB_MTS_CLIENT_H
#define LIB_MTS_CLIENT_H

#include <cstdint>
#include <cmath>

// Stub MTSClient class - MTS-ESP microtuning not supported in WASM build
struct MTSClient {
    // Empty stub
};

// Stub functions
inline MTSClient* MTS_RegisterClient() { return nullptr; }
inline void MTS_DeregisterClient(MTSClient*) {}
inline bool MTS_HasMaster(MTSClient*) { return false; }
inline bool MTS_ShouldFilterNote(MTSClient*, int, int) { return false; }
inline double MTS_NoteToFrequency(MTSClient*, int note, int) {
    // Standard 12-TET tuning
    return 440.0 * std::pow(2.0, (note - 69) / 12.0);
}
inline double MTS_RetuningInSemitones(MTSClient*, int, int) { return 0.0; }
inline const char* MTS_GetScaleName(MTSClient*) { return "12-TET"; }

#endif // LIB_MTS_CLIENT_H
