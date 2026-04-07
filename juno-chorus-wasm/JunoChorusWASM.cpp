/**
 * JunoChorusWASM.cpp — Juno-60 BBD chorus for DEViLBOX
 *
 * Emulates the iconic Roland Juno-60 chorus using two parallel
 * bucket-brigade device (BBD) delay lines with triangle-wave LFO modulation.
 *
 * Mode I:  Single delay, slow rate (~0.513 Hz)
 * Mode II: Single delay, fast rate (~0.863 Hz)
 * Mode I+II: Both delays with detuned LFOs for lush stereo spread
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr float PI = 3.14159265358979323846f;

// ─── BBD Delay Line ─────────────────────────────────────────────────────────

class BBDDelay {
    float* buf;
    int size;
    float writePos;
public:
    BBDDelay() : buf(nullptr), size(0), writePos(0) {}
    ~BBDDelay() { delete[] buf; }
    void init(int maxSamples) {
        delete[] buf;
        size = maxSamples;
        buf = new float[size]();
        writePos = 0;
    }
    // Hermite interpolation for smooth modulated reads
    float readHermite(float delaySamples) const {
        float readPos = writePos - delaySamples;
        while (readPos < 0) readPos += size;
        int i0 = (static_cast<int>(readPos) - 1 + size) % size;
        int i1 = static_cast<int>(readPos) % size;
        int i2 = (i1 + 1) % size;
        int i3 = (i2 + 1) % size;
        float frac = readPos - std::floor(readPos);
        float y0 = buf[i0], y1 = buf[i1], y2 = buf[i2], y3 = buf[i3];
        float c0 = y1;
        float c1 = 0.5f * (y2 - y0);
        float c2 = y0 - 2.5f * y1 + 2.0f * y2 - 0.5f * y3;
        float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);
        return ((c3 * frac + c2) * frac + c1) * frac + c0;
    }
    void write(float sample) {
        int wp = static_cast<int>(writePos) % size;
        buf[wp] = sample;
        writePos = static_cast<float>((wp + 1) % size);
    }
    void clear() { if (buf) std::memset(buf, 0, size * sizeof(float)); writePos = 0; }
};

// ─── Triangle LFO ───────────────────────────────────────────────────────────

class TriLFO {
    float phase;
    float phaseInc;
public:
    TriLFO() : phase(0), phaseInc(0) {}
    void setRate(float hz, float sampleRate) {
        phaseInc = hz / sampleRate;
    }
    void setPhase(float p) { phase = p; }
    float tick() {
        float out = 4.0f * std::fabs(phase - 0.5f) - 1.0f; // triangle: -1..+1
        phase += phaseInc;
        if (phase >= 1.0f) phase -= 1.0f;
        return out;
    }
};

// ─── Juno Chorus Instance ───────────────────────────────────────────────────

struct JunoChorusInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float rate = 0.513f;   // LFO rate in Hz
    float depth = 0.5f;    // 0-1, modulation depth
    int mode = 0;          // 0=I, 1=II, 2=I+II
    float mix = 0.5f;      // 0-1, dry/wet

    // Two BBD delay lines and LFOs
    BBDDelay bbd1, bbd2;
    TriLFO lfo1, lfo2;

    // Center delay in samples (approx 2.5ms)
    float centerDelay;
    // Max modulation excursion in samples (approx 1.5ms)
    float modDepthSamples;

    // DC blocker state
    float dcIn1L = 0, dcOut1L = 0;
    float dcIn1R = 0, dcOut1R = 0;

    void init(float sr) {
        sampleRate = sr;

        // BBD range: 0.5ms to 5ms → max delay buffer = 5ms
        int maxDelay = static_cast<int>(0.005f * sr) + 16;
        bbd1.init(maxDelay);
        bbd2.init(maxDelay);

        centerDelay = 0.0025f * sr; // 2.5ms center
        modDepthSamples = 0.0015f * sr; // ±1.5ms

        lfo1.setRate(rate, sr);
        lfo1.setPhase(0.0f);
        lfo2.setRate(rate * 0.97f, sr); // slightly detuned
        lfo2.setPhase(0.5f); // offset phase for stereo spread

        updateLFORates();
    }

    void updateLFORates() {
        float rate1, rate2;
        switch (mode) {
            case 0: // Mode I — slow
                rate1 = 0.513f;
                rate2 = 0.513f;
                break;
            case 1: // Mode II — fast
                rate1 = 0.863f;
                rate2 = 0.863f;
                break;
            default: // Mode I+II — both, detuned
                rate1 = 0.513f;
                rate2 = 0.863f;
                break;
        }
        // User rate parameter scales the base rates
        float rateScale = rate / 0.513f;
        lfo1.setRate(rate1 * rateScale, sampleRate);
        lfo2.setRate(rate2 * rateScale, sampleRate);
    }

    float dcBlock(float in, float& prevIn, float& prevOut) {
        float out = in - prevIn + 0.995f * prevOut;
        prevIn = in;
        prevOut = out;
        return out;
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float wet = mix;
        float dry = 1.0f - mix;
        float modAmt = depth * modDepthSamples;

        for (int i = 0; i < n; i++) {
            float monoIn = (inL[i] + inR[i]) * 0.5f;

            // LFO modulation
            float mod1 = lfo1.tick() * modAmt;
            float mod2 = lfo2.tick() * modAmt;

            float delay1 = centerDelay + mod1;
            float delay2 = centerDelay + mod2;
            delay1 = std::clamp(delay1, 1.0f, static_cast<float>(static_cast<int>(0.005f * sampleRate)));
            delay2 = std::clamp(delay2, 1.0f, static_cast<float>(static_cast<int>(0.005f * sampleRate)));

            // Write to both BBDs
            bbd1.write(monoIn);
            bbd2.write(monoIn);

            float wet1 = bbd1.readHermite(delay1);
            float wet2 = bbd2.readHermite(delay2);

            // DC blocking
            wet1 = dcBlock(wet1, dcIn1L, dcOut1L);
            wet2 = dcBlock(wet2, dcIn1R, dcOut1R);

            float wetL, wetR;
            switch (mode) {
                case 0: // Mode I — mono chorus
                    wetL = wetR = wet1;
                    break;
                case 1: // Mode II — mono chorus, faster
                    wetL = wetR = wet1;
                    break;
                default: // Mode I+II — stereo
                    wetL = wet1;
                    wetR = wet2;
                    break;
            }

            outL[i] = inL[i] * dry + wetL * wet;
            outR[i] = inR[i] * dry + wetR * wet;
        }
    }
};

static JunoChorusInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int juno_chorus_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void juno_chorus_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void juno_chorus_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void juno_chorus_set_rate(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].rate = std::clamp(v, 0.5f, 8.0f);
        instances[h].updateLFORates();
    }
}
EMSCRIPTEN_KEEPALIVE void juno_chorus_set_depth(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].depth = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void juno_chorus_set_mode(int h, int v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].mode = std::clamp(v, 0, 2); instances[h].updateLFORates(); } }
EMSCRIPTEN_KEEPALIVE void juno_chorus_set_mix(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f); }

} // extern "C"
