/**
 * ShimmerReverbEffect.cpp - WASM Shimmer Reverb
 * Dattorro plate reverb with grain-based pitch shifter in the feedback loop.
 * Built from scratch for DEViLBOX.
 *
 * Key design decisions (2026-04-14 rewrite):
 * - Dattorro lattice allpass (TRUE allpass, |H|=1 at all frequencies)
 *   The Freeverb form has frequency-dependent gain up to 1.67x/stage.
 * - 4-head pitch shifter (eliminates "brrrr" grain modulation of 2-head)
 * - Hermite interpolation (no aliasing noise from linear interp at 2x ratio)
 * - DC blockers in feedback path (prevents offset accumulation)
 * - softLimit at 0.95 threshold (transparent in normal range, catches peaks only)
 * - Input scaled to 0.25 (tank runs clean, never saturates in normal use)
 */

#include "WASMEffectBase.h"

#include <cstring>
#include <cmath>
#include <algorithm>

namespace devilbox {

// ============================================================================
// DSP building blocks
// ============================================================================

static constexpr float PI = 3.14159265358979323846f;

// --- Hermite interpolation (4-point, 3rd order) ---
static inline float hermite(float frac, float sm1, float s0, float s1, float s2) {
    float c0 = s0;
    float c1 = 0.5f * (s1 - sm1);
    float c2 = sm1 - 2.5f * s0 + 2.0f * s1 - 0.5f * s2;
    float c3 = 0.5f * (s2 - sm1) + 1.5f * (s0 - s1);
    return ((c3 * frac + c2) * frac + c1) * frac + c0;
}

// --- DC Blocker (~5Hz cutoff at 48kHz) ---
class DCBlocker {
public:
    DCBlocker() : x1_(0.0f), y1_(0.0f) {}
    void reset() { x1_ = 0.0f; y1_ = 0.0f; }
    float process(float x) {
        static constexpr float R = 0.9995f;
        float y = x - x1_ + R * y1_;
        x1_ = x;
        y1_ = y;
        return y;
    }
private:
    float x1_, y1_;
};

// --- Crossfade Pitch Shifter (4-head) ---
// 4 read heads with raised-cosine envelopes, staggered by 0.25.
// Sum of 4 such envelopes = constant 2.0, normalized to 1.0.
// Eliminates the "brrrr" modulation artifact of 2-head designs.
static constexpr int PS_BUF_SIZE = 32768;
static constexpr int PS_BUF_MASK = PS_BUF_SIZE - 1;
static constexpr int HALF_LIFE = 4096;   // ~85ms grains at 48kHz
static constexpr int NUM_HEADS = 4;

class CrossfadePitchShifter {
public:
    CrossfadePitchShifter() { reset(); }

    void reset() {
        std::memset(buf_, 0, sizeof(buf_));
        writePos_ = 0;
        pitchRatio_ = 2.0f;
        for (int h = 0; h < NUM_HEADS; ++h) {
            phase_[h] = static_cast<float>(h) / static_cast<float>(NUM_HEADS);
            readPos_[h] = -static_cast<float>(HALF_LIFE * (2 + h));
        }
        dc_.reset();
    }

    void setPitchSemitones(float semi) {
        pitchRatio_ = powf(2.0f, semi / 12.0f);
    }

    float process(float input) {
        buf_[writePos_ & PS_BUF_MASK] = input;

        float drift = fabsf(pitchRatio_ - 1.0f);
        float phaseInc = drift / static_cast<float>(2 * HALF_LIFE);

        if (drift < 0.001f) {
            writePos_++;
            return input;
        }

        float output = 0.0f;

        for (int t = 0; t < NUM_HEADS; ++t) {
            readPos_[t] += pitchRatio_;
            phase_[t] += phaseInc;

            if (phase_[t] >= 1.0f) {
                phase_[t] -= 1.0f;
                readPos_[t] = static_cast<float>(writePos_) - static_cast<float>(HALF_LIFE * 5 / 2);
            }

            // Hermite interpolation
            int idx = static_cast<int>(floorf(readPos_[t]));
            float frac = readPos_[t] - floorf(readPos_[t]);
            float sm1 = buf_[(idx - 1) & PS_BUF_MASK];
            float s0  = buf_[idx & PS_BUF_MASK];
            float s1  = buf_[(idx + 1) & PS_BUF_MASK];
            float s2  = buf_[(idx + 2) & PS_BUF_MASK];
            float sample = hermite(frac, sm1, s0, s1, s2);

            float env = 0.5f * (1.0f - cosf(2.0f * PI * phase_[t]));
            output += sample * env;
        }

        writePos_++;
        // 4 heads sum to 2.0 — normalize
        output *= 0.5f;
        return dc_.process(output);
    }

private:
    float buf_[PS_BUF_SIZE];
    float readPos_[NUM_HEADS];
    float phase_[NUM_HEADS];
    int writePos_;
    float pitchRatio_;
    DCBlocker dc_;
};

// --- Allpass diffuser (Dattorro lattice — TRUE allpass) ---
// H(z) = (g + z^{-M}) / (1 + g·z^{-M}), |H(e^jw)| = 1 for all w.
class Allpass {
public:
    Allpass() : pos_(0), size_(1) {
        std::memset(buf_, 0, sizeof(buf_));
    }

    void setSize(int size) {
        size_ = std::max(1, std::min(size, 8191));
        pos_ = 0;
        std::memset(buf_, 0, sizeof(buf_));
    }

    float process(float input, float coeff) {
        float delayed = buf_[pos_];
        float v = input - coeff * delayed;
        float output = coeff * v + delayed;
        buf_[pos_] = v;
        pos_ = (pos_ + 1) % size_;
        return output;
    }

private:
    float buf_[8192];
    int pos_;
    int size_;
};

// --- OnePole lowpass ---
class OnePole {
public:
    OnePole() : coeff_(0.5f), z1_(0.0f) {}

    void setCoeff(float c) { coeff_ = c; }

    void reset() { z1_ = 0.0f; }

    float process(float input) {
        z1_ = input * (1.0f - coeff_) + z1_ * coeff_;
        return z1_;
    }

private:
    float coeff_;
    float z1_;
};

// --- DelayLine with Hermite-interpolated read ---
class DelayLine {
public:
    static constexpr int MAX_DELAY = 65536;

    DelayLine() : writePos_(0) {
        std::memset(buf_, 0, sizeof(buf_));
    }

    void reset() {
        std::memset(buf_, 0, sizeof(buf_));
        writePos_ = 0;
    }

    void write(float sample) {
        buf_[writePos_ & (MAX_DELAY - 1)] = sample;
        writePos_++;
    }

    float read(int delaySamples) const {
        return buf_[(writePos_ - delaySamples) & (MAX_DELAY - 1)];
    }

    float readInterp(float delaySamples) const {
        int intPart = static_cast<int>(delaySamples);
        float frac = delaySamples - static_cast<float>(intPart);
        float sm1 = buf_[(writePos_ - intPart + 1) & (MAX_DELAY - 1)];
        float s0  = buf_[(writePos_ - intPart)     & (MAX_DELAY - 1)];
        float s1  = buf_[(writePos_ - intPart - 1) & (MAX_DELAY - 1)];
        float s2  = buf_[(writePos_ - intPart - 2) & (MAX_DELAY - 1)];
        return hermite(frac, sm1, s0, s1, s2);
    }

private:
    float buf_[MAX_DELAY];
    int writePos_;
};

// --- Soft-knee limiter (transparent below 0.95) ---
static inline float softLimit(float x) {
    if (x > 0.95f) {
        float excess = x - 0.95f;
        return 0.95f + excess / (1.0f + excess * 20.0f);
    }
    if (x < -0.95f) {
        float excess = -x - 0.95f;
        return -(0.95f + excess / (1.0f + excess * 20.0f));
    }
    return x;
}

// ============================================================================
// ShimmerReverbEffect
// ============================================================================

enum ShimmerParam {
    PARAM_DECAY     = 0,
    PARAM_SHIMMER   = 1,
    PARAM_PITCH     = 2,
    PARAM_DAMPING   = 3,
    PARAM_SIZE      = 4,
    PARAM_PREDELAY  = 5,
    PARAM_MOD_RATE  = 6,
    PARAM_MOD_DEPTH = 7,
    PARAM_MIX       = 8,
    PARAM_COUNT     = 9
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Decay", "Shimmer", "Pitch", "Damping", "Size",
    "Predelay", "ModRate", "ModDepth", "Mix"
};

static const float PARAM_MINS[PARAM_COUNT] = {
    0.0f, 0.0f, -24.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    1.0f, 1.0f, 24.0f, 1.0f, 1.0f, 0.5f, 1.0f, 1.0f, 1.0f
};

static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    0.5f, 0.3f, 12.0f, 0.6f, 0.6f, 0.04f, 0.3f, 0.2f, 0.5f
};

// Base delay sizes at 48kHz (Dattorro-inspired prime-ish values)
static constexpr int BASE_INPUT_AP_SIZES[4] = { 142, 107, 379, 277 };
static constexpr int BASE_TANK_AP_SIZES[2]  = { 672, 908 };
static constexpr int BASE_TANK_DELAY_SIZES[2] = { 4453, 4217 };

class ShimmerReverbEffect : public WASMEffectBase {
public:
    ShimmerReverbEffect() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];

        feedbackL_ = 0.0f;
        feedbackR_ = 0.0f;
        lfoPhase_ = 0.0f;
    }

    ~ShimmerReverbEffect() override = default;

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        srScale_ = static_cast<float>(sampleRate) / 48000.0f;
        resetDSP();
        applyAllParams();
    }

    void process(float* inputL, float* inputR,
                float* outputL, float* outputR, int numSamples) override
    {
        numSamples = std::min(numSamples, DEFAULT_BLOCK_SIZE * 4);

        if (!isInitialized_) {
            if (inputL != outputL) std::memcpy(outputL, inputL, numSamples * sizeof(float));
            if (inputR != outputR) std::memcpy(outputR, inputR, numSamples * sizeof(float));
            return;
        }

        const float mix = params_[PARAM_MIX];
        const float dry = 1.0f - mix;
        // Decay maps 0-1 → 0.2-0.88
        const float decay = 0.2f + params_[PARAM_DECAY] * 0.68f;
        const float shimmer = params_[PARAM_SHIMMER];
        const float damping = params_[PARAM_DAMPING];
        // Modulation: up to ~2ms for gentle chorus
        const float modDepth = params_[PARAM_MOD_DEPTH] * 100.0f * srScale_;
        const float lfoInc = (0.05f + params_[PARAM_MOD_RATE] * 2.95f) / static_cast<float>(sampleRate_);
        const int predelaySamples = static_cast<int>(params_[PARAM_PREDELAY] * static_cast<float>(sampleRate_));

        // Input scaling: tank runs at reduced level for clean headroom.
        // With true allpass (unity gain), tank level is predictable:
        // steady-state ≈ INPUT_SCALE / (1 - decay).
        // At 75% decay knob (0.71 internal): 0.25/0.29 ≈ 0.86 — clean.
        static constexpr float INPUT_SCALE = 0.25f;
        // Output gain compensates for input attenuation
        static constexpr float OUTPUT_GAIN = 2.0f;

        for (int i = 0; i < numSamples; ++i) {
            float mono = (inputL[i] + inputR[i]) * 0.5f * INPUT_SCALE;

            // Predelay
            predelay_.write(mono);
            float predelayed = predelay_.read(std::max(1, predelaySamples));

            // Input diffusion: 4 cascaded allpass (true allpass, no gain coloring)
            float diffused = predelayed;
            diffused = inputAP_[0].process(diffused, 0.60f);
            diffused = inputAP_[1].process(diffused, 0.60f);
            diffused = inputAP_[2].process(diffused, 0.50f);
            diffused = inputAP_[3].process(diffused, 0.50f);

            // LFO for gentle chorus modulation
            lfoPhase_ += lfoInc;
            if (lfoPhase_ >= 1.0f) lfoPhase_ -= 1.0f;
            float lfo = sinf(2.0f * PI * lfoPhase_) * modDepth;

            // --- Tank Left ---
            float tankInL = diffused + feedbackR_ * decay;
            tankInL = tankAP_[0].process(tankInL, 0.5f);
            tankDelay_[0].write(tankInL);
            float tankOutL = tankDelay_[0].readInterp(
                static_cast<float>(scaledTankDelay_[0]) + lfo
            );
            dampL_.setCoeff(damping);
            tankOutL = dampL_.process(tankOutL);

            // --- Tank Right ---
            float tankInR = diffused + feedbackL_ * decay;
            tankInR = tankAP_[1].process(tankInR, 0.5f);
            tankDelay_[1].write(tankInR);
            float tankOutR = tankDelay_[1].readInterp(
                static_cast<float>(scaledTankDelay_[1]) - lfo
            );
            dampR_.setCoeff(damping);
            tankOutR = dampR_.process(tankOutR);

            // Pitch-shifted feedback (shimmer)
            float shiftedL = pitchL_.process(tankOutL);
            float shiftedR = pitchR_.process(tankOutR);

            // Blend clean tank + shimmer for feedback
            float shimAmt = shimmer;
            float fbL = tankOutL * (1.0f - shimAmt) + shiftedL * shimAmt;
            float fbR = tankOutR * (1.0f - shimAmt) + shiftedR * shimAmt;

            // DC-block then soft-limit feedback
            feedbackL_ = softLimit(fbDcL_.process(fbL));
            feedbackR_ = softLimit(fbDcR_.process(fbR));

            // Output: blend, scale up, soft-limit for safety
            float outL = (tankOutL * (1.0f - shimAmt) + shiftedL * shimAmt) * OUTPUT_GAIN;
            float outR = (tankOutR * (1.0f - shimAmt) + shiftedR * shimAmt) * OUTPUT_GAIN;
            outputL[i] = inputL[i] * dry + softLimit(outL) * mix;
            outputR[i] = inputR[i] * dry + softLimit(outR) * mix;
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        params_[paramId] = clamp(value, PARAM_MINS[paramId], PARAM_MAXS[paramId]);
        applyParam(paramId);
    }

    float getParameter(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return params_[paramId];
        return 0.0f;
    }

    int getParameterCount() const override { return PARAM_COUNT; }

    const char* getParameterName(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_NAMES[paramId];
        return "";
    }

    float getParameterMin(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_MINS[paramId];
        return 0.0f;
    }

    float getParameterMax(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_MAXS[paramId];
        return 1.0f;
    }

    float getParameterDefault(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_DEFAULTS[paramId];
        return 0.0f;
    }

private:
    float params_[PARAM_COUNT];

    // Pre-delay
    DelayLine predelay_;

    // Input diffusion (4 allpass stages)
    Allpass inputAP_[4];

    // Tank (2-channel cross-fed)
    Allpass tankAP_[2];
    DelayLine tankDelay_[2];
    OnePole dampL_, dampR_;
    int scaledTankDelay_[2];

    // Pitch shifters for shimmer feedback
    CrossfadePitchShifter pitchL_, pitchR_;

    // DC blockers on feedback path
    DCBlocker fbDcL_, fbDcR_;

    // Feedback state
    float feedbackL_, feedbackR_;

    // LFO
    float lfoPhase_;
    float srScale_ = 1.0f;

    void resetDSP() {
        predelay_.reset();
        for (int i = 0; i < 4; ++i) {
            inputAP_[i].setSize(static_cast<int>(static_cast<float>(BASE_INPUT_AP_SIZES[i]) * srScale_));
        }
        for (int i = 0; i < 2; ++i) {
            tankAP_[i].setSize(static_cast<int>(static_cast<float>(BASE_TANK_AP_SIZES[i]) * srScale_));
            scaledTankDelay_[i] = static_cast<int>(static_cast<float>(BASE_TANK_DELAY_SIZES[i]) * srScale_);
            tankDelay_[i].reset();
        }
        dampL_.reset();
        dampR_.reset();
        pitchL_.reset();
        pitchR_.reset();
        fbDcL_.reset();
        fbDcR_.reset();
        feedbackL_ = 0.0f;
        feedbackR_ = 0.0f;
        lfoPhase_ = 0.0f;
    }

    void applyParam(int id) {
        if (!isInitialized_) return;
        switch (id) {
            case PARAM_PITCH:
                pitchL_.setPitchSemitones(params_[PARAM_PITCH]);
                pitchR_.setPitchSemitones(params_[PARAM_PITCH]);
                break;
            case PARAM_SIZE: {
                float sizeScale = 0.5f + params_[PARAM_SIZE] * 0.5f; // 0.5-1.0
                for (int i = 0; i < 4; ++i) {
                    inputAP_[i].setSize(static_cast<int>(
                        static_cast<float>(BASE_INPUT_AP_SIZES[i]) * srScale_ * sizeScale
                    ));
                }
                for (int i = 0; i < 2; ++i) {
                    tankAP_[i].setSize(static_cast<int>(
                        static_cast<float>(BASE_TANK_AP_SIZES[i]) * srScale_ * sizeScale
                    ));
                    scaledTankDelay_[i] = static_cast<int>(
                        static_cast<float>(BASE_TANK_DELAY_SIZES[i]) * srScale_ * sizeScale
                    );
                }
                break;
            }
            default:
                break;
        }
    }

    void applyAllParams() {
        for (int i = 0; i < PARAM_COUNT; ++i) applyParam(i);
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(ShimmerReverbEffect)
#endif

} // namespace devilbox
