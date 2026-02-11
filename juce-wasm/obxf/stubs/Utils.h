/**
 * Stub Utils.h for OB-Xf WASM build.
 * The real Utils.h includes juce_audio_processors and fmt.
 * We only need linsc, logsc, getPitch which are defined in the wrapper.
 */
#ifndef OBXF_SRC_UTILS_H
#define OBXF_SRC_UTILS_H

#include "Constants.h"

// These are defined before including SynthEngine.h in OBXfWASM.cpp:
// inline static float linsc(float param, const float min, const float max);
// inline static float logsc(float param, const float min, const float max, const float rolloff);
// inline static float getPitch(float index);

#endif // OBXF_SRC_UTILS_H
