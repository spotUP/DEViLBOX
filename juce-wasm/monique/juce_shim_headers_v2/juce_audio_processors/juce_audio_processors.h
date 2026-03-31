// Stub juce_audio_processors module for WASM builds
// Provides AudioProcessor, AudioProcessorEditor, and related types.
// These can't use real JUCE because juce_audio_processors depends on the full GUI stack.
#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_audio_basics/juce_audio_basics.h>

namespace juce
{

// NOTE: AudioPlayHead is already defined in real juce_audio_basics.
// We do NOT redefine it here.

//==============================================================================
// AudioProcessorEditor — base class for plugin editors
//==============================================================================
class AudioProcessor;

class AudioProcessorEditor : public Component {
public:
    AudioProcessorEditor() = default;
    AudioProcessorEditor(AudioProcessor&) {}
    AudioProcessorEditor(AudioProcessor*) {}
    virtual ~AudioProcessorEditor() = default;
    AudioProcessor* getAudioProcessor() const { return nullptr; }
    void setResizable(bool, bool) {}
    void setSize(int w, int h) { Component::setSize(w, h); }
};

//==============================================================================
// AudioProcessor — the main plugin base class
//==============================================================================
class AudioProcessor : public AudioPlayHead {
public:
    struct BusesProperties {
        BusesProperties& withInput(const String&, AudioChannelSet, bool = true) { return *this; }
        BusesProperties& withOutput(const String&, AudioChannelSet, bool = true) { return *this; }
    };

    struct BusesLayout {
        Array<AudioChannelSet> inputBuses;
        Array<AudioChannelSet> outputBuses;
        AudioChannelSet getMainInputChannelSet() const { return inputBuses.size() > 0 ? inputBuses[0] : AudioChannelSet::mono(); }
        AudioChannelSet getMainOutputChannelSet() const { return outputBuses.size() > 0 ? outputBuses[0] : AudioChannelSet::stereo(); }
    };

    AudioProcessor() = default;
    AudioProcessor(const BusesProperties&) {}
    virtual ~AudioProcessor() = default;

    // Implement AudioPlayHead::getPosition() — real JUCE 8 makes this pure virtual
    Optional<PositionInfo> getPosition() const override { return PositionInfo{}; }

    virtual const String getName() const { return ""; }
    virtual void prepareToPlay(double sampleRate, int samplesPerBlock) = 0;
    virtual void releaseResources() {}
    virtual void reset() {}
    virtual void processBlock(AudioBuffer<float>& buffer, MidiBuffer& midiMessages) = 0;
    virtual void processBlock(AudioBuffer<double>&, MidiBuffer&) {}
    virtual void processBlockBypassed(AudioBuffer<float>&, MidiBuffer&) {}
    virtual AudioProcessorEditor* createEditor() { return nullptr; }
    virtual bool hasEditor() const { return false; }
    AudioProcessorEditor* getActiveEditor() const { return activeEditor_; }
    virtual int getNumPrograms() { return 1; }
    virtual int getCurrentProgram() { return 0; }
    virtual void setCurrentProgram(int) {}
    virtual const String getProgramName(int) { return {}; }
    virtual void changeProgramName(int, const String&) {}
    virtual void getStateInformation(MemoryBlock&) {}
    virtual void setStateInformation(const void*, int) {}
    virtual bool acceptsMidi() const { return true; }
    virtual bool producesMidi() const { return false; }
    virtual bool silenceInProducesSilenceOut() const { return false; }
    virtual double getTailLengthSeconds() const { return 0; }
    virtual bool isInputChannelStereoPair(int) const { return true; }
    virtual bool isOutputChannelStereoPair(int) const { return true; }

    // Legacy parameter API (Monique uses these)
    virtual int getNumParameters() { return 0; }
    virtual float getParameter(int) { return 0; }
    virtual void setParameter(int, float) {}
    virtual const String getParameterName(int) { return {}; }
    virtual const String getParameterText(int) { return {}; }
    virtual String getParameterLabel(int) const { return {}; }
    virtual int getParameterNumSteps(int) { return 0x7fffffff; }
    virtual float getParameterDefaultValue(int) { return 0; }
    virtual bool isParameterAutomatable(int) const { return true; }
    virtual bool isMetaParameter(int) const { return false; }

    double getSampleRate() const { return sampleRate_; }
    int getBlockSize() const { return blockSize_; }
    int getTotalNumInputChannels() const { return 2; }
    int getTotalNumOutputChannels() const { return 2; }
    int getNumInputChannels() const { return 2; }
    int getNumOutputChannels() const { return 2; }

    AudioPlayHead* getPlayHead() const { return playHead_; }
    void setPlayHead(AudioPlayHead* ph) { playHead_ = ph; }

    virtual bool isBusesLayoutSupported(const BusesLayout&) const { return true; }
    void setPlayConfigDetails(int numIns, int numOuts, double sr, int bs) {
        sampleRate_ = sr; blockSize_ = bs;
    }

    void sendParamChangeMessageToListeners(int, float) {}
    static void copyXmlToBinary(const XmlElement&, MemoryBlock&) {}
    static std::unique_ptr<XmlElement> getXmlFromBinary(const void*, int) { return nullptr; }

    enum WrapperType {
        wrapperType_Undefined, wrapperType_VST, wrapperType_VST3,
        wrapperType_AudioUnit, wrapperType_AudioUnitv3,
        wrapperType_Standalone, wrapperType_AAX, wrapperType_Unity
    };
    WrapperType wrapperType = wrapperType_Standalone;

protected:
    double sampleRate_ = 44100;
    int blockSize_ = 512;
    AudioPlayHead* playHead_ = nullptr;
    AudioProcessorEditor* activeEditor_ = nullptr;
};

//==============================================================================
// PluginHostType
//==============================================================================
struct PluginHostType {
    static AudioProcessor::WrapperType jucePlugInClientCurrentWrapperType;
};
inline AudioProcessor::WrapperType PluginHostType::jucePlugInClientCurrentWrapperType = AudioProcessor::wrapperType_Standalone;

// Plugin macros
#ifndef JucePlugin_Name
#define JucePlugin_Name "Monique"
#endif
#ifndef JucePlugin_IsSynth
#define JucePlugin_IsSynth 1
#endif

} // namespace juce
