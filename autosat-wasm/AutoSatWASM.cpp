#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct AutoSatInstance {
    bool active = false;
    float sampleRate = 48000.0f;
    float amount = 0.5f;
    float mix = 1.0f;
    float rmsL = 0.0f, rmsR = 0.0f;
    float envCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        rmsL = rmsR = 0.0f;
        // ~10ms attack/release envelope
        envCoeff = 1.0f - std::exp(-1.0f / (sr * 0.01f));
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float dryL = inL[i], dryR = inR[i];

            // Track RMS envelope
            float sqL = dryL * dryL;
            float sqR = dryR * dryR;
            rmsL += envCoeff * (sqL - rmsL);
            rmsR += envCoeff * (sqR - rmsR);

            // Proportional saturation: more level = more saturation
            float levelL = std::sqrt(rmsL);
            float levelR = std::sqrt(rmsR);
            float satAmountL = amount * levelL * 4.0f;
            float satAmountR = amount * levelR * 4.0f;

            // Soft saturation using tanh with proportional drive
            float wetL = (satAmountL > 0.001f) ? std::tanh(dryL * (1.0f + satAmountL * 3.0f)) / (1.0f + satAmountL * 0.3f) : dryL;
            float wetR = (satAmountR > 0.001f) ? std::tanh(dryR * (1.0f + satAmountR * 3.0f)) / (1.0f + satAmountR * 0.3f) : dryR;

            // Mix
            outL[i] = dryL + mix * (wetL - dryL);
            outR[i] = dryR + mix * (wetR - dryR);
        }
    }
};

static AutoSatInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int autosat_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s] = AutoSatInstance{};
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void autosat_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void autosat_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void autosat_set_amount(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].amount = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void autosat_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

}
