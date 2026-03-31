// libMTSClient.h — Stub for Dexed WASM build
// MTS-ESP is not needed for the UI-only build
#pragma once

typedef void* MTSClient;

inline MTSClient* MTS_RegisterClient() { return nullptr; }
inline void MTS_DeregisterClient(MTSClient*) {}
inline bool MTS_HasMaster(MTSClient*) { return false; }
inline double MTS_NoteToFrequency(MTSClient*, char, char) { return 440.0; }
inline double MTS_RetuningInSemitones(MTSClient*, char, char) { return 0.0; }
