/**
 * BeatBreatherWASM.cpp — BeatBreather effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct BeatBreatherInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float transientBoost = 0.0f;
    float sustainBoost = 0.0f;
    float sensitivity = 0.5f;
    float attack = 5.0f;
    float release = 100.0f;
    float mix = 1.0f;

    // DSP state & methods

    // Dual-envelope transient/sustain detector
    float fastEnvL = 0.0f, fastEnvR = 0.0f;
    float slowEnvL = 0.0f, slowEnvR = 0.0f;
    float fastAttCoeff = 0.0f, fastRelCoeff = 0.0f;
    float slowAttCoeff = 0.0f, slowRelCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        fastEnvL = fastEnvR = slowEnvL = slowEnvR = 0.0f;
        updateCoeffs();
    }
    void updateCoeffs() {
        float attackMs = std::clamp(attack, 0.1f, 50.0f);
        float releaseMs = std::clamp(release, 10.0f, 500.0f);
        fastAttCoeff = std::exp(-1.0f / (sampleRate * attackMs * 0.001f));
        fastRelCoeff = std::exp(-1.0f / (sampleRate * releaseMs * 0.001f * 0.5f));
        slowAttCoeff = std::exp(-1.0f / (sampleRate * attackMs * 0.001f * 10.0f));
        slowRelCoeff = std::exp(-1.0f / (sampleRate * releaseMs * 0.001f * 5.0f));
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float absL = std::fabs(inL[i]);
            float absR = std::fabs(inR[i]);
            // Fast envelope (transient)
            fastEnvL = absL > fastEnvL ? fastAttCoeff * fastEnvL + (1.0f - fastAttCoeff) * absL
                                       : fastRelCoeff * fastEnvL + (1.0f - fastRelCoeff) * absL;
            fastEnvR = absR > fastEnvR ? fastAttCoeff * fastEnvR + (1.0f - fastAttCoeff) * absR
                                       : fastRelCoeff * fastEnvR + (1.0f - fastRelCoeff) * absR;
            // Slow envelope (sustain)
            slowEnvL = absL > slowEnvL ? slowAttCoeff * slowEnvL + (1.0f - slowAttCoeff) * absL
                                       : slowRelCoeff * slowEnvL + (1.0f - slowRelCoeff) * absL;
            slowEnvR = absR > slowEnvR ? slowAttCoeff * slowEnvR + (1.0f - slowAttCoeff) * absR
                                       : slowRelCoeff * slowEnvR + (1.0f - slowRelCoeff) * absR;
            // Transient = fast - slow, Sustain = slow
            float transL = std::max(0.0f, fastEnvL - slowEnvL);
            float transR = std::max(0.0f, fastEnvR - slowEnvR);
            float sustL = slowEnvL;
            float sustR = slowEnvR;
            // Gain factors
            float sensFactor = 1.0f + sensitivity * 4.0f;
            float tGainL = 1.0f + transientBoost * sensFactor * (transL / (absL + 1e-10f));
            float tGainR = 1.0f + transientBoost * sensFactor * (transR / (absR + 1e-10f));
            float sGainL = 1.0f + sustainBoost * sensFactor * (sustL / (absL + 1e-10f));
            float sGainR = 1.0f + sustainBoost * sensFactor * (sustR / (absR + 1e-10f));
            float gainL = std::clamp(tGainL * sGainL, 0.0f, 4.0f);
            float gainR = std::clamp(tGainR * sGainR, 0.0f, 4.0f);
            float wetL = inL[i] * gainL;
            float wetR = inR[i] * gainR;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static BeatBreatherInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int beat_breather_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void beat_breather_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void beat_breather_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void beat_breather_set_transientBoost(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].transientBoost = std::clamp(v, -1.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void beat_breather_set_sustainBoost(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].sustainBoost = std::clamp(v, -1.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void beat_breather_set_sensitivity(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].sensitivity = std::clamp(v, 0.0f, 1.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void beat_breather_set_attack(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].attack = std::clamp(v, 0.1f, 50.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void beat_breather_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].release = std::clamp(v, 10.0f, 500.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void beat_breather_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
