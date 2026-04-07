/**
 * KuizaWASM.cpp — Kuiza effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct KuizaInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float low = 0.0f;
    float lowMid = 0.0f;
    float highMid = 0.0f;
    float high = 0.0f;
    float gain = 0.0f;
    float mix = 1.0f;

    // DSP state & methods

    // 4 peaking biquads
    struct BiquadState { float x1=0,x2=0,y1=0,y2=0; };
    struct BiquadCoeffs { float b0=1,b1=0,b2=0,a1=0,a2=0; };
    BiquadState stL[4]={}, stR[4]={};
    BiquadCoeffs co[4]={};
    static constexpr float FREQS[4] = {55.0f, 220.0f, 1760.0f, 7040.0f};

    void init(float sr) {
        sampleRate = sr;
        for (int b=0;b<4;b++) { stL[b]={}; stR[b]={}; }
        updateCoeffs();
    }
    void updateCoeffs() {
        float gains[4] = {low, lowMid, highMid, high};
        for (int b=0;b<4;b++) computePeakingEQ(FREQS[b], gains[b], 1.0f, co[b]);
    }
    void computePeakingEQ(float f0, float dBgain, float Q, BiquadCoeffs& c) {
        float A = std::pow(10.0f, dBgain / 40.0f);
        float w0 = 2.0f * 3.14159265f * f0 / sampleRate;
        float sinw = std::sin(w0), cosw = std::cos(w0);
        float alpha = sinw / (2.0f * Q);
        float a0 = 1.0f + alpha / A;
        c.b0 = (1.0f + alpha * A) / a0;
        c.b1 = (-2.0f * cosw) / a0;
        c.b2 = (1.0f - alpha * A) / a0;
        c.a1 = (-2.0f * cosw) / a0;
        c.a2 = (1.0f - alpha / A) / a0;
    }
    static float biquad(float in, BiquadState& s, const BiquadCoeffs& c) {
        float out = c.b0*in + c.b1*s.x1 + c.b2*s.x2 - c.a1*s.y1 - c.a2*s.y2;
        s.x2=s.x1; s.x1=in; s.y2=s.y1; s.y1=out;
        return out;
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float outGain = std::pow(10.0f, gain / 20.0f);
        for (int i=0; i<n; i++) {
            float sL = inL[i], sR = inR[i];
            for (int b=0; b<4; b++) {
                sL = biquad(sL, stL[b], co[b]);
                sR = biquad(sR, stR[b], co[b]);
            }
            sL *= outGain; sR *= outGain;
            outL[i] = inL[i]*(1.0f-mix) + sL*mix;
            outR[i] = inR[i]*(1.0f-mix) + sR*mix;
        }
    }
};

static KuizaInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int kuiza_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void kuiza_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void kuiza_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void kuiza_set_low(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].low = std::clamp(v, -12.0f, 12.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void kuiza_set_lowMid(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowMid = std::clamp(v, -12.0f, 12.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void kuiza_set_highMid(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highMid = std::clamp(v, -12.0f, 12.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void kuiza_set_high(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].high = std::clamp(v, -12.0f, 12.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void kuiza_set_gain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].gain = std::clamp(v, -12.0f, 12.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void kuiza_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
