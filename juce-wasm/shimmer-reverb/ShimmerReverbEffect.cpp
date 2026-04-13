/**
 * ShimmerReverbEffect.cpp - WASM Shimmer Reverb
 * Dattorro plate reverb with grain-based pitch shifter in the feedback loop.
 * Built from scratch for DEViLBOX.
 */

#include "WASMEffectBase.h"

#include <cstring>
#include <cmath>
#include <algorithm>

namespace devilbox {

// ============================================================================
// DSP building blocks (all self-contained)
// ============================================================================

static constexpr float PI = 3.14159265358979323846f;

// --- Crossfade Pitch Shifter ---
// Two read heads advance at pitchRatio speed through a circular buffer.
// Each head has a full-cycle raised-cosine envelope (0→1→0) over its
// lifetime. Heads are staggered by half a lifetime so they always sum
// to exactly 1.0 — no clicks, no amplitude modulation.
static constexpr int PS_BUF_SIZE = 8192; // must be power of 2
static constexpr int PS_BUF_MASK = PS_BUF_SIZE - 1;
static constexpr int HALF_LIFE = 2048;   // half a head's lifetime (~42ms at 48kHz)

class CrossfadePitchShifter {
public:
    CrossfadePitchShifter() { reset(); }

    void reset() {
        std::memset(buf_, 0, sizeof(buf_));
        writePos_ = 0;
        pitchRatio_ = 2.0f;
        // Head 0 starts at beginning of its lifetime, head 1 is staggered by half
        phase_[0] = 0.0f;
        phase_[1] = 0.5f;
        // Both start reading from well behind writePos
        readPos_[0] = -static_cast<float>(HALF_LIFE * 2);
        readPos_[1] = -static_cast<float>(HALF_LIFE * 3);
    }

    void setPitchSemitones(float semi) {
        pitchRatio_ = powf(2.0f, semi / 12.0f);
    }

    float process(float input) {
        buf_[writePos_ & PS_BUF_MASK] = input;

        // Phase increment: one full cycle (0→1) = 2 * HALF_LIFE samples of drift.
        // drift per sample = |pitchRatio - 1|, full cycle when drift accumulates
        // to 2 * HALF_LIFE. So phaseInc = |ratio-1| / (2 * HALF_LIFE).
        float drift = fabsf(pitchRatio_ - 1.0f);
        float phaseInc = drift / static_cast<float>(2 * HALF_LIFE);

        // For ratio ≈ 1.0, barely any pitch shift — just pass through
        if (drift < 0.001f) {
            writePos_++;
            return input;
        }

        float output = 0.0f;

        for (int t = 0; t < 2; ++t) {
            // Advance read position at pitchRatio speed
            readPos_[t] += pitchRatio_;

            // Advance phase (sawtooth 0→1)
            phase_[t] += phaseInc;

            // When phase wraps, reset read position to safe distance behind write
            if (phase_[t] >= 1.0f) {
                phase_[t] -= 1.0f;
                readPos_[t] = static_cast<float>(writePos_) - static_cast<float>(HALF_LIFE * 2);
            }

            // Read with linear interpolation
            int idx0 = static_cast<int>(floorf(readPos_[t]));
            float frac = readPos_[t] - floorf(readPos_[t]);
            float s0 = buf_[idx0 & PS_BUF_MASK];
            float s1 = buf_[(idx0 + 1) & PS_BUF_MASK];
            float sample = s0 + frac * (s1 - s0);

            // Full-cycle raised cosine: 0.5*(1 - cos(2π*phase))
            // Goes 0 → 1 → 0 over one lifetime.
            // Two heads at phase offset 0.5: sum is ALWAYS 1.0.
            // (cos²(πp) + sin²(πp) = 1 rewritten as raised cosines)
            float env = 0.5f * (1.0f - cosf(2.0f * PI * phase_[t]));

            output += sample * env;
        }

        writePos_++;
        return output;
    }

private:
    float buf_[PS_BUF_SIZE];
    float readPos_[2];
    float phase_[2]; // 0-1 sawtooth, staggered by 0.5 between heads
    int writePos_;
    float pitchRatio_;
};

// --- Allpass diffuser ---
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
        float output = -input + delayed;
        buf_[pos_] = input + delayed * coeff;
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

// --- DelayLine with interpolated read ---
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
        float s0 = buf_[(writePos_ - intPart) & (MAX_DELAY - 1)];
        float s1 = buf_[(writePos_ - intPart - 1) & (MAX_DELAY - 1)];
        return s0 + frac * (s1 - s0);
    }

private:
    float buf_[MAX_DELAY];
    int writePos_;
};

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
        const float decay = 0.3f + params_[PARAM_DECAY] * 0.55f; // map 0-1 -> 0.3-0.85 (longer tail)
        const float shimmer = params_[PARAM_SHIMMER];
        const float damping = params_[PARAM_DAMPING];
        const float modDepth = params_[PARAM_MOD_DEPTH] * 200.0f * srScale_; // up to ~4ms — obvious chorus
        const float lfoInc = (0.05f + params_[PARAM_MOD_RATE] * 5.95f) / static_cast<float>(sampleRate_); // 0.05-6 Hz
        const int predelaySamples = static_cast<int>(params_[PARAM_PREDELAY] * static_cast<float>(sampleRate_));

        for (int i = 0; i < numSamples; ++i) {
            // Mono input sum
            float mono = (inputL[i] + inputR[i]) * 0.5f;

            // Predelay
            predelay_.write(mono);
            float predelayed = predelay_.read(std::max(1, predelaySamples));

            // Input diffusion: 4 cascaded allpass stages
            float diffused = predelayed;
            diffused = inputAP_[0].process(diffused, 0.75f);
            diffused = inputAP_[1].process(diffused, 0.75f);
            diffused = inputAP_[2].process(diffused, 0.625f);
            diffused = inputAP_[3].process(diffused, 0.625f);

            // LFO
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

            // Mix clean tank + shimmer for feedback
            // shimmer 0 = pure reverb, shimmer 1 = fully pitch-shifted feedback
            float shimAmt = shimmer; // full 0-1 range — user controls it directly
            feedbackL_ = tanhf(tankOutL * (1.0f - shimAmt) + shiftedL * shimAmt) * 0.7f;
            feedbackR_ = tanhf(tankOutR * (1.0f - shimAmt) + shiftedR * shimAmt) * 0.7f;

            // Output: crossfade between clean reverb and pitch-shifted reverb
            // shimmer 0 = pure plate reverb, shimmer 1 = fully pitch-shifted output
            float cleanL = tankOutL;
            float cleanR = tankOutR;
            float outL = cleanL * (1.0f - shimAmt) + shiftedL * shimAmt;
            float outR = cleanR * (1.0f - shimAmt) + shiftedR * shimAmt;
            outputL[i] = inputL[i] * dry + tanhf(outL) * mix * 0.7f;
            outputR[i] = inputR[i] * dry + tanhf(outR) * mix * 0.7f;
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
                // Remaining params (decay, shimmer, damping, predelay, modRate,
                // modDepth, mix) are read directly in process() each sample
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
