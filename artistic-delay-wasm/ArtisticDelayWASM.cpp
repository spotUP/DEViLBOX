#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int MAX_DELAY_SAMPLES = 96000; // 2s at 48kHz

struct ArtisticDelayInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float timeL = 500.0f;     // ms (10-2000) left delay
    float timeR = 375.0f;     // ms (10-2000) right delay
    float feedback = 0.4f;    // 0-0.95
    float pan = 0.5f;         // 0-1 stereo spread (0=mono, 1=full ping-pong)
    float lpf = 12000.0f;     // Hz (200-20000)
    float hpf = 40.0f;        // Hz (20-2000)
    float mix = 0.5f;         // 0-1

    // Delay lines
    float bufL[MAX_DELAY_SAMPLES] = {};
    float bufR[MAX_DELAY_SAMPLES] = {};
    int writePos = 0;
    int delaySamplesL = 0;
    int delaySamplesR = 0;

    // 1-pole LP filter state
    float lpStateL = 0.0f;
    float lpStateR = 0.0f;
    float lpCoeff = 0.0f;

    // 1-pole HP filter state
    float hpStateL = 0.0f;
    float hpStateR = 0.0f;
    float hpCoeff = 0.0f;
    float hpPrevL = 0.0f;
    float hpPrevR = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        updateDelays();
        updateFilters();
        writePos = 0;
        lpStateL = lpStateR = 0.0f;
        hpStateL = hpStateR = 0.0f;
        hpPrevL = hpPrevR = 0.0f;
        std::memset(bufL, 0, sizeof(bufL));
        std::memset(bufR, 0, sizeof(bufR));
    }

    void updateDelays() {
        delaySamplesL = std::clamp(static_cast<int>(timeL * 0.001f * sampleRate), 1, MAX_DELAY_SAMPLES - 1);
        delaySamplesR = std::clamp(static_cast<int>(timeR * 0.001f * sampleRate), 1, MAX_DELAY_SAMPLES - 1);
    }

    void updateFilters() {
        float fcLP = std::clamp(lpf, 200.0f, 20000.0f);
        lpCoeff = 1.0f - std::exp(-2.0f * 3.14159265f * fcLP / sampleRate);

        float fcHP = std::clamp(hpf, 20.0f, 2000.0f);
        hpCoeff = std::exp(-2.0f * 3.14159265f * fcHP / sampleRate);
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            // Read from delay lines
            int readPosL = writePos - delaySamplesL;
            if (readPosL < 0) readPosL += MAX_DELAY_SAMPLES;
            int readPosR = writePos - delaySamplesR;
            if (readPosR < 0) readPosR += MAX_DELAY_SAMPLES;

            float delL = bufL[readPosL];
            float delR = bufR[readPosR];

            // Crossfeed based on pan (stereo spread)
            float crossL = delL * (1.0f - pan * 0.5f) + delR * (pan * 0.5f);
            float crossR = delR * (1.0f - pan * 0.5f) + delL * (pan * 0.5f);

            // LP filter in feedback path
            lpStateL += lpCoeff * (crossL - lpStateL);
            lpStateR += lpCoeff * (crossR - lpStateR);

            // HP filter in feedback path (1-pole)
            float hpOutL = hpCoeff * (hpStateL + lpStateL - hpPrevL);
            hpPrevL = lpStateL;
            hpStateL = hpOutL;

            float hpOutR = hpCoeff * (hpStateR + lpStateR - hpPrevR);
            hpPrevR = lpStateR;
            hpStateR = hpOutR;

            // Write to delay lines
            bufL[writePos] = inL[i] + hpOutL * feedback;
            bufR[writePos] = inR[i] + hpOutR * feedback;

            writePos++;
            if (writePos >= MAX_DELAY_SAMPLES) writePos = 0;

            // Output
            outL[i] = inL[i] * (1.0f - mix) + delL * mix;
            outR[i] = inR[i] * (1.0f - mix) + delR * mix;
        }
    }
};

static ArtisticDelayInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int artistic_delay_create(int sr) {
    int s = findFree();
    if (s < 0) return -1;
    instances[s].active = true;
    instances[s].init(static_cast<float>(sr));
    return s;
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) {
        if (oL && iL) std::memcpy(oL, iL, n * 4);
        if (oR && iR) std::memcpy(oR, iR, n * 4);
        return;
    }
    instances[h].process(iL, iR, oL, oR, n);
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_set_timeL(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].timeL = std::clamp(v, 10.0f, 2000.0f);
        instances[h].updateDelays();
    }
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_set_timeR(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].timeR = std::clamp(v, 10.0f, 2000.0f);
        instances[h].updateDelays();
    }
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_set_feedback(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].feedback = std::clamp(v, 0.0f, 0.95f);
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_set_pan(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].pan = std::clamp(v, 0.0f, 1.0f);
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_set_lpf(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].lpf = std::clamp(v, 200.0f, 20000.0f);
        instances[h].updateFilters();
    }
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_set_hpf(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active) {
        instances[h].hpf = std::clamp(v, 20.0f, 2000.0f);
        instances[h].updateFilters();
    }
}

EMSCRIPTEN_KEEPALIVE void artistic_delay_set_mix(int h, float v) {
    if (h >= 0 && h < MAX_INSTANCES && instances[h].active)
        instances[h].mix = std::clamp(v, 0.0f, 1.0f);
}

} // extern "C"
