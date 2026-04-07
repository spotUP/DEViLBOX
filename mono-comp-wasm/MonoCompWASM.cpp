/**
 * MonoCompWASM.cpp — Single-band compressor with peak detection and soft knee.
 * Stereo-linked peak detection, configurable ratio/attack/release/knee/makeup.
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float threshold = -12.0f;  // dB (-60..0)
    float ratio     = 4.0f;    // 1..20
    float attack    = 10.0f;   // ms (0.1..100)
    float release   = 100.0f;  // ms (10..1000)
    float knee      = 6.0f;    // dB (0..24)
    float makeup    = 0.0f;    // dB (0..24)
    float mix       = 1.0f;    // 0..1

    // State
    float envDb = -96.0f;
    float attackCoeff  = 0.0f;
    float releaseCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        envDb = -96.0f;
        updateCoeffs();
    }

    void updateCoeffs() {
        attackCoeff  = (attack  > 0.001f) ? std::exp(-1.0f / (attack  * 0.001f * sampleRate)) : 0.0f;
        releaseCoeff = (release > 0.001f) ? std::exp(-1.0f / (release * 0.001f * sampleRate)) : 0.0f;
    }

    float computeGainDb(float inputDb) const {
        float halfKnee = knee * 0.5f;
        float diff = inputDb - threshold;
        if (knee > 0.0f && diff > -halfKnee && diff < halfKnee) {
            // Soft knee region
            float x = diff + halfKnee;
            float compressionDb = x * x / (2.0f * knee) * (1.0f / ratio - 1.0f);
            return compressionDb;
        } else if (diff >= halfKnee) {
            // Above knee: full compression
            return diff * (1.0f / ratio - 1.0f);
        }
        return 0.0f; // Below knee: no compression
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float makeupLin = std::pow(10.0f, makeup / 20.0f);
        for (int i = 0; i < n; i++) {
            // Stereo-linked peak detection
            float peak = std::max(std::abs(inL[i]), std::abs(inR[i]));
            float peakDb = (peak > 1e-10f) ? 20.0f * std::log10(peak) : -96.0f;

            // Smooth envelope
            if (peakDb > envDb)
                envDb = peakDb + attackCoeff * (envDb - peakDb);
            else
                envDb = peakDb + releaseCoeff * (envDb - peakDb);

            // Compute gain reduction
            float gainDb = computeGainDb(envDb);
            float gainLin = std::pow(10.0f, gainDb / 20.0f) * makeupLin;

            // Apply with dry/wet mix
            outL[i] = inL[i] * gainLin * mix + inL[i] * (1.0f - mix);
            outR[i] = inR[i] * gainLin * mix + inR[i] * (1.0f - mix);
        }
    }
};

static Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int mono_comp_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}

EMSCRIPTEN_KEEPALIVE void mono_comp_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void mono_comp_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void mono_comp_set_threshold(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].threshold = std::clamp(v, -60.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void mono_comp_set_ratio(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].ratio = std::clamp(v, 1.0f, 20.0f);
}
EMSCRIPTEN_KEEPALIVE void mono_comp_set_attack(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].attack = std::clamp(v, 0.1f, 100.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void mono_comp_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].release = std::clamp(v, 10.0f, 1000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void mono_comp_set_knee(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].knee = std::clamp(v, 0.0f, 24.0f);
}
EMSCRIPTEN_KEEPALIVE void mono_comp_set_makeup(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].makeup = std::clamp(v, 0.0f, 24.0f);
}
EMSCRIPTEN_KEEPALIVE void mono_comp_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
