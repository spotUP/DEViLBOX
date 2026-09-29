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
#include "cabinet_curves.h"
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int NUM_CABINETS = cabinet::NUM_CABINETS;

struct CabinetSimInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    int cabinetType = 0;      // 0-3
    float mix = 1.0f;         // 0-1 dry/wet
    float brightness = 0.5f;  // 0-1

    cabinet::Curve curveL, curveR;
    lr4::Biquad brightL, brightR, presL, presR;
    int builtCabinet = -1;
    float builtBrightness = -1.0f;

    void init(float sr) {
        sampleRate = sr;
        builtCabinet = -1; builtBrightness = -1.0f;
    }

    void rebuild() {
        if (cabinetType != builtCabinet) {
            curveL.build(cabinetType, sampleRate);
            curveR.build(cabinetType, sampleRate);
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
            l = presL.process(brightL.process(curveL.process(l)));
            r = presR.process(brightR.process(curveR.process(r)));
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
