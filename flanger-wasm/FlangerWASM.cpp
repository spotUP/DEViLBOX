/**
 * FlangerWASM.cpp — BBD-style through-zero flanger for DEViLBOX
 *
 * Classic analog flanger emulation with variable delay line modulated
 * by an LFO. Supports through-zero flanging, feedback, and stereo width.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 32;
static constexpr int MAX_DELAY_SAMPLES = 4800; // 100ms at 48kHz
static constexpr float PI = 3.14159265358979323846f;
static constexpr float TWO_PI = 2.0f * PI;

// ─── Fractional Delay Line ──────────────────────────────────────────────────

class FracDelayLine {
public:
    float buffer[MAX_DELAY_SAMPLES] = {};
    int writePos = 0;
    int maxLen = MAX_DELAY_SAMPLES;

    void clear() { std::memset(buffer, 0, sizeof(buffer)); writePos = 0; }

    void push(float sample) {
        buffer[writePos] = sample;
        writePos = (writePos + 1) % maxLen;
    }

    // Linear interpolation read at fractional delay
    float readFrac(float delaySamples) const {
        float clampedDelay = std::max(0.0f, std::min(delaySamples, static_cast<float>(maxLen - 2)));
        int idx = static_cast<int>(clampedDelay);
        float frac = clampedDelay - static_cast<float>(idx);

        int pos0 = (writePos - 1 - idx + maxLen * 2) % maxLen;
        int pos1 = (pos0 - 1 + maxLen) % maxLen;

        return buffer[pos0] * (1.0f - frac) + buffer[pos1] * frac;
    }
};

// ─── Flanger Instance ───────────────────────────────────────────────────────

struct FlangerInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float rate = 0.3f;          // LFO rate Hz
    float depth = 0.7f;         // LFO depth 0-1
    float delayMs = 5.0f;       // Center delay ms
    float feedback = 0.3f;      // Feedback amount -1 to 1
    float stereoPhase = 90.0f;  // Phase offset degrees for stereo
    float mix = 0.5f;           // Wet/dry mix 0-1

    // State
    float lfoPhase = 0.0f;
    float lfoInc = 0.0f;
    FracDelayLine delayL, delayR;
    float feedbackL = 0.0f, feedbackR = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        lfoPhase = 0.0f;
        feedbackL = feedbackR = 0.0f;
        delayL.clear();
        delayR.clear();
        updateRate();
    }

    void updateRate() {
        lfoInc = rate / sampleRate;
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int numSamples)
    {
        float centerDelaySamples = delayMs * 0.001f * sampleRate;
        float maxModSamples = centerDelaySamples * depth;
        float stereoPhaseRad = stereoPhase * (PI / 180.0f);

        for (int i = 0; i < numSamples; i++) {
            // LFO
            float lfoL = std::sin(lfoPhase * TWO_PI);
            float lfoR = std::sin(lfoPhase * TWO_PI + stereoPhaseRad);

            lfoPhase += lfoInc;
            if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;

            // Modulated delay
            float delL = centerDelaySamples + lfoL * maxModSamples;
            float delR = centerDelaySamples + lfoR * maxModSamples;

            // Push input + feedback into delay
            delayL.push(inL[i] + feedbackL * feedback);
            delayR.push(inR[i] + feedbackR * feedback);

            // Read delayed
            float wetL = delayL.readFrac(delL);
            float wetR = delayR.readFrac(delR);

            feedbackL = std::clamp(wetL, -1.0f, 1.0f);
            feedbackR = std::clamp(wetR, -1.0f, 1.0f);

            // Mix
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

// ─── Instance Pool ──────────────────────────────────────────────────────────

static FlangerInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int flanger_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void flanger_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void flanger_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void flanger_set_rate(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].rate = std::clamp(v, 0.01f, 20.0f); instances[h].updateRate(); }
}

EMSCRIPTEN_KEEPALIVE void flanger_set_depth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].depth = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void flanger_set_delay(int h, float ms) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].delayMs = std::clamp(ms, 0.1f, 20.0f);
}

EMSCRIPTEN_KEEPALIVE void flanger_set_feedback(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].feedback = std::clamp(v, -0.99f, 0.99f);
}

EMSCRIPTEN_KEEPALIVE void flanger_set_stereo(int h, float deg) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].stereoPhase = std::clamp(deg, 0.0f, 360.0f);
}

EMSCRIPTEN_KEEPALIVE void flanger_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
