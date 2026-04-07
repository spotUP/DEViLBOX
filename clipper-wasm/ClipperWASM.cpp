/**
 * ClipperWASM.cpp — Hard/soft clipper with input gain and output ceiling.
 * softness=0: hard clip, softness=1: smooth tanh saturation.
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    float inputGain = 0.0f;   // dB (0..24)
    float ceiling   = -1.0f;  // dB (-24..0)
    float softness  = 0.5f;   // 0..1
    float mix       = 1.0f;

    void init(float sr) {
        sampleRate = sr;
    }

    inline float clipSample(float sample, float ceilLin) const {
        if (softness <= 0.001f) {
            // Hard clip
            return std::clamp(sample, -ceilLin, ceilLin);
        } else if (softness >= 0.999f) {
            // Full soft clip (tanh)
            return std::tanh(sample / ceilLin) * ceilLin;
        } else {
            // Blend hard and soft
            float hard = std::clamp(sample, -ceilLin, ceilLin);
            float soft = std::tanh(sample / ceilLin) * ceilLin;
            return hard * (1.0f - softness) + soft * softness;
        }
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float gainLin = std::pow(10.0f, inputGain / 20.0f);
        float ceilLin = std::pow(10.0f, ceiling / 20.0f);

        for (int i = 0; i < n; i++) {
            float sL = inL[i] * gainLin;
            float sR = inR[i] * gainLin;

            float wetL = clipSample(sL, ceilLin);
            float wetR = clipSample(sR, ceilLin);

            outL[i] = wetL * mix + inL[i] * (1.0f - mix);
            outR[i] = wetR * mix + inR[i] * (1.0f - mix);
        }
    }
};

static Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int clipper_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void clipper_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}
EMSCRIPTEN_KEEPALIVE void clipper_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void clipper_set_inputGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].inputGain = std::clamp(v, 0.0f, 24.0f);
}
EMSCRIPTEN_KEEPALIVE void clipper_set_ceiling(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].ceiling = std::clamp(v, -24.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void clipper_set_softness(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].softness = std::clamp(v, 0.0f, 1.0f);
}
EMSCRIPTEN_KEEPALIVE void clipper_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
