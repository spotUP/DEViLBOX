/**
 * fil4_wasm.cpp — WASM wrapper for Fons Adriaensen's fil4 parametric EQ.
 * No LV2 or Cairo dependencies.
 * Build: emcmake cmake .. && emmake make  (in fil4-wasm/build/)
 */

#include <cmath>
#include <cstring>
#include <cstdlib>
#include <cstdint>
#include <algorithm>
#include <emscripten/emscripten.h>

// RESHP/RESLP macros required by hip.h and lop.h (normally from uris.h in lv2 build)
#define RESHP(X) (0.7 + 0.78 * tanh(1.82 * ((X) - .8)))
#define RESLP(X) (3.f * powf((float)(X), 3.20772f))

// iir.h is header-only — include it first (lop.h also pulls it in, but we need
// the types before including the C++ filters.h)
extern "C" {
#include "iir.h"
#include "hip.h"
#include "lop.h"
}

// filters.h is C++ (Fil4Paramsect class), include without extern "C"
#include "filters.h"

// ---------------------------------------------------------------------------

static constexpr int MAX_INSTANCES = 8;
static constexpr int N_PARA        = 4;

struct Fil4Channel {
    IIRProc       ls, hs;
    Fil4Paramsect p[N_PARA];
    HighPass      hp;
    LowPass       lp;
};

struct HPParams    { bool en; float freq, q; };
struct LPParams    { bool en; float freq, q; };
struct ShelfParams { bool en; float freq, gain_db, q; };
struct BandParams  { bool en; float freq, bw, gain_db; };

struct Fil4Instance {
    bool  active      = false;
    float sample_rate = 44100.f;

    Fil4Channel ch[2]; // 0=L, 1=R

    HPParams    hp_p  = {false, 20.f,    0.7f};
    LPParams    lp_p  = {false, 20000.f, 0.7f};
    ShelfParams ls_p  = {false, 80.f,    0.f,  0.7f};
    ShelfParams hs_p  = {false, 8000.f,  0.f,  0.7f};
    BandParams  p_p[N_PARA] = {
        {false, 200.f,  1.f, 0.f},
        {false, 500.f,  1.f, 0.f},
        {false, 2000.f, 1.f, 0.f},
        {false, 8000.f, 1.f, 0.f},
    };
    float master_gain = 1.f;
};

static Fil4Instance instances[MAX_INSTANCES];

// ---------------------------------------------------------------------------

static int find_free() {
    for (int i = 0; i < MAX_INSTANCES; i++)
        if (!instances[i].active) return i;
    return -1;
}

static void init_channel(Fil4Instance& inst, int ci) {
    Fil4Channel& ch = inst.ch[ci];
    iir_init(&ch.ls, inst.sample_rate);
    iir_init(&ch.hs, inst.sample_rate);
    for (int i = 0; i < N_PARA; i++) ch.p[i].init();
    hip_setup(&ch.hp, inst.sample_rate, inst.hp_p.freq, inst.hp_p.q);
    lop_setup(&ch.lp, inst.sample_rate, inst.lp_p.freq, inst.lp_p.q);
}

static void process_channel(Fil4Instance& inst, int ci, float* buf, int n) {
    Fil4Channel& ch = inst.ch[ci];
    const float sr = inst.sample_rate;

    // --- High-pass ---
    // hip_interpolate handles passthrough internally when en=false
    hip_interpolate(&ch.hp, inst.hp_p.en, inst.hp_p.freq, inst.hp_p.q);
    hip_compute(&ch.hp, (uint32_t)n, buf);

    // --- Low shelf ---
    // No enable flag — use gain=1.0 for flat passthrough when disabled
    {
        float g = inst.ls_p.en ? powf(10.f, 0.05f * inst.ls_p.gain_db) : 1.0f;
        if (iir_interpolate(&ch.ls, g, inst.ls_p.freq, inst.ls_p.q))
            iir_calc_lowshelf(&ch.ls);
        iir_compute(&ch.ls, (uint32_t)n, buf);
    }

    // --- Parametric bands (Regalia-Mitra) ---
    for (int i = 0; i < N_PARA; i++) {
        // proc() always called; pass g=1.0 (unity) when disabled so the
        // section interpolates back to flat gracefully
        float f_norm = inst.p_p[i].freq / sr;
        float bw_ratio = powf(2.f, inst.p_p[i].bw * 0.5f);
        float g_factor = inst.p_p[i].en
            ? powf(10.f, inst.p_p[i].gain_db / 20.f)
            : 1.0f;
        ch.p[i].proc(n, buf, f_norm, bw_ratio, g_factor);
    }

    // --- High shelf ---
    {
        float g = inst.hs_p.en ? powf(10.f, 0.05f * inst.hs_p.gain_db) : 1.0f;
        if (iir_interpolate(&ch.hs, g, inst.hs_p.freq, inst.hs_p.q))
            iir_calc_highshelf(&ch.hs);
        iir_compute(&ch.hs, (uint32_t)n, buf);
    }

    // --- Low-pass ---
    // lop_interpolate handles passthrough internally when en=false
    lop_interpolate(&ch.lp, inst.lp_p.en, inst.lp_p.freq, inst.lp_p.q);
    lop_compute(&ch.lp, (uint32_t)n, buf);

    // --- Master gain ---
    for (int s = 0; s < n; s++) buf[s] *= inst.master_gain;
}

// ---------------------------------------------------------------------------
// Public C API
// ---------------------------------------------------------------------------

extern "C" {

EMSCRIPTEN_KEEPALIVE int fil4_create(float sr) {
    int h = find_free();
    if (h < 0) return -1;
    instances[h] = Fil4Instance{};
    instances[h].active = true;
    instances[h].sample_rate = (sr > 0.f) ? sr : 44100.f;
    for (int c = 0; c < 2; c++) init_channel(instances[h], c);
    return h;
}

EMSCRIPTEN_KEEPALIVE void fil4_destroy(int h) {
    if (h >= 0 && h < MAX_INSTANCES)
        instances[h].active = false;
}

EMSCRIPTEN_KEEPALIVE void fil4_process(int h, float* L, float* R, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) return;
    process_channel(instances[h], 0, L, n);
    process_channel(instances[h], 1, R, n);
}

EMSCRIPTEN_KEEPALIVE void fil4_set_hp(int h, int en, float freq, float q) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) return;
    instances[h].hp_p = {en != 0, freq, q};
}

EMSCRIPTEN_KEEPALIVE void fil4_set_lp(int h, int en, float freq, float q) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) return;
    instances[h].lp_p = {en != 0, freq, q};
}

EMSCRIPTEN_KEEPALIVE void fil4_set_shelf(int h, int which, int en,
                                          float freq, float gain_db, float q) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) return;
    ShelfParams p = {en != 0, freq, gain_db, q};
    if (which == 0) instances[h].ls_p = p;
    else            instances[h].hs_p = p;
}

EMSCRIPTEN_KEEPALIVE void fil4_set_band(int h, int band, int en,
                                         float freq, float bw, float gain_db) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) return;
    if (band < 0 || band >= N_PARA) return;
    instances[h].p_p[band] = {en != 0, freq, bw, gain_db};
}

EMSCRIPTEN_KEEPALIVE void fil4_set_gain(int h, float gain) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active) return;
    instances[h].master_gain = (gain >= 0.f) ? gain : 0.f;
}

EMSCRIPTEN_KEEPALIVE void fil4_get_magnitude(int h, float* log_freqs, float* out_db, int n) {
    if (h < 0 || h >= MAX_INSTANCES || !instances[h].active || n <= 0) return;

    Fil4Instance& inst = instances[h];
    const float sr = inst.sample_rate;
    const int   N_IR = 4096;

    float* ir = (float*)calloc(N_IR, sizeof(float));
    if (!ir) { memset(out_db, 0, (size_t)n * sizeof(float)); return; }
    ir[0] = 1.f; // unit impulse

    // Temporary channel with fresh (zeroed) state — same parameters as instance
    Fil4Channel tmp;
    memset(&tmp, 0, sizeof(tmp));
    iir_init(&tmp.ls, sr);
    iir_init(&tmp.hs, sr);
    for (int i = 0; i < N_PARA; i++) tmp.p[i].init();
    hip_setup(&tmp.hp, sr, inst.hp_p.freq, inst.hp_p.q);
    lop_setup(&tmp.lp, sr, inst.lp_p.freq, inst.lp_p.q);

    // Apply all filter parameters to the temp channel, then process the impulse

    // HP
    hip_interpolate(&tmp.hp, inst.hp_p.en, inst.hp_p.freq, inst.hp_p.q);
    hip_compute(&tmp.hp, (uint32_t)N_IR, ir);

    // Low shelf
    {
        float g = inst.ls_p.en ? powf(10.f, 0.05f * inst.ls_p.gain_db) : 1.0f;
        if (iir_interpolate(&tmp.ls, g, inst.ls_p.freq, inst.ls_p.q))
            iir_calc_lowshelf(&tmp.ls);
        iir_compute(&tmp.ls, (uint32_t)N_IR, ir);
    }

    // Parametric bands — only active ones affect the magnitude
    for (int i = 0; i < N_PARA; i++) {
        if (inst.p_p[i].en) {
            tmp.p[i].proc(N_IR, ir,
                inst.p_p[i].freq / sr,
                powf(2.f, inst.p_p[i].bw * 0.5f),
                powf(10.f, inst.p_p[i].gain_db / 20.f));
        }
        // disabled bands left at unity — skip proc for a flat impulse response
    }

    // High shelf
    {
        float g = inst.hs_p.en ? powf(10.f, 0.05f * inst.hs_p.gain_db) : 1.0f;
        if (iir_interpolate(&tmp.hs, g, inst.hs_p.freq, inst.hs_p.q))
            iir_calc_highshelf(&tmp.hs);
        iir_compute(&tmp.hs, (uint32_t)N_IR, ir);
    }

    // LP
    lop_interpolate(&tmp.lp, inst.lp_p.en, inst.lp_p.freq, inst.lp_p.q);
    lop_compute(&tmp.lp, (uint32_t)N_IR, ir);

    // Master gain applied to IR
    for (int k = 0; k < N_IR; k++) ir[k] *= inst.master_gain;

    // Goertzel DFT at each requested frequency
    for (int fi = 0; fi < n; fi++) {
        float freq  = log_freqs[fi];
        float w     = 2.f * (float)M_PI * freq / sr;
        float coeff = 2.f * cosf(w);
        float s1    = 0.f, s2 = 0.f;
        for (int k = 0; k < N_IR; k++) {
            float s0 = ir[k] + coeff * s1 - s2;
            s2 = s1; s1 = s0;
        }
        float mag2 = s1*s1 + s2*s2 - s1*s2*coeff;
        float mag  = sqrtf(mag2 > 0.f ? mag2 : 1e-20f);
        out_db[fi] = 20.f * log10f(mag > 1e-10f ? mag : 1e-10f);
    }

    free(ir);
}

} // extern "C"
