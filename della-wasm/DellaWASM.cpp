/**
 * DellaWASM.cpp — Della effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct DellaInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float time = 300.0f;
    float feedback = 0.5f;
    float volume = 0.7f;
    float mix = 0.5f;

    // DSP state & methods

    static constexpr int MAX_DELAY = 96001; // 2s at 48kHz
    float* bufL = nullptr;
    float* bufR = nullptr;
    int writeIdx = 0;
    int delaySamples = 0;

    void init(float sr) {
        sampleRate = sr;
        writeIdx = 0;
        if (!bufL) bufL = new float[MAX_DELAY]();
        if (!bufR) bufR = new float[MAX_DELAY]();
        std::memset(bufL, 0, MAX_DELAY * sizeof(float));
        std::memset(bufR, 0, MAX_DELAY * sizeof(float));
        updateDelay();
    }
    void cleanup() {
        delete[] bufL; bufL = nullptr;
        delete[] bufR; bufR = nullptr;
    }
    void updateDelay() {
        delaySamples = std::clamp((int)(time * 0.001f * sampleRate), 1, MAX_DELAY - 1);
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        if (!bufL || !bufR) { std::memcpy(outL, inL, n*sizeof(float)); std::memcpy(outR, inR, n*sizeof(float)); return; }
        for (int i = 0; i < n; i++) {
            int readIdx = (writeIdx - delaySamples + MAX_DELAY) % MAX_DELAY;
            float delL = bufL[readIdx];
            float delR = bufR[readIdx];
            bufL[writeIdx] = inL[i] + delL * feedback;
            bufR[writeIdx] = inR[i] + delR * feedback;
            writeIdx = (writeIdx + 1) % MAX_DELAY;
            float wetL = delL * volume;
            float wetR = delR * volume;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static DellaInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int della_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void della_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) { instances[h].cleanup(); instances[h].active = false; }
}

EMSCRIPTEN_KEEPALIVE void della_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void della_set_time(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].time = std::clamp(v, 50.0f, 2000.0f);
        instances[h].updateDelay();
    }
}

EMSCRIPTEN_KEEPALIVE void della_set_feedback(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].feedback = std::clamp(v, 0.0f, 0.95f);
    }
}

EMSCRIPTEN_KEEPALIVE void della_set_volume(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].volume = std::clamp(v, 0.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void della_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
