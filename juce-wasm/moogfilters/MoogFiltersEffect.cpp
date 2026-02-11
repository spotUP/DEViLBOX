/**
 * MoogFiltersEffect.cpp - WASM wrapper for 6 MoogLadders filter models
 *
 * Wraps HyperionMoog, KrajeskiMoog, StilsonMoog, MicrotrackerMoog,
 * ImprovedMoog, and OberheimVariationMoog behind a unified effect interface.
 *
 * Each model processes mono in-place, so we maintain separate L/R filter
 * instances for stereo processing.
 */

#include "WASMEffectBase.h"

// MoogLadders filter models
#include "src/MoogUtils.h"
#include "src/LadderFilterBase.h"
#include "src/HyperionModel.h"
#include "src/KrajeskiModel.h"
#include "src/StilsonModel.h"
#include "src/MicrotrackerModel.h"
#include "src/ImprovedModel.h"
#include "src/OberheimVariationModel.h"

#include <cstring>
#include <algorithm>

namespace devilbox {

// Parameter IDs
enum MoogFilterParam {
    PARAM_MODEL       = 0,  // 0-5: model index
    PARAM_CUTOFF      = 1,  // 20-20000 Hz
    PARAM_RESONANCE   = 2,  // 0-1
    PARAM_DRIVE       = 3,  // 0.1-4.0
    PARAM_FILTER_MODE = 4,  // 0-6: Hyperion filter mode (LP2,LP4,BP2,BP4,HP2,HP4,NOTCH)
    PARAM_WET         = 5,  // 0-1: dry/wet mix
    PARAM_COUNT       = 6
};

enum MoogModel {
    MODEL_HYPERION    = 0,
    MODEL_KRAJESKI    = 1,
    MODEL_STILSON     = 2,
    MODEL_MICROTRACKER = 3,
    MODEL_IMPROVED    = 4,
    MODEL_OBERHEIM    = 5,
    MODEL_COUNT       = 6
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Model", "Cutoff", "Resonance", "Drive", "FilterMode", "Wet"
};

static const float PARAM_MINS[PARAM_COUNT] = {
    0.0f, 20.0f, 0.0f, 0.1f, 0.0f, 0.0f
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    5.0f, 20000.0f, 1.0f, 4.0f, 6.0f, 1.0f
};

static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    0.0f, 1000.0f, 0.1f, 1.0f, 1.0f, 1.0f  // Hyperion, 1kHz, light reso, unity drive, LP4, full wet
};

class MoogFiltersEffect : public WASMEffectBase {
public:
    MoogFiltersEffect() {
        // Set defaults before filters are created
        currentModel_ = MODEL_HYPERION;
        cutoff_ = 1000.0f;
        resonance_ = 0.1f;
        drive_ = 1.0f;
        filterMode_ = 1; // LP4
        wet_ = 1.0f;
    }

    ~MoogFiltersEffect() override {
        destroyFilters();
    }

    void initialize(int sampleRate) override {
        WASMEffectBase::initialize(sampleRate);
        createFilters(sampleRate);
        applyAllParams();
    }

    void process(float* inputL, float* inputR,
                float* outputL, float* outputR, int numSamples) override
    {
        // Clamp to buffer size to prevent overflow
        numSamples = std::min(numSamples, DEFAULT_BLOCK_SIZE * 4);

        if (!isInitialized_ || !filterL_ || !filterR_) {
            // Passthrough if not ready
            if (inputL != outputL) std::memcpy(outputL, inputL, numSamples * sizeof(float));
            if (inputR != outputR) std::memcpy(outputR, inputR, numSamples * sizeof(float));
            return;
        }

        // Copy input to processing buffers (filters process in-place)
        std::memcpy(procBufL_, inputL, numSamples * sizeof(float));
        std::memcpy(procBufR_, inputR, numSamples * sizeof(float));

        // Process through current filter model
        filterL_->Process(procBufL_, numSamples);
        filterR_->Process(procBufR_, numSamples);

        // Wet/dry mix
        if (wet_ >= 0.999f) {
            // Full wet - just copy
            std::memcpy(outputL, procBufL_, numSamples * sizeof(float));
            std::memcpy(outputR, procBufR_, numSamples * sizeof(float));
        } else if (wet_ <= 0.001f) {
            // Full dry - passthrough
            if (inputL != outputL) std::memcpy(outputL, inputL, numSamples * sizeof(float));
            if (inputR != outputR) std::memcpy(outputR, inputR, numSamples * sizeof(float));
        } else {
            // Mix
            float dry = 1.0f - wet_;
            for (int i = 0; i < numSamples; ++i) {
                outputL[i] = dry * inputL[i] + wet_ * procBufL_[i];
                outputR[i] = dry * inputR[i] + wet_ * procBufR_[i];
            }
        }
    }

    void setParameter(int paramId, float value) override {
        switch (paramId) {
            case PARAM_MODEL: {
                int newModel = clamp((int)value, 0, MODEL_COUNT - 1);
                if (newModel != currentModel_) {
                    currentModel_ = newModel;
                    if (isInitialized_) {
                        createFilters(sampleRate_);
                        applyAllParams();
                    }
                }
                break;
            }
            case PARAM_CUTOFF:
                cutoff_ = clamp(value, 20.0f, 20000.0f);
                if (filterL_) filterL_->SetCutoff(cutoff_);
                if (filterR_) filterR_->SetCutoff(cutoff_);
                break;
            case PARAM_RESONANCE:
                resonance_ = clamp(value, 0.0f, 1.0f);
                if (filterL_) filterL_->SetResonance(resonance_);
                if (filterR_) filterR_->SetResonance(resonance_);
                break;
            case PARAM_DRIVE:
                drive_ = clamp(value, 0.1f, 4.0f);
                applyDrive();
                break;
            case PARAM_FILTER_MODE:
                filterMode_ = clamp((int)value, 0, 6);
                applyFilterMode();
                break;
            case PARAM_WET:
                wet_ = clamp(value, 0.0f, 1.0f);
                break;
        }
    }

    float getParameter(int paramId) const override {
        switch (paramId) {
            case PARAM_MODEL:       return (float)currentModel_;
            case PARAM_CUTOFF:      return cutoff_;
            case PARAM_RESONANCE:   return resonance_;
            case PARAM_DRIVE:       return drive_;
            case PARAM_FILTER_MODE: return (float)filterMode_;
            case PARAM_WET:         return wet_;
            default:                return 0.0f;
        }
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
    LadderFilterBase* filterL_ = nullptr;
    LadderFilterBase* filterR_ = nullptr;

    int currentModel_ = MODEL_HYPERION;
    float cutoff_ = 1000.0f;
    float resonance_ = 0.1f;
    float drive_ = 1.0f;
    int filterMode_ = 1; // LP4
    float wet_ = 1.0f;

    // Processing buffers (filters process in-place)
    float procBufL_[DEFAULT_BLOCK_SIZE * 4]; // 4x for safety with larger blocks
    float procBufR_[DEFAULT_BLOCK_SIZE * 4];

    void destroyFilters() {
        delete filterL_;
        delete filterR_;
        filterL_ = nullptr;
        filterR_ = nullptr;
    }

    void createFilters(int sr) {
        destroyFilters();
        float sampleRate = static_cast<float>(sr);

        switch (currentModel_) {
            case MODEL_HYPERION:
                filterL_ = new HyperionMoog(sampleRate);
                filterR_ = new HyperionMoog(sampleRate);
                break;
            case MODEL_KRAJESKI:
                filterL_ = new KrajeskiMoog(sampleRate);
                filterR_ = new KrajeskiMoog(sampleRate);
                break;
            case MODEL_STILSON:
                filterL_ = new StilsonMoog(sampleRate);
                filterR_ = new StilsonMoog(sampleRate);
                break;
            case MODEL_MICROTRACKER:
                filterL_ = new MicrotrackerMoog(sampleRate);
                filterR_ = new MicrotrackerMoog(sampleRate);
                break;
            case MODEL_IMPROVED:
                filterL_ = new ImprovedMoog(sampleRate);
                filterR_ = new ImprovedMoog(sampleRate);
                break;
            case MODEL_OBERHEIM:
                filterL_ = new OberheimVariationMoog(sampleRate);
                filterR_ = new OberheimVariationMoog(sampleRate);
                break;
            default:
                filterL_ = new HyperionMoog(sampleRate);
                filterR_ = new HyperionMoog(sampleRate);
                break;
        }
    }

    void applyAllParams() {
        if (!filterL_ || !filterR_) return;
        filterL_->SetCutoff(cutoff_);
        filterR_->SetCutoff(cutoff_);
        filterL_->SetResonance(resonance_);
        filterR_->SetResonance(resonance_);
        applyDrive();
        applyFilterMode();
    }

    void applyDrive() {
        // Drive is only supported by Hyperion, Krajeski, and Improved models
        if (currentModel_ == MODEL_HYPERION) {
            auto* h = dynamic_cast<HyperionMoog*>(filterL_);
            if (h) h->SetDrive(drive_);
            h = dynamic_cast<HyperionMoog*>(filterR_);
            if (h) h->SetDrive(drive_);
        }
        // KrajeskiMoog and ImprovedMoog have drive as a private member set in constructor
        // For those, drive is baked into the processing - not dynamically settable
        // via the base class interface. The KrajeskiMoog uses drive in Process() directly.
    }

    void applyFilterMode() {
        // Filter mode is only supported by Hyperion
        if (currentModel_ == MODEL_HYPERION) {
            auto* h = dynamic_cast<HyperionMoog*>(filterL_);
            if (h) h->SetFilterMode(static_cast<HyperionMoog::FilterMode>(filterMode_));
            h = dynamic_cast<HyperionMoog*>(filterR_);
            if (h) h->SetFilterMode(static_cast<HyperionMoog::FilterMode>(filterMode_));
        }
    }
};

// Export inside namespace so Embind registers as "MoogFiltersEffect" (not "devilbox::MoogFiltersEffect")
#ifdef __EMSCRIPTEN__
EXPORT_WASM_EFFECT(MoogFiltersEffect)
#endif

} // namespace devilbox
