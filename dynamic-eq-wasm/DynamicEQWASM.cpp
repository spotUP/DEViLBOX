/**
 * DynamicEQWASM.cpp — Dynamic EQ for DEViLBOX
 *
 * Frequency-dependent dynamic processing: detect energy in one band,
 * apply gain in another. Detector → envelope follower → variable peaking EQ.
 *
 * Build: cd dynamic-eq-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

struct Biquad {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void reset() { x1 = x2 = y1 = y2 = 0; }

    float process(float in) {
        float out = b0 * in + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = in; y2 = y1; y1 = out;
        return out;
    }

    void setBP(float freq, float Q, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * Q);
        float a0 = 1.0f + alpha;
        b0 = alpha / a0; b1 = 0.0f; b2 = -alpha / a0;
        a1 = (-2.0f * cs) / a0; a2 = (1.0f - alpha) / a0;
    }

    void setPeaking(float freq, float gain, float Q, float sr) {
        if (std::fabs(gain) < 0.01f) {
            b0 = 1; b1 = b2 = a1 = a2 = 0; return;
        }
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * Q);
        float a0 = 1.0f + alpha / A;
        b0 = (1.0f + alpha * A) / a0; b1 = (-2.0f * cs) / a0;
        b2 = (1.0f - alpha * A) / a0; a1 = b1; a2 = (1.0f - alpha / A) / a0;
    }
};

struct DynEQInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Detector bandpass
    Biquad detectBPL, detectBPR;
    // Processor peaking EQ (coefficients updated per-block based on envelope)
    Biquad processL, processR;

    float detectFreq = 1000.0f, detectQ = 1.0f;
    float processFreq = 1000.0f, processQ = 1.0f;
    float threshold = -20.0f; // dB
    float maxGain = 0.0f;     // dB
    float attackMs = 10.0f, releaseMs = 100.0f;
    float mix = 1.0f;

    float envState = 0.0f;
    float attackCoeff = 0.0f, releaseCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        detectBPL.reset(); detectBPR.reset();
        processL.reset(); processR.reset();
        envState = 0.0f;
        recalcDetect();
        recalcEnvelope();
    }

    void recalcDetect() {
        detectBPL.setBP(detectFreq, detectQ, sampleRate);
        detectBPR.setBP(detectFreq, detectQ, sampleRate);
    }

    void recalcEnvelope() {
        attackCoeff = std::exp(-1.0f / (attackMs * 0.001f * sampleRate));
        releaseCoeff = std::exp(-1.0f / (releaseMs * 0.001f * sampleRate));
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float threshLin = std::pow(10.0f, threshold / 20.0f);

        for (int i = 0; i < n; i++) {
            // Detect: bandpass filter the input
            float detL = detectBPL.process(inL[i]);
            float detR = detectBPR.process(inR[i]);
            float detLevel = std::fabs(detL) + std::fabs(detR); // mono sum

            // Envelope follower
            float coeff = (detLevel > envState) ? attackCoeff : releaseCoeff;
            envState = coeff * envState + (1.0f - coeff) * detLevel;

            // Compute dynamic gain based on envelope vs threshold
            float dynamicGain = 0.0f;
            if (envState > threshLin && threshLin > 0.0f) {
                // How far above threshold (0..1 range, clamped)
                float ratio = std::min((envState - threshLin) / threshLin, 1.0f);
                dynamicGain = maxGain * ratio;
            }

            // Update process EQ with dynamic gain
            // Only recalculate if gain changed significantly (avoid per-sample recalc)
            processL.setPeaking(processFreq, dynamicGain, processQ, sampleRate);
            processR.setPeaking(processFreq, dynamicGain, processQ, sampleRate);

            float wetL = processL.process(inL[i]);
            float wetR = processR.process(inR[i]);

            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static DynEQInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int dynamic_eq_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void dynamic_eq_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }

EMSCRIPTEN_KEEPALIVE void dynamic_eq_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_detectFreq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].detectFreq = std::clamp(v, 20.0f, 20000.0f); instances[h].recalcDetect(); } }
EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_detectQ(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].detectQ = std::clamp(v, 0.1f, 10.0f); instances[h].recalcDetect(); } }
EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_processFreq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].processFreq = std::clamp(v, 20.0f, 20000.0f); }
EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_processQ(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].processQ = std::clamp(v, 0.1f, 10.0f); }
EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_threshold(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].threshold = std::clamp(v, -60.0f, 0.0f); }
EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_maxGain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].maxGain = std::clamp(v, -24.0f, 24.0f); }
EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_attack(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].attackMs = std::clamp(v, 0.1f, 100.0f); instances[h].recalcEnvelope(); } }
EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_release(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].releaseMs = std::clamp(v, 10.0f, 1000.0f); instances[h].recalcEnvelope(); } }
EMSCRIPTEN_KEEPALIVE void dynamic_eq_set_mix(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f); }

} // extern "C"
