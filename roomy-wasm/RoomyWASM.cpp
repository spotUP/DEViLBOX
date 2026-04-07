/**
 * RoomyWASM.cpp — Roomy effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct RoomyInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float time = 2.0f;
    float damping = 0.5f;
    float mix = 0.3f;

    // DSP state & methods

    // 4-channel FDN with prime delay lengths
    static constexpr int MAX_FDN_DELAY = 48000; // 1s at 48kHz max per line
    static constexpr int NUM_LINES = 4;
    float* fdnBuf[NUM_LINES] = {};
    int fdnLen[NUM_LINES] = {1553, 1907, 2311, 2713};
    int fdnPos[NUM_LINES] = {};
    float fdnLP[NUM_LINES] = {};

    void init(float sr) {
        sampleRate = sr;
        for (int c = 0; c < NUM_LINES; c++) {
            if (!fdnBuf[c]) fdnBuf[c] = new float[MAX_FDN_DELAY]();
            std::memset(fdnBuf[c], 0, MAX_FDN_DELAY * sizeof(float));
            fdnPos[c] = 0;
            fdnLP[c] = 0.0f;
        }
        updateDelays();
    }
    void cleanup() {
        for (int c = 0; c < NUM_LINES; c++) { delete[] fdnBuf[c]; fdnBuf[c] = nullptr; }
    }
    void updateCoeffs() { updateDelays(); }
    void updateDelays() {
        // Scale delay lengths by time parameter
        static const int baseLens[NUM_LINES] = {1553, 1907, 2311, 2713};
        float scale = std::clamp(time, 0.1f, 10.0f);
        for (int c = 0; c < NUM_LINES; c++) {
            fdnLen[c] = std::clamp((int)(baseLens[c] * scale * sampleRate / 48000.0f), 1, MAX_FDN_DELAY - 1);
        }
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        if (!fdnBuf[0]) { std::memcpy(outL, inL, n*sizeof(float)); std::memcpy(outR, inR, n*sizeof(float)); return; }
        float dampCoeff = damping * 0.7f;
        float fbk = 0.5f; // Hadamard-normalized feedback
        for (int i = 0; i < n; i++) {
            float inMono = (inL[i] + inR[i]) * 0.5f;
            float lineOut[NUM_LINES];
            for (int c = 0; c < NUM_LINES; c++) {
                lineOut[c] = fdnBuf[c][fdnPos[c]];
                // LP damping
                fdnLP[c] = lineOut[c] * (1.0f - dampCoeff) + fdnLP[c] * dampCoeff;
                lineOut[c] = fdnLP[c];
            }
            // Hadamard matrix mixing (4x4, normalized by 0.5)
            float mixed[NUM_LINES];
            mixed[0] = (lineOut[0]+lineOut[1]+lineOut[2]+lineOut[3]) * 0.5f;
            mixed[1] = (lineOut[0]-lineOut[1]+lineOut[2]-lineOut[3]) * 0.5f;
            mixed[2] = (lineOut[0]+lineOut[1]-lineOut[2]-lineOut[3]) * 0.5f;
            mixed[3] = (lineOut[0]-lineOut[1]-lineOut[2]+lineOut[3]) * 0.5f;
            for (int c = 0; c < NUM_LINES; c++) {
                fdnBuf[c][fdnPos[c]] = inMono * 0.25f + mixed[c] * fbk;
                fdnPos[c] = (fdnPos[c] + 1) % fdnLen[c];
            }
            float wetL = (lineOut[0] + lineOut[2]) * 0.5f;
            float wetR = (lineOut[1] + lineOut[3]) * 0.5f;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static RoomyInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int roomy_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void roomy_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) { instances[h].cleanup(); instances[h].active = false; }
}

EMSCRIPTEN_KEEPALIVE void roomy_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void roomy_set_time(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].time = std::clamp(v, 0.1f, 10.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void roomy_set_damping(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].damping = std::clamp(v, 0.0f, 1.0f);
        instances[h].updateCoeffs();
    }
}

EMSCRIPTEN_KEEPALIVE void roomy_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
