/**
 * PhonoFilterWASM.cpp — RIAA phono equalization for DEViLBOX
 *
 * Implements RIAA playback and recording curves using a biquad chain:
 * - HP at ~20Hz (subsonic rumble filter)
 * - Low shelf at ~50Hz (+19.9dB playback / -19.9dB recording)
 * - High shelf at ~2122Hz (-19.6dB playback / +19.6dB recording)
 *
 * Build: cd phono-filter-wasm/build && emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

struct Biquad {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void reset() { x1 = x2 = y1 = y2 = 0; }

    float process(float in) {
        float out = b0 * in + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = in; y2 = y1; y1 = out;
        return out;
    }

    void setHP(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / (2.0f * 0.7071f);
        float a0 = 1.0f + alpha;
        b0 = ((1.0f + cs) / 2.0f) / a0; b1 = (-(1.0f + cs)) / a0;
        b2 = b0; a1 = (-2.0f * cs) / a0; a2 = (1.0f - alpha) / a0;
    }

    void setLowShelf(float freq, float gain, float sr) {
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr, cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / 2.0f * std::sqrt((A + 1.0f / A) * 2.0f);
        float a0 = (A + 1) + (A - 1) * cs + 2 * std::sqrt(A) * alpha;
        b0 = (A * ((A + 1) - (A - 1) * cs + 2 * std::sqrt(A) * alpha)) / a0;
        b1 = (2 * A * ((A - 1) - (A + 1) * cs)) / a0;
        b2 = (A * ((A + 1) - (A - 1) * cs - 2 * std::sqrt(A) * alpha)) / a0;
        a1 = (-2 * ((A - 1) + (A + 1) * cs)) / a0;
        a2 = ((A + 1) + (A - 1) * cs - 2 * std::sqrt(A) * alpha) / a0;
    }

    void setHighShelf(float freq, float gain, float sr) {
        float A = std::pow(10.0f, gain / 40.0f);
        float w0 = 2.0f * PI * freq / sr, cs = std::cos(w0), sn = std::sin(w0);
        float alpha = sn / 2.0f * std::sqrt((A + 1.0f / A) * 2.0f);
        float a0 = (A + 1) - (A - 1) * cs + 2 * std::sqrt(A) * alpha;
        b0 = (A * ((A + 1) + (A - 1) * cs + 2 * std::sqrt(A) * alpha)) / a0;
        b1 = (-2 * A * ((A - 1) + (A + 1) * cs)) / a0;
        b2 = (A * ((A + 1) + (A - 1) * cs - 2 * std::sqrt(A) * alpha)) / a0;
        a1 = (2 * ((A - 1) - (A + 1) * cs)) / a0;
        a2 = ((A + 1) - (A - 1) * cs - 2 * std::sqrt(A) * alpha) / a0;
    }
};

struct PhonoFilterInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    Biquad hpL, hpR;       // subsonic filter
    Biquad lowL, lowR;     // bass shelf
    Biquad highL, highR;   // treble shelf

    int mode = 0; // 0=playback, 1=recording
    float mix = 1.0f;

    void init(float sr) {
        sampleRate = sr;
        hpL.reset(); hpR.reset();
        lowL.reset(); lowR.reset();
        highL.reset(); highR.reset();
        recalc();
    }

    void recalc() {
        // RIAA corner frequencies
        // Playback: boost bass, cut treble
        // Recording: cut bass, boost treble (inverse)
        float bassGain = (mode == 0) ? 19.9f : -19.9f;
        float trebleGain = (mode == 0) ? -19.6f : 19.6f;

        hpL.setHP(20.0f, sampleRate);
        hpR.setHP(20.0f, sampleRate);
        lowL.setLowShelf(50.0f, bassGain, sampleRate);
        lowR.setLowShelf(50.0f, bassGain, sampleRate);
        highL.setHighShelf(2122.0f, trebleGain, sampleRate);
        highR.setHighShelf(2122.0f, trebleGain, sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float L = hpL.process(inL[i]); L = lowL.process(L); L = highL.process(L);
            float R = hpR.process(inR[i]); R = lowR.process(R); R = highR.process(R);
            outL[i] = inL[i] * (1.0f - mix) + L * mix;
            outR[i] = inR[i] * (1.0f - mix) + R * mix;
        }
    }
};

static PhonoFilterInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int phono_filter_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void phono_filter_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }

EMSCRIPTEN_KEEPALIVE void phono_filter_process(int h, float* inL, float* inR, float* outL, float* outR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (outL && inL) std::memcpy(outL, inL, n * sizeof(float));
        if (outR && inR) std::memcpy(outR, inR, n * sizeof(float));
        return;
    }
    instances[h].process(inL, inR, outL, outR, n);
}

EMSCRIPTEN_KEEPALIVE void phono_filter_set_mode(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].mode = (v >= 0.5f) ? 1 : 0;
        instances[h].recalc();
    }
}
EMSCRIPTEN_KEEPALIVE void phono_filter_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
