/**
 * AGCWASM.cpp — AGC effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct AGCInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float target = -12.0f;
    float speed = 0.1f;
    float maxGain = 12.0f;
    float mix = 1.0f;

    // DSP state & methods

    float rmsEnv = 0.0f;
    float currentGain = 1.0f;
    float smoothCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        rmsEnv = 0.0f;
        currentGain = 1.0f;
        updateCoeffs();
    }
    void updateCoeffs() {
        smoothCoeff = std::exp(-speed / (sampleRate * 0.1f));
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float targetLin = std::pow(10.0f, target / 20.0f);
        float maxGainLin = std::pow(10.0f, maxGain / 20.0f);
        for (int i = 0; i < n; i++) {
            float mono = (inL[i] + inR[i]) * 0.5f;
            float sq = mono * mono;
            rmsEnv = smoothCoeff * rmsEnv + (1.0f - smoothCoeff) * sq;
            float rms = std::sqrt(rmsEnv + 1e-30f);
            float desiredGain = targetLin / (rms + 1e-30f);
            desiredGain = std::clamp(desiredGain, 0.001f, maxGainLin);
            // Smooth gain changes
            float gCoeff = (desiredGain < currentGain) ? 0.999f : smoothCoeff;
            currentGain = gCoeff * currentGain + (1.0f - gCoeff) * desiredGain;
            float wetL = inL[i] * currentGain;
            float wetR = inR[i] * currentGain;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static AGCInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int agc_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void agc_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void agc_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void agc_set_target(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].target = std::clamp(v, -24.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void agc_set_speed(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].speed = std::clamp(v, 0.01f, 1.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void agc_set_maxGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].maxGain = std::clamp(v, 0.0f, 24.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void agc_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
