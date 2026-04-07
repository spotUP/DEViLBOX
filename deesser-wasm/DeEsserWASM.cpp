/**
 * DeEsserWASM.cpp — De-esser (sibilance reduction) for DEViLBOX
 *
 * Uses a sidechain bandpass filter to detect sibilance in the 2-10kHz range,
 * an envelope follower to track the sibilance energy, and a gain reduction
 * stage that attenuates when sibilance exceeds the threshold.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

// ─── Biquad bandpass for sidechain detection ────────────────────────────────

struct BiquadBP {
    float b0, b1, b2, a1, a2;
    float z1L, z2L, z1R, z2R;

    BiquadBP() : b0(0), b1(0), b2(0), a1(0), a2(0),
                 z1L(0), z2L(0), z1R(0), z2R(0) {}

    void setBandpass(float freq, float Q, float sampleRate) {
        float w0 = 2.0f * PI * freq / sampleRate;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * Q);
        b0 = alpha;
        b1 = 0.0f;
        b2 = -alpha;
        float a0 = 1.0f + alpha;
        a1 = -2.0f * cosw;
        a2 = 1.0f - alpha;
        float inv = 1.0f / a0;
        b0 *= inv; b1 *= inv; b2 *= inv; a1 *= inv; a2 *= inv;
    }

    float processL(float in) {
        float out = b0 * in + z1L;
        z1L = b1 * in - a1 * out + z2L;
        z2L = b2 * in - a2 * out;
        return out;
    }

    float processR(float in) {
        float out = b0 * in + z1R;
        z1R = b1 * in - a1 * out + z2R;
        z2R = b2 * in - a2 * out;
        return out;
    }

    void clear() { z1L = z2L = z1R = z2R = 0; }
};

// ─── De-esser Instance ──────────────────────────────────────────────────────

struct DeEsserInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float frequency = 6000.0f;   // 2000-10000 Hz center
    float bandwidth = 1.0f;      // 0.1-2.0 Q factor
    float thresholdDb = -20.0f;  // -40..0 dB
    float ratio = 4.0f;          // 1-10 compression ratio
    float attackMs = 1.0f;       // 0.1-10 ms
    float releaseMs = 50.0f;     // 10-200 ms

    // Sidechain bandpass filter
    BiquadBP scFilterL, scFilterR;

    // Envelope follower
    float envL = 0, envR = 0;
    float attackCoeff, releaseCoeff;

    // Gain smoothing
    float smoothGainL = 1.0f, smoothGainR = 1.0f;
    float gainSmoothCoeff;

    void init(float sr) {
        sampleRate = sr;
        envL = envR = 0;
        smoothGainL = smoothGainR = 1.0f;
        updateCoeffs();
    }

    void updateCoeffs() {
        scFilterL.setBandpass(frequency, bandwidth, sampleRate);
        scFilterR.setBandpass(frequency, bandwidth, sampleRate);

        attackCoeff = 1.0f - std::exp(-1.0f / (sampleRate * attackMs * 0.001f));
        releaseCoeff = 1.0f - std::exp(-1.0f / (sampleRate * releaseMs * 0.001f));
        // Gain smoothing (1ms)
        gainSmoothCoeff = 1.0f - std::exp(-1.0f / (sampleRate * 0.001f));
    }

    float computeGainReduction(float envDb) {
        if (envDb <= thresholdDb) return 1.0f; // below threshold, no reduction
        float overDb = envDb - thresholdDb;
        float reducedDb = overDb * (1.0f - 1.0f / ratio);
        return std::pow(10.0f, -reducedDb / 20.0f);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            // Sidechain: bandpass filter the input
            float scL = scFilterL.processL(inL[i]);
            float scR = scFilterR.processR(inR[i]);

            // Envelope follower on sidechain
            float absL = std::fabs(scL);
            float absR = std::fabs(scR);

            float coeffL = absL > envL ? attackCoeff : releaseCoeff;
            float coeffR = absR > envR ? attackCoeff : releaseCoeff;
            envL += coeffL * (absL - envL);
            envR += coeffR * (absR - envR);

            // Convert envelope to dB
            float envDbL = envL > 1e-10f ? 20.0f * std::log10(envL) : -100.0f;
            float envDbR = envR > 1e-10f ? 20.0f * std::log10(envR) : -100.0f;

            // Compute gain reduction
            float targetGainL = computeGainReduction(envDbL);
            float targetGainR = computeGainReduction(envDbR);

            // Smooth gain changes to avoid clicks
            smoothGainL += gainSmoothCoeff * (targetGainL - smoothGainL);
            smoothGainR += gainSmoothCoeff * (targetGainR - smoothGainR);

            // Apply gain reduction
            outL[i] = inL[i] * smoothGainL;
            outR[i] = inR[i] * smoothGainR;
        }
    }
};

static DeEsserInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int deesser_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void deesser_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void deesser_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void deesser_set_frequency(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].frequency = std::clamp(v, 2000.0f, 10000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void deesser_set_bandwidth(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].bandwidth = std::clamp(v, 0.1f, 2.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void deesser_set_threshold(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].thresholdDb = std::clamp(v, -40.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void deesser_set_ratio(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].ratio = std::clamp(v, 1.0f, 10.0f);
}
EMSCRIPTEN_KEEPALIVE void deesser_set_attack(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].attackMs = std::clamp(v, 0.1f, 10.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void deesser_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].releaseMs = std::clamp(v, 10.0f, 200.0f); instances[h].updateCoeffs(); }
}

} // extern "C"
