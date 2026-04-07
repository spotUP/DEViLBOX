/**
 * DragonflyPlateWASM.cpp — Plate reverb for DEViLBOX
 *
 * Simulates the diffuse, bright reverb of a metal plate.
 * Uses a network of allpass filters and delay lines (Dattorro-style).
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;

// ─── Allpass filter ─────────────────────────────────────────────────────────

class Allpass {
    float* buf;
    int size, pos;
    float feedback;
public:
    Allpass() : buf(nullptr), size(0), pos(0), feedback(0.5f) {}
    ~Allpass() { delete[] buf; }
    void init(int sz, float fb) {
        delete[] buf;
        size = sz; buf = new float[sz](); pos = 0; feedback = fb;
    }
    float process(float in) {
        float delayed = buf[pos];
        float out = -in + delayed;
        buf[pos] = in + delayed * feedback;
        pos = (pos + 1) % size;
        return out;
    }
    void clear() { if (buf) std::memset(buf, 0, size * sizeof(float)); pos = 0; }
};

// ─── Comb filter (LBCF) ────────────────────────────────────────────────────

class Comb {
    float* buf;
    int size, pos;
    float feedback, damp, filterState;
public:
    Comb() : buf(nullptr), size(0), pos(0), feedback(0.5f), damp(0.5f), filterState(0) {}
    ~Comb() { delete[] buf; }
    void init(int sz, float fb, float dp) {
        delete[] buf;
        size = sz; buf = new float[sz](); pos = 0; feedback = fb; damp = dp; filterState = 0;
    }
    void setFeedback(float fb) { feedback = fb; }
    void setDamp(float dp) { damp = dp; }
    float process(float in) {
        float out = buf[pos];
        filterState = out * (1.0f - damp) + filterState * damp;
        buf[pos] = in + filterState * feedback;
        pos = (pos + 1) % size;
        return out;
    }
    void clear() { if (buf) std::memset(buf, 0, size * sizeof(float)); filterState = 0; pos = 0; }
};

// ─── Plate Reverb Instance ──────────────────────────────────────────────────

struct PlateReverbInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float decay = 0.7f;       // 0-1
    float damping = 0.5f;     // 0-1
    float predelayMs = 10.0f; // 0-100 ms
    float width = 1.0f;       // 0-1 stereo width
    float brightness = 0.7f;  // 0-1 (high-freq damping)

    // Predelay
    float* predelayBuf = nullptr;
    int predelaySize = 0;
    int predelayPos = 0;

    // Diffusion (4 allpass filters)
    Allpass diffAP[4];

    // Reverb tank: 8 parallel combs feeding into 2 allpasses
    Comb combL[4], combR[4];
    Allpass tankAPL, tankAPR;

    // Output LPF
    float lpfStateL = 0, lpfStateR = 0;

    void init(float sr) {
        sampleRate = sr;
        float scale = sr / 48000.0f;

        // Predelay (max 100ms)
        predelaySize = static_cast<int>(0.1f * sr);
        delete[] predelayBuf;
        predelayBuf = new float[predelaySize]();
        predelayPos = 0;

        // Diffusion allpasses (plate-specific short delays)
        int diffSizes[] = { 142, 107, 379, 277 };
        for (int i = 0; i < 4; i++) {
            diffAP[i].init(static_cast<int>(diffSizes[i] * scale), 0.75f);
        }

        // Parallel comb filters (Freeverb-inspired prime lengths)
        int combSizesL[] = { 1116, 1188, 1277, 1356 };
        int combSizesR[] = { 1139, 1211, 1300, 1379 };
        for (int i = 0; i < 4; i++) {
            combL[i].init(static_cast<int>(combSizesL[i] * scale), decay, damping);
            combR[i].init(static_cast<int>(combSizesR[i] * scale), decay, damping);
        }

        // Tank allpasses
        tankAPL.init(static_cast<int>(556 * scale), 0.5f);
        tankAPR.init(static_cast<int>(441 * scale), 0.5f);

        lpfStateL = lpfStateR = 0;
    }

    ~PlateReverbInstance() { delete[] predelayBuf; }

    void updateParams() {
        for (int i = 0; i < 4; i++) {
            combL[i].setFeedback(decay);
            combR[i].setFeedback(decay);
            combL[i].setDamp(damping);
            combR[i].setDamp(damping);
        }
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        int pdSamples = std::min(static_cast<int>(predelayMs * 0.001f * sampleRate), predelaySize - 1);
        float lpfCoeff = 1.0f - brightness * 0.7f;

        for (int i = 0; i < n; i++) {
            float mono = (inL[i] + inR[i]) * 0.5f;

            // Predelay
            float predelayed = predelayBuf[(predelayPos - pdSamples + predelaySize) % predelaySize];
            predelayBuf[predelayPos] = mono;
            predelayPos = (predelayPos + 1) % predelaySize;

            // Diffusion
            float diff = predelayed;
            for (int d = 0; d < 4; d++) diff = diffAP[d].process(diff);

            // Parallel combs
            float sumL = 0, sumR = 0;
            for (int c = 0; c < 4; c++) {
                sumL += combL[c].process(diff);
                sumR += combR[c].process(diff);
            }
            sumL *= 0.25f;
            sumR *= 0.25f;

            // Tank allpasses
            sumL = tankAPL.process(sumL);
            sumR = tankAPR.process(sumR);

            // Output LPF
            lpfStateL = sumL * (1.0f - lpfCoeff) + lpfStateL * lpfCoeff;
            lpfStateR = sumR * (1.0f - lpfCoeff) + lpfStateR * lpfCoeff;

            // Stereo width
            float mid = (lpfStateL + lpfStateR) * 0.5f;
            float side = (lpfStateL - lpfStateR) * 0.5f * width;
            outL[i] = mid + side;
            outR[i] = mid - side;
        }
    }
};

static PlateReverbInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int dragonfly_plate_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void dragonfly_plate_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void dragonfly_plate_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void dragonfly_plate_set_decay(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].decay = std::clamp(v, 0.0f, 0.99f); instances[h].updateParams(); } }
EMSCRIPTEN_KEEPALIVE void dragonfly_plate_set_damping(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].damping = std::clamp(v, 0.0f, 1.0f); instances[h].updateParams(); } }
EMSCRIPTEN_KEEPALIVE void dragonfly_plate_set_predelay(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].predelayMs = std::clamp(v, 0.0f, 100.0f); }
EMSCRIPTEN_KEEPALIVE void dragonfly_plate_set_width(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].width = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void dragonfly_plate_set_brightness(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].brightness = std::clamp(v, 0.0f, 1.0f); }

} // extern "C"
