/**
 * SidechainGateWASM.cpp — Gate with bandpass sidechain filter.
 * 2-pole bandpass on input for sidechain → envelope follower → gate with range.
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct BPFilter {
    float b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void setParams(float freq, float q, float sr) {
        float w0 = 2.0f * 3.14159265f * freq / sr;
        float alpha = std::sin(w0) / (2.0f * q);
        float a0inv = 1.0f / (1.0f + alpha);
        b0 = alpha * a0inv;
        b1 = 0.0f;
        b2 = -alpha * a0inv;
        a1 = -2.0f * std::cos(w0) * a0inv;
        a2 = (1.0f - alpha) * a0inv;
    }

    float process(float x) {
        float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    }

    void reset() { x1 = x2 = y1 = y2 = 0; }
};

struct Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float threshold = -30.0f;  // dB (-80..0)
    float attack    = 1.0f;    // ms (0.01..100)
    float hold      = 50.0f;   // ms (0..2000)
    float release   = 200.0f;  // ms (1..5000)
    float range     = 0.0f;    // 0..1 (0 = full gate, 1 = no gating)
    float scFreq    = 200.0f;  // Hz (20..20000)
    float scQ       = 1.0f;    // 0.1..10
    float mix       = 1.0f;    // 0..1

    // State
    float envLin      = 0.0f;
    float gateGain    = 0.0f;
    int   holdCounter = 0;
    float attackCoeff  = 0.0f;
    float releaseCoeff = 0.0f;
    int   holdSamples  = 0;
    BPFilter bpL, bpR;

    void init(float sr) {
        sampleRate = sr;
        envLin = 0.0f;
        gateGain = 0.0f;
        holdCounter = 0;
        bpL.reset(); bpR.reset();
        updateCoeffs();
    }

    void updateCoeffs() {
        attackCoeff  = (attack  > 0.001f) ? std::exp(-1.0f / (attack  * 0.001f * sampleRate)) : 0.0f;
        releaseCoeff = (release > 0.001f) ? std::exp(-1.0f / (release * 0.001f * sampleRate)) : 0.0f;
        holdSamples  = static_cast<int>(hold * 0.001f * sampleRate);
        bpL.setParams(scFreq, scQ, sampleRate);
        bpR.setParams(scFreq, scQ, sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        processExt(inL, inR, inL, inR, outL, outR, n);
    }

    void processExt(const float* inL, const float* inR, const float* scInL, const float* scInR, float* outL, float* outR, int n) {
        float threshLin = std::pow(10.0f, threshold / 20.0f);
        for (int i = 0; i < n; i++) {
            // Sidechain: bandpass filtered sidechain input
            float scL = bpL.process(scInL[i]);
            float scR = bpR.process(scInR[i]);
            float scPeak = std::max(std::abs(scL), std::abs(scR));

            // Envelope follower
            if (scPeak > envLin)
                envLin = scPeak + attackCoeff * (envLin - scPeak);
            else
                envLin = scPeak + releaseCoeff * (envLin - scPeak);

            // Gate logic with hold
            float targetGain;
            if (envLin >= threshLin) {
                targetGain = 1.0f;
                holdCounter = holdSamples;
            } else if (holdCounter > 0) {
                targetGain = 1.0f;
                holdCounter--;
            } else {
                targetGain = range; // range=0 is full gate
            }

            // Smooth gain transition
            float coeff = (targetGain > gateGain) ? (1.0f - attackCoeff) : (1.0f - releaseCoeff);
            gateGain += coeff * (targetGain - gateGain);

            outL[i] = inL[i] * gateGain * mix + inL[i] * (1.0f - mix);
            outR[i] = inR[i] * gateGain * mix + inR[i] * (1.0f - mix);
        }
    }
};

static Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int sidechain_gate_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_process_ext(int h, float* iL, float* iR, float* scL, float* scR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].processExt(iL, iR, scL, scR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_set_threshold(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].threshold = std::clamp(v, -80.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_set_attack(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].attack = std::clamp(v, 0.01f, 100.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_set_hold(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].hold = std::clamp(v, 0.0f, 2000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].release = std::clamp(v, 1.0f, 5000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_set_range(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].range = std::clamp(v, 0.0f, 1.0f);
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_set_scFreq(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].scFreq = std::clamp(v, 20.0f, 20000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_set_scQ(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].scQ = std::clamp(v, 0.1f, 10.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void sidechain_gate_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
