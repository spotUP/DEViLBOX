/**
 * LeslieEffect.cpp - WASM wrapper for Leslie rotary speaker
 * Built from scratch for DEViLBOX.
 */

#include "WASMEffectBase.h"
#include "LeslieSpeaker.h"

#include <cstring>
#include <algorithm>

namespace devilbox {

enum LeslieParam {
    PARAM_SPEED        = 0,  // 0=slow, 0.5=brake, 1=fast
    PARAM_HORN_RATE    = 1,  // 0.1-10 Hz
    PARAM_DRUM_RATE    = 2,  // 0.1-8 Hz
    PARAM_HORN_DEPTH   = 3,  // 0-1
    PARAM_DRUM_DEPTH   = 4,  // 0-1
    PARAM_DOPPLER      = 5,  // 0-1
    PARAM_MIX          = 6,  // 0-1
    PARAM_WIDTH        = 7,  // 0-1
    PARAM_ACCELERATION = 8,  // 0-1
    PARAM_COUNT        = 9
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Speed", "HornRate", "DrumRate", "HornDepth", "DrumDepth",
    "Doppler", "Mix", "Width", "Acceleration"
};

static const float PARAM_MINS[PARAM_COUNT] = {
    0.0f, 0.1f, 0.1f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    1.0f, 10.0f, 8.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f
};

static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    0.0f, 6.8f, 5.9f, 0.7f, 0.5f, 0.5f, 1.0f, 0.8f, 0.5f
};

class LeslieEffect : public WASMEffectBase {
public:
    LeslieEffect() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];
    }

    ~LeslieEffect() override = default;

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        leslie_.initialize(sampleRate);
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

        leslie_.process(inputL, inputR, outputL, outputR, numSamples);
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
    LeslieSpeaker leslie_;
    float params_[PARAM_COUNT];

    void applyParam(int id) {
        switch (id) {
            case PARAM_SPEED:        leslie_.setSpeed(params_[id]); break;
            case PARAM_HORN_RATE:    leslie_.setHornRate(params_[id]); break;
            case PARAM_DRUM_RATE:    leslie_.setDrumRate(params_[id]); break;
            case PARAM_HORN_DEPTH:   leslie_.setHornDepth(params_[id]); break;
            case PARAM_DRUM_DEPTH:   leslie_.setDrumDepth(params_[id]); break;
            case PARAM_DOPPLER:      leslie_.setDoppler(params_[id]); break;
            case PARAM_MIX:          leslie_.setMix(params_[id]); break;
            case PARAM_WIDTH:        leslie_.setWidth(params_[id]); break;
            case PARAM_ACCELERATION: leslie_.setAcceleration(params_[id]); break;
        }
    }

    void applyAllParams() {
        for (int i = 0; i < PARAM_COUNT; ++i) applyParam(i);
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(LeslieEffect)
#endif

} // namespace devilbox
