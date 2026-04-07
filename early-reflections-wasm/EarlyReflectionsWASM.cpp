/**
 * EarlyReflectionsWASM.cpp — Moorer early reflection model
 *
 * Simulates room reflections using tapped delay lines at prime-number
 * spacing with per-tap LP damping filters scaled by room size.
 *
 * Build: cd early-reflections-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int NUM_TAPS = 7;
static constexpr int MAX_DELAY_SAMPLES = 8640; // 180ms at 48kHz (max size=3 × 60ms base)
static constexpr float PI = 3.14159265358979323846f;

// Base tap delays in ms (prime-ish spacing to avoid flutter echo)
static constexpr float BASE_TAP_MS[NUM_TAPS] = {
    7.0f, 11.0f, 17.0f, 23.0f, 29.0f, 37.0f, 43.0f
};

// Tap gains (decreasing with distance, simulating inverse square law)
static constexpr float TAP_GAINS[NUM_TAPS] = {
    0.85f, 0.72f, 0.60f, 0.50f, 0.42f, 0.35f, 0.28f
};

// Pan offsets: negative = left, positive = right
static constexpr float TAP_PAN[NUM_TAPS] = {
    -0.8f, 0.6f, -0.4f, 0.7f, -0.5f, 0.3f, -0.6f
};

struct OnePoleLP {
    float z1 = 0.0f;
    float a = 0.5f;

    void setCoeff(float damping) {
        a = 1.0f - std::clamp(damping, 0.0f, 0.99f);
    }

    float process(float x) {
        z1 = z1 + a * (x - z1);
        return z1;
    }

    void clear() { z1 = 0.0f; }
};

struct EarlyReflectionsInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    float size = 1.0f;      // 0.1..3 room scale
    float damping = 0.3f;   // 0..1 HF absorption
    float mix = 0.3f;

    float bufferL[MAX_DELAY_SAMPLES] = {};
    float bufferR[MAX_DELAY_SAMPLES] = {};
    int writePos = 0;
    OnePoleLP dampFilters[NUM_TAPS];

    void init(float sr) {
        sampleRate = sr;
        writePos = 0;
        std::memset(bufferL, 0, sizeof(bufferL));
        std::memset(bufferR, 0, sizeof(bufferR));
        for (int i = 0; i < NUM_TAPS; i++) {
            dampFilters[i].clear();
            dampFilters[i].setCoeff(damping);
        }
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        for (int i = 0; i < n; i++) {
            bufferL[writePos] = inL[i];
            bufferR[writePos] = inR[i];

            float wetL = 0.0f, wetR = 0.0f;

            for (int t = 0; t < NUM_TAPS; t++) {
                int delaySamples = static_cast<int>(BASE_TAP_MS[t] * 0.001f * sampleRate * size + 0.5f);
                delaySamples = std::clamp(delaySamples, 1, MAX_DELAY_SAMPLES - 1);

                int readPos = (writePos - delaySamples + MAX_DELAY_SAMPLES) % MAX_DELAY_SAMPLES;
                float tapL = bufferL[readPos];
                float tapR = bufferR[readPos];

                // Apply damping
                float tapMono = (tapL + tapR) * 0.5f;
                tapMono = dampFilters[t].process(tapMono) * TAP_GAINS[t];

                // Pan distribution
                float panL = std::clamp(0.5f - TAP_PAN[t] * 0.5f, 0.0f, 1.0f);
                float panR = std::clamp(0.5f + TAP_PAN[t] * 0.5f, 0.0f, 1.0f);
                wetL += tapMono * panL;
                wetR += tapMono * panR;
            }

            writePos = (writePos + 1) % MAX_DELAY_SAMPLES;

            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static EarlyReflectionsInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int early_reflections_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void early_reflections_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void early_reflections_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void early_reflections_set_size(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].size = std::clamp(v, 0.1f, 3.0f);
}

EMSCRIPTEN_KEEPALIVE void early_reflections_set_damping(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].damping = std::clamp(v, 0.0f, 1.0f);
        for (int t = 0; t < NUM_TAPS; t++) instances[h].dampFilters[t].setCoeff(instances[h].damping);
    }
}

EMSCRIPTEN_KEEPALIVE void early_reflections_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
