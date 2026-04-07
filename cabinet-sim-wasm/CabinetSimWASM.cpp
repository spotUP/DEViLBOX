/**
 * CabinetSimWASM.cpp — Guitar cabinet simulator for DEViLBOX
 *
 * Simulates guitar speaker cabinets using short FIR convolution (256 taps).
 * Four built-in cabinet models generated from characteristic frequency responses:
 *   0 = 1x12 Combo (bright, mid-focused)
 *   1 = 2x12 Open back (warm, scooped mids)
 *   2 = 4x12 Closed back (heavy, tight low-end)
 *   3 = DI (bypass — flat response)
 *
 * Build: emcmake cmake .. && emmake make
 */

#include <cmath>
#include <cstring>
#include <algorithm>
#include <emscripten/emscripten.h>

static constexpr int MAX_INSTANCES = 16;
static constexpr int IR_LENGTH = 256;
static constexpr int NUM_CABINETS = 4;
static constexpr float PI = 3.14159265358979323846f;

// ─── Generate cabinet impulse responses ─────────────────────────────────────
// These are synthetic IRs designed to approximate the frequency response
// characteristics of real cabinet types using windowed-sinc + resonance peaks.

static float g_cabIRs[NUM_CABINETS][IR_LENGTH];
static bool g_irsGenerated = false;

static void applyWindow(float* ir, int len) {
    for (int i = 0; i < len; i++) {
        // Blackman window
        float w = 0.42f - 0.5f * std::cos(2.0f * PI * i / (len - 1))
                        + 0.08f * std::cos(4.0f * PI * i / (len - 1));
        ir[i] *= w;
    }
}

static void normIR(float* ir, int len) {
    float sum = 0;
    for (int i = 0; i < len; i++) sum += std::fabs(ir[i]);
    if (sum > 0.0001f) {
        float inv = 1.0f / sum;
        for (int i = 0; i < len; i++) ir[i] *= inv;
    }
}

static void generateCabIRs(float sampleRate) {
    if (g_irsGenerated) return;

    float dt = 1.0f / sampleRate;

    // ── Cabinet 0: 1x12 Combo (bright, mid-focused around 2-4kHz) ──
    {
        float* ir = g_cabIRs[0];
        float resonance = 2500.0f; // Hz
        float damping = 0.15f;
        float omega = 2.0f * PI * resonance;
        for (int i = 0; i < IR_LENGTH; i++) {
            float t = i * dt;
            ir[i] = std::exp(-damping * omega * t) * std::sin(omega * t);
            // Add low-end body
            ir[i] += 0.3f * std::exp(-500.0f * t) * std::sin(2.0f * PI * 150.0f * t);
        }
        applyWindow(ir, IR_LENGTH);
        normIR(ir, IR_LENGTH);
    }

    // ── Cabinet 1: 2x12 Open back (warm, scooped mids) ──
    {
        float* ir = g_cabIRs[1];
        float res1 = 1200.0f; // lower resonance
        float res2 = 4000.0f; // presence peak
        for (int i = 0; i < IR_LENGTH; i++) {
            float t = i * dt;
            ir[i] = std::exp(-0.12f * 2.0f * PI * res1 * t) * std::sin(2.0f * PI * res1 * t);
            ir[i] += 0.4f * std::exp(-0.2f * 2.0f * PI * res2 * t) * std::sin(2.0f * PI * res2 * t);
            // Strong low-end
            ir[i] += 0.5f * std::exp(-400.0f * t) * std::sin(2.0f * PI * 100.0f * t);
        }
        applyWindow(ir, IR_LENGTH);
        normIR(ir, IR_LENGTH);
    }

    // ── Cabinet 2: 4x12 Closed back (heavy, tight low-end) ──
    {
        float* ir = g_cabIRs[2];
        float res = 1800.0f;
        for (int i = 0; i < IR_LENGTH; i++) {
            float t = i * dt;
            // Tighter response with more low-end mass
            ir[i] = std::exp(-0.18f * 2.0f * PI * res * t) * std::sin(2.0f * PI * res * t);
            // Heavy low-end
            ir[i] += 0.7f * std::exp(-300.0f * t) * std::sin(2.0f * PI * 80.0f * t);
            // High-mid presence
            ir[i] += 0.25f * std::exp(-0.25f * 2.0f * PI * 3500.0f * t) * std::sin(2.0f * PI * 3500.0f * t);
        }
        applyWindow(ir, IR_LENGTH);
        normIR(ir, IR_LENGTH);
    }

    // ── Cabinet 3: DI (flat — Dirac delta) ──
    {
        float* ir = g_cabIRs[3];
        std::memset(ir, 0, IR_LENGTH * sizeof(float));
        ir[0] = 1.0f;
    }

    g_irsGenerated = true;
}

// ─── Cabinet Sim Instance ───────────────────────────────────────────────────

struct CabinetSimInstance {
    bool active = false;
    float sampleRate = 48000.0f;

    // Parameters
    int cabinetType = 0;   // 0-3
    float mix = 1.0f;      // 0-1 dry/wet
    float brightness = 0.5f; // 0-1 post-filter

    // FIR convolution input history
    float* histL = nullptr;
    float* histR = nullptr;
    int histPos = 0;

    // Output brightness LPF
    float lpfStateL = 0, lpfStateR = 0;

    void init(float sr) {
        sampleRate = sr;
        generateCabIRs(sr);

        delete[] histL;
        delete[] histR;
        histL = new float[IR_LENGTH]();
        histR = new float[IR_LENGTH]();
        histPos = 0;
        lpfStateL = lpfStateR = 0;
    }

    ~CabinetSimInstance() {
        delete[] histL;
        delete[] histR;
    }

    void process(const float* inL, const float* inR, float* outL, float* outR, int n) {
        const float* ir = g_cabIRs[cabinetType];
        float lpfCoeff = 1.0f - brightness * 0.7f;

        for (int i = 0; i < n; i++) {
            // Write to circular history
            histL[histPos] = inL[i];
            histR[histPos] = inR[i];

            // FIR convolution
            float convL = 0, convR = 0;
            for (int j = 0; j < IR_LENGTH; j++) {
                int idx = (histPos - j + IR_LENGTH) % IR_LENGTH;
                convL += histL[idx] * ir[j];
                convR += histR[idx] * ir[j];
            }

            histPos = (histPos + 1) % IR_LENGTH;

            // Brightness filter (simple one-pole LPF)
            lpfStateL = convL * (1.0f - lpfCoeff) + lpfStateL * lpfCoeff;
            lpfStateR = convR * (1.0f - lpfCoeff) + lpfStateR * lpfCoeff;

            // Mix dry/wet
            outL[i] = inL[i] * (1.0f - mix) + lpfStateL * mix;
            outR[i] = inR[i] * (1.0f - mix) + lpfStateR * mix;
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
