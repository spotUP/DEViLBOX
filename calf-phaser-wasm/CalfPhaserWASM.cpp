/**
 * CalfPhaserWASM.cpp — CalfPhaser effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct CalfPhaserInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float rate = 0.5f;
    float depth = 0.7f;
    float stages = 6.0f;
    float feedback = 0.5f;
    float stereoPhase = 90.0f;
    float mix = 0.5f;

    // DSP state & methods

    static constexpr int MAX_STAGES = 12;
    float apStateL[MAX_STAGES] = {};
    float apStateR[MAX_STAGES] = {};
    float fbL = 0.0f, fbR = 0.0f;
    float lfoPhase = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        lfoPhase = 0.0f;
        fbL = fbR = 0.0f;
        std::memset(apStateL, 0, sizeof(apStateL));
        std::memset(apStateR, 0, sizeof(apStateR));
    }
    void updateCoeffs() {}
    static float allpass1(float in, float& state, float coeff) {
        float out = state + (in - state) * coeff;
        state = in + (out - in) * coeff;
        return out;
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        int nStages = std::clamp((int)stages, 2, MAX_STAGES);
        float lfoInc = rate / sampleRate;
        float phaseOff = stereoPhase * 3.14159265f / 180.0f;
        for (int i = 0; i < n; i++) {
            float lfoL = std::sin(lfoPhase * 2.0f * 3.14159265f);
            float lfoR = std::sin(lfoPhase * 2.0f * 3.14159265f + phaseOff);
            // Map LFO to allpass coefficient (center freq modulation)
            float coeffL = 0.1f + depth * 0.4f * (1.0f + lfoL);
            float coeffR = 0.1f + depth * 0.4f * (1.0f + lfoR);
            coeffL = std::clamp(coeffL, 0.01f, 0.99f);
            coeffR = std::clamp(coeffR, 0.01f, 0.99f);
            float sigL = inL[i] + fbL * feedback;
            float sigR = inR[i] + fbR * feedback;
            for (int s = 0; s < nStages; s++) {
                sigL = allpass1(sigL, apStateL[s], coeffL);
                sigR = allpass1(sigR, apStateR[s], coeffR);
            }
            fbL = std::clamp(sigL, -1.0f, 1.0f);
            fbR = std::clamp(sigR, -1.0f, 1.0f);
            lfoPhase += lfoInc;
            if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
            outL[i] = inL[i] * (1.0f - mix) + sigL * mix;
            outR[i] = inR[i] * (1.0f - mix) + sigR * mix;
        }
    }
};

static CalfPhaserInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int calf_phaser_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void calf_phaser_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void calf_phaser_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void calf_phaser_set_rate(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].rate = std::clamp(v, 0.01f, 10.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void calf_phaser_set_depth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].depth = std::clamp(v, 0.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void calf_phaser_set_stages(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].stages = std::clamp(v, 2.0f, 12.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void calf_phaser_set_feedback(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].feedback = std::clamp(v, -0.95f, 0.95f);
    }
}

EMSCRIPTEN_KEEPALIVE void calf_phaser_set_stereoPhase(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].stereoPhase = std::clamp(v, 0.0f, 360.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void calf_phaser_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
