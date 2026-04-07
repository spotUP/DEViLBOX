/**
 * GEQ31WASM.cpp — 31-band graphic EQ for DEViLBOX
 *
 * 31 peaking biquad filters at ISO 1/3-octave center frequencies.
 * Fixed Q of 4.318 for 1/3-octave bandwidth.
 *
 * Build: cd geq31-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int NUM_BANDS = 31;
static constexpr float PI = 3.14159265358979323846f;
static constexpr float GEQ_Q = 4.318f; // 1/3 octave

static const float ISO_FREQS[NUM_BANDS] = {
    20, 25, 31.5f, 40, 50, 63, 80, 100, 125, 160,
    200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
    2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
};

struct Biquad {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void reset() { x1 = x2 = y1 = y2 = 0; }

    float process(float in) {
        float out = b0 * in + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = in; y2 = y1; y1 = out;
        return out;
    }

    void setPeaking(float freq, float gain, float Q, float sr) {
        if (std::fabs(gain) < 0.01f) {
            // Bypass when gain ~0
            b0 = 1; b1 = b2 = a1 = a2 = 0;
            return;
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

struct GEQ31Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    Biquad bandsL[NUM_BANDS], bandsR[NUM_BANDS];
    float gains[NUM_BANDS]; // dB per band
    float mix = 1.0f;

    void init(float sr) {
        sampleRate = sr;
        for (int i = 0; i < NUM_BANDS; i++) {
            gains[i] = 0.0f;
            bandsL[i].reset(); bandsR[i].reset();
        }
        recalcAll();
    }

    void recalcBand(int b) {
        bandsL[b].setPeaking(ISO_FREQS[b], gains[b], GEQ_Q, sampleRate);
        bandsR[b].setPeaking(ISO_FREQS[b], gains[b], GEQ_Q, sampleRate);
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

static GEQ31Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int geq31_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void geq31_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }

EMSCRIPTEN_KEEPALIVE void geq31_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void geq31_set_band(int h, int band, float gain) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active && band >= 0 && band < NUM_BANDS) {
        instances[h].gains[band] = std::clamp(gain, -12.0f, 12.0f);
        instances[h].recalcBand(band);
    }
}
EMSCRIPTEN_KEEPALIVE void geq31_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
