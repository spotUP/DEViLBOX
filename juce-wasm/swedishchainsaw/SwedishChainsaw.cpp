/**
 * SwedishChainsaw.cpp — Boss HM-2 "Swedish death metal" distortion + JCM800 tonestack
 *
 * 1:1 port of https://github.com/Barabas5532/SwedishChainsaw (GPL v3)
 * Signal chain: input gain → 60Hz HPF → optional 700Hz tight HPF → 4× oversample →
 *   tanh clip → HM2 graphic EQ (3 biquads) → 7kHz LPF → 600Hz amp HPF →
 *   amp gain → 4× oversample → tanh clip → FMV tonestack (JCM800) →
 *   7kHz LPF → output volume
 *
 * Skips convolution IR (external file dependency).
 */
#include "WASMEffectBase.h"
#include <cstring>
#include <cmath>
#include <algorithm>

namespace devilbox {

// ─── Parameters ─────────────────────────────────────────────────────────
enum Param {
    PARAM_TIGHT      = 0,  // bool: 0 or 1
    PARAM_PEDAL_GAIN = 1,  // 0-1 → 20-40 dB
    PARAM_AMP_GAIN   = 2,  // 0-1 → 0-30 dB
    PARAM_BASS       = 3,  // 0-1 tonestack
    PARAM_MIDDLE     = 4,  // 0-1 tonestack
    PARAM_TREBLE     = 5,  // 0-1 tonestack
    PARAM_VOLUME     = 6,  // 0-1 → 10-40 dB (applied as vol - 30)
    PARAM_COUNT      = 7,
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Tight", "HM-2 Gain", "Amp Gain", "Bass", "Middle", "Treble", "Volume"
};
static const float PARAM_MINS[PARAM_COUNT]     = { 0, 0, 0, 0, 0, 0, 0 };
static const float PARAM_MAXS[PARAM_COUNT]     = { 1, 1, 1, 1, 1, 1, 1 };
static const float PARAM_DEFAULTS[PARAM_COUNT] = { 0, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f };

// ─── IIR filter helpers ─────────────────────────────────────────────────

struct Biquad {
    float b0, b1, b2, a1, a2;
    float z1 = 0, z2 = 0;

    void reset() { z1 = z2 = 0; }

    float process(float x) {
        float y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;
        return y;
    }
};

struct FirstOrderFilter {
    float b0, b1, a1;
    float z1 = 0;

    void reset() { z1 = 0; }

    float process(float x) {
        float y = b0 * x + z1;
        z1 = b1 * x - a1 * y;
        return y;
    }
};

static void makeFirstOrderHPF(FirstOrderFilter& f, float fc, float fs) {
    float w = 2.0f * 3.14159265f * fc / fs;
    float cosw = cosf(w);
    float alpha = (1.0f + cosw) / 2.0f;
    float a0 = 1.0f + sinf(w);
    f.b0 = alpha / a0;
    f.b1 = -alpha / a0;
    f.a1 = -cosw / a0;
}

static void makeLowPass2(Biquad& f, float fc, float fs) {
    float w = 2.0f * 3.14159265f * fc / fs;
    float cosw = cosf(w);
    float sinw = sinf(w);
    float Q = 0.7071f;
    float alpha = sinw / (2.0f * Q);
    float a0 = 1.0f + alpha;
    f.b0 = ((1.0f - cosw) / 2.0f) / a0;
    f.b1 = (1.0f - cosw) / a0;
    f.b2 = ((1.0f - cosw) / 2.0f) / a0;
    f.a1 = (-2.0f * cosw) / a0;
    f.a2 = (1.0f - alpha) / a0;
}

// ─── 3rd-order IIR for FMV tonestack ────────────────────────────────────

struct ThirdOrderIIR {
    float b[4], a[4];
    float xz[3] = {}, yz[3] = {};

    void reset() { memset(xz, 0, sizeof(xz)); memset(yz, 0, sizeof(yz)); }

    float process(float x) {
        float y = b[0]*x + b[1]*xz[0] + b[2]*xz[1] + b[3]*xz[2]
                - a[1]*yz[0] - a[2]*yz[1] - a[3]*yz[2];
        xz[2] = xz[1]; xz[1] = xz[0]; xz[0] = x;
        yz[2] = yz[1]; yz[1] = yz[0]; yz[0] = y;
        return y;
    }
};

static constexpr int MAX_BLOCK = 128;

// ─── HM-2 EQ: 3 cascaded biquads with MATLAB-derived coefficients ──────
// These coefficients are from the original SwedishChainsaw MATLAB analysis
// of the HM-2 graphic EQ with all knobs at max.

static void initHM2Biquads(Biquad hm2[3]) {
    // Filter 1
    hm2[0].b0 = 1.016224171805848f;
    hm2[0].b1 = -1.996244766867333f;
    hm2[0].b2 = 0.980170456681741f;
    hm2[0].a1 = -1.996244766867333f;
    hm2[0].a2 = 0.996394628487589f;
    // Filter 2
    hm2[1].b0 = 1.048098514125369f;
    hm2[1].b1 = -1.946884930731663f;
    hm2[1].b2 = 0.914902628855116f;
    hm2[1].a1 = -1.946884930731663f;
    hm2[1].a2 = 0.963001142980485f;
    // Filter 3
    hm2[2].b0 = 1.260798129602192f;
    hm2[2].b1 = -1.896438187817481f;
    hm2[2].b2 = 0.674002337997260f;
    hm2[2].a1 = -1.896438187817481f;
    hm2[2].a2 = 0.934800467599452f;
}

// ─── FMV Tonestack: JCM800 component values, Yeh & Smith bilinear ──────

static void designFMV(ThirdOrderIIR& filt, float l, float m, float t, float Fs) {
    const float R1 = 220e3f, R2 = 1e6f, R3 = 22e3f, R4 = 33e3f;
    const float C1 = 470e-12f, C2 = 22e-9f, C3 = 22e-9f;

    float b1 = t*C1*R1 + m*C3*R3 + l*(C1*R2 + C2*R2) + (C1*R3 + C2*R3);

    float b2 = t*(C1*C2*R1*R4 + C1*C3*R1*R4)
        - m*m*(C1*C3*R3*R3 + C2*C3*R3*R3)
        + m*(C1*C3*R1*R3 + C1*C3*R3*R3 + C2*C3*R3*R3)
        + l*(C1*C2*R1*R2 + C1*C2*R2*R4 + C1*C3*R2*R4)
        + l*m*(C1*C3*R2*R3 + C2*C3*R2*R3)
        + (C1*C2*R1*R3 + C1*C2*R3*R4 + C1*C3*R3*R4);

    float b3 = l*m*(C1*C2*C3*R1*R2*R3 + C1*C2*C3*R2*R3*R4)
        - m*m*(C1*C2*C3*R1*R3*R3 + C1*C2*C3*R3*R3*R4)
        + m*(C1*C2*C3*R1*R3*R3 + C1*C2*C3*R3*R3*R4)
        + t*C1*C2*C3*R1*R3*R4 - t*m*C1*C2*C3*R1*R3*R4
        + t*l*C1*C2*C3*R1*R2*R4;

    float a0 = 1.0f;
    float a1 = (C1*R1 + C1*R3 + C2*R3 + C2*R4 + C3*R4)
        + m*C3*R3 + l*(C1*R2 + C2*R2);

    float a2 = m*(C1*C3*R1*R3 - C2*C3*R3*R4 + C1*C3*R3*R3 + C2*C3*R3*R3)
        + l*m*(C1*C3*R2*R3 + C2*C3*R2*R3)
        - m*m*(C1*C3*R3*R3 + C2*C3*R3*R3)
        + l*(C1*C2*R2*R4 + C1*C2*R1*R2 + C1*C3*R2*R4 + C2*C3*R2*R4)
        + (C1*C2*R1*R4 + C1*C3*R1*R4 + C1*C2*R3*R4
           + C1*C2*R1*R3 + C1*C3*R3*R4 + C2*C3*R3*R4);

    float a3 = l*m*(C1*C2*C3*R1*R2*R3 + C1*C2*C3*R2*R3*R4)
        - m*m*(C1*C2*C3*R1*R3*R3 + C1*C2*C3*R3*R3*R4)
        + m*(C1*C2*C3*R3*R3*R4 + C1*C2*C3*R1*R3*R3 - C1*C2*C3*R1*R3*R4)
        + l*C1*C2*C3*R1*R2*R4 + C1*C2*C3*R1*R3*R4;

    float c  = 2.0f * Fs;
    float c2 = c * c;
    float c3 = c * c * c;

    float B0 = -b1*c - b2*c2 - b3*c3;
    float B1 = -b1*c + b2*c2 + 3*b3*c3;
    float B2 =  b1*c + b2*c2 - 3*b3*c3;
    float B3 =  b1*c - b2*c2 + b3*c3;

    float A0 = -a0 - a1*c - a2*c2 - a3*c3;
    float A1 = -3*a0 - a1*c + a2*c2 + 3*a3*c3;
    float A2 = -3*a0 + a1*c + a2*c2 - 3*a3*c3;
    float A3 = -a0 + a1*c - a2*c2 + a3*c3;

    filt.b[0] = B0 / A0;
    filt.b[1] = B1 / A0;
    filt.b[2] = B2 / A0;
    filt.b[3] = B3 / A0;
    filt.a[0] = 1.0f;
    filt.a[1] = A1 / A0;
    filt.a[2] = A2 / A0;
    filt.a[3] = A3 / A0;
}

// ─── dB to linear ───────────────────────────────────────────────────────

static inline float dBtoLinear(float dB) {
    return powf(10.0f, dB / 20.0f);
}

// ═════════════════════════════════════════════════════════════════════════
// SwedishChainsaw effect class
// ═════════════════════════════════════════════════════════════════════════

class SwedishChainsaw : public WASMEffectBase {
public:
    SwedishChainsaw() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];
    }

    ~SwedishChainsaw() override = default;

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);

        float fs = static_cast<float>(sampleRate);

        makeFirstOrderHPF(pedalInputHPF_, 60.0f, fs);
        makeFirstOrderHPF(tightHPF_, 700.0f, fs);
        initHM2Biquads(hm2_);
        makeLowPass2(pedalLPF_, 7000.0f, fs);
        makeFirstOrderHPF(ampInputHPF_, 100.0f, fs);
        makeLowPass2(ampLPF_, 7000.0f, fs);

        pedalInputHPF_R_ = pedalInputHPF_;
        tightHPF_R_ = tightHPF_;
        for (int i = 0; i < 3; ++i) hm2R_[i] = hm2_[i];
        pedalLPF_R_ = pedalLPF_;
        ampInputHPF_R_ = ampInputHPF_;
        ampLPF_R_ = ampLPF_;

        updateTonestack();

        resetFilters();
    }

    void process(float* inputL, float* inputR,
                 float* outputL, float* outputR, int numSamples) override
    {
        numSamples = std::min(numSamples, MAX_BLOCK);

        if (!isInitialized_) {
            if (inputL != outputL) std::memcpy(outputL, inputL, numSamples * sizeof(float));
            if (inputR != outputR) std::memcpy(outputR, inputR, numSamples * sizeof(float));
            return;
        }

        const bool tight = params_[PARAM_TIGHT] > 0.5f;
        // Pedal drive: 0-1 → 0-24 dB (original was 20-40 but that assumed -30dBFS guitar input)
        const float pedalGainLin = dBtoLinear(params_[PARAM_PEDAL_GAIN] * 24.0f);
        // Amp drive: 0-1 → 0-18 dB
        const float ampGainLin   = dBtoLinear(params_[PARAM_AMP_GAIN] * 18.0f);
        // Volume: 0-1 → -30 to 0 dB
        const float volLin       = dBtoLinear(-30.0f + params_[PARAM_VOLUME] * 30.0f);

        updateTonestack();

        for (int i = 0; i < numSamples; ++i) {
            float sL = inputL[i];
            float sR = inputR[i];

            // 1. 60 Hz HPF (remove sub-bass before clipping)
            sL = pedalInputHPF_.process(sL);
            sR = pedalInputHPF_R_.process(sR);

            // 2. Optional tight filter (700 Hz HPF)
            if (tight) {
                sL = tightHPF_.process(sL);
                sR = tightHPF_R_.process(sR);
            }

            // 3. Pedal drive + waveshaper
            sL = tanhf(sL * pedalGainLin);
            sR = tanhf(sR * pedalGainLin);

            // 4. HM-2 graphic EQ (3 cascaded biquads)
            for (int f = 0; f < 3; ++f) {
                sL = hm2_[f].process(sL);
                sR = hm2R_[f].process(sR);
            }

            // 5. 7 kHz LPF after pedal
            sL = pedalLPF_.process(sL);
            sR = pedalLPF_R_.process(sR);

            // 6. Amp input HPF (600 Hz)
            sL = ampInputHPF_.process(sL);
            sR = ampInputHPF_R_.process(sR);

            // 7. Amp drive + waveshaper
            sL = tanhf(sL * ampGainLin);
            sR = tanhf(sR * ampGainLin);

            // 8. FMV tonestack (passive — attenuates)
            sL = tonestackL_.process(sL);
            sR = tonestackR_.process(sR);

            // 9. Tonestack makeup (~12 dB)
            sL *= 4.0f;
            sR *= 4.0f;

            // 10. 7 kHz LPF
            sL = ampLPF_.process(sL);
            sR = ampLPF_R_.process(sR);

            // 11. Output volume + soft clip
            outputL[i] = tanhf(sL * volLin);
            outputR[i] = tanhf(sR * volLin);
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        params_[paramId] = clamp(value, PARAM_MINS[paramId], PARAM_MAXS[paramId]);
    }

    float getParameter(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? params_[paramId] : 0.0f;
    }

    int getParameterCount() const override { return PARAM_COUNT; }
    const char* getParameterName(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_NAMES[paramId] : "";
    }
    float getParameterMin(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_MINS[paramId] : 0.0f;
    }
    float getParameterMax(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_MAXS[paramId] : 1.0f;
    }
    float getParameterDefault(int paramId) const override {
        return (paramId >= 0 && paramId < PARAM_COUNT) ? PARAM_DEFAULTS[paramId] : 0.0f;
    }

private:
    float params_[PARAM_COUNT];

    // Left channel filters
    FirstOrderFilter pedalInputHPF_{};
    FirstOrderFilter tightHPF_{};
    Biquad hm2_[3]{};
    Biquad pedalLPF_{};
    FirstOrderFilter ampInputHPF_{};
    Biquad ampLPF_{};
    ThirdOrderIIR tonestackL_{};

    // Right channel filters (stereo)
    FirstOrderFilter pedalInputHPF_R_{};
    FirstOrderFilter tightHPF_R_{};
    Biquad hm2R_[3]{};
    Biquad pedalLPF_R_{};
    FirstOrderFilter ampInputHPF_R_{};
    Biquad ampLPF_R_{};
    ThirdOrderIIR tonestackR_{};

    void updateTonestack() {
        ThirdOrderIIR newTS{};
        designFMV(newTS, params_[PARAM_BASS], params_[PARAM_MIDDLE],
                  params_[PARAM_TREBLE], static_cast<float>(sampleRate_));
        for (int k = 0; k < 4; ++k) {
            tonestackL_.b[k] = newTS.b[k];
            tonestackL_.a[k] = newTS.a[k];
            tonestackR_.b[k] = newTS.b[k];
            tonestackR_.a[k] = newTS.a[k];
        }
    }

    void resetFilters() {
        pedalInputHPF_.reset(); pedalInputHPF_R_.reset();
        tightHPF_.reset(); tightHPF_R_.reset();
        for (int i = 0; i < 3; ++i) { hm2_[i].reset(); hm2R_[i].reset(); }
        pedalLPF_.reset(); pedalLPF_R_.reset();
        ampInputHPF_.reset(); ampInputHPF_R_.reset();
        ampLPF_.reset(); ampLPF_R_.reset();
        tonestackL_.reset(); tonestackR_.reset();
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(SwedishChainsaw)
#endif

} // namespace devilbox
