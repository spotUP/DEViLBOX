/**
 * DuckaWASM.cpp — Sidechain-less auto-ducker for pumping effects
 *
 * Uses input signal level to duck itself. When level exceeds threshold,
 * volume is reduced by `drop` amount with configurable release time.
 *
 * Build: cd ducka-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct DuckaInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    float threshold = -20.0f; // dB (-60..0)
    float drop = 0.5f;        // 0..1 amount of reduction
    float release = 200.0f;   // ms (10..2000)
    float mix = 1.0f;

    float envelope = 0.0f;    // current envelope level (linear)
    float gainReduction = 0.0f; // current gain reduction 0..1

    void init(float sr) {
        sampleRate = sr;
        envelope = 0.0f;
        gainReduction = 0.0f;
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        float threshLin = std::pow(10.0f, threshold / 20.0f);
        float attackCoeff = 1.0f - std::exp(-1.0f / (0.001f * sampleRate)); // 1ms attack
        float releaseCoeff = 1.0f - std::exp(-1.0f / (release * 0.001f * sampleRate));

        for (int i = 0; i < n; i++) {
            // Peak detection
            float peak = std::max(std::fabs(inL[i]), std::fabs(inR[i]));

            // Envelope follower
            if (peak > envelope)
                envelope += attackCoeff * (peak - envelope);
            else
                envelope += releaseCoeff * (peak - envelope);

            // Gain reduction: when above threshold, reduce by `drop`
            float targetReduction = 0.0f;
            if (envelope > threshLin) {
                // How far above threshold (0..1 range)
                float overRatio = std::clamp((envelope - threshLin) / (1.0f - threshLin + 1e-10f), 0.0f, 1.0f);
                targetReduction = drop * overRatio;
            }

            // Smooth gain reduction
            if (targetReduction > gainReduction)
                gainReduction += attackCoeff * (targetReduction - gainReduction);
            else
                gainReduction += releaseCoeff * (targetReduction - gainReduction);

            float gain = 1.0f - std::clamp(gainReduction, 0.0f, 1.0f);

            float wetL = inL[i] * gain;
            float wetR = inR[i] * gain;

            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static DuckaInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int ducka_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void ducka_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void ducka_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void ducka_set_threshold(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].threshold = std::clamp(v, -60.0f, 0.0f);
}

EMSCRIPTEN_KEEPALIVE void ducka_set_drop(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].drop = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void ducka_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].release = std::clamp(v, 10.0f, 2000.0f);
}

EMSCRIPTEN_KEEPALIVE void ducka_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
