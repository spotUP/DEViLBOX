/**
 * MultibandEnhancerWASM.cpp — 4-band stereo width enhancement + harmonics
 *
 * Splits signal into 4 bands via Linkwitz-Riley crossovers, applies M/S
 * width control per band, optional harmonic saturation, and recombines.
 *
 * Build: cd multiband-enhancer-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

// Simple 2nd-order state-variable filter for band splitting
struct SVFilter {
    float lp = 0, bp = 0, hp = 0;
    float ic1eq = 0, ic2eq = 0;

    void clear() { lp = bp = hp = ic1eq = ic2eq = 0; }

    void process(float x, float freq, float sr) {
        float g = std::tan(PI * std::clamp(freq, 20.0f, sr * 0.49f) / sr);
        float k = 1.41421356f; // sqrt(2) for Butterworth Q
        float a1 = 1.0f / (1.0f + g * (g + k));
        float a2 = g * a1;
        float a3 = g * a2;

        float v3 = x - ic2eq;
        float v1 = a1 * ic1eq + a2 * v3;
        float v2 = ic2eq + a2 * ic1eq + a3 * v3;

        ic1eq = 2.0f * v1 - ic1eq;
        ic2eq = 2.0f * v2 - ic2eq;

        lp = v2;
        bp = v1;
        hp = x - k * v1 - v2;
    }
};

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

    // 3 crossover filters per channel (L/R), each splits into LP and HP
    SVFilter xoverL[3], xoverR[3];

    void init(float sr) {
        sampleRate = sr;
        for (int i = 0; i < 3; i++) { xoverL[i].clear(); xoverR[i].clear(); }
    }

    static float saturate(float x, float amount) {
        if (amount < 0.001f) return x;
        return x + amount * (std::tanh(x * 2.0f) - x);
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        for (int i = 0; i < n; i++) {
            float sL = inL[i], sR = inR[i];

            // Band 1: low (below lowCross)
            xoverL[0].process(sL, lowCross, sampleRate);
            xoverR[0].process(sR, lowCross, sampleRate);
            float lowL = xoverL[0].lp, lowR = xoverR[0].lp;
            float restL = xoverL[0].hp, restR = xoverR[0].hp;

            // Band 2: mid (lowCross to midCross)
            xoverL[1].process(restL, midCross, sampleRate);
            xoverR[1].process(restR, midCross, sampleRate);
            float midL = xoverL[1].lp, midR = xoverR[1].lp;
            float rest2L = xoverL[1].hp, rest2R = xoverR[1].hp;

            // Band 3: high (midCross to highCross)
            xoverL[2].process(rest2L, highCross, sampleRate);
            xoverR[2].process(rest2R, highCross, sampleRate);
            float hiL = xoverL[2].lp, hiR = xoverR[2].lp;
            float topL = xoverL[2].hp, topR = xoverR[2].hp;

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

            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
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
