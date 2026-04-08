/**
 * SidechainLimiterWASM.cpp — Limiter with sidechain frequency weighting.
 * Bell filter on sidechain determines what frequencies trigger limiting.
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265f;
static constexpr int LOOKAHEAD = 64;

struct BellFilter {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void setParams(float freq, float gainDb, float sr) {
        float A = std::pow(10.0f, gainDb / 40.0f);
        float w0 = 2.0f * PI * freq / sr;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * 1.0f); // Q=1
        float a0inv = 1.0f / (1.0f + alpha / A);
        b0 = (1.0f + alpha * A) * a0inv;
        b1 = (-2.0f * cosw) * a0inv;
        b2 = (1.0f - alpha * A) * a0inv;
        a1 = (-2.0f * cosw) * a0inv;
        a2 = (1.0f - alpha / A) * a0inv;
    }

    float process(float x) {
        float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    }

    void reset() { x1 = x2 = y1 = y2 = 0; }
};

struct Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    float ceiling  = -1.0f;    // dB (-24..0)
    float release  = 50.0f;    // ms (10..500)
    float scFreq   = 1000.0f;  // Hz (20..20000)
    float scGain   = 0.0f;     // dB (-12..12)
    float mix      = 1.0f;

    // State
    float delayL[LOOKAHEAD] = {};
    float delayR[LOOKAHEAD] = {};
    int writePos = 0;
    float gainReduction = 1.0f;
    float releaseCoeff = 0.0f;
    BellFilter scFilterL, scFilterR;

    void init(float sr) {
        sampleRate = sr;
        std::memset(delayL, 0, sizeof(delayL));
        std::memset(delayR, 0, sizeof(delayR));
        writePos = 0;
        gainReduction = 1.0f;
        scFilterL.reset(); scFilterR.reset();
        updateCoeffs();
    }

    void updateCoeffs() {
        releaseCoeff = (release > 0.001f) ? std::exp(-1.0f / (release * 0.001f * sampleRate)) : 0.0f;
        scFilterL.setParams(scFreq, scGain, sampleRate);
        scFilterR.setParams(scFreq, scGain, sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        processExt(inL, inR, inL, inR, outL, outR, n);
    }

    void processExt(const float* inL, const float* inR, const float* scInL, const float* scInR, float* outL, float* outR, int n) {
        float ceilLin = std::pow(10.0f, ceiling / 20.0f);

        for (int i = 0; i < n; i++) {
            // Sidechain: frequency-weighted version of sidechain input
            float scL = scFilterL.process(scInL[i]);
            float scR = scFilterR.process(scInR[i]);
            float scPeak = std::max(std::abs(scL), std::abs(scR));

            // Desired gain based on sidechain
            float desiredGain = (scPeak > ceilLin && scPeak > 0.0f) ? ceilLin / scPeak : 1.0f;

            // Instant attack, smooth release
            if (desiredGain < gainReduction)
                gainReduction = desiredGain;
            else
                gainReduction = desiredGain + releaseCoeff * (gainReduction - desiredGain);

            float g = std::min(gainReduction, 1.0f);

            // Read delayed audio
            float dL = delayL[writePos];
            float dR = delayR[writePos];
            delayL[writePos] = inL[i];
            delayR[writePos] = inR[i];
            writePos = (writePos + 1) % LOOKAHEAD;

            float wetL = dL * g;
            float wetR = dR * g;

            outL[i] = wetL * mix + inL[i] * (1.0f - mix);
            outR[i] = wetR * mix + inR[i] * (1.0f - mix);
        }
    }
};

static Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int sidechain_limiter_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void sidechain_limiter_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}
EMSCRIPTEN_KEEPALIVE void sidechain_limiter_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void sidechain_limiter_process_ext(int h, float* iL, float* iR, float* scL, float* scR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].processExt(iL, iR, scL, scR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void sidechain_limiter_set_ceiling(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].ceiling = std::clamp(v, -24.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void sidechain_limiter_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].release = std::clamp(v, 10.0f, 500.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void sidechain_limiter_set_scFreq(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].scFreq = std::clamp(v, 20.0f, 20000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void sidechain_limiter_set_scGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].scGain = std::clamp(v, -12.0f, 12.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void sidechain_limiter_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
