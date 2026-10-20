/**
 * Odin2WASM.cpp - the real Odin2 plugin engine behind DEViLBOX's WASMSynthBase interface.
 *
 * Hosts an upstream OdinAudioProcessor (third-party/odin2-master/Source) compiled against the
 * real JUCE modules (juce-wasm/juce-lib). Nothing of the DSP, parameter tree, mod matrix, arp,
 * step sequencer, draw tables or patch migration is reimplemented here.
 *
 *   noteOn/noteOff/pitchBend/controlChange -> queued as juce::MidiMessage -> processBlock
 *   setParameter(id, value)                -> the processor's real APVTS parameter (real units)
 *   handleCommand("loadPreset", .odin)     -> ValueTree -> XML state -> setStateInformation
 *                                             (readPatch -> migratePatch -> createDrawTablesFromValueTree)
 *
 * Parameter index i is the i-th entry of AudioProcessor::getParameters(); its name is the real
 * Odin2 parameter id (e.g. "osc1_vol"), which the JS side keys on.
 */

#include "../common/WASMSynthBase.h"

#include <emscripten/bind.h>

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_events/juce_events.h>
#include <juce_audio_processors/juce_audio_processors.h>

// The processor keeps its APVTS private and the GUI writes the type selectors (osc/filter type, wave
// selectors) straight into it. Expose it for this one include so setValueTreeProperty can do the same.
#define private public
#include "PluginProcessor.h"
#undef private

extern "C" void juce_wasm_dispatch_messages();

namespace devilbox {

class Odin2Synth : public WASMSynthBase {
public:
    Odin2Synth() {
        juce::MessageManager::getInstance();
        proc_ = std::make_unique<OdinAudioProcessor>();
        for (auto* p : proc_->getParameters()) {
            if (auto* r = dynamic_cast<juce::RangedAudioParameter*>(p))
                params_.push_back(r);
        }
        pending_.ensureSize(4096);
    }

    ~Odin2Synth() override = default;

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);
        proc_->setPlayConfigDetails(0, 2, sampleRate, DEFAULT_BLOCK_SIZE);
        proc_->prepareToPlay(sampleRate, DEFAULT_BLOCK_SIZE);
    }

    void noteOn(int midiNote, int velocity) override {
        pending_.addEvent(juce::MidiMessage::noteOn(1, midiNote, (juce::uint8)juce::jlimit(1, 127, velocity)), 0);
    }
    void noteOff(int midiNote) override {
        pending_.addEvent(juce::MidiMessage::noteOff(1, midiNote), 0);
    }
    void allNotesOff() override {
        pending_.addEvent(juce::MidiMessage::allNotesOff(1), 0);
    }
    void controlChange(int cc, int value) override {
        pending_.addEvent(juce::MidiMessage::controllerEvent(1, cc, value), 0);
    }
    void pitchBend(int value) override {
        pending_.addEvent(juce::MidiMessage::pitchWheel(1, value), 0);
    }

    void process(float* outL, float* outR, int numSamples) override {
        if (numSamples <= 0) return;
        float* chans[2] = {outL, outR};
        juce::AudioBuffer<float> buffer(chans, 2, numSamples);
        buffer.clear();
        proc_->processBlock(buffer, pending_);
        pending_.clear();
    }

    // ---- parameters (real APVTS ids, real units) ----
    void setParameter(int id, float value) override {
        if (auto* p = param(id))
            p->setValueNotifyingHost(p->convertTo0to1(value));
    }
    float getParameter(int id) const override {
        auto* p = param(id);
        return p ? p->convertFrom0to1(p->getValue()) : 0.0f;
    }
    int getParameterCount() const override { return (int)params_.size(); }
    const char* getParameterName(int id) const override {
        auto* p = param(id);
        return p ? p->paramID.toRawUTF8() : "";
    }
    float getParameterMin(int id) const override {
        auto* p = param(id);
        return p ? p->getNormalisableRange().start : 0.0f;
    }
    float getParameterMax(int id) const override {
        auto* p = param(id);
        return p ? p->getNormalisableRange().end : 1.0f;
    }
    float getParameterDefault(int id) const override {
        auto* p = param(id);
        return p ? p->convertFrom0to1(p->getDefaultValue()) : 0.0f;
    }

    // ---- native preset state ----
    bool handleCommand(const char* commandType, const uint8_t* data, int length) override {
        const std::string type(commandType);
        if (type == "loadPreset") return loadOdinPatch(data, length);
        if (type == "setValueTreeProperty") return setValueTreeProperty(data, length);
        return false;
    }

    /** How many times the real setStateInformation ran (reachability sentinel). */
    int getStateLoadCount() const { return stateLoads_; }

    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        process(reinterpret_cast<float*>(outputLPtr), reinterpret_cast<float*>(outputRPtr), numSamples);
    }

private:
    juce::RangedAudioParameter* param(int id) const {
        return (id >= 0 && id < (int)params_.size()) ? params_[(size_t)id] : nullptr;
    }

    // A .odin file is a raw ValueTree stream (what PatchBrowser reads). The processor's public
    // load entry is setStateInformation, which takes the host XML-binary form of the same tree,
    // so wrap it; readPatch -> migratePatch -> createDrawTablesFromValueTree all run inside it.
    bool loadOdinPatch(const uint8_t* data, int length) {
        juce::MemoryInputStream in(data, (size_t)length, false);
        juce::ValueTree tree = juce::ValueTree::readFromStream(in);
        if (!tree.isValid() || !tree.hasType("Odin")) return false;
        const int version = tree.getChildWithName("misc")["patch_migration_version"];
        if (version > ODIN_PATCH_MIGRATION_VERSION) return false;
        std::unique_ptr<juce::XmlElement> xml = tree.createXml();
        if (!xml) return false;
        juce::MemoryBlock block;
        juce::AudioProcessor::copyXmlToBinary(*xml, block);
        proc_->setStateInformation(block.getData(), (int)block.getSize());
        ++stateLoads_;
        return true;
    }

    // Payload "<tree>.<property>=<number>", e.g. "osc.osc1_type=3" or "misc.fil1_type=2". Writes the
    // property exactly like the upstream GUI (PluginEditor: state.getChildWithName(tree).setProperty),
    // so the processor's tree listeners (treeValueChangedNonParamOsc etc.) switch the DSP.
    bool setValueTreeProperty(const uint8_t* data, int length) {
        const std::string s(reinterpret_cast<const char*>(data), (size_t)length);
        const auto dot = s.find('.');
        const auto eq = s.find('=');
        if (dot == std::string::npos || eq == std::string::npos || eq < dot) return false;
        auto tree = proc_->m_value_tree.state.getChildWithName(juce::Identifier(s.substr(0, dot)));
        if (!tree.isValid()) return false;
        const juce::Identifier prop(s.substr(dot + 1, eq - dot - 1));
        if (!tree.hasProperty(prop)) return false;
        const double v = std::stod(s.substr(eq + 1));
        if (v == (double)(int)v) tree.setProperty(prop, (int)v, nullptr);
        else tree.setProperty(prop, (float)v, nullptr);
        return true;
    }

    std::unique_ptr<OdinAudioProcessor> proc_;
    std::vector<juce::RangedAudioParameter*> params_;
    juce::MidiBuffer pending_;
    int stateLoads_ = 0;
};

} // namespace devilbox

// Explicit bindings instead of EXPORT_WASM_SYNTH_EXTENDED_EX: that macro takes member pointers of the
// unregistered base WASMSynthBase, so embind never installs those methods on the JS class.
EMSCRIPTEN_BINDINGS(Odin2Synth_bindings) {
    using S = devilbox::Odin2Synth;
    emscripten::class_<S>("Odin2Synth")
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
        .function("getStateLoadCount", &S::getStateLoadCount)
        .function("handleCommand", +[](S& s, const std::string& type, emscripten::val data) { return s.handleCommandJS(type, data); })
        .function("process", &S::processJS);
}
