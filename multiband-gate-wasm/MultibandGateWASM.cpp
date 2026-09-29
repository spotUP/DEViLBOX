/**
 * MultibandGateWASM.cpp — 3-band crossover + per-band gate with range.
 * LR2 (Linkwitz-Riley 2nd order) crossover splits into low/mid/high.
 */
#include <cmath>
#include "lr4_crossover.h"
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265f;


struct BandGate {
    float envLin = 0.0f;
    float gateGain = 0.0f;
};

struct Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Crossover frequencies
    float lowCross  = 200.0f;   // Hz (20..1000)
    float highCross = 3000.0f;  // Hz (500..16000)

    // Per-band thresholds and ranges
    float lowThresh  = -40.0f;  // dB (-80..0)
    float midThresh  = -40.0f;
    float highThresh = -40.0f;
    float lowRange   = 0.0f;    // 0..1
    float midRange   = 0.0f;
    float highRange  = 0.0f;

    // Shared timing
    float attack  = 1.0f;   // ms (0.01..100)
    float release = 200.0f; // ms (1..5000)
    float mix     = 1.0f;

    // Filter state (L/R × low LP, low HP, high LP, high HP)
    lr4::Split3 splitL, splitR;   // flat-summing LR4 split (wasm-common/lr4_crossover.h)
    BandGate gates[3]; // low, mid, high

    float attackCoeff = 0.0f, releaseCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        for (auto& g : gates) { g.envLin = 0; g.gateGain = 0; }
        resetFilters();
        updateCoeffs();
    }

    void resetFilters() {
        splitL.reset(); splitR.reset();
    }

    void updateCoeffs() {
        attackCoeff  = (attack  > 0.001f) ? std::exp(-1.0f / (attack  * 0.001f * sampleRate)) : 0.0f;
        releaseCoeff = (release > 0.001f) ? std::exp(-1.0f / (release * 0.001f * sampleRate)) : 0.0f;
        splitL.set(lowCross, highCross, sampleRate);
        splitR.set(lowCross, highCross, sampleRate);
    }

    void gateEnv(BandGate& g, float peak, float threshDb) {
        float threshLin = std::pow(10.0f, threshDb / 20.0f);
        if (peak > g.envLin)
            g.envLin = peak + attackCoeff * (g.envLin - peak);
        else
            g.envLin = peak + releaseCoeff * (g.envLin - peak);
    }

    float gateGain(BandGate& g, float threshDb, float range) {
        float threshLin = std::pow(10.0f, threshDb / 20.0f);
        float target = (g.envLin >= threshLin) ? 1.0f : range;
        float coeff = (target > g.gateGain) ? (1.0f - attackCoeff) : (1.0f - releaseCoeff);
        g.gateGain += coeff * (target - g.gateGain);
        return g.gateGain;
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            // Split into 3 bands
            float lowL, midL, highL, lowR, midR, highR;
            splitL.split(inL[i], lowL, midL, highL);
            splitR.split(inR[i], lowR, midR, highR);

            // Per-band gating
            float peakLow  = std::max(std::abs(lowL), std::abs(lowR));
            float peakMid  = std::max(std::abs(midL), std::abs(midR));
            float peakHigh = std::max(std::abs(highL), std::abs(highR));

            gateEnv(gates[0], peakLow,  lowThresh);
            gateEnv(gates[1], peakMid,  midThresh);
            gateEnv(gates[2], peakHigh, highThresh);

            float gLow  = gateGain(gates[0], lowThresh,  lowRange);
            float gMid  = gateGain(gates[1], midThresh,  midRange);
            float gHigh = gateGain(gates[2], highThresh, highRange);

            float wetL = lowL * gLow + midL * gMid + highL * gHigh;
            float wetR = lowR * gLow + midR * gMid + highR * gHigh;

            outL[i] = wetL * mix + inL[i] * (1.0f - mix);
            outR[i] = wetR * mix + inR[i] * (1.0f - mix);
        }
    }
};

static Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int multiband_gate_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_lowCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lowCross = std::clamp(v, 20.0f, 1000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_highCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].highCross = std::clamp(v, 500.0f, 16000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_lowThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lowThresh = std::clamp(v, -80.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_midThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].midThresh = std::clamp(v, -80.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_highThresh(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].highThresh = std::clamp(v, -80.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_lowRange(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lowRange = std::clamp(v, 0.0f, 1.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_midRange(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].midRange = std::clamp(v, 0.0f, 1.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_highRange(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].highRange = std::clamp(v, 0.0f, 1.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_attack(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].attack = std::clamp(v, 0.01f, 100.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].release = std::clamp(v, 1.0f, 5000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void multiband_gate_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
