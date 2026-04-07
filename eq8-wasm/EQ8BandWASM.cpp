/**
 * EQ8BandWASM.cpp — 8-band parametric EQ for DEViLBOX
 *
 * HP + LP (Butterworth) + 2 shelving + 4 peaking biquad filters.
 *
 * Build: cd eq8-wasm/build && emcmake cmake .. && emmake make
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

    void setHP(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * 0.7071f); // Q = sqrt(2)/2 for Butterworth
        float a0 = 1.0f + alpha;
        b0 = ((1.0f + cs) / 2.0f) / a0;
        b1 = (-(1.0f + cs)) / a0;
        b2 = ((1.0f + cs) / 2.0f) / a0;
        a1 = (-2.0f * cs) / a0;
        a2 = (1.0f - alpha) / a0;
    }

    void setLP(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * 0.7071f);
        float a0 = 1.0f + alpha;
        b0 = ((1.0f - cs) / 2.0f) / a0;
        b1 = (1.0f - cs) / a0;
        b2 = ((1.0f - cs) / 2.0f) / a0;
        a1 = (-2.0f * cs) / a0;
        a2 = (1.0f - alpha) / a0;
    }

    void setLowShelf(float freq, float gain, float sr) {
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
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
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
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
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * Q);
        float a0 = 1.0f + alpha / A;
        b0 = (1.0f + alpha * A) / a0;
        b1 = (-2.0f * cs) / a0;
        b2 = (1.0f - alpha * A) / a0;
        a1 = b1;
        a2 = (1.0f - alpha / A) / a0;
    }
};

struct EQ8Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    // 8 bands: HP, lowShelf, peak1-4, highShelf, LP
    Biquad bandsL[8], bandsR[8];

    float hpFreq = 20.0f, lpFreq = 20000.0f;
    float lowShelfFreq = 100.0f, lowShelfGain = 0.0f;
    float peak1Freq = 250.0f, peak1Gain = 0.0f, peak1Q = 1.0f;
    float peak2Freq = 1000.0f, peak2Gain = 0.0f, peak2Q = 1.0f;
    float peak3Freq = 3500.0f, peak3Gain = 0.0f, peak3Q = 1.0f;
    float peak4Freq = 8000.0f, peak4Gain = 0.0f, peak4Q = 1.0f;
    float highShelfFreq = 8000.0f, highShelfGain = 0.0f;
    float mix = 1.0f;

    void init(float sr) {
        sampleRate = sr;
        for (int i = 0; i < 8; i++) { bandsL[i].reset(); bandsR[i].reset(); }
        recalcAll();
    }

    void recalcAll() {
        bandsL[0].setHP(hpFreq, sampleRate); bandsR[0].setHP(hpFreq, sampleRate);
        bandsL[1].setLowShelf(lowShelfFreq, lowShelfGain, sampleRate); bandsR[1].setLowShelf(lowShelfFreq, lowShelfGain, sampleRate);
        bandsL[2].setPeaking(peak1Freq, peak1Gain, peak1Q, sampleRate); bandsR[2].setPeaking(peak1Freq, peak1Gain, peak1Q, sampleRate);
        bandsL[3].setPeaking(peak2Freq, peak2Gain, peak2Q, sampleRate); bandsR[3].setPeaking(peak2Freq, peak2Gain, peak2Q, sampleRate);
        bandsL[4].setPeaking(peak3Freq, peak3Gain, peak3Q, sampleRate); bandsR[4].setPeaking(peak3Freq, peak3Gain, peak3Q, sampleRate);
        bandsL[5].setPeaking(peak4Freq, peak4Gain, peak4Q, sampleRate); bandsR[5].setPeaking(peak4Freq, peak4Gain, peak4Q, sampleRate);
        bandsL[6].setHighShelf(highShelfFreq, highShelfGain, sampleRate); bandsR[6].setHighShelf(highShelfFreq, highShelfGain, sampleRate);
        bandsL[7].setLP(lpFreq, sampleRate); bandsR[7].setLP(lpFreq, sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float L = inL[i], R = inR[i];
            for (int b = 0; b < 8; b++) { L = bandsL[b].process(L); R = bandsR[b].process(R); }
            outL[i] = inL[i] * (1.0f - mix) + L * mix;
            outR[i] = inR[i] * (1.0f - mix) + R * mix;
        }
    }
};

static EQ8Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int eq8_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void eq8_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }

EMSCRIPTEN_KEEPALIVE void eq8_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void eq8_set_hpFreq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].hpFreq = std::clamp(v, 20.0f, 1000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_lpFreq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lpFreq = std::clamp(v, 1000.0f, 20000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_lowShelfFreq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lowShelfFreq = std::clamp(v, 20.0f, 500.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_lowShelfGain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lowShelfGain = std::clamp(v, -36.0f, 36.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak1Freq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak1Freq = std::clamp(v, 100.0f, 2000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak1Gain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak1Gain = std::clamp(v, -36.0f, 36.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak1Q(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak1Q = std::clamp(v, 0.1f, 10.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak2Freq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak2Freq = std::clamp(v, 200.0f, 5000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak2Gain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak2Gain = std::clamp(v, -36.0f, 36.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak2Q(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak2Q = std::clamp(v, 0.1f, 10.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak3Freq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak3Freq = std::clamp(v, 500.0f, 10000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak3Gain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak3Gain = std::clamp(v, -36.0f, 36.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak3Q(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak3Q = std::clamp(v, 0.1f, 10.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak4Freq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak4Freq = std::clamp(v, 1000.0f, 18000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak4Gain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak4Gain = std::clamp(v, -36.0f, 36.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_peak4Q(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].peak4Q = std::clamp(v, 0.1f, 10.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_highShelfFreq(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].highShelfFreq = std::clamp(v, 2000.0f, 20000.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_highShelfGain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].highShelfGain = std::clamp(v, -36.0f, 36.0f); instances[h].recalcAll(); } }
EMSCRIPTEN_KEEPALIVE void eq8_set_mix(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f); }

} // extern "C"
