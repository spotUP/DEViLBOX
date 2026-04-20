/**
 * DattorroPlateEffect.cpp — WASM wrapper for el-visio/dattorro-verb
 *
 * Implements Jon Dattorro's 1997 plate reverb algorithm ("Effect Design,
 * Part 1"). Single-file C implementation by Pauli Pölkki (MIT license)
 * drops into our WASMEffectBase harness — C source is compiled as C,
 * the wrapper links against it as C++.
 *
 * Character: metallic, "infinite" at high decay — closer to the Lexicon
 * PCM-70 / Mad Professor dub sound than MVerb's softer plate model.
 * Ships alongside MVerb (softer tuning) and MadProfessorPlate (MVerb
 * with pre/post EQ) so all three can be A/B'd at mix.
 */

#include "WASMEffectBase.h"

extern "C" {
#include "verb.h"
}

#include <cstring>
#include <algorithm>

namespace devilbox {

enum DattorroParam {
    PARAM_PREDELAY        = 0,
    PARAM_PREFILTER       = 1,
    PARAM_INPUT_DIFFUSION = 2,   // drives both inputDiffusion1 + inputDiffusion2
    PARAM_DECAY_DIFFUSION = 3,
    PARAM_DECAY           = 4,
    PARAM_DAMPING         = 5,
    PARAM_COUNT           = 6
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Predelay", "PreFilter", "InputDiffusion", "DecayDiffusion", "Decay", "Damping"
};
static const float PARAM_MINS[PARAM_COUNT]     = { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f };
static const float PARAM_MAXS[PARAM_COUNT]     = { 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f };
// Defaults tuned for a medium-long PCM-70-ish plate.
static const float PARAM_DEFAULTS[PARAM_COUNT] = { 0.15f, 0.70f, 0.75f, 0.50f, 0.85f, 0.35f };

class DattorroPlateEffect : public WASMEffectBase {
public:
    DattorroPlateEffect()
        : verb_(nullptr)
    {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];
    }

    ~DattorroPlateEffect() override {
        if (verb_) {
            DattorroVerb_delete(verb_);
            verb_ = nullptr;
        }
    }

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        if (verb_) {
            DattorroVerb_delete(verb_);
            verb_ = nullptr;
        }
        verb_ = DattorroVerb_create();
        applyAllParams();
    }

    void process(float* inputL, float* inputR,
                float* outputL, float* outputR, int numSamples) override
    {
        numSamples = std::min(numSamples, DEFAULT_BLOCK_SIZE * 4);

        if (!isInitialized_ || !verb_) {
            if (inputL != outputL) std::memcpy(outputL, inputL, numSamples * sizeof(float));
            if (inputR != outputR) std::memcpy(outputR, inputR, numSamples * sizeof(float));
            return;
        }

        // Dattorro's algorithm takes a single mono input and produces
        // stereo output via internal tap structure. Mix L+R before
        // pushing in; the reverb tank produces the L/R decorrelation.
        for (int i = 0; i < numSamples; ++i) {
            double mono = 0.5 * (static_cast<double>(inputL[i]) + static_cast<double>(inputR[i]));
            DattorroVerb_process(verb_, mono);
            outputL[i] = static_cast<float>(DattorroVerb_getLeft(verb_));
            outputR[i] = static_cast<float>(DattorroVerb_getRight(verb_));
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        params_[paramId] = clamp(value, PARAM_MINS[paramId], PARAM_MAXS[paramId]);
        if (verb_) applyParam(paramId);
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
    struct sDattorroVerb* verb_;
    float params_[PARAM_COUNT];

    void applyAllParams() {
        for (int i = 0; i < PARAM_COUNT; ++i) applyParam(i);
    }

    void applyParam(int paramId) {
        if (!verb_) return;
        const double v = static_cast<double>(params_[paramId]);
        switch (paramId) {
            case PARAM_PREDELAY:
                DattorroVerb_setPreDelay(verb_, v);
                break;
            case PARAM_PREFILTER:
                DattorroVerb_setPreFilter(verb_, v);
                break;
            case PARAM_INPUT_DIFFUSION:
                // Single user-facing knob drives both input diffusion stages.
                // Dattorro's paper uses 0.75 / 0.625 as defaults; we keep the
                // ratio so the UI has one "thickness" control.
                DattorroVerb_setInputDiffusion1(verb_, v);
                DattorroVerb_setInputDiffusion2(verb_, v * 0.833);
                break;
            case PARAM_DECAY_DIFFUSION:
                DattorroVerb_setDecayDiffusion(verb_, v);
                break;
            case PARAM_DECAY:
                DattorroVerb_setDecay(verb_, v);
                break;
            case PARAM_DAMPING:
                DattorroVerb_setDamping(verb_, v);
                break;
        }
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(DattorroPlateEffect)
#endif

} // namespace devilbox
