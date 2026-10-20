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
#include "synthesis/lookups/wavetable.h"
#include "synthesis/producers/sample_source.h"
#include "synthesis/lookups/wave_frame.h"
#include "common/line_generator.h"
#include "common/synth_types.h"
#include "synthesis/modules/modulation_connection_processor.h"
#include "common/wavetable/wavetable_creator.h"
#include "json/json.h"

#include <vector>
#include <cstring>
#include <map>
#include <memory>
#include <string>

namespace devilbox {

class VitalSynth : public WASMSynthBase {
    using ModConn = vital::ModulationConnection;
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

        initDefaultSources();
    }

    // Vital's SynthBase::initEngine() fills the engine's oscillator wavetables,
    // sample and LFO shapes with the init patch. A bare SoundEngine starts with
    // an all-zero wavetable (one blank frame), so every oscillator renders
    // silence. Reproduce the init patch sources here (the default group is a
    // single sawtooth frame, see WavetableGroup::loadDefaultGroup).
    void initDefaultSources() {
        vital::WaveFrame saw;
        for (int i = 0; i < vital::WaveFrame::kWaveformSize; ++i) {
            float t = i / (vital::WaveFrame::kWaveformSize - 1.0f);
            int shifted = (i + vital::WaveFrame::kWaveformSize / 2) % vital::WaveFrame::kWaveformSize;
            saw.time_domain[shifted] = 1.0f - 2.0f * t;
        }
        saw.toFrequencyDomain();
        for (int osc = 0; osc < vital::kNumOscillators; ++osc) {
            vital::Wavetable* table = engine_->getWavetable(osc);
            table->setName("Init");
            table->setNumFrames(1);
            table->loadWaveFrame(&saw, 0);
            table->postProcess(0.0f);
        }
        engine_->getSample()->init();
        for (int lfo = 0; lfo < vital::kNumLfos; ++lfo)
            engine_->getLfoSource(lfo)->initTriangle();
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

    // Extension command channel (VSTBridgeSynth.sendCommand -> worklet 'command').
    //   "loadPreset": data = UTF-8 bytes of a Vital .vital preset (JSON).
    // Returns true when the preset was applied.
    bool handleCommand(const char* commandType, const uint8_t* data, int length) override {
        if (!engine_ || !commandType || std::strcmp(commandType, "loadPreset") != 0)
            return false;
        if (!data || length <= 0) return false;
        return loadPresetJson(std::string(reinterpret_cast<const char*>(data), (size_t)length));
    }

    // Mirrors SynthBase::loadFromJson -> LoadSave::jsonToState for the engine
    // state a .vital file carries: controls, modulation matrix, sample,
    // wavetables, LFO shapes. Presets older than 1.0.0 need Vital's
    // updateFromOldVersion migration, which is not ported: they are refused.
    bool loadPresetJson(const std::string& text) {
        json data = json::parse(text, nullptr, false);
        if (data.is_discarded() || !data.is_object()) return false;
        if (!data.count("synth_version") || !data["synth_version"].is_string()) return false;
        if (!data.count("settings") || !data["settings"].is_object()) return false;
        const std::string version = data["synth_version"].get<std::string>();
        if (vitalMajor(version) < 1) return false;           // needs old-version migration
        if (version_newer(version)) return false;            // written by a newer Vital

        const json& settings = data["settings"];
        engine_->allSoundsOff();

        // Controls: preset value, else the parameter default (loadControls)
        for (auto& pair : controlMap_) {
            vital::mono_float value;
            auto it = settings.find(pair.first);
            if (it != settings.end() && it->is_number())
                value = it->get<float>();
            else
                value = vital::Parameters::getDetails(pair.first).default_value;
            pair.second->set(value);
        }

        loadModulations(settings);

        if (settings.count("sample") && settings["sample"].is_object())
            engine_->getSample()->jsonToState(settings["sample"]);
        else
            engine_->getSample()->init();

        if (settings.count("wavetables") && settings["wavetables"].is_array()) {
            int i = 0;
            for (const json& wavetable : settings["wavetables"]) {
                if (i >= vital::kNumOscillators) break;
                if (!wavetable.is_object()) { ++i; continue; }
                WavetableCreator* creator = wavetableCreator(i);
                creator->jsonToState(wavetable);
                creator->render();
                ++i;
            }
        }

        if (settings.count("lfos") && settings["lfos"].is_array()) {
            int i = 0;
            for (const json& lfo : settings["lfos"]) {
                if (i >= vital::kNumLfos) break;
                if (!lfo.is_object()) { ++i; continue; }
                LineGenerator* source = engine_->getLfoSource(i);
                source->jsonToState(lfo);
                source->render();
                ++i;
            }
        }

        engine_->checkOversampling();
        return true;
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
    static int vitalMajor(const std::string& version) {
        return std::atoi(version.c_str());
    }

    // True when the preset was written by a Vital newer than the engine here
    // (LoadSave::compareFeatureVersionStrings: major.minor only).
    static bool version_newer(const std::string& version) {
        int major = 0, minor = 0;
        std::sscanf(version.c_str(), "%d.%d", &major, &minor);
        return major > 1 || (major == 1 && minor > 5);
    }

    WavetableCreator* wavetableCreator(int osc) {
        if (!wavetableCreators_[osc])
            wavetableCreators_[osc] = std::make_unique<WavetableCreator>(engine_->getWavetable(osc));
        return wavetableCreators_[osc].get();
    }

    // LoadSave::loadModulations, applying the connection straight to the engine
    // (SynthBase queues it for the audio thread; here commands and process()
    // run on the same worklet thread, so no queue is needed).
    void loadModulations(const json& settings) {
        for (ModConn* conn : activeConnections_) {
            vital::modulation_change change = makeChange(conn);
            change.disconnecting = true;
            engine_->disconnectModulation(change);
            conn->source_name = "";
            conn->destination_name = "";
        }
        activeConnections_.clear();
        for (int i = 0; i < (int)modulationBank_.numConnections(); ++i)
            modulationBank_.atIndex(i)->modulation_processor->lineMapGenerator()->initLinear();
        engine_->disableUnnecessaryModSources();

        if (!settings.count("modulations") || !settings["modulations"].is_array()) return;
        int index = 0;
        for (const json& modulation : settings["modulations"]) {
            if (index >= vital::kMaxModulationConnections) break;
            ModConn* conn = modulationBank_.atIndex(index++);
            if (!modulation.is_object() || !modulation.count("source") || !modulation.count("destination") ||
                !modulation["source"].is_string() || !modulation["destination"].is_string())
                continue;
            const std::string source = modulation["source"].get<std::string>();
            const std::string destination = modulation["destination"].get<std::string>();
            if (engine_->getModulationSource(source) == nullptr ||
                engine_->getMonoModulationDestination(destination) == nullptr)
                continue;

            if (source.length() && destination.length()) {
                conn->source_name = source;
                conn->destination_name = destination;
                vital::modulation_change change = makeChange(conn);
                if (change.poly_destination && change.poly_destination->router() == change.modulation_processor) {
                    conn->source_name = "";
                    conn->destination_name = "";
                } else {
                    change.disconnecting = false;
                    engine_->connectModulation(change);
                    activeConnections_.push_back(conn);
                }
            }
            if (modulation.count("line_mapping") && modulation["line_mapping"].is_object())
                conn->modulation_processor->lineMapGenerator()->jsonToState(modulation["line_mapping"]);
            else
                conn->modulation_processor->lineMapGenerator()->initLinear();
        }
    }

    // SynthBase::createModulationChange
    vital::modulation_change makeChange(ModConn* connection) {
        vital::modulation_change change;
        change.source = engine_->getModulationSource(connection->source_name);
        change.mono_destination = engine_->getMonoModulationDestination(connection->destination_name);
        change.mono_modulation_switch = engine_->getMonoModulationSwitch(connection->destination_name);
        change.destination_scale = vital::Parameters::getParameterRange(connection->destination_name);
        change.poly_modulation_switch = engine_->getPolyModulationSwitch(connection->destination_name);
        change.poly_destination = engine_->getPolyModulationDestination(connection->destination_name);
        change.modulation_processor = connection->modulation_processor.get();
        change.disconnecting = false;

        int num_audio_rate = 0;
        for (int i = 0; i < vital::kMaxModulationConnections; ++i) {
            ModConn* other = modulationBank_.atIndex(i);
            if (other->source_name == connection->source_name &&
                other->destination_name != connection->destination_name &&
                !other->modulation_processor->isControlRate())
                num_audio_rate++;
        }
        change.num_audio_rate = num_audio_rate;
        return change;
    }

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
    vital::ModulationConnectionBank modulationBank_;
    std::vector<ModConn*> activeConnections_;
    std::unique_ptr<WavetableCreator> wavetableCreators_[vital::kNumOscillators];
    std::map<std::string, vital::Value*> controlMap_;
    std::vector<std::string> paramNames_;
    std::vector<float> paramMins_;
    std::vector<float> paramMaxs_;
    std::vector<float> paramDefaults_;
};

} // namespace devilbox

// Explicit bindings instead of EXPORT_WASM_SYNTH_EXTENDED_EX: that macro takes member pointers of the
// unregistered base WASMSynthBase (isInitialized, getSampleRate, getParameterNameJS, handleCommandJS,
// getFullStateJS, loadFullStateJS, programChange), and embind then never installs those methods on the
// JS class. Without handleCommand the 'loadPreset' command could never reach loadPresetJson, and without
// getParameterName the worklet published no parameter metadata. Lambdas bind them to VitalSynth.
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(VitalSynth_bindings) {
    using S = devilbox::VitalSynth;
    emscripten::class_<S>("VitalSynth")
        .constructor<>()
        .function("initialize", &S::initialize)
        .function("isInitialized", +[](const S& s) { return s.isInitialized(); })
        .function("getSampleRate", +[](const S& s) { return s.getSampleRate(); })
        .function("noteOn", &S::noteOn)
        .function("noteOff", &S::noteOff)
        .function("allNotesOff", &S::allNotesOff)
        .function("setParameter", &S::setParameter)
        .function("getParameter", &S::getParameter)
        .function("controlChange", &S::controlChange)
        .function("pitchBend", &S::pitchBend)
        .function("programChange", +[](S& s, int program) { s.programChange(program); })
        .function("getParameterCount", &S::getParameterCount)
        .function("getParameterName", +[](const S& s, int id) { return s.getParameterNameJS(id); })
        .function("getParameterMin", &S::getParameterMin)
        .function("getParameterMax", &S::getParameterMax)
        .function("getParameterDefault", &S::getParameterDefault)
        .function("handleCommand", +[](S& s, const std::string& type, emscripten::val data) { return s.handleCommandJS(type, data); })
        .function("getFullState", +[](const S& s) { return s.getFullStateJS(); })
        .function("loadFullState", +[](S& s, emscripten::val state) { s.loadFullStateJS(state); })
        .function("process", &S::processJS);
}
#endif
