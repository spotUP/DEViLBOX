#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct SatmaInstance {
    bool active = false;
    float sampleRate = 48000.0f;
    float distortion = 0.5f;
    float tone = 0.5f;
    float mix = 1.0f;
    // LP filter state
    float lpL = 0.0f, lpR = 0.0f;
    // HP filter state (derived from LP)
    float hpPrevL = 0.0f, hpPrevR = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        lpL = lpR = 0.0f;
        hpPrevL = hpPrevR = 0.0f;
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        // Gain from distortion: exponential 1x to 100x
        float gain = 1.0f + distortion * distortion * 99.0f;
        // Tone filter frequency: 200Hz (tone=0) to 8000Hz (tone=1)
        float toneFreq = 200.0f * std::pow(40.0f, tone);
        float lpCoeff = 1.0f - std::exp(-2.0f * 3.14159265f * toneFreq / sampleRate);

        for (int i = 0; i < n; i++) {
            float dryL = inL[i], dryR = inR[i];

            // Apply heavy gain
            float sL = inL[i] * gain;
            float sR = inR[i] * gain;

            // Cubic waveshaping: x - (1/3)x^3, hard clipped
            sL = std::clamp(sL, -1.5f, 1.5f);
            sR = std::clamp(sR, -1.5f, 1.5f);
            sL = sL - (sL * sL * sL) / 3.0f;
            sR = sR - (sR * sR * sR) / 3.0f;

            // Tone: LP filter
            lpL += lpCoeff * (sL - lpL);
            lpR += lpCoeff * (sR - lpR);

            // HP = original - LP
            float hpL = sL - lpL;
            float hpR = sR - lpR;

            // Crossfade LP/HP based on tone
            float wetL = (1.0f - tone) * lpL + tone * hpL;
            float wetR = (1.0f - tone) * lpR + tone * hpR;

            // Soft limit output
            wetL = std::tanh(wetL);
            wetR = std::tanh(wetR);

            // Mix
            outL[i] = dryL + mix * (wetL - dryL);
            outR[i] = dryR + mix * (wetR - dryR);
        }
    }
};

static SatmaInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int satma_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s] = SatmaInstance{};
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void satma_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void satma_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void satma_set_distortion(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].distortion = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void satma_set_tone(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].tone = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void satma_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

}
