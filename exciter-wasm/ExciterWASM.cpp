#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct OnePoleHP {
    float coeff = 0.0f;
    float z1L = 0.0f, z1R = 0.0f;
    float prevInL = 0.0f, prevInR = 0.0f;

    void setFreq(float freq, float sr) {
        float w = 2.0f * 3.14159265f * freq / sr;
        coeff = 1.0f / (1.0f + w);
    }
    void reset() { z1L = z1R = prevInL = prevInR = 0.0f; }
    void processHP(const float* in, float* out, int n, bool isLeft) {
        float& z = isLeft ? z1L : z1R;
        float& prev = isLeft ? prevInL : prevInR;
        for (int i = 0; i < n; i++) {
            float x = in[i];
            z = coeff * (z + x - prev);
            prev = x;
            out[i] = z;
        }
    }
};

struct OnePoleLP {
    float coeff = 0.0f;
    float z1L = 0.0f, z1R = 0.0f;

    void setFreq(float freq, float sr) {
        float w = 2.0f * 3.14159265f * freq / sr;
        coeff = 1.0f - std::exp(-w);
    }
    void reset() { z1L = z1R = 0.0f; }
    void processLP(float* buf, int n, bool isLeft) {
        float& z = isLeft ? z1L : z1R;
        for (int i = 0; i < n; i++) {
            z += coeff * (buf[i] - z);
            buf[i] = z;
        }
    }
};

struct ExciterInstance {
    bool active = false;
    float sampleRate = 48000.0f;
    float frequency = 3000.0f;
    float amount = 0.5f;
    float blend = 0.5f;
    float ceil = 16000.0f;
    float mix = 1.0f;
    OnePoleHP hpFilt;
    OnePoleLP ceilFilt;

    void init(float sr) {
        sampleRate = sr;
        hpFilt.reset();
        ceilFilt.reset();
        hpFilt.setFreq(frequency, sr);
        ceilFilt.setFreq(ceil, sr);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float driveGain = 1.0f + amount * 20.0f;

        for (int i = 0; i < n; i++) {
            float dryL = inL[i], dryR = inR[i];

            // HP filter to isolate highs
            float hL = inL[i], hR = inR[i];
            hpFilt.z1L = hpFilt.coeff * (hpFilt.z1L + hL - hpFilt.prevInL);
            hpFilt.prevInL = hL; hL = hpFilt.z1L;
            hpFilt.z1R = hpFilt.coeff * (hpFilt.z1R + hR - hpFilt.prevInR);
            hpFilt.prevInR = hR; hR = hpFilt.z1R;

            // Drive the highs
            hL *= driveGain;
            hR *= driveGain;

            // Generate harmonics: blend between even (asymmetric) and odd (tanh)
            float evenL = hL + 0.5f * hL * std::fabs(hL);
            float evenR = hR + 0.5f * hR * std::fabs(hR);
            float oddL = std::tanh(hL);
            float oddR = std::tanh(hR);
            hL = (1.0f - blend) * evenL + blend * oddL;
            hR = (1.0f - blend) * evenR + blend * oddR;

            // Ceiling LP filter
            ceilFilt.z1L += ceilFilt.coeff * (hL - ceilFilt.z1L); hL = ceilFilt.z1L;
            ceilFilt.z1R += ceilFilt.coeff * (hR - ceilFilt.z1R); hR = ceilFilt.z1R;

            // Normalize excited signal
            float excL = hL / (1.0f + std::fabs(hL));
            float excR = hR / (1.0f + std::fabs(hR));

            // Mix: add excited highs to dry
            outL[i] = dryL + mix * excL;
            outR[i] = dryR + mix * excR;
        }
    }
};

static ExciterInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int exciter_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s] = ExciterInstance{};
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void exciter_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void exciter_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void exciter_set_frequency(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].frequency = std::clamp(v, 1000.0f, 10000.0f);
        instances[h].hpFilt.setFreq(instances[h].frequency, instances[h].sampleRate);
    }
}

EMSCRIPTEN_KEEPALIVE void exciter_set_amount(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].amount = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void exciter_set_blend(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].blend = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void exciter_set_ceil(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].ceil = std::clamp(v, 1000.0f, 20000.0f);
        instances[h].ceilFilt.setFreq(instances[h].ceil, instances[h].sampleRate);
    }
}

EMSCRIPTEN_KEEPALIVE void exciter_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

}
