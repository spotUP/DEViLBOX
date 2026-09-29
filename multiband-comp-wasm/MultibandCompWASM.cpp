/**
 * MultibandCompWASM.cpp — 3-band multiband compressor for DEViLBOX
 *
 * Splits signal into low/mid/high bands using Linkwitz-Riley crossovers,
 * applies independent compression to each band, then sums.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include "lr4_crossover.h"
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

// ─── Linkwitz-Riley 2nd-order (cascaded Butterworth) ────────────────────────


// ─── Band Compressor ────────────────────────────────────────────────────────

struct BandCompressor {
    float threshold = -20.0f; // dB
    float ratio = 4.0f;
    float attackMs = 5.0f;
    float releaseMs = 50.0f;
    float makeupGain = 0.0f;  // dB

    float envelope = 0.0f;
    float attackCoeff = 0.0f;
    float releaseCoeff = 0.0f;

    void updateCoeffs(float sr) {
        attackCoeff = (attackMs > 0.01f) ? std::exp(-1.0f / (attackMs * 0.001f * sr)) : 0.0f;
        releaseCoeff = (releaseMs > 0.01f) ? std::exp(-1.0f / (releaseMs * 0.001f * sr)) : 0.0f;
    }

    float process(float in) {
        float absIn = std::abs(in);
        // Envelope follower
        if (absIn > envelope)
            envelope = absIn + attackCoeff * (envelope - absIn);
        else
            envelope = absIn + releaseCoeff * (envelope - absIn);

        // Gain computation
        float envDb = (envelope > 1e-10f) ? 20.0f * std::log10(envelope) : -100.0f;
        float gain = 0.0f;
        if (envDb > threshold) {
            float excess = envDb - threshold;
            float compressed = excess / ratio;
            gain = compressed - excess; // negative dB = reduction
        }
        gain += makeupGain;
        return in * std::pow(10.0f, gain / 20.0f);
    }

    void reset() { envelope = 0.0f; }
};

// ─── Multiband Compressor Instance ──────────────────────────────────────────

struct MultibandCompInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Crossover frequencies
    float lowCrossover = 200.0f;
    float highCrossover = 3000.0f;

    // Flat-summing LR4 band split per channel (wasm-common/lr4_crossover.h)
    lr4::Split3 splitL, splitR;

    // Band compressors (stereo linked)
    BandCompressor compLow, compMid, compHigh;

    // Band gains
    float lowGain = 1.0f, midGain = 1.0f, highGain = 1.0f;

    void init(float sr) {
        sampleRate = sr;
        compLow.updateCoeffs(sr);
        compMid.updateCoeffs(sr);
        compHigh.updateCoeffs(sr);
        updateCrossover();
        reset();
    }

    void updateCrossover() {
        splitL.set(lowCrossover, highCrossover, sampleRate);
        splitR.set(lowCrossover, highCrossover, sampleRate);
    }

    void reset() {
        splitL.reset(); splitR.reset();
        compLow.reset(); compMid.reset(); compHigh.reset();
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            // Split into 3 bands
            float lowL, midL, highL, lowR, midR, highR;
            splitL.split(inL[i], lowL, midL, highL);
            splitR.split(inR[i], lowR, midR, highR);

            // Compress each band (stereo linked via max)
            float lowPeak = std::max(std::abs(lowL), std::abs(lowR));
            float midPeak = std::max(std::abs(midL), std::abs(midR));
            float highPeak = std::max(std::abs(highL), std::abs(highR));

            // Use mono sidechain for stereo link
            float lowComp = (lowPeak > 1e-10f) ? compLow.process(lowPeak) / lowPeak : 1.0f;
            float midComp = (midPeak > 1e-10f) ? compMid.process(midPeak) / midPeak : 1.0f;
            float highComp = (highPeak > 1e-10f) ? compHigh.process(highPeak) / highPeak : 1.0f;

            // Apply compression + band gain and sum
            outL[i] = lowL * lowComp * lowGain + midL * midComp * midGain + highL * highComp * highGain;
            outR[i] = lowR * lowComp * lowGain + midR * midComp * midGain + highR * highComp * highGain;
        }
    }
};

static MultibandCompInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {
EMSCRIPTEN_KEEPALIVE int multiband_comp_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void multiband_comp_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void multiband_comp_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_low_crossover(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lowCrossover = std::clamp(v, 20.0f, 1000.0f); instances[h].updateCrossover(); } }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_high_crossover(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].highCrossover = std::clamp(v, 500.0f, 16000.0f); instances[h].updateCrossover(); } }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_low_threshold(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].compLow.threshold = std::clamp(v, -60.0f, 0.0f); }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_mid_threshold(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].compMid.threshold = std::clamp(v, -60.0f, 0.0f); }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_high_threshold(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].compHigh.threshold = std::clamp(v, -60.0f, 0.0f); }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_low_ratio(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].compLow.ratio = std::clamp(v, 1.0f, 20.0f); }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_mid_ratio(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].compMid.ratio = std::clamp(v, 1.0f, 20.0f); }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_high_ratio(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].compHigh.ratio = std::clamp(v, 1.0f, 20.0f); }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_low_gain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lowGain = std::clamp(v, 0.0f, 4.0f); }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_mid_gain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].midGain = std::clamp(v, 0.0f, 4.0f); }
EMSCRIPTEN_KEEPALIVE void multiband_comp_set_high_gain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].highGain = std::clamp(v, 0.0f, 4.0f); }
} // extern "C"
