/**
 * MVerbEffect.cpp - WASM wrapper for MVerb plate reverb
 *
 * Wraps Martin Eastwood's MVerb (GPL v3) behind the WASMEffectBase interface.
 * MVerb uses T** (double pointer) API, so we create stack float*[2] arrays.
 */

#include "WASMEffectBase.h"
#include "MVerb.h"

#include <cstring>
#include <algorithm>

namespace devilbox {

enum MVerbParam {
    PARAM_DAMPING    = 0,
    PARAM_DENSITY    = 1,
    PARAM_BANDWIDTH  = 2,
    PARAM_DECAY      = 3,
    PARAM_PREDELAY   = 4,
    PARAM_SIZE       = 5,
    PARAM_GAIN       = 6,
    PARAM_MIX        = 7,
    PARAM_EARLYMIX   = 8,
    PARAM_COUNT      = 9
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Damping", "Density", "Bandwidth", "Decay", "Predelay",
    "Size", "Gain", "Mix", "EarlyMix"
};

static const float PARAM_MINS[PARAM_COUNT] = {
    0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f
};

static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    0.5f, 0.5f, 0.5f, 0.7f, 0.0f, 0.8f, 1.0f, 0.4f, 0.5f
};

class MVerbEffect : public WASMEffectBase {
public:
    MVerbEffect() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];
    }

    ~MVerbEffect() override = default;

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        reverb_.setSampleRate(static_cast<float>(sampleRate));
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

        // Copy input to processing buffers (MVerb processes in-place)
        std::memcpy(procBufL_, inputL, numSamples * sizeof(float));
        std::memcpy(procBufR_, inputR, numSamples * sizeof(float));

        float* ins[2]  = { procBufL_, procBufR_ };
        float* outs[2] = { outputL, outputR };

        reverb_.process(ins, outs, numSamples);
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        params_[paramId] = clamp(value, PARAM_MINS[paramId], PARAM_MAXS[paramId]);
        reverb_.setParameter(paramId, params_[paramId]);
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
    MVerb<float> reverb_;
    float params_[PARAM_COUNT];
    float procBufL_[DEFAULT_BLOCK_SIZE * 4];
    float procBufR_[DEFAULT_BLOCK_SIZE * 4];

    void applyAllParams() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            reverb_.setParameter(i, params_[i]);
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(MVerbEffect)
#endif

} // namespace devilbox
