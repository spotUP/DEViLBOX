/**
 * JUCE DSP shim for OB-Xf WASM build.
 * Provides FastMathApproximations::sin used by Lfo.h.
 */
#pragma once

#include <cmath>
#include <juce_core/juce_core.h>

namespace juce { namespace dsp {

struct FastMathApproximations {
    template<typename T>
    static T sin(T x) { return std::sin(x); }
};

}} // namespace juce::dsp
