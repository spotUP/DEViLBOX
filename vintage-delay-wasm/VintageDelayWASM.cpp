#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int MAX_DELAY_SAMPLES = 96000; // 2s at 48kHz

struct VintageDelayInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float time = 400.0f;      // ms (10-2000)
    float feedback = 0.4f;    // 0-0.95
    float cutoff = 3000.0f;   // Hz (200-8000) LP in feedback
    float drive = 0.3f;       // 0-1 saturation amount
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
        float fc = std::clamp(cutoff, 200.0f, 8000.0f);
        float x = std::exp(-2.0f * 3.14159265f * fc / sampleRate);
        lpCoeff = 1.0f - x;
    }

    inline float softClip(float x, float drv) {
        if (drv < 0.001f) return x;
        float driven = x * (1.0f + drv * 3.0f);
        return std::tanh(driven) / (1.0f + drv * 2.0f);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            // Read from delay line
            int readPos = writePos - delaySamples;
            if (readPos < 0) readPos += MAX_DELAY_SAMPLES;

            float delL = bufL[readPos];
            float delR = bufR[readPos];

            // LP filter in feedback path
            lpStateL += lpCoeff * (delL - lpStateL);
            lpStateR += lpCoeff * (delR - lpStateR);
            float filtL = lpStateL;
            float filtR = lpStateR;

            // Soft saturation
            filtL = softClip(filtL, drive);
            filtR = softClip(filtR, drive);

            // Write to delay line: input + filtered feedback
            bufL[writePos] = inL[i] + filtL * feedback;
            bufR[writePos] = inR[i] + filtR * feedback;

            writePos++;
            if (writePos >= MAX_DELAY_SAMPLES) writePos = 0;

            // Output mix
            outL[i] = inL[i] * (1.0f - mix) + delL * mix;
            outR[i] = inR[i] * (1.0f - mix) + delR * mix;
        }
    }
};

static VintageDelayInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int vintage_delay_create(int sr) {
    int s = findFree();
    if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void vintage_delay_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void vintage_delay_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void vintage_delay_set_time(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].time = std::clamp(v, 10.0f, 2000.0f);
        instances[h].updateDelay();
    }
}

EMSCRIPTEN_KEEPALIVE void vintage_delay_set_feedback(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].feedback = std::clamp(v, 0.0f, 0.95f);
}

EMSCRIPTEN_KEEPALIVE void vintage_delay_set_cutoff(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].cutoff = std::clamp(v, 200.0f, 8000.0f);
        instances[h].updateFilter();
    }
}

EMSCRIPTEN_KEEPALIVE void vintage_delay_set_drive(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].drive = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void vintage_delay_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
