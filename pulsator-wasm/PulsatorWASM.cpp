/**
 * PulsatorWASM.cpp — Autopanner/tremolo with stereo phase offset
 *
 * Multiple LFO waveforms (sine, triangle, square, saw, revsaw) modulate
 * L/R amplitude with configurable phase offset for stereo movement.
 *
 * Build: cd pulsator-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;
static constexpr float TWO_PI = 2.0f * PI;

struct PulsatorInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    float rate = 2.0f;          // Hz (0.01..20)
    float depth = 0.5f;         // 0..1
    int waveform = 0;           // 0=sine, 1=tri, 2=square, 3=saw, 4=revsaw
    float stereoPhase = 180.0f; // degrees (0..360)
    float offset = 0.0f;        // minimum volume (0..1)
    float mix = 1.0f;

    float lfoPhase = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        lfoPhase = 0.0f;
    }

    static float lfoWave(int wf, float phase) {
        float p = phase - std::floor(phase); // 0..1
        switch (wf) {
            case 0: // sine
                return 0.5f + 0.5f * std::sin(p * TWO_PI);
            case 1: // triangle
                return (p < 0.5f) ? (p * 2.0f) : (2.0f - p * 2.0f);
            case 2: // square
                return (p < 0.5f) ? 1.0f : 0.0f;
            case 3: // saw
                return p;
            case 4: // revsaw
                return 1.0f - p;
            default:
                return 0.5f + 0.5f * std::sin(p * TWO_PI);
        }
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int n)
    {
        float phaseInc = rate / sampleRate;
        float phaseOff = stereoPhase / 360.0f;

        for (int i = 0; i < n; i++) {
            float modL = lfoWave(waveform, lfoPhase);
            float modR = lfoWave(waveform, lfoPhase + phaseOff);

            // Scale by depth and apply offset (minimum volume)
            float gainL = offset + (1.0f - offset) * (1.0f - depth + depth * modL);
            float gainR = offset + (1.0f - offset) * (1.0f - depth + depth * modR);

            float wetL = inL[i] * gainL;
            float wetR = inR[i] * gainR;

            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;

            lfoPhase += phaseInc;
            if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
        }
    }
};

static PulsatorInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int pulsator_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void pulsator_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void pulsator_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void pulsator_set_rate(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].rate = std::clamp(v, 0.01f, 20.0f);
}

EMSCRIPTEN_KEEPALIVE void pulsator_set_depth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].depth = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void pulsator_set_waveform(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].waveform = std::clamp(static_cast<int>(v + 0.5f), 0, 4);
}

EMSCRIPTEN_KEEPALIVE void pulsator_set_stereoPhase(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].stereoPhase = std::clamp(v, 0.0f, 360.0f);
}

EMSCRIPTEN_KEEPALIVE void pulsator_set_offset(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].offset = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void pulsator_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
