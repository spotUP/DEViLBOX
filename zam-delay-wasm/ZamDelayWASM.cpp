#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int MAX_DELAY_SAMPLES = 96000; // 2s at 48kHz

struct ZamDelayInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float time = 500.0f;      // ms (10-2000)
    float feedback = 0.4f;    // 0-0.95
    float lpfFreq = 8000.0f;  // Hz (500-16000)
    float hpfFreq = 60.0f;    // Hz (20-500)
    float invert = 0.0f;      // 0 or 1 (phase invert wet)
    float mix = 0.5f;         // 0-1

    // Delay line
    float bufL[MAX_DELAY_SAMPLES] = {};
    float bufR[MAX_DELAY_SAMPLES] = {};
    int writePos = 0;
    int delaySamples = 0;

    // 1-pole LP filter state
    float lpStateL = 0.0f;
    float lpStateR = 0.0f;
    float lpCoeff = 0.0f;

    // 1-pole HP filter state
    float hpPrevInL = 0.0f;
    float hpPrevInR = 0.0f;
    float hpStateL = 0.0f;
    float hpStateR = 0.0f;
    float hpCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        updateDelay();
        updateFilters();
        writePos = 0;
        lpStateL = lpStateR = 0.0f;
        hpPrevInL = hpPrevInR = 0.0f;
        hpStateL = hpStateR = 0.0f;
        std::memset(bufL, 0, sizeof(bufL));
        std::memset(bufR, 0, sizeof(bufR));
    }

    void updateDelay() {
        delaySamples = std::clamp(static_cast<int>(time * 0.001f * sampleRate), 1, MAX_DELAY_SAMPLES - 1);
    }

    void updateFilters() {
        float fcLP = std::clamp(lpfFreq, 500.0f, 16000.0f);
        lpCoeff = 1.0f - std::exp(-2.0f * 3.14159265f * fcLP / sampleRate);

        float fcHP = std::clamp(hpfFreq, 20.0f, 500.0f);
        hpCoeff = std::exp(-2.0f * 3.14159265f * fcHP / sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        float phaseSign = (invert >= 0.5f) ? -1.0f : 1.0f;

        for (int i = 0; i < n; i++) {
            int readPos = writePos - delaySamples;
            if (readPos < 0) readPos += MAX_DELAY_SAMPLES;

            float delL = bufL[readPos];
            float delR = bufR[readPos];

            // LP filter in feedback path
            lpStateL += lpCoeff * (delL - lpStateL);
            lpStateR += lpCoeff * (delR - lpStateR);

            // HP filter in feedback path (1-pole DC blocker style)
            float hpOutL = hpCoeff * (hpStateL + lpStateL - hpPrevInL);
            hpPrevInL = lpStateL;
            hpStateL = hpOutL;

            float hpOutR = hpCoeff * (hpStateR + lpStateR - hpPrevInR);
            hpPrevInR = lpStateR;
            hpStateR = hpOutR;

            // Write to delay line: input + filtered feedback
            bufL[writePos] = inL[i] + hpOutL * feedback;
            bufR[writePos] = inR[i] + hpOutR * feedback;

            writePos++;
            if (writePos >= MAX_DELAY_SAMPLES) writePos = 0;

            // Output with optional phase inversion of wet signal
            float wetL = delL * phaseSign;
            float wetR = delR * phaseSign;
            outL[i] = inL[i] * (1.0f - mix) + wetL * mix;
            outR[i] = inR[i] * (1.0f - mix) + wetR * mix;
        }
    }
};

static ZamDelayInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int zam_delay_create(int sr) {
    int s = findFree();
    if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void zam_delay_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void zam_delay_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void zam_delay_set_time(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].time = std::clamp(v, 10.0f, 2000.0f);
        instances[h].updateDelay();
    }
}

EMSCRIPTEN_KEEPALIVE void zam_delay_set_feedback(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].feedback = std::clamp(v, 0.0f, 0.95f);
}

EMSCRIPTEN_KEEPALIVE void zam_delay_set_lpf(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lpfFreq = std::clamp(v, 500.0f, 16000.0f);
        instances[h].updateFilters();
    }
}

EMSCRIPTEN_KEEPALIVE void zam_delay_set_hpf(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].hpfFreq = std::clamp(v, 20.0f, 500.0f);
        instances[h].updateFilters();
    }
}

EMSCRIPTEN_KEEPALIVE void zam_delay_set_invert(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].invert = (v >= 0.5f) ? 1.0f : 0.0f;
}

EMSCRIPTEN_KEEPALIVE void zam_delay_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
