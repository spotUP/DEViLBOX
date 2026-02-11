/**
 * SurgeWASM.cpp - Surge XT Hybrid Synth → WASMSynthBase adapter
 *
 * Wraps Surge XT's standalone DSP engine (surge-common) for use in
 * DEViLBOX's VSTBridge framework.
 *
 * Surge XT is a hybrid synthesizer by the Surge Synth Team (GPL v3).
 * Originally created by Claes Johanson / Vember Audio (2004-2018).
 *
 * Architecture:
 *   SurgeSynth (WASMSynthBase)
 *     └── SurgeSynthesizer  (complete DSP engine, no JUCE dependency)
 *           ├── Scene[2] (dual scene architecture)
 *           │     ├── Oscillator × 3 (12 types)
 *           │     ├── FilterChain (quad SIMD processing)
 *           │     ├── Envelope × 2
 *           │     └── LFO × 12 (6 voice + 6 scene)
 *           └── FX[16] (32 effect types)
 *
 * Surge's DSP engine is fully standalone in src/common/ (no JUCE needed).
 * It uses SST libraries for filters, waveshapers, and effects.
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

#include "SurgeSynthesizer.h"
#include "SurgeStorage.h"

#include <cstring>
#include <vector>

namespace devilbox {

/**
 * Minimal PluginLayer for Surge — the engine requires this callback interface.
 * In a real plugin, this notifies the host of parameter changes.
 * In WASM, we just absorb the callbacks.
 */
class WASMPluginLayer : public SurgeSynthesizer::PluginLayer {
public:
    void surgeParameterUpdated(const SurgeSynthesizer::ID& id, float value) override {
        (void)id; (void)value;
    }
    void surgeMacroUpdated(long macroNum, float value) override {
        (void)macroNum; (void)value;
    }
};

class SurgeSynth : public WASMSynthBase {
public:
    SurgeSynth() : synth_(nullptr) {}

    ~SurgeSynth() override {
        delete synth_;
        synth_ = nullptr;
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);

        // Create Surge synthesizer with our stub PluginLayer
        // Empty data path = skip file-based patch/wavetable loading
        synth_ = new SurgeSynthesizer(&pluginLayer_, "");
        synth_->setSamplerate(static_cast<float>(sampleRate));

        // Surge processes in fixed BLOCK_SIZE chunks (typically 32)
        blockSize_ = BLOCK_SIZE;

        // Cache parameter metadata
        cacheParameters();
    }

    void noteOn(int midiNote, int velocity) override {
        if (!synth_) return;
        synth_->playNote(0, static_cast<char>(midiNote),
                         static_cast<char>(velocity), 0);
    }

    void noteOff(int midiNote) override {
        if (!synth_) return;
        synth_->releaseNote(0, static_cast<char>(midiNote), 0);
    }

    void allNotesOff() override {
        if (!synth_) return;
        synth_->allNotesOff();
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!synth_ || !isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        int samplesProcessed = 0;

        while (samplesProcessed < numSamples) {
            // Surge always processes exactly BLOCK_SIZE samples
            synth_->process();

            int chunk = numSamples - samplesProcessed;
            if (chunk > blockSize_) chunk = blockSize_;

            // Copy from Surge's internal output buffers
            std::memcpy(outputL + samplesProcessed, synth_->output[0],
                        chunk * sizeof(float));
            std::memcpy(outputR + samplesProcessed, synth_->output[1],
                        chunk * sizeof(float));

            samplesProcessed += chunk;
        }
    }

    void setParameter(int paramId, float value) override {
        if (!synth_ || paramId < 0 || paramId >= n_total_params) return;
        SurgeSynthesizer::ID surgeId;
        if (synth_->fromSynthSideId(paramId, surgeId)) {
            synth_->setParameter01(surgeId, value);
        }
    }

    float getParameter(int paramId) const override {
        if (!synth_ || paramId < 0 || paramId >= n_total_params) return 0.0f;
        SurgeSynthesizer::ID surgeId;
        if (synth_->fromSynthSideId(paramId, surgeId)) {
            return synth_->getParameter01(surgeId);
        }
        return 0.0f;
    }

    void controlChange(int cc, int value) override {
        if (!synth_) return;
        synth_->channelController(0, cc, value);
    }

    void pitchBend(int value) override {
        if (!synth_) return;
        synth_->pitchBend(0, value);
    }

    void programChange(int program) override {
        if (!synth_) return;
        synth_->programChange(0, program);
    }

    // --- Parameter metadata ---

    int getParameterCount() const override {
        return (int)paramNames_.size();
    }

    const char* getParameterName(int paramId) const override {
        if (paramId < 0 || paramId >= (int)paramNames_.size()) return "";
        return paramNames_[paramId].c_str();
    }

    float getParameterMin(int paramId) const override {
        if (paramId < 0 || paramId >= (int)paramMins_.size()) return 0.0f;
        return paramMins_[paramId];
    }

    float getParameterMax(int paramId) const override {
        if (paramId < 0 || paramId >= (int)paramMaxs_.size()) return 1.0f;
        return paramMaxs_[paramId];
    }

    float getParameterDefault(int paramId) const override {
        if (paramId < 0 || paramId >= (int)paramDefaults_.size()) return 0.0f;
        return paramDefaults_[paramId];
    }

    bool handleCommand(const char* commandType, const uint8_t* data, int length) override {
        if (!synth_) return false;
        if (std::strcmp(commandType, "loadPatch") == 0 && data && length > 0) {
            synth_->loadRaw(data, length, true);
            return true;
        }
        return false;
    }

#ifdef __EMSCRIPTEN__
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputLPtr);
        float* outR = reinterpret_cast<float*>(outputRPtr);
        process(outL, outR, numSamples);
    }
#endif

private:
    void cacheParameters() {
        paramNames_.clear();
        paramMins_.clear();
        paramMaxs_.clear();
        paramDefaults_.clear();

        for (int i = 0; i < n_total_params; i++) {
            SurgeSynthesizer::ID surgeId;
            if (synth_->fromSynthSideId(i, surgeId)) {
                parametermeta pm = {};
                synth_->getParameterMeta(surgeId, pm);

                char name[256] = {};
                synth_->getParameterName(surgeId, name);

                paramNames_.push_back(name);
                paramMins_.push_back(pm.fmin);
                paramMaxs_.push_back(pm.fmax);
                paramDefaults_.push_back(pm.fdefault);
            }
        }
    }

    SurgeSynthesizer* synth_;
    WASMPluginLayer pluginLayer_;
    int blockSize_ = 32;

    std::vector<std::string> paramNames_;
    std::vector<float> paramMins_;
    std::vector<float> paramMaxs_;
    std::vector<float> paramDefaults_;
};

} // namespace devilbox

EXPORT_WASM_SYNTH_EXTENDED_EX(SurgeSynth, devilbox::SurgeSynth, "SurgeSynth")
