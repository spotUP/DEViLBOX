/**
 * X42CompWASM.cpp — RMS compressor with hold feature (inspired by x42-compressor / DARC).
 * Uses RMS (not peak) detection. Hold freezes gain when signal drops below threshold.
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int RMS_WINDOW = 512;

struct Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    float threshold  = -20.0f; // dB (-50..-10)
    float ratio      = 4.0f;   // 1..20
    float attack     = 10.0f;  // ms (0.1..100)
    float release    = 100.0f; // ms (10..1000)
    float hold       = 0.0f;   // 0 or 1 (binary: freeze gain when below threshold)
    float inputGain  = 0.0f;   // dB (-10..30)
    float mix        = 1.0f;

    // RMS state
    float rmsBuffer[RMS_WINDOW] = {};
    int rmsPos = 0;
    float rmsSum = 0.0f;

    // Compressor state
    float envDb = -96.0f;
    float currentGainDb = 0.0f;
    float attackCoeff = 0.0f, releaseCoeff = 0.0f;
    bool belowThreshold = false;

    void init(float sr) {
        sampleRate = sr;
        std::memset(rmsBuffer, 0, sizeof(rmsBuffer));
        rmsPos = 0; rmsSum = 0.0f;
        envDb = -96.0f;
        currentGainDb = 0.0f;
        belowThreshold = false;
        updateCoeffs();
    }

    void updateCoeffs() {
        attackCoeff  = (attack  > 0.001f) ? std::exp(-1.0f / (attack  * 0.001f * sampleRate)) : 0.0f;
        releaseCoeff = (release > 0.001f) ? std::exp(-1.0f / (release * 0.001f * sampleRate)) : 0.0f;
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float inputGainLin = std::pow(10.0f, inputGain / 20.0f);

        for (int i = 0; i < n; i++) {
            float sL = inL[i] * inputGainLin;
            float sR = inR[i] * inputGainLin;

            // RMS detection (stereo-linked)
            float sq = sL * sL + sR * sR;
            rmsSum -= rmsBuffer[rmsPos];
            rmsBuffer[rmsPos] = sq;
            rmsSum += sq;
            rmsPos = (rmsPos + 1) % RMS_WINDOW;

            float rms = std::sqrt(std::max(rmsSum / RMS_WINDOW, 0.0f));
            float rmsDb = (rms > 1e-10f) ? 20.0f * std::log10(rms) : -96.0f;

            // Smooth envelope
            if (rmsDb > envDb)
                envDb = rmsDb + attackCoeff * (envDb - rmsDb);
            else
                envDb = rmsDb + releaseCoeff * (envDb - rmsDb);

            // Compute gain
            float gainDb = 0.0f;
            if (envDb > threshold) {
                float diff = envDb - threshold;
                gainDb = diff * (1.0f / ratio - 1.0f);
                belowThreshold = false;
            } else {
                // Below threshold
                if (hold > 0.5f && !belowThreshold) {
                    // Hold: freeze gain at current level
                    belowThreshold = true;
                    // currentGainDb stays as-is
                } else if (hold <= 0.5f) {
                    gainDb = 0.0f; // Release naturally
                    belowThreshold = false;
                }
            }

            if (!belowThreshold || hold <= 0.5f) {
                currentGainDb = gainDb;
            }
            // If hold=1 and belowThreshold, currentGainDb is frozen

            float gainLin = std::pow(10.0f, currentGainDb / 20.0f);

            outL[i] = sL * gainLin * mix + inL[i] * (1.0f - mix);
            outR[i] = sR * gainLin * mix + inR[i] * (1.0f - mix);
        }
    }
};

static Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int x42_comp_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void x42_comp_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}
EMSCRIPTEN_KEEPALIVE void x42_comp_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void x42_comp_set_threshold(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].threshold = std::clamp(v, -50.0f, -10.0f);
}
EMSCRIPTEN_KEEPALIVE void x42_comp_set_ratio(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].ratio = std::clamp(v, 1.0f, 20.0f);
}
EMSCRIPTEN_KEEPALIVE void x42_comp_set_attack(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].attack = std::clamp(v, 0.1f, 100.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void x42_comp_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].release = std::clamp(v, 10.0f, 1000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void x42_comp_set_hold(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].hold = (v > 0.5f) ? 1.0f : 0.0f;
}
EMSCRIPTEN_KEEPALIVE void x42_comp_set_inputGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].inputGain = std::clamp(v, -10.0f, 30.0f);
}
EMSCRIPTEN_KEEPALIVE void x42_comp_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
