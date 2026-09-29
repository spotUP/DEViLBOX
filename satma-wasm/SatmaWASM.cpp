#include <cmath>
#include <cstring>
#include <algorithm>
#include <cstdint>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

// Cubic soft clip, unity small-signal gain: x - (4/27)x^3 on [-1.5, 1.5],
// reaching its peak of 1 there and flat beyond. The clamp sat at +-1.5 on
// x - x^3/3, whose peak is at 1, so louder input came out QUIETER
// (1.5 -> 0.375): a fold-back.
static inline float softClip(float x) {
    x = std::clamp(x, -1.5f, 1.5f);
    return x - (4.0f / 27.0f) * x * x * x;
}

// Reference level for the drive makeup: -18 dBFS RMS, a mix's level.
static constexpr float kRefRms = 0.125893f;

// Output gain that brings a -18 dBFS signal driven by `gain` back to -18 dBFS
// through softClip: the drive otherwise came out up to +11 dB louder than it
// went in (2026-09-29). Measured on a fixed noise sequence (sum of four
// uniforms: near-Gaussian, like a mix), so it is the same on every call.
static float driveMakeup(float gain) {
    uint32_t seed = 22222u;
    double sq = 0.0;
    const int n = 8192;
    for (int i = 0; i < n; i++) {
        float u = 0.0f;
        for (int k = 0; k < 4; k++) { seed = seed * 1664525u + 1013904223u; u += (seed >> 8) * (1.0f / 16777216.0f) - 0.5f; }
        const float x = u * (kRefRms / 0.57735f); // four uniforms: sd sqrt(4/12)
        const float y = softClip(x * gain);
        sq += (double)y * y;
    }
    const float rms = (float)std::sqrt(sq / n);
    return rms > 0.0f ? kRefRms / rms : 1.0f;
}

struct SatmaInstance {
    bool active = false;
    float sampleRate = 48000.0f;
    float distortion = 0.5f;
    float tone = 0.5f;
    float mix = 1.0f;
    float makeupFor = -1.0f;   // distortion the makeup was computed for
    float makeup = 1.0f;
    // LP filter state
    float lpL = 0.0f, lpR = 0.0f;
    // HP filter state (derived from LP)
    float hpPrevL = 0.0f, hpPrevR = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        lpL = lpR = 0.0f;
        hpPrevL = hpPrevR = 0.0f;
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        // Gain from distortion: exponential 1x to 100x
        float gain = 1.0f + distortion * distortion * 99.0f;
        if (distortion != makeupFor) { makeup = driveMakeup(gain); makeupFor = distortion; }
        // Tone filter frequency: 200Hz (tone=0) to 8000Hz (tone=1)
        float toneFreq = 200.0f * std::pow(40.0f, tone);
        float lpCoeff = 1.0f - std::exp(-2.0f * 3.14159265f * toneFreq / sampleRate);
        const float toneNorm = 1.0f / std::max(tone, 1.0f - tone);

        for (int i = 0; i < n; i++) {
            float dryL = inL[i], dryR = inR[i];

            // Apply heavy gain
            float sL = inL[i] * gain;
            float sR = inR[i] * gain;

            sL = softClip(sL) * makeup;
            sR = softClip(sR) * makeup;
            // Tone: LP filter
            lpL += lpCoeff * (sL - lpL);
            lpR += lpCoeff * (sR - lpR);

            // HP = original - LP
            float hpL = sL - lpL;
            float hpR = sR - lpR;

            // Crossfade LP/HP based on tone, normalised to the larger weight:
            // pure LP at 0, flat at 0.5, pure HP at 1. The plain crossfade
            // summed to half the signal at the centre (-6 dB).
            float wetL = ((1.0f - tone) * lpL + tone * hpL) * toneNorm;
            float wetR = ((1.0f - tone) * lpR + tone * hpR) * toneNorm;

            // Soft limit output
            wetL = std::tanh(wetL);
            wetR = std::tanh(wetR);

            // Mix
            outL[i] = dryL + mix * (wetL - dryL);
            outR[i] = dryR + mix * (wetR - dryR);
        }
    }
};

static SatmaInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int satma_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s] = SatmaInstance{};
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void satma_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void satma_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void satma_set_distortion(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].distortion = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void satma_set_tone(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].tone = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void satma_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

}
