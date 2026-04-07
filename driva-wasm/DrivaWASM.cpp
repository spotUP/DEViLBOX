/**
 * DrivaWASM.cpp — Driva effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct DrivaInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float amount = 0.5f;
    float tone = 0.0f;
    float mix = 1.0f;

    // DSP state & methods

    float lpStateL = 0.0f, lpStateR = 0.0f;
    float hpStateL = 0.0f, hpStateR = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        lpStateL = lpStateR = hpStateL = hpStateR = 0.0f;
    }
    void updateCoeffs() {}

    static float processDistortion(float x, float amt, int mode) {
        float gained = x * (1.0f + amt * 49.0f);
        switch (mode) {
            case 0: // warm: soft tanh
                return std::tanh(gained);
            case 1: { // crunch: hard clip + resonant character
                float clipped = std::clamp(gained, -1.0f, 1.0f);
                return clipped - 0.3f * clipped * clipped * clipped;
            }
            case 2: { // heavy: asymmetric wavefold
                float folded = std::sin(gained * 1.5f);
                return gained >= 0 ? folded : folded * 0.8f;
            }
            case 3: { // fuzz: extreme
                float sign = gained >= 0 ? 1.0f : -1.0f;
                return sign * (1.0f - std::exp(-std::fabs(gained) * 3.0f));
            }
            default: return std::tanh(gained);
        }
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        int mode = std::clamp((int)tone, 0, 3);
        float lpCoeff = std::exp(-2.0f * 3.14159265f * (2000.0f + (1.0f - amount) * 10000.0f) / sampleRate);
        float hpCoeff = std::exp(-2.0f * 3.14159265f * 30.0f / sampleRate);
        for (int i = 0; i < n; i++) {
            float wetL = processDistortion(inL[i], amount, mode);
            float wetR = processDistortion(inR[i], amount, mode);
            // Tone LP filter
            lpStateL = wetL * (1.0f - lpCoeff) + lpStateL * lpCoeff;
            lpStateR = wetR * (1.0f - lpCoeff) + lpStateR * lpCoeff;
            wetL = lpStateL; wetR = lpStateR;
            // DC block HP
            float dcL = hpStateL; hpStateL = wetL * (1.0f - hpCoeff) + hpStateL * hpCoeff;
            float dcR = hpStateR; hpStateR = wetR * (1.0f - hpCoeff) + hpStateR * hpCoeff;
            wetL -= dcL; wetR -= dcR;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static DrivaInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int driva_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void driva_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void driva_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void driva_set_amount(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].amount = std::clamp(v, 0.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void driva_set_tone(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].tone = std::clamp(v, 0.0f, 3.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void driva_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
