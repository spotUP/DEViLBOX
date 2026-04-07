/**
 * ZamEQ2WASM.cpp — 2-band parametric EQ with shelving for DEViLBOX
 *
 * Low shelf + high shelf biquads with bandwidth control.
 *
 * Build: cd zam-eq2-wasm/build && emcmake cmake .. && emmake make
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

    void setLowShelf(float freq, float gain, float bw, float sr) {
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        // Use bandwidth to control shelf slope
        float alpha = sn * std::sinh(std::log(2.0f) / 2.0f * bw * w0 / sn);
        float sqA = 2.0f * std::sqrt(A) * alpha;
        float a0 = (A + 1) + (A - 1) * cs + sqA;
        b0 = (A * ((A + 1) - (A - 1) * cs + sqA)) / a0;
        b1 = (2 * A * ((A - 1) - (A + 1) * cs)) / a0;
        b2 = (A * ((A + 1) - (A - 1) * cs - sqA)) / a0;
        a1 = (-2 * ((A - 1) + (A + 1) * cs)) / a0;
        a2 = ((A + 1) + (A - 1) * cs - sqA) / a0;
    }

    void setHighShelf(float freq, float gain, float bw, float sr) {
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn * std::sinh(std::log(2.0f) / 2.0f * bw * w0 / sn);
        float sqA = 2.0f * std::sqrt(A) * alpha;
        float a0 = (A + 1) - (A - 1) * cs + sqA;
        b0 = (A * ((A + 1) + (A - 1) * cs + sqA)) / a0;
        b1 = (-2 * A * ((A - 1) + (A + 1) * cs)) / a0;
        b2 = (A * ((A + 1) + (A - 1) * cs - sqA)) / a0;
        a1 = (2 * ((A - 1) - (A + 1) * cs)) / a0;
        a2 = ((A + 1) - (A - 1) * cs - sqA) / a0;
    }
};

struct ZamEQ2Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    Biquad lowL, lowR, highL, highR;

    float lowFreq = 200.0f, lowGain = 0.0f, lowBw = 1.0f;
    float highFreq = 4000.0f, highGain = 0.0f, highBw = 1.0f;
    float mix = 1.0f;

    void init(float sr) {
        sampleRate = sr;
        lowL.reset(); lowR.reset(); highL.reset(); highR.reset();
        recalcAll();
    }

    void recalcAll() {
        lowL.setLowShelf(lowFreq, lowGain, lowBw, sampleRate);
        lowR.setLowShelf(lowFreq, lowGain, lowBw, sampleRate);
        highL.setHighShelf(highFreq, highGain, highBw, sampleRate);
        highR.setHighShelf(highFreq, highGain, highBw, sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float L = lowL.process(inL[i]); L = highL.process(L);
            float R = lowR.process(inR[i]); R = highR.process(R);
            outL[i] = inL[i] * (1.0f - mix) + L * mix;
            outR[i] = inR[i] * (1.0f - mix) + R * mix;
        }
    }
};

static ZamEQ2Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int zam_eq2_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void zam_eq2_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }

EMSCRIPTEN_KEEPALIVE void zam_eq2_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void zam_eq2_set_lowFreq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lowFreq = std::clamp(v, 20.0f, 1000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void zam_eq2_set_lowGain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lowGain = std::clamp(v, -36.0f, 36.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void zam_eq2_set_lowBw(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lowBw = std::clamp(v, 0.1f, 6.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void zam_eq2_set_highFreq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].highFreq = std::clamp(v, 1000.0f, 20000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void zam_eq2_set_highGain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].highGain = std::clamp(v, -36.0f, 36.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void zam_eq2_set_highBw(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].highBw = std::clamp(v, 0.1f, 6.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void zam_eq2_set_mix(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f); }

} // extern "C"
