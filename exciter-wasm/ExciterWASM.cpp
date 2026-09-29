#include <cmath>
#include "lr4_crossover.h"
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

/**
 * Harmonic exciter: generates harmonics from the band above `frequency` and
 * ADDS them to the dry signal at `amount` level.
 *
 *   hp1 (2nd-order, at frequency)  - the band to excite; the lows never enter
 *   drive + shaper (even / odd by blend), bounded to +-1
 *   shaper keeps NO linear term, so it adds harmonics, never the band itself
 *   hp2 (30 Hz)                    - blocks the DC the even harmonics make;
 *                                    at the band edge it adds no phase (a
 *                                    second high-pass AT frequency put the
 *                                    edge 180 degrees out and cut it 6.9 dB)
 *   ceiling low-pass (ceil)
 *   out = dry + mix * amount * 0.5 * harmonics
 *
 * Replaces a version that added the DRIVEN band itself back to the dry signal
 * (+10.5 dB on a full-spectrum signal, 2026-09-29) and then a first fix that
 * subtracted the band at high drive and took 2.2 dB off 100 Hz through a
 * leaky 1-pole high-pass.
 */
struct ExciterInstance {
    bool active = false;
    float sampleRate = 48000.0f;
    float frequency = 3000.0f;
    float amount = 0.5f;
    float blend = 0.5f;
    float ceil = 16000.0f;
    float mix = 1.0f;

    lr4::Biquad hp1L, hp1R, hp2L, hp2R, lpL, lpR;
    float setFreq = -1.0f, setCeil = -1.0f;

    void init(float sr) {
        sampleRate = sr;
        setFreq = setCeil = -1.0f;
        hp1L.reset(); hp1R.reset(); hp2L.reset(); hp2R.reset(); lpL.reset(); lpR.reset();
    }

    void updateFilters() {
        if (frequency != setFreq) {
            hp1L.setHP(frequency, sampleRate); hp1R.setHP(frequency, sampleRate);
            hp2L.setHP(30.0f, sampleRate); hp2R.setHP(30.0f, sampleRate);
            setFreq = frequency;
        }
        if (ceil != setCeil) {
            const float c = std::min(ceil, sampleRate * 0.45f);
            lpL.setLP(c, sampleRate); lpR.setLP(c, sampleRate);
            setCeil = ceil;
        }
    }

    float shape(float d) const {
        const float even = 0.5f * d * std::fabs(d);                       // 2nd-order products
        const float d3 = d * d * d;
        const float odd = d3 / (1.0f + std::fabs(d3));                    // 3rd-order, bounded
        const float y = (1.0f - blend) * even + blend * odd;
        return y / (1.0f + std::fabs(y));
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        updateFilters();
        const float drive = 1.0f + amount * 10.0f;
        const float level = mix * amount * 0.5f;
        for (int i = 0; i < n; i++) {
            const float hL = lpL.process(hp2L.process(shape(hp1L.process(inL[i]) * drive)));
            const float hR = lpR.process(hp2R.process(shape(hp1R.process(inR[i]) * drive)));
            outL[i] = inL[i] + level * hL;
            outR[i] = inR[i] + level * hR;
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
    }
}

EMSCRIPTEN_KEEPALIVE void exciter_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

}
