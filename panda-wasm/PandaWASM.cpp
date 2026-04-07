/**
 * PandaWASM.cpp — Panda effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct PandaInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float threshold = -20.0f;
    float factor = 0.5f;
    float release = 100.0f;
    float mix = 1.0f;

    // DSP state & methods

    float env = 0.0f;
    float attCoeff = 0.0f, relCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        env = 0.0f;
        attCoeff = std::exp(-1.0f / (sr * 0.001f));
        updateCoeffs();
    }
    void updateCoeffs() {
        relCoeff = std::exp(-1.0f / (sampleRate * release * 0.001f));
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float threshLin = std::pow(10.0f, threshold / 20.0f);
        for (int i = 0; i < n; i++) {
            float peak = std::max(std::fabs(inL[i]), std::fabs(inR[i]));
            env = peak > env ? peak + (env - peak) * attCoeff : peak + (env - peak) * relCoeff;
            float envDb = 20.0f * std::log10(env + 1e-30f);
            float gainDb = 0.0f;
            if (envDb < threshold) {
                // Below threshold: expand (reduce gain)
                float below = threshold - envDb;
                gainDb = -below * factor;
            } else {
                // Above threshold: compress
                float above = envDb - threshold;
                gainDb = -above * factor * 0.5f;
            }
            float gain = std::pow(10.0f, gainDb / 20.0f);
            float wetL = inL[i] * gain;
            float wetR = inR[i] * gain;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static PandaInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int panda_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void panda_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void panda_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void panda_set_threshold(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].threshold = std::clamp(v, -60.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void panda_set_factor(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].factor = std::clamp(v, 0.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void panda_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].release = std::clamp(v, 10.0f, 1000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void panda_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
