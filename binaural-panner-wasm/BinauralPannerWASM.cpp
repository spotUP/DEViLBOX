/**
 * BinauralPannerWASM.cpp — BinauralPanner effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct BinauralPannerInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float azimuth = 0.0f;
    float elevation = 0.0f;
    float distance = 1.0f;
    float mix = 1.0f;

    // DSP state & methods

    // ITD delay line
    static constexpr int MAX_ITD = 128;
    float delayBufL[MAX_ITD] = {};
    float delayBufR[MAX_ITD] = {};
    int delayWritePos = 0;
    // Head shadow LP filter
    float shadowStateL = 0.0f, shadowStateR = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        delayWritePos = 0;
        shadowStateL = shadowStateR = 0.0f;
        std::memset(delayBufL, 0, sizeof(delayBufL));
        std::memset(delayBufR, 0, sizeof(delayBufR));
    }
    void updateCoeffs() {}
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float azRad = azimuth * 3.14159265f / 180.0f;
        float elRad = elevation * 3.14159265f / 180.0f;
        float cosEl = std::cos(elRad);
        // ITD: max ~0.6ms, based on azimuth
        float itdSec = 0.0006f * std::sin(azRad) * cosEl;
        int itdSamplesL = std::clamp((int)(std::max(0.0f, -itdSec) * sampleRate), 0, MAX_ITD - 1);
        int itdSamplesR = std::clamp((int)(std::max(0.0f, itdSec) * sampleRate), 0, MAX_ITD - 1);
        // ILD: up to ~10dB at high freq, simplified as overall level
        float ildDb = 5.0f * std::sin(azRad) * cosEl;
        float gainL = std::pow(10.0f, (-ildDb) / 20.0f);
        float gainR = std::pow(10.0f, (ildDb) / 20.0f);
        // Distance attenuation
        float distAtten = 1.0f / std::max(distance, 0.1f);
        gainL *= distAtten; gainR *= distAtten;
        // Head shadow LP: far ear gets LP filtered
        float shadowFreq = 4000.0f + 8000.0f * (1.0f - std::fabs(std::sin(azRad)) * cosEl);
        float shadowCoeff = std::exp(-2.0f * 3.14159265f * shadowFreq / sampleRate);
        for (int i = 0; i < n; i++) {
            float mono = (inL[i] + inR[i]) * 0.5f;
            delayBufL[delayWritePos] = mono;
            delayBufR[delayWritePos] = mono;
            int readL = (delayWritePos - itdSamplesL + MAX_ITD) % MAX_ITD;
            int readR = (delayWritePos - itdSamplesR + MAX_ITD) % MAX_ITD;
            float sigL = delayBufL[readL] * gainL;
            float sigR = delayBufR[readR] * gainR;
            // Apply head shadow to far ear
            if (azRad > 0) { // source on right, shadow left
                shadowStateL = sigL * (1.0f - shadowCoeff) + shadowStateL * shadowCoeff;
                sigL = shadowStateL;
            } else {
                shadowStateR = sigR * (1.0f - shadowCoeff) + shadowStateR * shadowCoeff;
                sigR = shadowStateR;
            }
            delayWritePos = (delayWritePos + 1) % MAX_ITD;
            outL[i] = inL[i] * (1.0f - mix) + sigL * mix;
            outR[i] = inR[i] * (1.0f - mix) + sigR * mix;
        }
    }
};

static BinauralPannerInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int binaural_panner_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void binaural_panner_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void binaural_panner_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void binaural_panner_set_azimuth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].azimuth = std::clamp(v, -180.0f, 180.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void binaural_panner_set_elevation(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].elevation = std::clamp(v, -90.0f, 90.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void binaural_panner_set_distance(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].distance = std::clamp(v, 0.1f, 10.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void binaural_panner_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
