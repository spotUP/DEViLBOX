/**
 * HaasEnhancerWASM.cpp — Stereo widening via Haas effect
 *
 * Delays one channel slightly (0.1–20ms) to create stereo width perception.
 *
 * Build: cd haas-enhancer-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int MAX_DELAY_SAMPLES = 960; // 20ms at 48kHz

struct HaasEnhancerInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    float delay = 10.0f;  // ms (0.1..20)
    float side = 0.0f;    // 0 = delay R, 1 = delay L
    float mix = 1.0f;

    float buffer[MAX_DELAY_SAMPLES] = {};
    int writePos = 0;

    void init(float sr) {
        sampleRate = sr;
        writePos = 0;
        std::memset(buffer, 0, sizeof(buffer));
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        int delaySamples = std::clamp(static_cast<int>(delay * 0.001f * sampleRate + 0.5f),
                                       1, MAX_DELAY_SAMPLES - 1);

        for (int i = 0; i < n; i++) {
            float srcSample = (side < 0.5f) ? inR[i] : inL[i];

            buffer[writePos] = srcSample;
            int readPos = (writePos - delaySamples + MAX_DELAY_SAMPLES) % MAX_DELAY_SAMPLES;
            float delayed = buffer[readPos];
            writePos = (writePos + 1) % MAX_DELAY_SAMPLES;

            if (side < 0.5f) {
                // Delay right channel
                outL[i] = inL[i];
                outR[i] = inR[i] * (1.0f - mix) + delayed * mix;
            } else {
                // Delay left channel
                outL[i] = inL[i] * (1.0f - mix) + delayed * mix;
                outR[i] = inR[i];
            }
        }
    }
};

static HaasEnhancerInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int haas_enhancer_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void haas_enhancer_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void haas_enhancer_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void haas_enhancer_set_delay(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].delay = std::clamp(v, 0.1f, 20.0f);
}

EMSCRIPTEN_KEEPALIVE void haas_enhancer_set_side(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].side = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void haas_enhancer_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
