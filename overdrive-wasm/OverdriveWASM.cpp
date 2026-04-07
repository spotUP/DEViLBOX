/**
 * OverdriveWASM.cpp — Soft-clip tube overdrive for DEViLBOX
 *
 * Inspired by ArtyFX Vihda overdrive from Zynthian.
 * Asymmetric soft-clipping waveshaper with tone control and
 * pre/post filtering for warm tube-like overdrive.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 32;
static constexpr float PI = 3.14159265358979323846f;

// ─── One-pole filter ────────────────────────────────────────────────────────

class OnePoleLP {
public:
    float state = 0.0f;
    float coeff = 0.0f;

    void setFreq(float freq, float sr) {
        float x = std::exp(-2.0f * PI * freq / sr);
        coeff = x;
    }

    float process(float in) {
        state = in * (1.0f - coeff) + state * coeff;
        return state;
    }

    void reset() { state = 0.0f; }
};

// ─── Overdrive Instance ─────────────────────────────────────────────────────

struct OverdriveInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float drive = 0.5f;       // 0-1, mapped to gain multiplier
    float tone = 0.5f;        // 0-1, low-pass filter frequency
    float mix = 1.0f;         // 0-1 wet/dry
    float level = 0.5f;       // 0-1 output level

    // State
    OnePoleLP toneFilterL, toneFilterR;
    OnePoleLP dcBlockL, dcBlockR;

    void init(float sr) {
        sampleRate = sr;
        toneFilterL.reset(); toneFilterR.reset();
        dcBlockL.reset(); dcBlockR.reset();
        updateTone();
        // DC blocker at 10 Hz
        dcBlockL.setFreq(10.0f, sr);
        dcBlockR.setFreq(10.0f, sr);
    }

    void updateTone() {
        // Map tone 0-1 to 800-12000 Hz
        float freq = 800.0f + tone * 11200.0f;
        toneFilterL.setFreq(freq, sampleRate);
        toneFilterR.setFreq(freq, sampleRate);
    }

    // Asymmetric soft-clip waveshaper
    static float waveshape(float x, float amount) {
        // Pre-gain: drive 0-1 maps to 1-50x
        float gained = x * (1.0f + amount * 49.0f);

        // Asymmetric tanh-based soft clip
        if (gained >= 0.0f) {
            return std::tanh(gained);
        } else {
            // Slightly different curve for negative side (tube-like asymmetry)
            return std::tanh(gained * 0.8f) * 1.2f;
        }
    }

    void process(const float* inL, const float* inR,
                 float* outL, float* outR, int numSamples)
    {
        // Makeup gain to compensate for clipping loss
        float makeupGain = level * (1.0f / (1.0f + drive * 0.5f));

        for (int i = 0; i < numSamples; i++) {
            // Waveshape
            float wetL = waveshape(inL[i], drive);
            float wetR = waveshape(inR[i], drive);

            // Tone filter
            wetL = toneFilterL.process(wetL);
            wetR = toneFilterR.process(wetR);

            // DC blocker (subtract LP-filtered signal = high-pass)
            float dcL = dcBlockL.process(wetL);
            float dcR = dcBlockR.process(wetR);
            wetL -= dcL;
            wetR -= dcR;

            // Apply makeup gain
            wetL *= makeupGain;
            wetR *= makeupGain;

            // Mix
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

// ─── Instance Pool ──────────────────────────────────────────────────────────

static OverdriveInstance instances[MAX_INSTANCES];
static int findFreeSlot() {
    for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i;
    return -1;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int overdrive_create(int sampleRate) {
    int s = findFreeSlot(); if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sampleRate));
    return s;
}

EMSCRIPTEN_KEEPALIVE void overdrive_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void overdrive_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void overdrive_set_drive(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].drive = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void overdrive_set_tone(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].tone = std::clamp(v, 0.0f, 1.0f); instances[h].updateTone(); }
}

EMSCRIPTEN_KEEPALIVE void overdrive_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void overdrive_set_level(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].level = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
