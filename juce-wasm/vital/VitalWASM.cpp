/**
 * VitalWASM.cpp - Vital Spectral Warping Wavetable Synth → WASMSynthBase adapter
 *
 * Wraps Vital's SoundEngine for use in DEViLBOX's VSTBridge framework.
 * Vital is a spectral warping wavetable synth by Matt Tytel (GPL v3).
 *
 * Architecture:
 *   VitalSynth (WASMSynthBase)
 *     └── vital::SoundEngine  (graph-based processor)
 *           ├── SynthVoiceHandler (polyphonic voices)
 *           │     ├── SynthOscillator × 3 (wavetable + spectral morph)
 *           │     ├── SynthFilter × 2 (analog/digital/formant/comb)
 *           │     ├── Envelope × 6
 *           │     └── SynthLfo × 8
 *           └── ReorderableEffectChain
 *                 ├── Chorus, Compressor, Delay
 *                 ├── Distortion, EQ, Flanger
 *                 └── Phaser, Reverb
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

// Vital synthesis engine
#include "synthesis/synth_engine/sound_engine.h"
#include "common/synth_parameters.h"

#include <vector>
#include <cstring>
#include <map>

namespace devilbox {

class VitalSynth : public WASMSynthBase {
public:
    VitalSynth() : engine_(nullptr) {}

    ~VitalSynth() override {
        delete engine_;
        engine_ = nullptr;
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);

        engine_ = new vital::SoundEngine();
        engine_->setSampleRate(sampleRate);

        // Cache parameter metadata from Vital's static Parameters class
        cacheParameters();

        // Build a fast name→Value* lookup from the engine's control map
        vital::control_map controls = engine_->getControls();
        for (auto& pair : controls) {
            controlMap_[pair.first] = pair.second;
        }
    }

    void noteOn(int midiNote, int velocity) override {
        if (!engine_) return;
        float vel = velocity / 127.0f;
        engine_->noteOn(midiNote, vel, 0, 0);
    }

    void noteOff(int midiNote) override {
        if (!engine_) return;
        engine_->noteOff(midiNote, 0.0f, 0, 0);
    }

    void allNotesOff() override {
        if (!engine_) return;
        engine_->allNotesOff(0);
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!engine_ || !isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        // Vital processes audio through its modular processor graph
        engine_->process(numSamples);

        // Get output from the engine's output buffer
        // SoundEngine outputs stereo through its output processor
        const vital::poly_float* engineOutput = engine_->output(0)->buffer;
        if (engineOutput) {
            for (int i = 0; i < numSamples; i++) {
                // poly_float is SIMD — extract left/right from vector lanes
                outputL[i] = engineOutput[i][0];
                outputR[i] = engineOutput[i][1];
            }
        } else {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
        }
    }

    void setParameter(int paramId, float value) override {
        if (!engine_ || paramId < 0 || paramId >= (int)paramNames_.size()) return;
        // Look up the Value* control by parameter name and set it
        auto it = controlMap_.find(paramNames_[paramId]);
        if (it != controlMap_.end() && it->second) {
            it->second->set(value);
        }
    }

    float getParameter(int paramId) const override {
        if (!engine_ || paramId < 0 || paramId >= (int)paramNames_.size()) return 0.0f;
        auto it = controlMap_.find(paramNames_[paramId]);
        if (it != controlMap_.end() && it->second) {
            return it->second->value();
        }
        return 0.0f;
    }

    void controlChange(int cc, int value) override {
        if (!engine_) return;
        if (cc == 1) {  // Mod wheel
            engine_->setModWheelAllChannels(value / 127.0f);
        }
    }

    void pitchBend(int value) override {
        if (!engine_) return;
        // Convert 14-bit (0-16383, center=8192) to -1..+1
        float normalized = (value - 8192) / 8192.0f;
        engine_->setPitchWheel(normalized, 0);
    }

    // --- Parameter metadata for auto-generated UI ---

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
        // TODO: Implement wavetable loading, preset loading via handleCommand
        return false;
    }

    // processJS for Emscripten binding
#ifdef __EMSCRIPTEN__
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputLPtr);
        float* outR = reinterpret_cast<float*>(outputRPtr);
        process(outL, outR, numSamples);
    }
#endif

private:
    void cacheParameters() {
        // Build parameter lists from Vital's static Parameters class
        int count = vital::Parameters::getNumParameters();

        paramNames_.clear();
        paramMins_.clear();
        paramMaxs_.clear();
        paramDefaults_.clear();
        paramNames_.reserve(count);
        paramMins_.reserve(count);
        paramMaxs_.reserve(count);
        paramDefaults_.reserve(count);

        for (int i = 0; i < count; i++) {
            const vital::ValueDetails* details = vital::Parameters::getDetails(i);
            if (details) {
                paramNames_.push_back(details->name);
                paramMins_.push_back(details->min);
                paramMaxs_.push_back(details->max);
                paramDefaults_.push_back(details->default_value);
            }
        }
    }

    vital::SoundEngine* engine_;
    std::map<std::string, vital::Value*> controlMap_;
    std::vector<std::string> paramNames_;
    std::vector<float> paramMins_;
    std::vector<float> paramMaxs_;
    std::vector<float> paramDefaults_;
};

} // namespace devilbox

// Use the _EX variant to handle the namespace in the binding name
EXPORT_WASM_SYNTH_EXTENDED_EX(VitalSynth, devilbox::VitalSynth, "VitalSynth")
