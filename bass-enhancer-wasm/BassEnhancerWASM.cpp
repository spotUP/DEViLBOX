/**
 * BassEnhancerWASM.cpp — Sub-harmonic bass enhancer for DEViLBOX
 *
 * Isolates low frequencies, generates sub-harmonics (octave below),
 * and blends back with optional saturation for warmth.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

struct BassEnhancerInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float frequency = 100.0f; // Crossover frequency for bass isolation
    float amount = 0.5f;      // Sub-harmonic blend amount 0-1
    float drive = 0.0f;       // Saturation on sub-harmonics 0-1
    float mix = 1.0f;         // Overall wet/dry

    // LP filter state (2-pole Butterworth for bass isolation)
    float lp_z1L = 0, lp_z2L = 0;
    float lp_z1R = 0, lp_z2R = 0;
    float lp_a1 = 0, lp_a2 = 0, lp_b0 = 0, lp_b1 = 0, lp_b2 = 0;

    // Sub-harmonic oscillator state (frequency divider)
    float subPhaseL = 0, subPhaseR = 0;
    float prevSignL = 0, prevSignR = 0;

    // Envelope follower for sub level
    float envL = 0, envR = 0;

    void init(float sr) {
        sampleRate = sr;
        lp_z1L = lp_z2L = lp_z1R = lp_z2R = 0;
        subPhaseL = subPhaseR = 0;
        prevSignL = prevSignR = 0;
        envL = envR = 0;
        updateFilter();
    }

    void updateFilter() {
        // 2-pole Butterworth LP
        float w0 = 2.0f * PI * frequency / sampleRate;
        float cosw0 = std::cos(w0);
        float sinw0 = std::sin(w0);
        float alpha = sinw0 / (2.0f * 0.707f); // Q = 0.707 for Butterworth
        float a0 = 1.0f + alpha;
        lp_b0 = ((1.0f - cosw0) / 2.0f) / a0;
        lp_b1 = (1.0f - cosw0) / a0;
        lp_b2 = lp_b0;
        lp_a1 = (-2.0f * cosw0) / a0;
        lp_a2 = (1.0f - alpha) / a0;
    }

    float filterLP_L(float in) {
        float out = lp_b0 * in + lp_b1 * lp_z1L + lp_b2 * lp_z2L - lp_a1 * lp_z1L - lp_a2 * lp_z2L;
        // Direct Form II
        float w = in - lp_a1 * lp_z1L - lp_a2 * lp_z2L;
        out = lp_b0 * w + lp_b1 * lp_z1L + lp_b2 * lp_z2L;
        lp_z2L = lp_z1L;
        lp_z1L = w;
        return out;
    }

    float filterLP_R(float in) {
        float w = in - lp_a1 * lp_z1R - lp_a2 * lp_z2R;
        float out = lp_b0 * w + lp_b1 * lp_z1R + lp_b2 * lp_z2R;
        lp_z2R = lp_z1R;
        lp_z1R = w;
        return out;
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float envCoeff = std::exp(-1.0f / (0.01f * sampleRate)); // 10ms

        for (int i = 0; i < n; i++) {
            // Isolate bass
            float bassL = filterLP_L(inL[i]);
            float bassR = filterLP_R(inR[i]);

            // Track envelope for sub level
            float absL = std::abs(bassL);
            float absR = std::abs(bassR);
            envL = (absL > envL) ? absL : absL + envCoeff * (envL - absL);
            envR = (absR > envR) ? absR : absR + envCoeff * (envR - absR);

            // Generate sub-harmonic (octave below via zero-crossing frequency divider)
            float signL = bassL >= 0 ? 1.0f : -1.0f;
            float signR = bassR >= 0 ? 1.0f : -1.0f;
            if (signL != prevSignL) subPhaseL = -subPhaseL;
            if (signR != prevSignR) subPhaseR = -subPhaseR;
            prevSignL = signL;
            prevSignR = signR;

            // Sub = square wave at half frequency, scaled by envelope
            float subL = (subPhaseL >= 0 ? 1.0f : -1.0f) * envL;
            float subR = (subPhaseR >= 0 ? 1.0f : -1.0f) * envR;

            // Optional saturation on sub
            if (drive > 0.01f) {
                float d = 1.0f + drive * 10.0f;
                subL = std::tanh(subL * d) / d;
                subR = std::tanh(subR * d) / d;
            }

            // Mix: original + sub-harmonic
            float enhancedL = inL[i] + subL * amount;
            float enhancedR = inR[i] + subR * amount;

            outL[i] = inL[i] * (1.0f - mix) + enhancedL * mix;
            outR[i] = inR[i] * (1.0f - mix) + enhancedR * mix;
        }
    }
};

static BassEnhancerInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {
EMSCRIPTEN_KEEPALIVE int bass_enhancer_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void bass_enhancer_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void bass_enhancer_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void bass_enhancer_set_frequency(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].frequency = std::clamp(v, 30.0f, 300.0f); instances[h].updateFilter(); } }
EMSCRIPTEN_KEEPALIVE void bass_enhancer_set_amount(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].amount = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void bass_enhancer_set_drive(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].drive = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void bass_enhancer_set_mix(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f); }
} // extern "C"
