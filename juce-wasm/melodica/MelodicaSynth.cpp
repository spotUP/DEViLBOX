/**
 * MelodicaSynth.cpp - WASM wrapper for Melodica
 * Built from scratch for DEViLBOX. Uses VSTBridge framework.
 */

#include "WASMSynthBase.h"
#include "WASMExports.h"
#include "Melodica.h"

#include <cstring>

namespace devilbox {

enum MelodicaParam {
    PARAM_BREATH        = 0,
    PARAM_BRIGHTNESS    = 1,
    PARAM_VIBRATO_RATE  = 2,
    PARAM_VIBRATO_DEPTH = 3,
    PARAM_DETUNE        = 4,
    PARAM_NOISE         = 5,
    PARAM_PORTAMENTO    = 6,
    PARAM_ATTACK        = 7,
    PARAM_RELEASE       = 8,
    PARAM_VOLUME        = 9,
    PARAM_COUNT         = 10
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Tone:Breath", "Tone:Brightness", "Vibrato:Rate", "Vibrato:Depth",
    "Tone:Detune", "Tone:Noise", "Play:Portamento", "Envelope:Attack", "Envelope:Release", "Master:Volume"
};

static const float PARAM_MINS[PARAM_COUNT] = {
    0, 0, 0, 0, -50, 0, 0, 0, 0, 0
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    1, 1, 10, 1, 50, 1, 1, 1, 1, 1
};

static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    0.7f, 0.5f, 4.5f, 0.2f, 5.0f, 0.15f, 0.1f, 0.15f, 0.2f, 0.8f
};

class MelodicaWASMSynth : public WASMSynthBase {
public:
    MelodicaWASMSynth() {
        for (int i = 0; i < PARAM_COUNT; ++i)
            params_[i] = PARAM_DEFAULTS[i];
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);
        melodica_.initialize(sampleRate);
        applyAllParams();
    }

    void noteOn(int midiNote, int velocity) override {
        melodica_.noteOn(midiNote, velocity);
    }

    void noteOff(int midiNote) override {
        melodica_.noteOff(midiNote);
    }

    void allNotesOff() override {
        melodica_.allNotesOff();
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }
        melodica_.process(outputL, outputR, numSamples);
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
    MelodicaDSP melodica_;
    float params_[PARAM_COUNT];

    void applyParam(int id) {
        switch (id) {
            case PARAM_BREATH:        melodica_.setBreath(params_[id]); break;
            case PARAM_BRIGHTNESS:    melodica_.setBrightness(params_[id]); break;
            case PARAM_VIBRATO_RATE:  melodica_.setVibratoRate(params_[id]); break;
            case PARAM_VIBRATO_DEPTH: melodica_.setVibratoDepth(params_[id]); break;
            case PARAM_DETUNE:        melodica_.setDetune(params_[id]); break;
            case PARAM_NOISE:         melodica_.setNoise(params_[id]); break;
            case PARAM_PORTAMENTO:    melodica_.setPortamento(params_[id]); break;
            case PARAM_ATTACK:        melodica_.setAttack(params_[id]); break;
            case PARAM_RELEASE:       melodica_.setRelease(params_[id]); break;
            case PARAM_VOLUME:        melodica_.setVolume(params_[id]); break;
        }
    }

    void applyAllParams() {
        for (int i = 0; i < PARAM_COUNT; ++i) applyParam(i);
    }
};

#ifdef __EMSCRIPTEN__
EXPORT_WASM_SYNTH_EXTENDED_EX(MelodicaWASMSynth, devilbox::MelodicaWASMSynth, "MelodicaWASMSynth")
#endif

} // namespace devilbox
