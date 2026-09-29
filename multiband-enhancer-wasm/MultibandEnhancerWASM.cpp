/**
 * MultibandEnhancerWASM.cpp — 4-band stereo width enhancement + harmonics
 *
 * Splits signal into 4 bands via Linkwitz-Riley crossovers, applies M/S
 * width control per band, optional harmonic saturation, and recombines.
 *
 * Build: cd multiband-enhancer-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include "lr4_crossover.h"
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

struct MultibandEnhancerInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    float lowCross = 200.0f;     // Hz
    float midCross = 2000.0f;    // Hz
    float highCross = 8000.0f;   // Hz
    float lowWidth = 1.0f;       // 0..2
    float midWidth = 1.0f;
    float highWidth = 1.0f;
    float topWidth = 1.0f;
    float harmonics = 0.0f;      // 0..1
    float mix = 1.0f;

    // Flat-summing LR4 band split per channel (wasm-common/lr4_crossover.h).
    lr4::Split4 splitL, splitR;
    float setLow = -1, setMid = -1, setHigh = -1;

    void init(float sr) {
        sampleRate = sr;
        splitL.reset(); splitR.reset();
        setLow = setMid = setHigh = -1;
    }

    static float saturate(float x, float amount) {
        if (amount < 0.001f) return x;
        return x + amount * (std::tanh(x * 2.0f) - x);
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        if (lowCross != setLow || midCross != setMid || highCross != setHigh) {
            splitL.set(lowCross, midCross, highCross, sampleRate);
            splitR.set(lowCross, midCross, highCross, sampleRate);
            setLow = lowCross; setMid = midCross; setHigh = highCross;
        }
        for (int i = 0; i < n; i++) {
            float lowL, midL, hiL, topL, lowR, midR, hiR, topR;
            splitL.split(inL[i], lowL, midL, hiL, topL);
            splitR.split(inR[i], lowR, midR, hiR, topR);
            // The dry signal for the mix: the bands summed untouched, which
            // carries the same crossover phase as the wet (raw input would
            // comb against it at mix < 1).
            const float dryL = lowL + midL + hiL + topL;
            const float dryR = lowR + midR + hiR + topR;

            // M/S processing per band
            auto applyWidth = [&](float& bL, float& bR, float width) {
                float m = (bL + bR) * 0.5f;
                float s = (bL - bR) * 0.5f;
                s *= width;
                m = saturate(m, harmonics);
                bL = m + s;
                bR = m - s;
            };

            applyWidth(lowL, lowR, lowWidth);
            applyWidth(midL, midR, midWidth);
            applyWidth(hiL, hiR, highWidth);
            applyWidth(topL, topR, topWidth);

            float wetL = lowL + midL + hiL + topL;
            float wetR = lowR + midR + hiR + topR;

            outL[i] = dryL * (1.0f - mix) + wetL * mix;
            outR[i] = dryR * (1.0f - mix) + wetR * mix;
        }
    }
};

static MultibandEnhancerInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int multiband_enhancer_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void multiband_enhancer_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void multiband_enhancer_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_lowCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lowCross = std::clamp(v, 20.0f, 500.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_midCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].midCross = std::clamp(v, 200.0f, 5000.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_highCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].highCross = std::clamp(v, 2000.0f, 16000.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_lowWidth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lowWidth = std::clamp(v, 0.0f, 2.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_midWidth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].midWidth = std::clamp(v, 0.0f, 2.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_highWidth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].highWidth = std::clamp(v, 0.0f, 2.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_topWidth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].topWidth = std::clamp(v, 0.0f, 2.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_harmonics(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].harmonics = std::clamp(v, 0.0f, 1.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_enhancer_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
