/**
 * lr4_crossover.h - Linkwitz-Riley 4th-order crossovers that sum FLAT.
 *
 * Shared by the multiband effects (MultibandComp, MultibandClipper,
 * MultibandGate, MultibandLimiter, MultibandEnhancer). Each used to carry its
 * own splitter: a 1st-order low-pass and high-pass at the same frequency,
 * cascaded twice and SUMMED - which cancels at the crossover (measured
 * 2026-09-29: MultibandComp -47 dB at 3 kHz, MultibandEnhancer -25 dB at
 * 8 kHz, at default settings) - and a band tree whose lower bands never saw
 * the higher crossovers' phase, carving further dips.
 *
 * LR4 = two cascaded 2nd-order Butterworth sections (Q = 1/sqrt 2). Its
 * low-pass and high-pass sum to an ALL-PASS: flat magnitude. In a band tree,
 * every band that bypasses a crossover passes through that crossover's
 * all-pass instead, so all bands carry the same phase and the sum stays flat.
 */
#pragma once
#include <cmath>

namespace lr4 {

static constexpr float kPi = 3.14159265358979323846f;

/** RBJ biquad, transposed direct form II. */
struct Biquad {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float z1 = 0, z2 = 0;

    void setLP(float f, float sr) { design(f, sr, false); }
    void setHP(float f, float sr) { design(f, sr, true); }

    void design(float f, float sr, bool high) {
        const float w0 = 2.0f * kPi * f / sr;
        const float cw = std::cos(w0), sw = std::sin(w0);
        const float alpha = sw / (2.0f * 0.70710678f);
        const float a0 = 1.0f + alpha;
        if (high) {
            b0 = (1.0f + cw) * 0.5f / a0; b1 = -(1.0f + cw) / a0; b2 = b0;
        } else {
            b0 = (1.0f - cw) * 0.5f / a0; b1 = (1.0f - cw) / a0; b2 = b0;
        }
        a1 = -2.0f * cw / a0; a2 = (1.0f - alpha) / a0;
    }

    float process(float x) {
        const float y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        return y;
    }

    void reset() { z1 = z2 = 0; }
};

/** One LR4 filter: two identical Butterworth sections. */
struct LR4 {
    Biquad s1, s2;
    void setLP(float f, float sr) { s1.setLP(f, sr); s2.setLP(f, sr); }
    void setHP(float f, float sr) { s1.setHP(f, sr); s2.setHP(f, sr); }
    float process(float x) { return s2.process(s1.process(x)); }
    void reset() { s1.reset(); s2.reset(); }
};

/** An LR4 crossover point: low + high = all-pass(x). */
struct Crossover {
    LR4 lp, hp;
    void set(float f, float sr) { lp.setLP(f, sr); hp.setHP(f, sr); }
    void split(float x, float& lo, float& hi) { lo = lp.process(x); hi = hp.process(x); }
    void reset() { lp.reset(); hp.reset(); }
};

/** This crossover's all-pass (LP + HP), for bands that bypass it. */
struct AllPass {
    LR4 lp, hp;
    void set(float f, float sr) { lp.setLP(f, sr); hp.setHP(f, sr); }
    float process(float x) { return lp.process(x) + hp.process(x); }
    void reset() { lp.reset(); hp.reset(); }
};

/** Three bands at f1 < f2, one channel. low + mid + high has flat magnitude. */
struct Split3 {
    Crossover x1, x2;
    AllPass ap2;   // the low band's copy of crossover 2's phase
    void set(float f1, float f2, float sr) { x1.set(f1, sr); x2.set(f2, sr); ap2.set(f2, sr); }
    void split(float x, float& low, float& mid, float& high) {
        float lo, rest;
        x1.split(x, lo, rest);
        low = ap2.process(lo);
        x2.split(rest, mid, high);
    }
    void reset() { x1.reset(); x2.reset(); ap2.reset(); }
};

/** Four bands at f1 < f2 < f3, one channel. The four bands sum flat. */
struct Split4 {
    Crossover x1, x2, x3;
    AllPass ap3;   // lower half gets crossover 3's phase
    AllPass ap1;   // upper half gets crossover 1's phase
    void set(float f1, float f2, float f3, float sr) {
        x1.set(f1, sr); x2.set(f2, sr); x3.set(f3, sr); ap3.set(f3, sr); ap1.set(f1, sr);
    }
    void split(float x, float& b0, float& b1, float& b2, float& b3) {
        float lower, upper;
        x2.split(x, lower, upper);
        x1.split(ap3.process(lower), b0, b1);
        x3.split(ap1.process(upper), b2, b3);
    }
    void reset() { x1.reset(); x2.reset(); x3.reset(); ap3.reset(); ap1.reset(); }
};

}  // namespace lr4
