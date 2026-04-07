/**
 * MultibandGateWASM.cpp — 3-band crossover + per-band gate with range.
 * LR2 (Linkwitz-Riley 2nd order) crossover splits into low/mid/high.
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265f;

struct LR2Filter {
    // 2nd-order Butterworth LP/HP cascaded = LR2
    float b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void setLowpass(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * 0.7071f); // Q=0.7071 for Butterworth
        float a0inv = 1.0f / (1.0f + alpha);
        b0 = ((1.0f - cosw) * 0.5f) * a0inv;
        b1 = (1.0f - cosw) * a0inv;
        b2 = b0;
        a1 = (-2.0f * cosw) * a0inv;
        a2 = (1.0f - alpha) * a0inv;
    }

    void setHighpass(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * 0.7071f);
        float a0inv = 1.0f / (1.0f + alpha);
        b0 = ((1.0f + cosw) * 0.5f) * a0inv;
        b1 = -(1.0f + cosw) * a0inv;
        b2 = b0;
        a1 = (-2.0f * cosw) * a0inv;
        a2 = (1.0f - alpha) * a0inv;
    }

    float process(float x) {
        float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    }

    void reset() { x1 = x2 = y1 = y2 = 0; }
};

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
    LR2Filter lpLowL, lpLowR, hpLowL, hpLowR;
    LR2Filter lpHighL, lpHighR, hpHighL, hpHighR;
    BandGate gates[3]; // low, mid, high

    float attackCoeff = 0.0f, releaseCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        for (auto& g : gates) { g.envLin = 0; g.gateGain = 0; }
        resetFilters();
        updateCoeffs();
    }

    void resetFilters() {
        lpLowL.reset(); lpLowR.reset(); hpLowL.reset(); hpLowR.reset();
        lpHighL.reset(); lpHighR.reset(); hpHighL.reset(); hpHighR.reset();
    }

    void updateCoeffs() {
        attackCoeff  = (attack  > 0.001f) ? std::exp(-1.0f / (attack  * 0.001f * sampleRate)) : 0.0f;
        releaseCoeff = (release > 0.001f) ? std::exp(-1.0f / (release * 0.001f * sampleRate)) : 0.0f;
        lpLowL.setLowpass(lowCross, sampleRate); lpLowR.setLowpass(lowCross, sampleRate);
        hpLowL.setHighpass(lowCross, sampleRate); hpLowR.setHighpass(lowCross, sampleRate);
        lpHighL.setLowpass(highCross, sampleRate); lpHighR.setLowpass(highCross, sampleRate);
        hpHighL.setHighpass(highCross, sampleRate); hpHighR.setHighpass(highCross, sampleRate);
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
            float lowL = lpLowL.process(inL[i]);
            float lowR = lpLowR.process(inR[i]);
            float highRestL = hpLowL.process(inL[i]);
            float highRestR = hpLowR.process(inR[i]);
            float midL = lpHighL.process(highRestL);
            float midR = lpHighR.process(highRestR);
            float highL = hpHighL.process(highRestL);
            float highR = hpHighR.process(highRestR);

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
