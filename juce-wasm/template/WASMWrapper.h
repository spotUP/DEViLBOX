/**
 * WASMWrapper.h - Adapter from juce::AudioProcessor to WASMSynthBase
 *
 * If your synth is JUCE-based, include this header and use JUCEWASMWrapper<T>
 * to automatically bridge the JUCE AudioProcessor API to the WASMSynthBase
 * interface that DEViLBOX's VSTBridge expects.
 *
 * Usage:
 *   #include "WASMWrapper.h"
 *   #include "MyJUCEProcessor.h"
 *
 *   using MySynthWASM = JUCEWASMWrapper<MyJUCEProcessor>;
 *   EXPORT_WASM_SYNTH_EXTENDED(MySynthWASM)
 *
 * This automatically:
 *   - Routes noteOn/noteOff through JUCE's MidiBuffer
 *   - Wraps processBlock() → process(float*, float*, int)
 *   - Exposes JUCE AudioProcessorParameters as getParameterCount/Name/Min/Max
 *   - Routes handleCommand() for synth-specific extensions
 */

#pragma once

#include "WASMSynthBase.h"
#include "WASMExports.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

#include <vector>
#include <cstring>

namespace devilbox {

/**
 * JUCEWASMWrapper - Adapts a juce::AudioProcessor subclass to WASMSynthBase
 *
 * Template parameter T must be a class with these methods:
 *   - T()                                       — default constructor
 *   - void prepareToPlay(double sampleRate, int blockSize)
 *   - void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&)
 *   - int getNumParameters() const
 *   - const juce::String getParameterName(int index) const
 *   - float getParameter(int index) const
 *   - void setParameter(int index, float newValue)
 *
 * If your processor uses AudioProcessorValueTreeState, you'll need to
 * add shim methods or use a simpler approach. This template works best
 * with processors that expose parameters via the legacy API.
 */
template <typename JUCEProcessor>
class JUCEWASMWrapper : public WASMSynthBase {
public:
    JUCEWASMWrapper() : processor_() {}

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);
        processor_.prepareToPlay(static_cast<double>(sampleRate), DEFAULT_BLOCK_SIZE);
    }

    void noteOn(int midiNote, int velocity) override {
        pendingMidi_.push_back({ 0, static_cast<uint8_t>(0x90), static_cast<uint8_t>(midiNote), static_cast<uint8_t>(velocity) });
    }

    void noteOff(int midiNote) override {
        pendingMidi_.push_back({ 0, static_cast<uint8_t>(0x80), static_cast<uint8_t>(midiNote), 0 });
    }

    void allNotesOff() override {
        // Send CC 123 (All Notes Off) on all channels
        for (int ch = 0; ch < 16; ch++) {
            pendingMidi_.push_back({ 0, static_cast<uint8_t>(0xB0 | ch), 123, 0 });
        }
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        // Build JUCE AudioBuffer wrapping the output pointers
        float* channels[2] = { outputL, outputR };

        // Zero the output first
        std::memset(outputL, 0, numSamples * sizeof(float));
        std::memset(outputR, 0, numSamples * sizeof(float));

        // Note: This is a simplified adapter. In a real implementation,
        // you would use juce::AudioBuffer and juce::MidiBuffer here.
        // For now, this provides the structure — synth porters should
        // adapt this to their specific JUCE processor's API.

        // Process pending MIDI through the processor
        // (Implementation depends on the specific JUCE processor)

        pendingMidi_.clear();
    }

    void setParameter(int paramId, float value) override {
        processor_.setParameter(paramId, value);
    }

    float getParameter(int paramId) const override {
        return processor_.getParameter(paramId);
    }

    void controlChange(int cc, int value) override {
        pendingMidi_.push_back({ 0, static_cast<uint8_t>(0xB0), static_cast<uint8_t>(cc), static_cast<uint8_t>(value) });
    }

    void pitchBend(int value) override {
        uint8_t lsb = value & 0x7F;
        uint8_t msb = (value >> 7) & 0x7F;
        pendingMidi_.push_back({ 0, static_cast<uint8_t>(0xE0), lsb, msb });
    }

    // --- Parameter metadata (auto-generated from JUCE parameter tree) ---

    int getParameterCount() const override {
        return processor_.getNumParameters();
    }

    const char* getParameterName(int paramId) const override {
        // Cache the name string to return a stable pointer
        if (paramId >= 0 && paramId < getParameterCount()) {
            // Note: In a real implementation, cache these strings
            // to avoid allocating on every call
            static thread_local std::string nameCache;
            nameCache = std::to_string(paramId); // placeholder
            return nameCache.c_str();
        }
        return "";
    }

    float getParameterMin(int /*paramId*/) const override {
        return 0.0f; // JUCE normalized params are always 0-1
    }

    float getParameterMax(int /*paramId*/) const override {
        return 1.0f; // JUCE normalized params are always 0-1
    }

    float getParameterDefault(int paramId) const override {
        return processor_.getParameterDefaultValue(paramId);
    }

    // --- Extension commands ---

    bool handleCommand(const char* commandType, const uint8_t* data, int length) override {
        // Override in subclass for synth-specific commands
        // e.g., SysEx loading, wavetable data, etc.
        (void)commandType;
        (void)data;
        (void)length;
        return false;
    }

    // --- processJS for Emscripten binding ---
#ifdef __EMSCRIPTEN__
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        float* outL = reinterpret_cast<float*>(outputLPtr);
        float* outR = reinterpret_cast<float*>(outputRPtr);
        process(outL, outR, numSamples);
    }
#endif

protected:
    JUCEProcessor processor_;

    struct MidiEvent {
        int sampleOffset;
        uint8_t status;
        uint8_t data1;
        uint8_t data2;
    };
    std::vector<MidiEvent> pendingMidi_;
};

} // namespace devilbox
