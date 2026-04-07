/**
 * MultiChorusWASM.cpp — MultiChorus effect for DEViLBOX
 * Build: emcmake cmake .. && emmake make
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct MultiChorusInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float rate = 0.5f;
    float depth = 0.5f;
    float voices = 4.0f;
    float stereoPhase = 90.0f;
    float mix = 0.5f;

    // DSP state & methods

    static constexpr int BUF_SIZE = 4096;
    float bufL[BUF_SIZE] = {};
    float bufR[BUF_SIZE] = {};
    int writePos = 0;
    float lfoPhase = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        writePos = 0;
        lfoPhase = 0.0f;
        std::memset(bufL, 0, sizeof(bufL));
        std::memset(bufR, 0, sizeof(bufR));
    }
    void updateCoeffs() {}
    float readInterp(const float* buf, float delay) {
        float idx = (float)writePos - delay;
        while (idx < 0) idx += BUF_SIZE;
        int i0 = (int)idx % BUF_SIZE;
        int i1 = (i0 + 1) % BUF_SIZE;
        float frac = idx - std::floor(idx);
        return buf[i0] * (1.0f - frac) + buf[i1] * frac;
    }
    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        int nVoices = std::clamp((int)voices, 1, 8);
        float phaseOffset = stereoPhase * 3.14159265f / 180.0f;
        float lfoInc = rate / sampleRate;
        float maxDelaySamples = depth * 0.005f * sampleRate; // max 5ms
        float centerDelay = 0.01f * sampleRate; // 10ms center
        for (int i = 0; i < n; i++) {
            bufL[writePos] = inL[i];
            bufR[writePos] = inR[i];
            float sumL = 0.0f, sumR = 0.0f;
            for (int v = 0; v < nVoices; v++) {
                float voicePhase = lfoPhase + (float)v / (float)nVoices;
                float lfoL = std::sin(voicePhase * 2.0f * 3.14159265f);
                float lfoR = std::sin((voicePhase * 2.0f * 3.14159265f) + phaseOffset);
                float delayL = centerDelay + lfoL * maxDelaySamples;
                float delayR = centerDelay + lfoR * maxDelaySamples;
                delayL = std::clamp(delayL, 1.0f, (float)(BUF_SIZE - 2));
                delayR = std::clamp(delayR, 1.0f, (float)(BUF_SIZE - 2));
                sumL += readInterp(bufL, delayL);
                sumR += readInterp(bufR, delayR);
            }
            sumL /= (float)nVoices;
            sumR /= (float)nVoices;
            writePos = (writePos + 1) % BUF_SIZE;
            lfoPhase += lfoInc;
            if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
            outL[i] = inL[i] * (1.0f - mix) + sumL * mix;
            outR[i] = inR[i] * (1.0f - mix) + sumR * mix;
        }
    }
};

static MultiChorusInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int multi_chorus_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void multi_chorus_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void multi_chorus_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void multi_chorus_set_rate(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].rate = std::clamp(v, 0.01f, 10.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multi_chorus_set_depth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].depth = std::clamp(v, 0.0f, 1.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multi_chorus_set_voices(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].voices = std::clamp(v, 1.0f, 8.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multi_chorus_set_stereoPhase(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].stereoPhase = std::clamp(v, 0.0f, 360.0f);
    }
}

EMSCRIPTEN_KEEPALIVE void multi_chorus_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
    }
}

} // extern "C"
