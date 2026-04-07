/**
 * TransientDesignerWASM.cpp — Transient shaper for DEViLBOX
 *
 * Detects transients and reshapes attack/sustain envelope.
 * Uses a dual-envelope detector (fast/slow) to isolate transients.
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

struct TransientDesignerInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float attack = 0.0f;    // -1 to 1 (negative = soften, positive = enhance)
    float sustain = 0.0f;   // -1 to 1
    float output = 1.0f;    // 0-2 output gain

    // Envelope followers
    float fastEnv = 0.0f;
    float slowEnv = 0.0f;
    float fastAttack = 0.0f, fastRelease = 0.0f;
    float slowAttack = 0.0f, slowRelease = 0.0f;

    void init(float sr) {
        sampleRate = sr;
        fastEnv = slowEnv = 0.0f;
        // Fast envelope: 0.1ms attack, 5ms release
        fastAttack  = std::exp(-1.0f / (0.0001f * sr));
        fastRelease = std::exp(-1.0f / (0.005f * sr));
        // Slow envelope: 20ms attack, 200ms release
        slowAttack  = std::exp(-1.0f / (0.02f * sr));
        slowRelease = std::exp(-1.0f / (0.2f * sr));
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        for (int i = 0; i < n; i++) {
            float peak = std::max(std::abs(inL[i]), std::abs(inR[i]));

            // Fast envelope (tracks transients)
            if (peak > fastEnv)
                fastEnv = peak + fastAttack * (fastEnv - peak);
            else
                fastEnv = peak + fastRelease * (fastEnv - peak);

            // Slow envelope (tracks sustain)
            if (peak > slowEnv)
                slowEnv = peak + slowAttack * (slowEnv - peak);
            else
                slowEnv = peak + slowRelease * (slowEnv - peak);

            // Transient detection: fast - slow = transient component
            float transient = fastEnv - slowEnv;
            float sustainLevel = slowEnv;

            // Compute gain modification
            float gain = 1.0f;

            // Attack shaping: boost/cut during transients
            if (transient > 0.001f) {
                gain += attack * transient * 10.0f;
            }

            // Sustain shaping: boost/cut during sustained portions
            if (sustainLevel > 0.001f && transient < 0.01f) {
                float sustainMod = sustain * 2.0f;
                if (sustainMod > 0.0f) {
                    gain += sustainMod * 0.5f;
                } else {
                    gain *= (1.0f + sustainMod * 0.8f);
                }
            }

            gain = std::max(gain, 0.0f) * output;

            outL[i] = inL[i] * gain;
            outR[i] = inR[i] * gain;
        }
    }
};

static TransientDesignerInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {
EMSCRIPTEN_KEEPALIVE int transient_designer_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void transient_designer_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void transient_designer_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void transient_designer_set_attack(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].attack = std::clamp(v, -1.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void transient_designer_set_sustain(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].sustain = std::clamp(v, -1.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void transient_designer_set_output(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].output = std::clamp(v, 0.0f, 2.0f); }
} // extern "C"
