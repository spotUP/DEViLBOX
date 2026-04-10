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

// --- Hann window LUT ---
static constexpr int GRAIN_SIZE = 512;
static constexpr int HOP_SIZE = 128;   // 4x overlap
static constexpr int NUM_GRAINS = GRAIN_SIZE / HOP_SIZE; // 4
static constexpr int MAX_BUFFER = 2048;

static float hannWindow[GRAIN_SIZE];
static bool hannInitialized = false;

static void initHann() {
    if (hannInitialized) return;
    for (int i = 0; i < GRAIN_SIZE; ++i) {
        hannWindow[i] = 0.5f * (1.0f - cosf(2.0f * PI * static_cast<float>(i) / static_cast<float>(GRAIN_SIZE)));
    }
    hannInitialized = true;
}

// --- GrainPitchShifter ---
class GrainPitchShifter {
public:
    GrainPitchShifter() {
        initHann();
        reset();
    }

    void reset() {
        std::memset(inputBuf_, 0, sizeof(inputBuf_));
        std::memset(outputBuf_, 0, sizeof(outputBuf_));
        writePos_ = 0;
        readPos_ = 0;
        hopCounter_ = 0;
        pitchRatio_ = 2.0f; // default +12 semitones
    }

    void setPitchSemitones(float semi) {
        pitchRatio_ = powf(2.0f, semi / 12.0f);
    }

    float process(float input) {
        // Write to circular input buffer
        inputBuf_[writePos_ & (MAX_BUFFER - 1)] = input;
        writePos_++;

        // Every HOP_SIZE samples, start a new grain
        hopCounter_++;
        if (hopCounter_ >= HOP_SIZE) {
            hopCounter_ = 0;
            synthesizeGrain();
        }

        // Read from output buffer
        float out = outputBuf_[readPos_ & (MAX_BUFFER - 1)];
        outputBuf_[readPos_ & (MAX_BUFFER - 1)] = 0.0f; // clear after read
        readPos_++;

        return out;
    }

private:
    float inputBuf_[MAX_BUFFER];
    float outputBuf_[MAX_BUFFER];
    int writePos_;
    int readPos_;
    int hopCounter_;
    float pitchRatio_;

    void synthesizeGrain() {
        // Read position: center grain around current write position
        float grainStart = static_cast<float>(writePos_) - static_cast<float>(GRAIN_SIZE);

        for (int i = 0; i < GRAIN_SIZE; ++i) {
            // Resample with pitch ratio using linear interpolation
            float srcPos = grainStart + static_cast<float>(i) * pitchRatio_;
            int idx0 = static_cast<int>(floorf(srcPos));
            float frac = srcPos - floorf(srcPos);

            float s0 = inputBuf_[idx0 & (MAX_BUFFER - 1)];
            float s1 = inputBuf_[(idx0 + 1) & (MAX_BUFFER - 1)];
            float sample = s0 + frac * (s1 - s0);

            // Overlap-add with Hann window
            int outIdx = (readPos_ + i) & (MAX_BUFFER - 1);
            outputBuf_[outIdx] += sample * hannWindow[i];
        }
    }
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
        const float decay = 0.3f + params_[PARAM_DECAY] * 0.45f; // map 0-1 -> 0.3-0.75
        const float shimmer = params_[PARAM_SHIMMER];
        const float damping = params_[PARAM_DAMPING];
        const float modDepth = params_[PARAM_MOD_DEPTH] * 16.0f * srScale_;
        const float lfoInc = (0.1f + params_[PARAM_MOD_RATE] * 2.9f) / static_cast<float>(sampleRate_);
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

            // Mix clean tank + shimmer for feedback, with soft clip to prevent runaway
            float shimAmt = shimmer * 0.6f; // scale down shimmer to prevent instability
            feedbackL_ = tanhf(tankOutL * (1.0f - shimAmt) + shiftedL * shimAmt);
            feedbackR_ = tanhf(tankOutR * (1.0f - shimAmt) + shiftedR * shimAmt);

            // Output: wet L/R mixed with dry input (soft clip wet signal)
            outputL[i] = inputL[i] * dry + tanhf(tankOutL) * mix;
            outputR[i] = inputR[i] * dry + tanhf(tankOutR) * mix;
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
    GrainPitchShifter pitchL_, pitchR_;

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
