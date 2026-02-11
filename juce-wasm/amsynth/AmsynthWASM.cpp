/**
 * AmsynthWASM.cpp - amsynth → WASMSynthBase adapter
 *
 * Wraps Nick Dowell's amsynth for use in DEViLBOX's VSTBridge framework.
 * amsynth is GPL2 licensed. Pure C++ DSP with Freeverb reverb.
 *
 * Architecture:
 *   AmsynthSynth (WASMSynthBase)
 *     +-- Synthesizer  -- complete amsynth engine (voices, MIDI, presets)
 *
 * amsynth's Synthesizer class handles all polyphony, voice allocation,
 * and MIDI processing internally. We convert our noteOn/noteOff/CC API
 * to MIDI events and pass them through the process() call.
 *
 * Parameters use "Group:Name" naming for VSTBridgePanel auto-grouping.
 * 41 params across 11 groups.
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

#include "Synthesizer.h"
#include "core/controls.h"
#include "core/types.h"

#include <cstring>
#include <cmath>
#include <vector>
#include <string>

namespace devilbox {

// ============================================================================
// Parameter name mapping: Param enum index -> "Group:Name"
// ============================================================================
static const char* PARAM_GROUP_NAMES[] = {
    "Amp Env:Attack",           // 0  kAmsynthParameter_AmpEnvAttack
    "Amp Env:Decay",            // 1  kAmsynthParameter_AmpEnvDecay
    "Amp Env:Sustain",          // 2  kAmsynthParameter_AmpEnvSustain
    "Amp Env:Release",          // 3  kAmsynthParameter_AmpEnvRelease
    "Osc1:Waveform",            // 4  kAmsynthParameter_Oscillator1Waveform
    "Filter Env:Attack",        // 5  kAmsynthParameter_FilterEnvAttack
    "Filter Env:Decay",         // 6  kAmsynthParameter_FilterEnvDecay
    "Filter Env:Sustain",       // 7  kAmsynthParameter_FilterEnvSustain
    "Filter Env:Release",       // 8  kAmsynthParameter_FilterEnvRelease
    "Filter:Resonance",         // 9  kAmsynthParameter_FilterResonance
    "Filter:Env Amount",        // 10 kAmsynthParameter_FilterEnvAmount
    "Filter:Cutoff",            // 11 kAmsynthParameter_FilterCutoff
    "Osc2:Detune",              // 12 kAmsynthParameter_Oscillator2Detune
    "Osc2:Waveform",            // 13 kAmsynthParameter_Oscillator2Waveform
    "Master:Volume",            // 14 kAmsynthParameter_MasterVolume
    "LFO:Freq",                 // 15 kAmsynthParameter_LFOFreq
    "LFO:Waveform",             // 16 kAmsynthParameter_LFOWaveform
    "Osc2:Octave",              // 17 kAmsynthParameter_Oscillator2Octave
    "Osc:Mix",                  // 18 kAmsynthParameter_OscillatorMix
    "LFO:To Osc",               // 19 kAmsynthParameter_LFOToOscillators
    "LFO:To Filter",            // 20 kAmsynthParameter_LFOToFilterCutoff
    "LFO:To Amp",               // 21 kAmsynthParameter_LFOToAmp
    "Osc:Ring Mod",             // 22 kAmsynthParameter_OscillatorMixRingMod
    "Osc1:Pulsewidth",          // 23 kAmsynthParameter_Oscillator1Pulsewidth
    "Osc2:Pulsewidth",          // 24 kAmsynthParameter_Oscillator2Pulsewidth
    "Reverb:Roomsize",          // 25 kAmsynthParameter_ReverbRoomsize
    "Reverb:Damp",              // 26 kAmsynthParameter_ReverbDamp
    "Reverb:Wet",               // 27 kAmsynthParameter_ReverbWet
    "Reverb:Width",             // 28 kAmsynthParameter_ReverbWidth
    "Distortion:Crunch",        // 29 kAmsynthParameter_AmpDistortion
    "Osc2:Sync",                // 30 kAmsynthParameter_Oscillator2Sync
    "Portamento:Time",          // 31 kAmsynthParameter_PortamentoTime
    "Master:Keyboard Mode",     // 32 kAmsynthParameter_KeyboardMode
    "Osc2:Pitch",               // 33 kAmsynthParameter_Oscillator2Pitch
    "Filter:Type",              // 34 kAmsynthParameter_FilterType
    "Filter:Slope",             // 35 kAmsynthParameter_FilterSlope
    "LFO:Osc Select",           // 36 kAmsynthParameter_LFOOscillatorSelect
    "Filter:Key Track",         // 37 kAmsynthParameter_FilterKeyTrackAmount
    "Filter:Vel Sens",          // 38 kAmsynthParameter_FilterKeyVelocityAmount
    "Amp:Vel Sens",             // 39 kAmsynthParameter_AmpVelocityAmount
    "Portamento:Mode",          // 40 kAmsynthParameter_PortamentoMode
};

static constexpr int PARAM_COUNT = kAmsynthParameterCount;  // 41

// ============================================================================
// AmsynthSynth — WASMSynthBase wrapper around amsynth's Synthesizer
// ============================================================================
class AmsynthSynth : public WASMSynthBase {
public:
    AmsynthSynth() {
        // Cache default values
        for (int i = 0; i < PARAM_COUNT; ++i) {
            double minVal, maxVal, defVal, step;
            get_parameter_properties(i, &minVal, &maxVal, &defVal, &step);
            paramMin_[i] = (float)minVal;
            paramMax_[i] = (float)maxVal;
            paramDefault_[i] = (float)defVal;
            cachedParams_[i] = (float)defVal;
        }
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);

        synth_.setSampleRate(sampleRate);
        synth_.setMaxNumVoices(16);

        // Apply all cached parameter defaults
        for (int i = 0; i < PARAM_COUNT; ++i) {
            synth_.setParameterValue((Param)i, cachedParams_[i]);
        }
    }

    void noteOn(int midiNote, int velocity) override {
        if (!isInitialized_) return;
        if (velocity == 0) { noteOff(midiNote); return; }
        unsigned char data[3] = {
            0x90, (unsigned char)midiNote, (unsigned char)velocity
        };
        addMidiEvent(data, 3);
    }

    void noteOff(int midiNote) override {
        if (!isInitialized_) return;
        unsigned char data[3] = {
            0x80, (unsigned char)midiNote, 0
        };
        addMidiEvent(data, 3);
    }

    void allNotesOff() override {
        if (!isInitialized_) return;
        // CC 123 = All Notes Off
        unsigned char data[3] = { 0xB0, 123, 0 };
        addMidiEvent(data, 3);
    }

    void controlChange(int cc, int value) override {
        if (!isInitialized_) return;
        unsigned char data[3] = {
            0xB0, (unsigned char)cc, (unsigned char)value
        };
        addMidiEvent(data, 3);
    }

    void pitchBend(int value) override {
        if (!isInitialized_) return;
        // 14-bit value (0..16383, center=8192) → MIDI pitch bend
        unsigned char lsb = value & 0x7F;
        unsigned char msb = (value >> 7) & 0x7F;
        unsigned char data[3] = { 0xE0, lsb, msb };
        addMidiEvent(data, 3);
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_ || numSamples <= 0) {
            if (numSamples > 0) {
                std::memset(outputL, 0, numSamples * sizeof(float));
                std::memset(outputR, 0, numSamples * sizeof(float));
            }
            return;
        }

        std::vector<amsynth_midi_cc_t> midiOut;
        synth_.process(numSamples, pendingMidi_, midiOut, outputL, outputR);

        // Clear MIDI event queue
        pendingMidi_.clear();
        midiBufPos_ = 0;
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        cachedParams_[paramId] = value;
        if (isInitialized_) {
            synth_.setParameterValue((Param)paramId, value);
        }
    }

    float getParameter(int paramId) const override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return 0.0f;
        return cachedParams_[paramId];
    }

    int getParameterCount() const override { return PARAM_COUNT; }

    const char* getParameterName(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_GROUP_NAMES[paramId];
        return "";
    }

    float getParameterMin(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return paramMin_[paramId];
        return 0.0f;
    }

    float getParameterMax(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return paramMax_[paramId];
        return 1.0f;
    }

    float getParameterDefault(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return paramDefault_[paramId];
        return 0.0f;
    }

#ifdef __EMSCRIPTEN__
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        process(reinterpret_cast<float*>(outputLPtr),
                reinterpret_cast<float*>(outputRPtr), numSamples);
    }
#endif

private:
    Synthesizer synth_;
    float cachedParams_[PARAM_COUNT] = {};
    float paramMin_[PARAM_COUNT] = {};
    float paramMax_[PARAM_COUNT] = {};
    float paramDefault_[PARAM_COUNT] = {};

    // MIDI event buffering
    static constexpr int MIDI_BUF_SIZE = 1024;
    unsigned char midiBuf_[MIDI_BUF_SIZE] = {};
    int midiBufPos_ = 0;
    std::vector<amsynth_midi_event_t> pendingMidi_;

    void addMidiEvent(const unsigned char* data, int length) {
        if (midiBufPos_ + length > MIDI_BUF_SIZE) return;  // buffer full

        std::memcpy(midiBuf_ + midiBufPos_, data, length);

        amsynth_midi_event_t event;
        event.offset_frames = 0;
        event.length = length;
        event.buffer = midiBuf_ + midiBufPos_;
        pendingMidi_.push_back(event);

        midiBufPos_ += length;
    }
};

} // namespace devilbox

EXPORT_WASM_SYNTH_EXTENDED_EX(AmsynthSynth, devilbox::AmsynthSynth, "AmsynthSynth")
