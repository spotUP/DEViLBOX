#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct OnePoleLP {
    float coeff = 0.0f;
    float z1L = 0.0f, z1R = 0.0f;

    void setFreq(float freq, float sr) {
        float w = 2.0f * 3.14159265f * freq / sr;
        coeff = 1.0f - std::exp(-w);
    }
    void processBlock(float* L, float* R, int n) {
        for (int i = 0; i < n; i++) {
            z1L += coeff * (L[i] - z1L); L[i] = z1L;
            z1R += coeff * (R[i] - z1R); R[i] = z1R;
        }
    }
    void reset() { z1L = z1R = 0.0f; }
};

struct SaturatorInstance {
    bool active = false;
    float sampleRate = 48000.0f;
    float drive = 0.5f;
    float blend = 0.5f;
    float preFreq = 20000.0f;
    float postFreq = 20000.0f;
    float mix = 1.0f;
    OnePoleLP preFilt, postFilt;

    void init(float sr) {
        sampleRate = sr;
        preFilt.reset();
        postFilt.reset();
        preFilt.setFreq(preFreq, sr);
        postFilt.setFreq(postFreq, sr);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float gainDb = drive * 30.0f;
        float gain = std::pow(10.0f, gainDb / 20.0f);

        for (int i = 0; i < n; i++) {
            float dryL = inL[i], dryR = inR[i];
            float sL = inL[i], sR = inR[i];

            // Pre-filter
            preFilt.z1L += preFilt.coeff * (sL - preFilt.z1L); sL = preFilt.z1L;
            preFilt.z1R += preFilt.coeff * (sR - preFilt.z1R); sR = preFilt.z1R;

            // Apply drive
            sL *= gain;
            sR *= gain;

            // 2nd harmonic: asymmetric (x + 0.5*x^2, then normalize)
            float h2L = sL + 0.5f * sL * std::fabs(sL);
            float h2R = sR + 0.5f * sR * std::fabs(sR);
            h2L /= (1.0f + 0.5f * std::fabs(sL));
            h2R /= (1.0f + 0.5f * std::fabs(sR));

            // 3rd harmonic: tanh
            float h3L = std::tanh(sL);
            float h3R = std::tanh(sR);

            // Blend
            float wetL = (1.0f - blend) * h2L + blend * h3L;
            float wetR = (1.0f - blend) * h2R + blend * h3R;

            // Post-filter
            postFilt.z1L += postFilt.coeff * (wetL - postFilt.z1L); wetL = postFilt.z1L;
            postFilt.z1R += postFilt.coeff * (wetR - postFilt.z1R); wetR = postFilt.z1R;

            // Mix
            outL[i] = dryL + mix * (wetL - dryL);
            outR[i] = dryR + mix * (wetR - dryR);
        }
    }
};

static SaturatorInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int saturator_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s] = SaturatorInstance{};
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void saturator_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void saturator_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void saturator_set_drive(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].drive = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void saturator_set_blend(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].blend = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void saturator_set_preFreq(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].preFreq = std::clamp(v, 200.0f, 20000.0f);
        instances[h].preFilt.setFreq(instances[h].preFreq, instances[h].sampleRate);
    }
}

EMSCRIPTEN_KEEPALIVE void saturator_set_postFreq(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].postFreq = std::clamp(v, 200.0f, 20000.0f);
        instances[h].postFilt.setFreq(instances[h].postFreq, instances[h].sampleRate);
    }
}

EMSCRIPTEN_KEEPALIVE void saturator_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

}
