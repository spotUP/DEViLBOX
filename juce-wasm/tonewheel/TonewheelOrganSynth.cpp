/**
 * TonewheelOrganSynth.cpp - WASM wrapper for Tonewheel Organ
 * Built from scratch for DEViLBOX. Uses VSTBridge framework.
 */

#include "WASMSynthBase.h"
#include "WASMExports.h"
#include "TonewheelOrgan.h"

#include <cstring>

namespace devilbox {

enum TonewheelParam {
    PARAM_DRAWBAR_16    = 0,
    PARAM_DRAWBAR_513   = 1,
    PARAM_DRAWBAR_8     = 2,
    PARAM_DRAWBAR_4     = 3,
    PARAM_DRAWBAR_223   = 4,
    PARAM_DRAWBAR_2     = 5,
    PARAM_DRAWBAR_135   = 6,
    PARAM_DRAWBAR_113   = 7,
    PARAM_DRAWBAR_1     = 8,
    PARAM_PERCUSSION    = 9,
    PARAM_PERC_FAST     = 10,
    PARAM_PERC_SOFT     = 11,
    PARAM_CLICK         = 12,
    PARAM_VIBRATO_TYPE  = 13,
    PARAM_VIBRATO_DEPTH = 14,
    PARAM_OVERDRIVE     = 15,
    PARAM_VOLUME        = 16,
    PARAM_COUNT         = 17
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Drawbar:16'", "Drawbar:5-1/3'", "Drawbar:8'", "Drawbar:4'",
    "Drawbar:2-2/3'", "Drawbar:2'", "Drawbar:1-3/5'", "Drawbar:1-1/3'",
    "Drawbar:1'", "Percussion:Mode", "Percussion:Fast", "Percussion:Soft",
    "Tone:Click", "Vibrato:Type", "Vibrato:Depth", "Tone:Overdrive", "Master:Volume"
};

static const float PARAM_MINS[PARAM_COUNT] = {
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    8, 8, 8, 8, 8, 8, 8, 8, 8,
    2, 1, 1, 1, 5, 1, 1, 1
};

static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    8, 8, 8, 0, 0, 0, 0, 0, 0,
    0, 1, 0, 0.3f, 2, 0.5f, 0.0f, 0.8f
};

class TonewheelOrganSynth : public WASMSynthBase {
public:
    TonewheelOrganSynth() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);
        organ_.initialize(sampleRate);
        applyAllParams();
    }

    void noteOn(int midiNote, int velocity) override {
        organ_.noteOn(midiNote, velocity);
    }

    void noteOff(int midiNote) override {
        organ_.noteOff(midiNote);
    }

    void allNotesOff() override {
        organ_.allNotesOff();
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }
        organ_.process(outputL, outputR, numSamples);
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

#ifdef __EMSCRIPTEN__
    void processJS(uintptr_t outLPtr, uintptr_t outRPtr, int numSamples) {
        float* outputL = reinterpret_cast<float*>(outLPtr);
        float* outputR = reinterpret_cast<float*>(outRPtr);
        process(outputL, outputR, numSamples);
    }
#endif

private:
    TonewheelOrgan organ_;
    float params_[PARAM_COUNT];

    void applyParam(int id) {
        if (id <= PARAM_DRAWBAR_1) {
            organ_.setDrawbar(id, params_[id]);
        } else {
            switch (id) {
                case PARAM_PERCUSSION:    organ_.setPercussion(static_cast<int>(params_[id])); break;
                case PARAM_PERC_FAST:     organ_.setPercFast(params_[id]); break;
                case PARAM_PERC_SOFT:     organ_.setPercSoft(params_[id]); break;
                case PARAM_CLICK:         organ_.setClick(params_[id]); break;
                case PARAM_VIBRATO_TYPE:  organ_.setVibratoType(static_cast<int>(params_[id])); break;
                case PARAM_VIBRATO_DEPTH: organ_.setVibratoDepth(params_[id]); break;
                case PARAM_OVERDRIVE:     organ_.setOverdrive(params_[id]); break;
                case PARAM_VOLUME:        organ_.setVolume(params_[id]); break;
            }
        }
    }

    void applyAllParams() {
        for (int i = 0; i < PARAM_COUNT; ++i) applyParam(i);
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_SYNTH_EXTENDED_EX(TonewheelOrganSynth, devilbox::TonewheelOrganSynth, "TonewheelOrganSynth")
#endif

} // namespace devilbox
