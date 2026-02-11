/**
 * MTS-ESP client stub for OB-Xf WASM build.
 * MTS-ESP microtuning is not available in WASM, so we stub it out.
 */
#pragma once

struct MTSClient {};

inline MTSClient* MTS_RegisterClient() { return nullptr; }
inline void MTS_DeregisterClient(MTSClient*) {}
inline bool MTS_HasMaster(MTSClient*) { return false; }
inline double MTS_RetuningInSemitones(MTSClient*, int, int) { return 0.0; }
inline const char* MTS_GetScaleName(MTSClient*) { return "12-TET"; }
