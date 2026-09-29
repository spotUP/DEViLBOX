/**
 * cabinet_curves.h - guitar speaker cabinets as short biquad cascades.
 *
 * Each cabinet is its speaker's frequency response: low cut, low-end
 * resonance, mid / presence peaks and the steep roll-off above ~5-6 kHz every
 * guitar speaker has. Normalised to 0 dB at 1 kHz, so a cabinet shapes the
 * tone without changing the level. Shared by CabinetSim and the amp
 * simulators that end in a speaker (Swedish Chainsaw).
 *   0 = 1x12 Combo (bright, mid-focused)
 *   1 = 2x12 Open back (warm, scooped mids)
 *   2 = 4x12 Closed back (heavy, tight low-end)
 *   3 = DI (flat)
 */
#pragma once
#include "lr4_crossover.h"

namespace cabinet {

constexpr int NUM_CABINETS = 4;
constexpr int MAX_STAGES = 8;
constexpr int CLOSED_4X12 = 2;

struct Stage { char kind; float f, q, dB; };   // kind: 'h' high-pass, 'l' low-pass, 'p' peak

// One row per cabinet; unused stages have f = 0.
inline const Stage CABINETS[NUM_CABINETS][MAX_STAGES] = {
    // 1x12 combo: modest low end, 2.5 kHz bite, rolls off from ~5.5 kHz
    { {'h', 90, 0.7f, 0}, {'p', 130, 1.0f, 2.5f}, {'p', 2500, 1.2f, 4}, {'l', 5500, 0.7f, 0}, {'l', 6000, 0.7f, 0} },
    // 2x12 open back: warm lows, scooped mids, 4 kHz presence
    { {'h', 70, 0.7f, 0}, {'p', 110, 0.9f, 3}, {'p', 800, 0.8f, -3}, {'p', 4000, 1.2f, 3}, {'l', 6500, 0.7f, 0}, {'l', 7000, 0.7f, 0} },
    // 4x12 closed back: tight thump, 1.8 / 3.5 kHz presence, early roll-off
    { {'h', 70, 0.7f, 0}, {'p', 95, 1.2f, 5}, {'p', 1800, 1.0f, 2}, {'p', 3500, 1.4f, 3}, {'l', 5000, 0.7f, 0}, {'l', 5500, 0.7f, 0} },
    // DI: flat
    { },
};

/** One channel of one cabinet. */
struct Curve {
    lr4::Biquad stages[MAX_STAGES];
    int count = 0;
    float norm = 1.0f;   // 0 dB at 1 kHz

    void build(int type, float sampleRate) {
        count = 0;
        float mag = 1.0f;
        for (int s = 0; s < MAX_STAGES; s++) {
            const Stage& st = CABINETS[type][s];
            if (st.f <= 0) break;
            lr4::Biquad& b = stages[count];
            if (st.kind == 'h') b.setHP(st.f, sampleRate);
            else if (st.kind == 'l') b.setLP(st.f, sampleRate);
            else b.setPeak(st.f, sampleRate, st.q, st.dB);
            b.reset();
            mag *= b.magnitude(1000.0f, sampleRate);
            count++;
        }
        norm = mag > 1e-6f ? 1.0f / mag : 1.0f;
    }

    float process(float x) {
        for (int s = 0; s < count; s++) x = stages[s].process(x);
        return x * norm;
    }
};

} // namespace cabinet
