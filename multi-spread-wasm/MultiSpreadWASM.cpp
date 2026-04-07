/**
 * MultiSpreadWASM.cpp — Mono-to-stereo via frequency band distribution
 *
 * Splits signal into bands using allpass filters to create complementary
 * L/R spectra, spreading mono content across the stereo field.
 *
 * Build: cd multi-spread-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int MAX_BANDS = 8;
static constexpr float PI = 3.14159265358979323846f;

// First-order allpass filter
struct AllpassFilter {
    float a1 = 0.0f;
    float z1 = 0.0f;

    void setCoeff(float freq, float sr) {
        float t = std::tan(PI * freq / sr);
        a1 = (t - 1.0f) / (t + 1.0f);
    }

    float process(float x) {
        float y = a1 * x + z1;
        z1 = x - a1 * y;
        return y;
    }

    void clear() { z1 = 0.0f; }
};

struct MultiSpreadInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    int bands = 4;        // 2..8
    float spread = 0.7f;  // 0..1
    float mix = 1.0f;

    // Two sets of cascaded allpass filters for complementary spectra
    AllpassFilter apL[MAX_BANDS];
    AllpassFilter apR[MAX_BANDS];

    void init(float sr) {
        sampleRate = sr;
        updateFilters();
    }

    void updateFilters() {
        for (int i = 0; i < MAX_BANDS; i++) {
            apL[i].clear();
            apR[i].clear();
        }
        // Distribute crossover frequencies logarithmically
        for (int i = 0; i < bands; i++) {
            float frac = static_cast<float>(i + 1) / static_cast<float>(bands + 1);
            float freq = 200.0f * std::pow(sampleRate * 0.4f / 200.0f, frac);
            freq = std::clamp(freq, 20.0f, sampleRate * 0.49f);
            apL[i].setCoeff(freq, sampleRate);
            apR[i].setCoeff(freq, sampleRate);
        }
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        for (int i = 0; i < n; i++) {
            float mono = (inL[i] + inR[i]) * 0.5f;

            // Process through allpass chains with different orders
            // L channel: all filters in series
            float sigL = mono;
            for (int b = 0; b < bands; b++) {
                sigL = apL[b].process(sigL);
            }

            // R channel: one fewer filter pass creates phase difference
            float sigR = mono;
            for (int b = 0; b < bands - 1; b++) {
                sigR = apR[b].process(sigR);
            }

            // The phase difference between L and R creates stereo width
            float spreadL = (mono + sigL) * 0.5f;
            float spreadR = (mono - sigL) * 0.5f + sigR * 0.5f;

            // Blend with spread amount
            float wetL = inL[i] * (1.0f - spread) + spreadL * spread;
            float wetR = inR[i] * (1.0f - spread) + spreadR * spread;

            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static MultiSpreadInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int multi_spread_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void multi_spread_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void multi_spread_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void multi_spread_set_bands(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].bands = std::clamp(static_cast<int>(v + 0.5f), 2, MAX_BANDS);
        instances[h].updateFilters();
    }
}

EMSCRIPTEN_KEEPALIVE void multi_spread_set_spread(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].spread = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void multi_spread_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
