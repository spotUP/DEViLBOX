#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int MAX_DELAY_SAMPLES = 5760; // 120ms at 48kHz

struct SlapbackDelayInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float time = 60.0f;     // ms (10-120)
    float feedback = 0.1f;  // 0-0.5
    float tone = 4000.0f;   // Hz (200-8000) LP cutoff
    float mix = 0.5f;       // 0-1

    // Delay line
    float bufL[MAX_DELAY_SAMPLES] = {};
    float bufR[MAX_DELAY_SAMPLES] = {};
    int writePos = 0;
    int delaySamples = 0;

    // 1-pole LP filter state
    float lpStateL = 0.0f;
    float lpStateR = 0.0f;
    float lpCoeff = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        updateDelay();
        updateFilter();
        writePos = 0;
        lpStateL = lpStateR = 0.0f;
        std::memset(bufL, 0, sizeof(bufL));
        std::memset(bufR, 0, sizeof(bufR));
    }

    void updateDelay() {
        delaySamples = std::clamp(static_cast<int>(time * 0.001f * sampleRate), 1, MAX_DELAY_SAMPLES - 1);
    }

    void updateFilter() {
        float fc = std::clamp(tone, 200.0f, 8000.0f);
        lpCoeff = 1.0f - std::exp(-2.0f * 3.14159265f * fc / sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            int readPos = writePos - delaySamples;
            if (readPos < 0) readPos += MAX_DELAY_SAMPLES;

            float delL = bufL[readPos];
            float delR = bufR[readPos];

            // LP filter on delayed signal
            lpStateL += lpCoeff * (delL - lpStateL);
            lpStateR += lpCoeff * (delR - lpStateR);

            // Write input + filtered feedback
            bufL[writePos] = inL[i] + lpStateL * feedback;
            bufR[writePos] = inR[i] + lpStateR * feedback;

            writePos++;
            if (writePos >= MAX_DELAY_SAMPLES) writePos = 0;

            outL[i] = inL[i] * (1.0f - mix) + delL * mix;
            outR[i] = inR[i] * (1.0f - mix) + delR * mix;
        }
    }
};

static SlapbackDelayInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int slapback_delay_create(int sr) {
    int s = findFree();
    if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void slapback_delay_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void slapback_delay_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void slapback_delay_set_time(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].time = std::clamp(v, 10.0f, 120.0f);
        instances[h].updateDelay();
    }
}

EMSCRIPTEN_KEEPALIVE void slapback_delay_set_feedback(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].feedback = std::clamp(v, 0.0f, 0.5f);
}

EMSCRIPTEN_KEEPALIVE void slapback_delay_set_tone(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].tone = std::clamp(v, 200.0f, 8000.0f);
        instances[h].updateFilter();
    }
}

EMSCRIPTEN_KEEPALIVE void slapback_delay_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
