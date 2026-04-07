/**
 * MaximizerWASM.cpp — Maximizer effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct MaximizerInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float ceiling = -0.3f;
    float release = 50.0f;
    float mix = 1.0f;

    // DSP state & methods

    static constexpr int LOOK_MAX = 256;
    float lookBufL[LOOK_MAX * 2] = {};
    float lookBufR[LOOK_MAX * 2] = {};
    int lookLen = 128;
    int writePos = 0;
    float gainEnv = 1.0f;
    float relCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        lookLen = 128;
        writePos = 0;
        gainEnv = 1.0f;
        std::memset(lookBufL, 0, sizeof(lookBufL));
        std::memset(lookBufR, 0, sizeof(lookBufR));
        updateCoeffs();
    }
    void updateCoeffs() {
        relCoeff = std::exp(-1.0f / (sampleRate * release * 0.001f));
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float ceilLin = std::pow(10.0f, ceiling / 20.0f);
        for (int i = 0; i < n; i++) {
            lookBufL[writePos] = inL[i];
            lookBufR[writePos] = inR[i];
            // Find peak in lookahead buffer
            float peak = 0.0f;
            for (int j = 0; j < lookLen; j++) {
                int idx = (writePos - j + LOOK_MAX * 2) % (LOOK_MAX * 2);
                peak = std::max(peak, std::max(std::fabs(lookBufL[idx]), std::fabs(lookBufR[idx])));
            }
            // Target gain
            float targetGain = (peak > ceilLin) ? (ceilLin / peak) : 1.0f;
            // Smooth gain envelope
            if (targetGain < gainEnv) gainEnv = targetGain;
            else gainEnv = targetGain + (gainEnv - targetGain) * relCoeff;
            // Read delayed sample
            int readPos = (writePos - lookLen + LOOK_MAX * 2) % (LOOK_MAX * 2);
            float wetL = lookBufL[readPos] * gainEnv;
            float wetR = lookBufR[readPos] * gainEnv;
            writePos = (writePos + 1) % (LOOK_MAX * 2);
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static MaximizerInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int maximizer_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void maximizer_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void maximizer_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void maximizer_set_ceiling(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].ceiling = std::clamp(v, -6.0f, 0.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void maximizer_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].release = std::clamp(v, 1.0f, 500.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void maximizer_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
