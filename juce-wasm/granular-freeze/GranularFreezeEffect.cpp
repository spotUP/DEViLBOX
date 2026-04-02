/**
 * GranularFreezeEffect.cpp - Live-capture granular freeze effect
 *
 * Continuously buffers incoming audio. When "frozen", spawns overlapping
 * grains from the captured buffer with configurable density, pitch,
 * scatter, shimmer, and stereo width.
 */

#include "WASMEffectBase.h"
#include <algorithm>

namespace devilbox {

// 2 seconds stereo at 96kHz max
static constexpr int MAX_CAPTURE_SAMPLES = 96000 * 2;
static constexpr int MAX_GRAINS = 64;

struct Grain {
    bool   active      = false;
    int    bufferOffset = 0;     // start position in capture buffer
    int    grainLength = 0;      // length in samples
    float  position    = 0.0f;   // current read position (fractional)
    float  pitchRatio  = 1.0f;
    float  pan         = 0.0f;   // -1..+1
    float  envGain     = 0.0f;   // current envelope amplitude
};

enum GranularParam {
    PARAM_FREEZE       = 0,   // 0 or 1
    PARAM_GRAIN_SIZE   = 1,   // 0.01 - 0.5 seconds
    PARAM_DENSITY      = 2,   // 1 - 50 grains/sec
    PARAM_SCATTER      = 3,   // 0 - 1
    PARAM_PITCH        = 4,   // -24 to +24 semitones
    PARAM_SPRAY        = 5,   // 0 - 1
    PARAM_SHIMMER      = 6,   // 0 - 1 (probability of octave-up)
    PARAM_STEREO_WIDTH = 7,   // 0 - 1
    PARAM_FEEDBACK     = 8,   // 0 - 1
    PARAM_CAPTURE_LEN  = 9,   // 0.05 - 2.0 seconds
    PARAM_ATTACK       = 10,  // 0.001 - 0.05 seconds
    PARAM_RELEASE      = 11,  // 0.001 - 0.2 seconds
    PARAM_THRU         = 12,  // 0 or 1
    PARAM_MIX          = 13,  // 0 - 1
    PARAM_COUNT        = 14
};

class GranularFreezeEffect : public WASMEffectBase {
public:
    GranularFreezeEffect() {
        // Set defaults
        params_[PARAM_FREEZE]       = 0.0f;
        params_[PARAM_GRAIN_SIZE]   = 0.08f;
        params_[PARAM_DENSITY]      = 12.0f;
        params_[PARAM_SCATTER]      = 0.3f;
        params_[PARAM_PITCH]        = 0.0f;
        params_[PARAM_SPRAY]        = 0.2f;
        params_[PARAM_SHIMMER]      = 0.0f;
        params_[PARAM_STEREO_WIDTH] = 0.7f;
        params_[PARAM_FEEDBACK]     = 0.0f;
        params_[PARAM_CAPTURE_LEN]  = 0.5f;
        params_[PARAM_ATTACK]       = 0.005f;
        params_[PARAM_RELEASE]      = 0.04f;
        params_[PARAM_THRU]         = 0.0f;
        params_[PARAM_MIX]          = 1.0f;

        std::memset(captureL_, 0, sizeof(captureL_));
        std::memset(captureR_, 0, sizeof(captureR_));
        for (int i = 0; i < MAX_GRAINS; i++) {
            grains_[i] = Grain{};
        }
    }

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        writePos_ = 0;
        grainTimer_ = 0.0f;
        rngState_ = 0x12345678u;
        std::memset(captureL_, 0, sizeof(captureL_));
        std::memset(captureR_, 0, sizeof(captureR_));
        for (int i = 0; i < MAX_GRAINS; i++) {
            grains_[i] = Grain{};
        }
    }

    void process(float* inputL, float* inputR,
                 float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        const bool frozen     = params_[PARAM_FREEZE] >= 0.5f;
        const float grainSize = params_[PARAM_GRAIN_SIZE];
        const float density   = params_[PARAM_DENSITY];
        const float scatter   = params_[PARAM_SCATTER];
        const float pitch     = params_[PARAM_PITCH];
        const float spray     = params_[PARAM_SPRAY];
        const float shimmer   = params_[PARAM_SHIMMER];
        const float stereoW   = params_[PARAM_STEREO_WIDTH];
        const float feedback  = params_[PARAM_FEEDBACK];
        const float capLen    = params_[PARAM_CAPTURE_LEN];
        const float attack    = params_[PARAM_ATTACK];
        const float release   = params_[PARAM_RELEASE];
        const bool  thru      = params_[PARAM_THRU] >= 0.5f;
        const float mix       = params_[PARAM_MIX];

        const int captureLength = std::max(1, std::min(
            static_cast<int>(capLen * sampleRate_), MAX_CAPTURE_SAMPLES));
        const int grainLenSamples = std::max(1, static_cast<int>(grainSize * sampleRate_));
        const int attackSamples  = std::max(1, static_cast<int>(attack * sampleRate_));
        const int releaseSamples = std::max(1, static_cast<int>(release * sampleRate_));

        // Pitch ratio from semitones: 2^(semitones/12)
        const float basePitchRatio = std::pow(2.0f, pitch / 12.0f);

        // Samples between grain triggers
        const float triggerInterval = (density > 0.0f)
            ? static_cast<float>(sampleRate_) / density
            : static_cast<float>(sampleRate_);

        for (int i = 0; i < numSamples; i++) {
            const float inL = inputL[i];
            const float inR = inputR[i];

            // --- Capture ---
            if (!frozen) {
                captureL_[writePos_ % captureLength] = inL;
                captureR_[writePos_ % captureLength] = inR;
                writePos_ = (writePos_ + 1) % captureLength;
            }

            // --- Grain triggering ---
            if (frozen) {
                grainTimer_ += 1.0f;
                if (grainTimer_ >= triggerInterval) {
                    grainTimer_ -= triggerInterval;
                    triggerGrain(captureLength, grainLenSamples,
                                 scatter, spray, basePitchRatio, shimmer, stereoW);
                }
            } else {
                grainTimer_ = 0.0f;
            }

            // --- Grain synthesis ---
            float sumL = 0.0f;
            float sumR = 0.0f;

            for (int g = 0; g < MAX_GRAINS; g++) {
                Grain& grain = grains_[g];
                if (!grain.active) continue;

                // Compute envelope (linear attack/release)
                const float posInGrain = grain.position;
                float env = 1.0f;
                if (posInGrain < static_cast<float>(attackSamples)) {
                    env = posInGrain / static_cast<float>(attackSamples);
                } else if (posInGrain > static_cast<float>(grain.grainLength - releaseSamples)) {
                    const float releasePos = posInGrain -
                        static_cast<float>(grain.grainLength - releaseSamples);
                    env = 1.0f - releasePos / static_cast<float>(releaseSamples);
                }
                env = clamp(env, 0.0f, 1.0f);
                grain.envGain = env;

                // Read from capture buffer with linear interpolation
                const float readPos = static_cast<float>(grain.bufferOffset) + grain.position;
                const int idx0 = static_cast<int>(readPos) % captureLength;
                const int idx1 = (idx0 + 1) % captureLength;
                const float frac = readPos - std::floor(readPos);

                // Handle negative modulo
                const int safeIdx0 = ((idx0 % captureLength) + captureLength) % captureLength;
                const int safeIdx1 = ((idx1 % captureLength) + captureLength) % captureLength;

                const float sL = captureL_[safeIdx0] * (1.0f - frac) + captureL_[safeIdx1] * frac;
                const float sR = captureR_[safeIdx0] * (1.0f - frac) + captureR_[safeIdx1] * frac;

                // Pan: -1 = full left, +1 = full right
                const float gainL = env * (1.0f - std::max(0.0f, grain.pan));
                const float gainR = env * (1.0f + std::min(0.0f, grain.pan));

                sumL += sL * gainL;
                sumR += sR * gainR;

                // Advance position by pitch ratio
                grain.position += grain.pitchRatio;

                // Deactivate when grain ends
                if (grain.position >= static_cast<float>(grain.grainLength)) {
                    grain.active = false;
                }
            }

            // --- Feedback: mix output back into capture buffer ---
            if (frozen && feedback > 0.0f) {
                const int fbIdx = writePos_ % captureLength;
                captureL_[fbIdx] += sumL * feedback;
                captureR_[fbIdx] += sumR * feedback;
            }

            // --- Output ---
            if (frozen) {
                const float grainL = sumL + (thru ? inL : 0.0f);
                const float grainR = sumR + (thru ? inR : 0.0f);
                outputL[i] = inL * (1.0f - mix) + grainL * mix;
                outputR[i] = inR * (1.0f - mix) + grainR * mix;
            } else {
                outputL[i] = inL;
                outputR[i] = inR;
            }
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            params_[paramId] = clamp(value,
                getParameterMin(paramId), getParameterMax(paramId));
        }
    }

    float getParameter(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            return params_[paramId];
        }
        return 0.0f;
    }

    int getParameterCount() const override { return PARAM_COUNT; }

    const char* getParameterName(int paramId) const override {
        switch (paramId) {
            case PARAM_FREEZE:       return "freeze";
            case PARAM_GRAIN_SIZE:   return "grainSize";
            case PARAM_DENSITY:      return "density";
            case PARAM_SCATTER:      return "scatter";
            case PARAM_PITCH:        return "pitch";
            case PARAM_SPRAY:        return "spray";
            case PARAM_SHIMMER:      return "shimmer";
            case PARAM_STEREO_WIDTH: return "stereoWidth";
            case PARAM_FEEDBACK:     return "feedback";
            case PARAM_CAPTURE_LEN:  return "captureLen";
            case PARAM_ATTACK:       return "attack";
            case PARAM_RELEASE:      return "release";
            case PARAM_THRU:         return "thru";
            case PARAM_MIX:          return "mix";
            default:                 return "";
        }
    }

    float getParameterMin(int paramId) const override {
        switch (paramId) {
            case PARAM_FREEZE:       return 0.0f;
            case PARAM_GRAIN_SIZE:   return 0.01f;
            case PARAM_DENSITY:      return 1.0f;
            case PARAM_SCATTER:      return 0.0f;
            case PARAM_PITCH:        return -24.0f;
            case PARAM_SPRAY:        return 0.0f;
            case PARAM_SHIMMER:      return 0.0f;
            case PARAM_STEREO_WIDTH: return 0.0f;
            case PARAM_FEEDBACK:     return 0.0f;
            case PARAM_CAPTURE_LEN:  return 0.05f;
            case PARAM_ATTACK:       return 0.001f;
            case PARAM_RELEASE:      return 0.001f;
            case PARAM_THRU:         return 0.0f;
            case PARAM_MIX:          return 0.0f;
            default:                 return 0.0f;
        }
    }

    float getParameterMax(int paramId) const override {
        switch (paramId) {
            case PARAM_FREEZE:       return 1.0f;
            case PARAM_GRAIN_SIZE:   return 0.5f;
            case PARAM_DENSITY:      return 50.0f;
            case PARAM_SCATTER:      return 1.0f;
            case PARAM_PITCH:        return 24.0f;
            case PARAM_SPRAY:        return 1.0f;
            case PARAM_SHIMMER:      return 1.0f;
            case PARAM_STEREO_WIDTH: return 1.0f;
            case PARAM_FEEDBACK:     return 1.0f;
            case PARAM_CAPTURE_LEN:  return 2.0f;
            case PARAM_ATTACK:       return 0.05f;
            case PARAM_RELEASE:      return 0.2f;
            case PARAM_THRU:         return 1.0f;
            case PARAM_MIX:          return 1.0f;
            default:                 return 1.0f;
        }
    }

    float getParameterDefault(int paramId) const override {
        switch (paramId) {
            case PARAM_FREEZE:       return 0.0f;
            case PARAM_GRAIN_SIZE:   return 0.08f;
            case PARAM_DENSITY:      return 12.0f;
            case PARAM_SCATTER:      return 0.3f;
            case PARAM_PITCH:        return 0.0f;
            case PARAM_SPRAY:        return 0.2f;
            case PARAM_SHIMMER:      return 0.0f;
            case PARAM_STEREO_WIDTH: return 0.7f;
            case PARAM_FEEDBACK:     return 0.0f;
            case PARAM_CAPTURE_LEN:  return 0.5f;
            case PARAM_ATTACK:       return 0.005f;
            case PARAM_RELEASE:      return 0.04f;
            case PARAM_THRU:         return 0.0f;
            case PARAM_MIX:          return 1.0f;
            default:                 return 0.0f;
        }
    }

private:
    float params_[PARAM_COUNT] = {};

    // Capture buffers (interleaved would save cache lines but separate is simpler)
    float captureL_[MAX_CAPTURE_SAMPLES] = {};
    float captureR_[MAX_CAPTURE_SAMPLES] = {};
    int   writePos_ = 0;

    // Grain pool
    Grain grains_[MAX_GRAINS] = {};
    float grainTimer_ = 0.0f;

    // Simple xorshift32 RNG
    uint32_t rngState_ = 0x12345678u;

    float nextRandom() {
        rngState_ ^= rngState_ << 13;
        rngState_ ^= rngState_ >> 17;
        rngState_ ^= rngState_ << 5;
        return static_cast<float>(rngState_) / static_cast<float>(0xFFFFFFFFu);
    }

    void triggerGrain(int captureLength, int grainLenSamples,
                      float scatter, float spray,
                      float basePitchRatio, float shimmerProb, float stereoWidth) {
        // Find a free grain slot
        int slot = -1;
        for (int i = 0; i < MAX_GRAINS; i++) {
            if (!grains_[i].active) {
                slot = i;
                break;
            }
        }
        if (slot < 0) return; // all grains busy

        Grain& g = grains_[slot];
        g.active = true;
        g.grainLength = grainLenSamples;
        g.position = 0.0f;
        g.envGain = 0.0f;

        // Buffer offset: scatter determines how far back into the buffer we read
        // spray adds random variation around the scatter point
        const float baseOffset = scatter * static_cast<float>(captureLength);
        const float sprayRange = spray * static_cast<float>(captureLength) * 0.5f;
        const float offsetF = baseOffset + (nextRandom() * 2.0f - 1.0f) * sprayRange;
        g.bufferOffset = static_cast<int>(clamp(offsetF, 0.0f,
            static_cast<float>(captureLength - 1)));

        // Pitch: base ratio with shimmer chance for octave-up
        g.pitchRatio = basePitchRatio;
        if (nextRandom() < shimmerProb) {
            g.pitchRatio *= 2.0f; // octave up
        }

        // Random stereo pan within width
        g.pan = (nextRandom() * 2.0f - 1.0f) * stereoWidth;
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(GranularFreezeEffect)
#endif

} // namespace devilbox
