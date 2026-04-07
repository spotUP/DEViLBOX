/**
 * EQ12BandWASM.cpp — 12-band parametric EQ for DEViLBOX
 *
 * Fixed structure: HP + lowShelf + 8×peaking + highShelf + LP
 * Per-band freq/gain/Q via indexed setters.
 *
 * Build: cd eq12-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int NUM_BANDS = 12;
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

    void setHP(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * 0.7071f);
        float a0 = 1.0f + alpha;
        b0 = ((1.0f + cs) / 2.0f) / a0; b1 = (-(1.0f + cs)) / a0;
        b2 = b0; a1 = (-2.0f * cs) / a0; a2 = (1.0f - alpha) / a0;
    }

    void setLP(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * 0.7071f);
        float a0 = 1.0f + alpha;
        b0 = ((1.0f - cs) / 2.0f) / a0; b1 = (1.0f - cs) / a0;
        b2 = b0; a1 = (-2.0f * cs) / a0; a2 = (1.0f - alpha) / a0;
    }

    void setLowShelf(float freq, float gain, float sr) {
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr, cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / 2.0f * std::sqrt((A + 1.0f / A) * 2.0f);
        float a0 = (A + 1) + (A - 1) * cs + 2 * std::sqrt(A) * alpha;
        b0 = (A * ((A + 1) - (A - 1) * cs + 2 * std::sqrt(A) * alpha)) / a0;
        b1 = (2 * A * ((A - 1) - (A + 1) * cs)) / a0;
        b2 = (A * ((A + 1) - (A - 1) * cs - 2 * std::sqrt(A) * alpha)) / a0;
        a1 = (-2 * ((A - 1) + (A + 1) * cs)) / a0;
        a2 = ((A + 1) + (A - 1) * cs - 2 * std::sqrt(A) * alpha) / a0;
    }

    void setHighShelf(float freq, float gain, float sr) {
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr, cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / 2.0f * std::sqrt((A + 1.0f / A) * 2.0f);
        float a0 = (A + 1) - (A - 1) * cs + 2 * std::sqrt(A) * alpha;
        b0 = (A * ((A + 1) + (A - 1) * cs + 2 * std::sqrt(A) * alpha)) / a0;
        b1 = (-2 * A * ((A - 1) + (A + 1) * cs)) / a0;
        b2 = (A * ((A + 1) + (A - 1) * cs - 2 * std::sqrt(A) * alpha)) / a0;
        a1 = (2 * ((A - 1) - (A + 1) * cs)) / a0;
        a2 = ((A + 1) - (A - 1) * cs - 2 * std::sqrt(A) * alpha) / a0;
    }

    void setPeaking(float freq, float gain, float Q, float sr) {
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr, cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * Q);
        float a0 = 1.0f + alpha / A;
        b0 = (1.0f + alpha * A) / a0; b1 = (-2.0f * cs) / a0;
        b2 = (1.0f - alpha * A) / a0; a1 = b1; a2 = (1.0f - alpha / A) / a0;
    }

    // Passthrough (unity)
    void setBypass() { b0 = 1; b1 = b2 = a1 = a2 = 0; }
};

// Band types: 0=HP, 1=lowShelf, 2..9=peak, 10=highShelf, 11=LP
struct EQ12Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    Biquad bandsL[NUM_BANDS], bandsR[NUM_BANDS];
    float freq[NUM_BANDS];
    float gain[NUM_BANDS]; // dB
    float q[NUM_BANDS];
    float mix = 1.0f;

    void init(float sr) {
        sampleRate = sr;
        // Defaults
        float defaultFreqs[NUM_BANDS] = {30, 80, 160, 400, 800, 1500, 3000, 5000, 8000, 12000, 14000, 18000};
        for (int i = 0; i < NUM_BANDS; i++) {
            freq[i] = defaultFreqs[i]; gain[i] = 0.0f; q[i] = 1.0f;
            bandsL[i].reset(); bandsR[i].reset();
        }
        recalcAll();
    }

    void recalcBand(int b) {
        float f = std::clamp(freq[b], 20.0f, 20000.0f);
        float g = std::clamp(gain[b], -36.0f, 36.0f);
        float Q = std::clamp(q[b], 0.1f, 10.0f);

        if (b == 0) { // HP
            bandsL[b].setHP(f, sampleRate); bandsR[b].setHP(f, sampleRate);
        } else if (b == 1) { // Low shelf
            bandsL[b].setLowShelf(f, g, sampleRate); bandsR[b].setLowShelf(f, g, sampleRate);
        } else if (b >= 2 && b <= 9) { // Peaking
            bandsL[b].setPeaking(f, g, Q, sampleRate); bandsR[b].setPeaking(f, g, Q, sampleRate);
        } else if (b == 10) { // High shelf
            bandsL[b].setHighShelf(f, g, sampleRate); bandsR[b].setHighShelf(f, g, sampleRate);
        } else if (b == 11) { // LP
            bandsL[b].setLP(f, sampleRate); bandsR[b].setLP(f, sampleRate);
        }
    }

    void recalcAll() { for (int i = 0; i < NUM_BANDS; i++) recalcBand(i); }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float L = inL[i], R = inR[i];
            for (int b = 0; b < NUM_BANDS; b++) { L = bandsL[b].process(L); R = bandsR[b].process(R); }
            outL[i] = inL[i] * (1.0f - mix) + L * mix;
            outR[i] = inR[i] * (1.0f - mix) + R * mix;
        }
    }
};

static EQ12Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int eq12_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void eq12_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }

EMSCRIPTEN_KEEPALIVE void eq12_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void eq12_set_freq(int h, int band, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active && band >= 0 && band < NUM_BANDS) {
        instances[h].freq[band] = std::clamp(v, 20.0f, 20000.0f); instances[h].recalcBand(band);
    }
}
EMSCRIPTEN_KEEPALIVE void eq12_set_gain(int h, int band, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active && band >= 0 && band < NUM_BANDS) {
        instances[h].gain[band] = std::clamp(v, -36.0f, 36.0f); instances[h].recalcBand(band);
    }
}
EMSCRIPTEN_KEEPALIVE void eq12_set_q(int h, int band, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active && band >= 0 && band < NUM_BANDS) {
        instances[h].q[band] = std::clamp(v, 0.1f, 10.0f); instances[h].recalcBand(band);
    }
}
EMSCRIPTEN_KEEPALIVE void eq12_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
