/**
 * CabinetSimWASM.cpp — Guitar cabinet simulator for DEViLBOX
 *
 * Each cabinet is its speaker's frequency response as a short biquad
 * cascade: low cut, low-end resonance, mid / presence peaks and the steep
 * roll-off above ~5-6 kHz every guitar speaker has. Normalised to 0 dB at
 * 1 kHz, so a cabinet shapes the tone without changing the level.
 *   0 = 1x12 Combo (bright, mid-focused)
 *   1 = 2x12 Open back (warm, scooped mids)
 *   2 = 4x12 Closed back (heavy, tight low-end)
 *   3 = DI (flat)
 * Brightness 0.5 is neutral; below it a low-pass sweeps down to 1.5 kHz,
 * above it a 4 kHz presence lift rises to +6 dB.
 *
 * Replaces synthetic 256-tap FIRs built from decaying sine waves - narrow
 * band-passes, Blackman-windowed from their start and normalised by their
 * absolute sum: -59 dB at 1 kHz and -159 dB at 10 kHz at the defaults
 * (tools/master-fx-response-audit.ts, 2026-09-29).
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include "lr4_crossover.h"
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int NUM_CABINETS = 4;
static constexpr int MAX_STAGES = 8;

struct Stage { char kind; float f, q, dB; };   // kind: 'h' high-pass, 'l' low-pass, 'p' peak

// One row per cabinet; unused stages have f = 0.
static const Stage CABINETS[NUM_CABINETS][MAX_STAGES] = {
    // 1x12 combo: modest low end, 2.5 kHz bite, rolls off from ~5.5 kHz
    { {'h', 90, 0.7f, 0}, {'p', 130, 1.0f, 2.5f}, {'p', 2500, 1.2f, 4}, {'l', 5500, 0.7f, 0}, {'l', 6000, 0.7f, 0} },
    // 2x12 open back: warm lows, scooped mids, 4 kHz presence
    { {'h', 70, 0.7f, 0}, {'p', 110, 0.9f, 3}, {'p', 800, 0.8f, -3}, {'p', 4000, 1.2f, 3}, {'l', 6500, 0.7f, 0}, {'l', 7000, 0.7f, 0} },
    // 4x12 closed back: tight thump, 1.8 / 3.5 kHz presence, early roll-off
    { {'h', 70, 0.7f, 0}, {'p', 95, 1.2f, 5}, {'p', 1800, 1.0f, 2}, {'p', 3500, 1.4f, 3}, {'l', 5000, 0.7f, 0}, {'l', 5500, 0.7f, 0} },
    // DI: flat
    { },
};

struct CabinetSimInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    int cabinetType = 0;      // 0-3
    float mix = 1.0f;         // 0-1 dry/wet
    float brightness = 0.5f;  // 0-1

    lr4::Biquad stagesL[MAX_STAGES], stagesR[MAX_STAGES];
    int stageCount = 0;
    float norm = 1.0f;        // 0 dB at 1 kHz
    lr4::Biquad brightL, brightR, presL, presR;
    int builtCabinet = -1;
    float builtBrightness = -1.0f;

    void init(float sr) {
        sampleRate = sr;
        builtCabinet = -1; builtBrightness = -1.0f;
    }

    void rebuild() {
        if (cabinetType != builtCabinet) {
            stageCount = 0;
            norm = 1.0f;
            for (int s = 0; s < MAX_STAGES; s++) {
                const Stage& st = CABINETS[cabinetType][s];
                if (st.f <= 0) break;
                lr4::Biquad& b = stagesL[stageCount];
                if (st.kind == 'h') b.setHP(st.f, sampleRate);
                else if (st.kind == 'l') b.setLP(st.f, sampleRate);
                else b.setPeak(st.f, sampleRate, st.q, st.dB);
                b.reset();
                stagesR[stageCount] = b;
                norm *= b.magnitude(1000.0f, sampleRate);
                stageCount++;
            }
            norm = norm > 1e-6f ? 1.0f / norm : 1.0f;
            builtCabinet = cabinetType;
        }
        if (brightness != builtBrightness) {
            const float dark = std::min(brightness * 2.0f, 1.0f);           // 0..1 over 0..0.5
            const float f = std::min(1500.0f * std::pow(20000.0f / 1500.0f, dark), sampleRate * 0.45f);
            brightL.setLP(f, sampleRate); brightR.setLP(f, sampleRate);
            const float lift = std::max(0.0f, brightness - 0.5f) * 12.0f;     // 0..6 dB
            presL.setPeak(4000.0f, sampleRate, 0.6f, lift); presR.setPeak(4000.0f, sampleRate, 0.6f, lift);
            builtBrightness = brightness;
        }
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        rebuild();
        for (int i = 0; i < n; i++) {
            float l = inL[i], r = inR[i];
            for (int s = 0; s < stageCount; s++) { l = stagesL[s].process(l); r = stagesR[s].process(r); }
            l = presL.process(brightL.process(l * norm));
            r = presR.process(brightR.process(r * norm));
            outL[i] = inL[i] * (1.0f - mix) + l * mix;
            outR[i] = inR[i] * (1.0f - mix) + r * mix;
        }
    }
};

static CabinetSimInstance instances[MAX_INSTANCES];
static int findFree() { for (int i = 0; i < MAX_INSTANCES; i++) if (!instances[i].active) return i; return -1; }

extern "C" {

EMSCRIPTEN_KEEPALIVE int cabinet_sim_create(int sr) {
    int s = findFree(); if (s < 0) return -1;
    instances[s].active = true; instances[s].init(static_cast<float>(sr)); return s;
}
EMSCRIPTEN_KEEPALIVE void cabinet_sim_destroy(int h) { if (h >= 0 && h < MAX_INSTANCES) instances[h].active = false; }
EMSCRIPTEN_KEEPALIVE void cabinet_sim_process(int h, float* iL, float* iR, float* oL, float* oR, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) { if (oL && iL) std::memcpy(oL, iL, n*4); if (oR && iR) std::memcpy(oR, iR, n*4); return; }
    instances[h].process(iL, iR, oL, oR, n);
}
EMSCRIPTEN_KEEPALIVE void cabinet_sim_set_cabinet(int h, int v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].cabinetType = std::clamp(v, 0, NUM_CABINETS - 1); }
EMSCRIPTEN_KEEPALIVE void cabinet_sim_set_mix(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].mix = std::clamp(v, 0.0f, 1.0f); }
EMSCRIPTEN_KEEPALIVE void cabinet_sim_set_brightness(int h, float v) { if (h >= 0 && h < MAX_INSTANCES && instances[h].active) instances[h].brightness = std::clamp(v, 0.0f, 1.0f); }

} // extern "C"
