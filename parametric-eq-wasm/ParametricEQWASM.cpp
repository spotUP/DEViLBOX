/**
 * ParametricEQWASM.cpp — 4-band parametric equalizer for DEViLBOX
 *
 * Four cascaded biquad filters:
 *   Band 1: Low shelf  (20-500 Hz)
 *   Band 2: Peaking    (100-2000 Hz)
 *   Band 3: Peaking    (500-8000 Hz)
 *   Band 4: High shelf (2000-20000 Hz)
 *
 * Uses standard Audio EQ Cookbook biquad coefficient formulas (Robert Bristow-Johnson).
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;
static constexpr int NUM_BANDS = 4;

// ─── Biquad filter ──────────────────────────────────────────────────────────

enum BiquadType { LOW_SHELF, PEAKING, HIGH_SHELF };

struct Biquad {
    // Coefficients
    float b0, b1, b2, a1, a2;
    // State (transposed direct form II)
    float z1L, z2L, z1R, z2R;

    Biquad() : b0(1), b1(0), b2(0), a1(0), a2(0),
               z1L(0), z2L(0), z1R(0), z2R(0) {}

    void compute(BiquadType type, float freq, float gainDb, float Q, float sampleRate) {
        float A = std::pow(10.0f, gainDb / 40.0f); // sqrt of linear gain
        float w0 = 2.0f * PI * freq / sampleRate;
        float cosw = std::cos(w0);
        float sinw = std::sin(w0);
        float alpha = sinw / (2.0f * Q);

        float a0;
        switch (type) {
            case LOW_SHELF: {
                float sqA = std::sqrt(A);
                float t = (A + 1.0f) - (A - 1.0f) * cosw;
                float u = (A + 1.0f) + (A - 1.0f) * cosw;
                float v = 2.0f * sqA * alpha;
                b0 = A * (t + v);
                b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * cosw);
                b2 = A * (t - v);
                a0 = u + v;
                a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * cosw);
                a2 = u - v;
                break;
            }
            case PEAKING: {
                b0 = 1.0f + alpha * A;
                b1 = -2.0f * cosw;
                b2 = 1.0f - alpha * A;
                a0 = 1.0f + alpha / A;
                a1 = -2.0f * cosw;
                a2 = 1.0f - alpha / A;
                break;
            }
            case HIGH_SHELF: {
                float sqA = std::sqrt(A);
                float t = (A + 1.0f) + (A - 1.0f) * cosw;
                float u = (A + 1.0f) - (A - 1.0f) * cosw;
                float v = 2.0f * sqA * alpha;
                b0 = A * (t + v);
                b1 = -2.0f * A * ((A - 1.0f) + (A + 1.0f) * cosw);
                b2 = A * (t - v);
                a0 = u + v;
                a1 = 2.0f * ((A - 1.0f) - (A + 1.0f) * cosw);
                a2 = u - v;
                break;
            }
        }

        // Normalize
        float inv = 1.0f / a0;
        b0 *= inv; b1 *= inv; b2 *= inv;
        a1 *= inv; a2 *= inv;
    }

    float processL(float in) {
        float out = b0 * in + z1L;
        z1L = b1 * in - a1 * out + z2L;
        z2L = b2 * in - a2 * out;
        return out;
    }

    float processR(float in) {
        float out = b0 * in + z1R;
        z1R = b1 * in - a1 * out + z2R;
        z2R = b2 * in - a2 * out;
        return out;
    }

    void clearState() { z1L = z2L = z1R = z2R = 0; }
};

// ─── Band parameters ────────────────────────────────────────────────────────

struct BandParams {
    BiquadType type;
    float freq;
    float gain; // dB
    float Q;
    float freqMin, freqMax;
};

// ─── Parametric EQ Instance ─────────────────────────────────────────────────

struct ParametricEQInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    BandParams bands[NUM_BANDS];
    Biquad filters[NUM_BANDS];

    void init(float sr) {
        sampleRate = sr;

        // Band 1: Low shelf
        bands[0] = { LOW_SHELF, 100.0f, 0.0f, 0.707f, 20.0f, 500.0f };
        // Band 2: Peaking (dub return EQ — widened range for Tubby-style sweeps)
        bands[1] = { PEAKING, 500.0f, 0.0f, 1.0f, 100.0f, 5000.0f };
        // Band 3: Peaking
        bands[2] = { PEAKING, 2000.0f, 0.0f, 1.0f, 500.0f, 8000.0f };
        // Band 4: High shelf
        bands[3] = { HIGH_SHELF, 8000.0f, 0.0f, 0.707f, 2000.0f, 20000.0f };

        recomputeAll();
    }

    void recomputeAll() {
        for (int i = 0; i < NUM_BANDS; i++) {
            filters[i].compute(bands[i].type, bands[i].freq, bands[i].gain, bands[i].Q, sampleRate);
        }
    }

    void recomputeBand(int band) {
        if (band >= 0 && band < NUM_BANDS) {
            filters[band].compute(bands[band].type, bands[band].freq, bands[band].gain, bands[band].Q, sampleRate);
        }
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float sL = inL[i];
            float sR = inR[i];
            for (int b = 0; b < NUM_BANDS; b++) {
                sL = filters[b].processL(sL);
                sR = filters[b].processR(sR);
            }
            outL[i] = sL;
            outR[i] = sR;
        }
    }
};

static ParametricEQInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int parametric_eq_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void parametric_eq_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void parametric_eq_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void parametric_eq_set_band(int h, int band, float freq, float gain, float q) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) return;
    if (band < 0 || band >= NUM_BANDS) return;
    auto& b = instances[h].bands[band];
    b.freq = std::clamp(freq, b.freqMin, b.freqMax);
    b.gain = std::clamp(gain, -18.0f, 18.0f);
    b.Q = std::clamp(q, 0.1f, 10.0f);
    instances[h].recomputeBand(band);
}

} // extern "C"
