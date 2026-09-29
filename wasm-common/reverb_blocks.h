/**
 * reverb_blocks.h - building blocks for the Schroeder-style reverbs
 * (Dragonfly Hall / Plate / Room).
 *
 * Allpass is a TRUE Schroeder all-pass (unity magnitude at every frequency):
 *   out = -g*in + d;  buf = in + g*out
 * The reverbs carried the Freeverb-style one (out = -in + d; buf = in + g*d),
 * whose noise power gain is 1 + 1/(1-g^2) - +4.7 dB per stage at g 0.7 - and
 * dropped Freeverb's 0.015 input gain that compensates for it: the Hall read
 * +19 dB at wet 100 % on pink noise (2026-09-29).
 *
 * combSumNorm(g, n): the gain for n parallel combs of feedback g that keeps a
 * reverb's loudness independent of its decay knob (see below).
 */
#pragma once
#include <cmath>
#include <cstring>

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
        const float delayed = buf[pos];
        const float out = -feedback * in + delayed;
        buf[pos] = in + feedback * out;
        pos = (pos + 1) % size;
        return out;
    }
    void clear() { if (buf) std::memset(buf, 0, size * sizeof(float)); pos = 0; }
};

// Lowpass-feedback comb (LBCF).
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

/**
 * Gain for the SUM of n parallel combs of feedback g, so the tail's level
 * does not follow the decay knob. Across the audible band the combs'
 * resonances add incoherently, so each comb's power gain goes with
 * 1/(1-g^2) and the sum is normalised by sqrt(1-g^2).
 *
 * (Only at DC do the combs add in phase, with gain 1/(1-g): a (1-g)
 * normalisation calibrated on unfiltered pink noise - whose Kellet filter
 * keeps rising below 20 Hz - matched that sub-audio part and left the
 * reverbs 10-20 dB quiet on music, falling with decay. 2026-09-29.)
 * Scaled to sqrt((1-0.64)/n) at g = 0.8, the value the reverbs' makeups are
 * measured against.
 */
inline float combSumNorm(float g, int n) {
    const float atDefault = std::sqrt((1.0f - 0.64f) / (float)n);
    const float gc = g < 0.999f ? g : 0.999f;
    return atDefault * std::sqrt((1.0f - gc * gc) / (1.0f - 0.64f));
}
