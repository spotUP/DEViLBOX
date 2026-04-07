/**
 * ExpanderWASM.cpp — Dynamic range expander for DEViLBOX
 *
 * Below-threshold signals are attenuated by the ratio, expanding
 * quiet parts and tightening dynamics. Stereo-linked detection.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct ExpanderInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float thresholdDb = -30.0f;  // dB
    float ratio = 2.0f;          // 1:2 means 1dB below thresh → 2dB below
    float attackMs = 1.0f;
    float releaseMs = 100.0f;
    float rangeDb = -60.0f;      // Maximum attenuation (expansion floor)
    float kneeDb = 6.0f;         // Soft knee width

    // Internal
    float envelope = 0.0f;
    float attackCoeff = 0.0f;
    float releaseCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        envelope = 0.0f;
        updateCoeffs();
    }

    void updateCoeffs() {
        attackCoeff  = std::exp(-1.0f / (attackMs * 0.001f * sampleRate));
        releaseCoeff = std::exp(-1.0f / (releaseMs * 0.001f * sampleRate));
    }

    float computeGainDb(float inputDb) {
        float diff = inputDb - thresholdDb;

        float gainReduction;
        if (kneeDb > 0.0f && std::abs(diff) < kneeDb / 2.0f) {
            // Soft knee region
            float x = diff + kneeDb / 2.0f;
            float slope = (1.0f - ratio) / ratio;
            gainReduction = slope * x * x / (2.0f * kneeDb);
        } else if (diff < 0.0f) {
            // Below threshold: expand
            gainReduction = diff * (1.0f - ratio) / ratio;
        } else {
            // Above threshold: no change
            gainReduction = 0.0f;
        }

        // Clamp to range
        return std::max(gainReduction, rangeDb);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            // Stereo-linked peak detection
            float peak = std::max(std::abs(inL[i]), std::abs(inR[i]));
            float peakDb = (peak > 1e-10f) ? 20.0f * std::log10(peak) : -120.0f;

            // Smooth envelope
            float target = peakDb;
            if (target > envelope)
                envelope = target + attackCoeff * (envelope - target);
            else
                envelope = target + releaseCoeff * (envelope - target);

            // Compute gain
            float gainDb = computeGainDb(envelope);
            float gain = std::pow(10.0f, gainDb / 20.0f);

            outL[i] = inL[i] * gain;
            outR[i] = inR[i] * gain;
        }
    }
};

static ExpanderInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {
EMSCRIPTEN_KEEPALIVE int expander_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void expander_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void expander_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void expander_set_threshold(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].thresholdDb = std::clamp(v, -60.0f, 0.0f); }
EMSCRIPTEN_KEEPALIVE void expander_set_ratio(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].ratio = std::clamp(v, 1.0f, 10.0f); }
EMSCRIPTEN_KEEPALIVE void expander_set_attack(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].attackMs = std::clamp(v, 0.1f, 100.0f); instances[h].updateCoeffs(); } }
EMSCRIPTEN_KEEPALIVE void expander_set_release(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].releaseMs = std::clamp(v, 10.0f, 1000.0f); instances[h].updateCoeffs(); } }
EMSCRIPTEN_KEEPALIVE void expander_set_range(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].rangeDb = std::clamp(v, -90.0f, 0.0f); }
EMSCRIPTEN_KEEPALIVE void expander_set_knee(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].kneeDb = std::clamp(v, 0.0f, 24.0f); }
} // extern "C"
