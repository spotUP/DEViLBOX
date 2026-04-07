/**
 * DragonflyRoomWASM.cpp — Room reverb for DEViLBOX
 *
 * Simulates small to medium rooms with strong early reflections
 * and faster decay. Shorter delay lines than the plate/hall reverbs.
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

// ─── Early reflections tap delay ────────────────────────────────────────────

class EarlyReflections {
    float* buf;
    int size, pos;
    static constexpr int NUM_TAPS = 8;
    int tapDelays[NUM_TAPS];
    float tapGains[NUM_TAPS];
public:
    EarlyReflections() : buf(nullptr), size(0), pos(0) {}
    ~EarlyReflections() { delete[] buf; }
    void init(float sampleRate, float sizeMultiplier) {
        delete[] buf;
        size = static_cast<int>(0.05f * sampleRate);
        buf = new float[size]();
        pos = 0;
        float scale = sampleRate / 48000.0f * sizeMultiplier;
        // Dense early reflections for room character
        int baseTaps[] = { 48, 120, 190, 310, 420, 530, 680, 850 };
        float baseGains[] = { 0.85f, 0.72f, 0.63f, 0.55f, 0.45f, 0.38f, 0.30f, 0.22f };
        for (int i = 0; i < NUM_TAPS; i++) {
            tapDelays[i] = std::min(static_cast<int>(baseTaps[i] * scale), size - 1);
            tapGains[i] = baseGains[i];
        }
    }
    float process(float in) {
        buf[pos] = in;
        float out = 0.0f;
        for (int i = 0; i < NUM_TAPS; i++) {
            int idx = (pos - tapDelays[i] + size) % size;
            out += buf[idx] * tapGains[i];
        }
        pos = (pos + 1) % size;
        return out;
    }
    void clear() { if (buf) std::memset(buf, 0, size * sizeof(float)); pos = 0; }
};

// ─── Room Reverb Instance ───────────────────────────────────────────────────

struct RoomReverbInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    float decay = 0.4f;        // 0-0.95
    float damping = 0.6f;      // 0-1 (more damping = deader room)
    float predelayMs = 5.0f;   // 0-50 ms
    float width = 0.8f;        // 0-1 stereo width
    float earlyLevel = 0.7f;   // 0-1 (rooms have strong early reflections)
    float size = 0.8f;         // 0.3-1.5 delay length multiplier

    // Predelay
    float* predelayBuf = nullptr;
    int predelaySize = 0;
    int predelayPos = 0;

    // Early reflections
    EarlyReflections earlyL, earlyR;

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

        // Predelay (max 50ms)
        predelaySize = static_cast<int>(0.05f * sr);
        delete[] predelayBuf;
        predelayBuf = new float[predelaySize]();
        predelayPos = 0;

        // Early reflections
        earlyL.init(sr, size);
        earlyR.init(sr, size * 1.12f);

        // 4 diffusion allpasses (shorter delays for tighter room)
        int diffSizes[] = { 71, 54, 190, 139 };
        for (int i = 0; i < 4; i++) {
            diffAP[i].init(static_cast<int>(diffSizes[i] * scale * size), 0.75f);
        }

        // Parallel comb filters (0.5-1x plate sizes for shorter tail)
        int combSizesL[] = { 558, 594, 639, 678 };
        int combSizesR[] = { 570, 606, 650, 690 };
        for (int i = 0; i < 4; i++) {
            combL[i].init(static_cast<int>(combSizesL[i] * scale * size), decay, damping);
            combR[i].init(static_cast<int>(combSizesR[i] * scale * size), decay, damping);
        }

        // Tank allpasses
        tankAPL.init(static_cast<int>(278 * scale * size), 0.5f);
        tankAPR.init(static_cast<int>(221 * scale * size), 0.5f);

        lpfStateL = lpfStateR = 0;
    }

    ~RoomReverbInstance() { delete[] predelayBuf; }

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
        float lpfCoeff = 0.5f - damping * 0.3f;

        for (int i = 0; i < n; i++) {
            float mono = (inL[i] + inR[i]) * 0.5f;

            // Predelay
            float predelayed = predelayBuf[(predelayPos - pdSamples + predelaySize) % predelaySize];
            predelayBuf[predelayPos] = mono;
            predelayPos = (predelayPos + 1) % predelaySize;

            // Early reflections
            float earlyOutL = earlyL.process(predelayed);
            float earlyOutR = earlyR.process(predelayed);

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

            // Mix early reflections with late reverb
            sumL += earlyOutL * earlyLevel;
            sumR += earlyOutR * earlyLevel;

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

static RoomReverbInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int dragonfly_room_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void dragonfly_room_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void dragonfly_room_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void dragonfly_room_set_decay(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].decay = std::clamp(v, 0.0f, 0.95f); instances[h].updateParams(); } }
EMSCRIPTEN_KEEPALIVE void dragonfly_room_set_damping(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) { instances[h].damping = std::clamp(v, 0.0f, 1.0f); instances[h].updateParams(); } }
EMSCRIPTEN_KEEPALIVE void dragonfly_room_set_predelay(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].predelayMs = std::clamp(v, 0.0f, 50.0f); }
EMSCRIPTEN_KEEPALIVE void dragonfly_room_set_width(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].width = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void dragonfly_room_set_early_level(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].earlyLevel = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void dragonfly_room_set_size(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].size = std::clamp(v, 0.3f, 1.5f); }

} // extern "C"
