/**
 * SpringReverbEffect.cpp - WASM wrapper for Spring Reverb
 * Built from scratch for DEViLBOX. Classic dub spring tank with drip.
 */

#include "WASMEffectBase.h"
#include "SpringReverb.h"

#include <cstring>
#include <algorithm>

namespace devilbox {

enum SpringReverbParam {
    PARAM_DECAY     = 0,
    PARAM_DAMPING   = 1,
    PARAM_TENSION   = 2,
    PARAM_MIX       = 3,
    PARAM_DRIP      = 4,
    PARAM_DIFFUSION = 5,
    PARAM_COUNT     = 6
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Decay", "Damping", "Tension", "Mix", "Drip", "Diffusion"
};

static const float PARAM_MINS[PARAM_COUNT] = {
    0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f
};

static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    0.6f, 0.4f, 0.5f, 0.35f, 0.5f, 0.7f
};

class SpringReverbEffect : public WASMEffectBase {
public:
    SpringReverbEffect() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];
    }

    ~SpringReverbEffect() override = default;

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        reverb_.initialize(sampleRate);
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

        reverb_.process(inputL, inputR, outputL, outputR, numSamples);
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
    SpringReverb reverb_;
    float params_[PARAM_COUNT];

    void applyParam(int id) {
        switch (id) {
            case PARAM_DECAY:     reverb_.setDecay(params_[id]); break;
            case PARAM_DAMPING:   reverb_.setDamping(params_[id]); break;
            case PARAM_TENSION:   reverb_.setTension(params_[id]); break;
            case PARAM_MIX:       reverb_.setMix(params_[id]); break;
            case PARAM_DRIP:      reverb_.setDrip(params_[id]); break;
            case PARAM_DIFFUSION: reverb_.setDiffusion(params_[id]); break;
        }
    }

    void applyAllParams() {
        for (int i = 0; i < PARAM_COUNT; ++i) applyParam(i);
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(SpringReverbEffect)
#endif

} // namespace devilbox
