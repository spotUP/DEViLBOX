/**
 * MultibandClipperWASM.cpp — MultibandClipper effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct MultibandClipperInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float lowCross = 200.0f;
    float highCross = 4000.0f;
    float lowCeil = -3.0f;
    float midCeil = -3.0f;
    float highCeil = -3.0f;
    float softness = 0.5f;
    float mix = 1.0f;

    // DSP state & methods

    // LR2 crossover state (2nd order = two cascaded 1st order)
    float lp1L[2]={}, lp1R[2]={}, hp1L[2]={}, hp1R[2]={};
    float lp2L[2]={}, lp2R[2]={}, hp2L[2]={}, hp2R[2]={};
    float lowCoeff = 0.0f, highCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        std::memset(lp1L,0,sizeof(lp1L)); std::memset(lp1R,0,sizeof(lp1R));
        std::memset(hp1L,0,sizeof(hp1L)); std::memset(hp1R,0,sizeof(hp1R));
        std::memset(lp2L,0,sizeof(lp2L)); std::memset(lp2R,0,sizeof(lp2R));
        std::memset(hp2L,0,sizeof(hp2L)); std::memset(hp2R,0,sizeof(hp2R));
        updateCoeffs();
    }
    void updateCoeffs() {
        lowCoeff = std::exp(-2.0f * 3.14159265f * lowCross / sampleRate);
        highCoeff = std::exp(-2.0f * 3.14159265f * highCross / sampleRate);
    }
    static float onePoleLP(float in, float& state, float coeff) {
        state = in * (1.0f - coeff) + state * coeff;
        return state;
    }
    static float softClip(float x, float ceil, float soft) {
        float ceilLin = std::pow(10.0f, ceil / 20.0f);
        if (soft < 0.01f) return std::clamp(x, -ceilLin, ceilLin);
        float norm = x / ceilLin;
        float shaped = std::tanh(norm / std::max(soft, 0.01f)) * soft;
        return shaped * ceilLin;
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            // Split into 3 bands using cascaded one-pole filters
            float lowL = onePoleLP(onePoleLP(inL[i], lp1L[0], lowCoeff), lp1L[1], lowCoeff);
            float lowR = onePoleLP(onePoleLP(inR[i], lp1R[0], lowCoeff), lp1R[1], lowCoeff);
            float restL = inL[i] - lowL;
            float restR = inR[i] - lowR;
            float highL = restL - onePoleLP(onePoleLP(restL, lp2L[0], highCoeff), lp2L[1], highCoeff);
            float highR = restR - onePoleLP(onePoleLP(restR, lp2R[0], highCoeff), lp2R[1], highCoeff);
            float midL = restL - highL;
            float midR = restR - highR;
            // Clip each band
            lowL = softClip(lowL, lowCeil, softness);
            lowR = softClip(lowR, lowCeil, softness);
            midL = softClip(midL, midCeil, softness);
            midR = softClip(midR, midCeil, softness);
            highL = softClip(highL, highCeil, softness);
            highR = softClip(highR, highCeil, softness);
            float wetL = lowL + midL + highL;
            float wetR = lowR + midR + highR;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static MultibandClipperInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int multiband_clipper_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_set_lowCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowCross = std::clamp(v, 20.0f, 1000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_set_highCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highCross = std::clamp(v, 500.0f, 16000.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_set_lowCeil(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lowCeil = std::clamp(v, -24.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_set_midCeil(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].midCeil = std::clamp(v, -24.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_set_highCeil(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].highCeil = std::clamp(v, -24.0f, 0.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_set_softness(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].softness = std::clamp(v, 0.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multiband_clipper_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
