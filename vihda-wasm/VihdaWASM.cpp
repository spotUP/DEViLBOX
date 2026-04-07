/**
 * VihdaWASM.cpp — Vihda effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct VihdaInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float width = 1.0f;
    float invert = 0.0f;
    float mix = 1.0f;

    // DSP state & methods

    void init(float sr) { sampleRate = sr; }
    void updateCoeffs() {}
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        bool doInvert = (invert >= 0.5f);
        for (int i = 0; i < n; i++) {
            // M/S encode
            float mid = (inL[i] + inR[i]) * 0.5f;
            float side = (inL[i] - inR[i]) * 0.5f;
            // Scale side by width
            side *= width;
            // M/S decode
            float wetL = mid + side;
            float wetR = mid - side;
            // Optionally invert R channel
            if (doInvert) wetR = -wetR;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static VihdaInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int vihda_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void vihda_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void vihda_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void vihda_set_width(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].width = std::clamp(v, 0.0f, 2.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void vihda_set_invert(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].invert = std::clamp(v, 0.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void vihda_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
