/**
 * RingModWASM.cpp — Ring Modulator effect for DEViLBOX
 *
 * Classic ring modulation (AM synthesis) with internal carrier oscillator.
 * Supports sine, square, triangle, and saw carrier waveforms.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 32;
static constexpr float PI = 3.14159265358979323846f;
static constexpr float TWO_PI = 2.0f * PI;

struct RingModInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float frequency = 440.0f;   // Carrier frequency Hz
    float mix = 0.5f;           // 0-1 wet/dry
    int waveform = 0;           // 0=sine, 1=square, 2=triangle, 3=saw
    float lfoRate = 0.0f;       // Carrier FM LFO rate Hz (0=off)
    float lfoDepth = 0.0f;      // Carrier FM LFO depth (0-1, fraction of carrier freq)

    // State
    float carrierPhase = 0.0f;
    float lfoPhase = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        carrierPhase = 0.0f;
        lfoPhase = 0.0f;
    }

    float generateCarrier(float phase) const {
        switch (waveform) {
            case 0: // Sine
                return std::sin(phase * TWO_PI);
            case 1: // Square
                return phase < 0.5f ? 1.0f : -1.0f;
            case 2: // Triangle
                return 4.0f * std::abs(phase - 0.5f) - 1.0f;
            case 3: // Saw
                return 2.0f * phase - 1.0f;
            default:
                return std::sin(phase * TWO_PI);
        }
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int numSamples)
    {
        for (int i = 0; i < numSamples; i++) {
            // FM via LFO
            float fmOffset = 0.0f;
            if (lfoRate > 0.0f && lfoDepth > 0.0f) {
                fmOffset = std::sin(lfoPhase * TWO_PI) * lfoDepth * frequency;
                lfoPhase += lfoRate / sampleRate;
                if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
            }

            float currentFreq = frequency + fmOffset;
            float carrier = generateCarrier(carrierPhase);

            carrierPhase += currentFreq / sampleRate;
            if (carrierPhase >= 1.0f) carrierPhase -= 1.0f;
            if (carrierPhase < 0.0f) carrierPhase += 1.0f;

            // Ring modulate
            float wetL = inL[i] * carrier;
            float wetR = inR[i] * carrier;

            // Mix
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

// ─── Instance Pool ──────────────────────────────────────────────────────────

static RingModInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int ring_mod_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void ring_mod_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void ring_mod_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void ring_mod_set_frequency(int h, float hz) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].frequency = std::clamp(hz, 1.0f, 5000.0f);
}

EMSCRIPTEN_KEEPALIVE void ring_mod_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void ring_mod_set_waveform(int h, int w) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].waveform = std::clamp(w, 0, 3);
}

EMSCRIPTEN_KEEPALIVE void ring_mod_set_lfo_rate(int h, float hz) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lfoRate = std::clamp(hz, 0.0f, 20.0f);
}

EMSCRIPTEN_KEEPALIVE void ring_mod_set_lfo_depth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lfoDepth = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
