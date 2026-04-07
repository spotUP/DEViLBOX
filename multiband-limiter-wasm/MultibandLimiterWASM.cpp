/**
 * MultibandLimiterWASM.cpp — 3-band crossover + per-band brick-wall limiter with lookahead.
 * LR2 crossover, 64-sample lookahead per band, ceiling limiter, band gain.
 */
#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265f;
static constexpr int LOOKAHEAD = 64;

struct LR2Filter {
    float b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    void setLowpass(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * 0.7071f);
        float a0inv = 1.0f / (1.0f + alpha);
        b0 = ((1.0f - cosw) * 0.5f) * a0inv;
        b1 = (1.0f - cosw) * a0inv; b2 = b0;
        a1 = (-2.0f * cosw) * a0inv; a2 = (1.0f - alpha) * a0inv;
    }

    void setHighpass(float freq, float sr) {
        float w0 = 2.0f * PI * freq / sr;
        float cosw = std::cos(w0), sinw = std::sin(w0);
        float alpha = sinw / (2.0f * 0.7071f);
        float a0inv = 1.0f / (1.0f + alpha);
        b0 = ((1.0f + cosw) * 0.5f) * a0inv;
        b1 = -(1.0f + cosw) * a0inv; b2 = b0;
        a1 = (-2.0f * cosw) * a0inv; a2 = (1.0f - alpha) * a0inv;
    }

    float process(float x) {
        float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    }

    void reset() { x1 = x2 = y1 = y2 = 0; }
};

struct BandLimiter {
    float delayL[LOOKAHEAD] = {};
    float delayR[LOOKAHEAD] = {};
    int writePos = 0;
    float gainReduction = 1.0f;

    void reset() {
        std::memset(delayL, 0, sizeof(delayL));
        std::memset(delayR, 0, sizeof(delayR));
        writePos = 0;
        gainReduction = 1.0f;
    }

    void processFrame(float inL, float inR, float& outL, float& outR,
                      float ceilingLin, float bandGain, float releaseCoeff) {
        // Read delayed
        outL = delayL[writePos] * bandGain;
        outR = delayR[writePos] * bandGain;

        // Write new
        delayL[writePos] = inL;
        delayR[writePos] = inR;
        writePos = (writePos + 1) % LOOKAHEAD;

        // Peak detection on post-gain signal
        float peak = std::max(std::abs(outL), std::abs(outR));
        float desiredGain = (peak > ceilingLin && peak > 0.0f) ? ceilingLin / peak : 1.0f;

        // Instant attack, smooth release
        if (desiredGain < gainReduction)
            gainReduction = desiredGain;
        else
            gainReduction = desiredGain + releaseCoeff * (gainReduction - desiredGain);

        float g = std::min(gainReduction, 1.0f);
        outL *= g;
        outR *= g;
    }
};

struct Instance {
    bool active = false;
    float sampleRate = 48000.0f;

    float lowCross  = 200.0f;
    float highCross = 3000.0f;
    float lowCeil   = -1.0f;   // dB (-24..0)
    float midCeil   = -1.0f;
    float highCeil  = -1.0f;
    float lowGain   = 1.0f;    // linear (0..4)
    float midGain   = 1.0f;
    float highGain  = 1.0f;
    float release   = 50.0f;   // ms (10..500)
    float mix       = 1.0f;

    LR2Filter lpLowL, lpLowR, hpLowL, hpLowR;
    LR2Filter lpHighL, lpHighR, hpHighL, hpHighR;
    BandLimiter bands[3];
    float releaseCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        for (auto& b : bands) b.reset();
        resetFilters();
        updateCoeffs();
    }

    void resetFilters() {
        lpLowL.reset(); lpLowR.reset(); hpLowL.reset(); hpLowR.reset();
        lpHighL.reset(); lpHighR.reset(); hpHighL.reset(); hpHighR.reset();
    }

    void updateCoeffs() {
        releaseCoeff = (release > 0.001f) ? std::exp(-1.0f / (release * 0.001f * sampleRate)) : 0.0f;
        lpLowL.setLowpass(lowCross, sampleRate); lpLowR.setLowpass(lowCross, sampleRate);
        hpLowL.setHighpass(lowCross, sampleRate); hpLowR.setHighpass(lowCross, sampleRate);
        lpHighL.setLowpass(highCross, sampleRate); lpHighR.setLowpass(highCross, sampleRate);
        hpHighL.setHighpass(highCross, sampleRate); hpHighR.setHighpass(highCross, sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float lowCeilLin  = std::pow(10.0f, lowCeil  / 20.0f);
        float midCeilLin  = std::pow(10.0f, midCeil  / 20.0f);
        float highCeilLin = std::pow(10.0f, highCeil / 20.0f);

        for (int i = 0; i < n; i++) {
            float ll = lpLowL.process(inL[i]);
            float lr = lpLowR.process(inR[i]);
            float restL = hpLowL.process(inL[i]);
            float restR = hpLowR.process(inR[i]);
            float ml = lpHighL.process(restL);
            float mr = lpHighR.process(restR);
            float hl = hpHighL.process(restL);
            float hr = hpHighR.process(restR);

            float bll, blr, bml, bmr, bhl, bhr;
            bands[0].processFrame(ll, lr, bll, blr, lowCeilLin,  lowGain,  releaseCoeff);
            bands[1].processFrame(ml, mr, bml, bmr, midCeilLin,  midGain,  releaseCoeff);
            bands[2].processFrame(hl, hr, bhl, bhr, highCeilLin, highGain, releaseCoeff);

            float wetL = bll + bml + bhl;
            float wetR = blr + bmr + bhr;

            outL[i] = wetL * mix + inL[i] * (1.0f - mix);
            outR[i] = wetR * mix + inR[i] * (1.0f - mix);
        }
    }
};

static Instance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int multiband_limiter_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4); if (oR && iR) std::memcpy(oR, iR, n * 4); return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_lowCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].lowCross = std::clamp(v, 20.0f, 1000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_highCross(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].highCross = std::clamp(v, 500.0f, 16000.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_lowCeil(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lowCeil = std::clamp(v, -24.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_midCeil(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].midCeil = std::clamp(v, -24.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_highCeil(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].highCeil = std::clamp(v, -24.0f, 0.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_lowGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].lowGain = std::clamp(v, 0.0f, 4.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_midGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].midGain = std::clamp(v, 0.0f, 4.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_highGain(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].highGain = std::clamp(v, 0.0f, 4.0f);
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_release(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].release = std::clamp(v, 10.0f, 500.0f); instances[h].updateCoeffs(); }
}
EMSCRIPTEN_KEEPALIVE void multiband_limiter_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
