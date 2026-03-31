// libMTSClient.h — Stub for MTS-ESP (microtuning) in WASM build
#pragma once

struct MTSClient {};
inline MTSClient* MTS_RegisterClient() { return nullptr; }
inline void MTS_DeregisterClient(MTSClient*) {}
inline bool MTS_HasMaster(MTSClient*) { return false; }
inline double MTS_RetuningInSemitones(MTSClient*, int, int) { return 0.0; }
inline const char* MTS_GetScaleName(MTSClient*) { return "12-TET"; }
