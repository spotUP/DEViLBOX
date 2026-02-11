/**
 * MoniqueSynth.cpp - Monique Monosynth -> WASMSynthBase adapter
 *
 * Wraps the Monique monosynth for use in DEViLBOX's VSTBridge framework.
 * Monique is a morphing monosynth by Surge Synth Team (dual GPL3/MIT).
 *
 * Architecture:
 *   MoniqueSynth (WASMSynthBase)
 *     +-- RuntimeNotifyer*    -- sample rate/block size notification
 *     +-- RuntimeInfo*        -- BPM, playback position
 *     +-- DataBuffer*         -- shared audio buffers
 *     +-- SmoothManager*      -- parameter smoothing
 *     +-- MoniqueSynthData*   -- all parameters, morph groups
 *     +-- MoniqueSynthesiserVoice* -- the single DSP voice
 *     +-- MoniqueSynthesizer* -- MIDI dispatch -> voice
 *
 * Parameters use "Group:Name" naming for VSTBridgePanel auto-grouping.
 * 120 sound-relevant params across 13 groups.
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

// Monique core headers (uses our JUCE shim via include paths)
// Note: private/protected->public hack is in monique_juce_shim.h (force-included)
#include "monique_core_Synth.h"
#include "monique_core_Datastructures.h"

#include <cstring>
#include <cmath>
#include <vector>
#include <string>

namespace devilbox {

// ============================================================================
// Parameter IDs — 120 sound-relevant params in 13 groups
// ============================================================================
enum MoniqueParams {
    // Master (5)
    PARAM_VOLUME = 0,
    PARAM_GLIDE,
    PARAM_OCTAVE_OFFSET,
    PARAM_NOTE_OFFSET,
    PARAM_SYNC,

    // Osc1 (4)
    PARAM_OSC1_WAVE,
    PARAM_OSC1_TUNE,
    PARAM_OSC1_FM_AMOUNT,
    PARAM_OSC1_SYNC,

    // Osc2 (4)
    PARAM_OSC2_WAVE,
    PARAM_OSC2_TUNE,
    PARAM_OSC2_FM_AMOUNT,
    PARAM_OSC2_SYNC,

    // Osc3 (4)
    PARAM_OSC3_WAVE,
    PARAM_OSC3_TUNE,
    PARAM_OSC3_FM_AMOUNT,
    PARAM_OSC3_SYNC,

    // FM Osc (4)
    PARAM_FM_FREQ,
    PARAM_FM_SHAPE,
    PARAM_FM_SWING,
    PARAM_FM_SHIFT,

    // Filter1 (7)
    PARAM_FIL1_TYPE,
    PARAM_FIL1_CUTOFF,
    PARAM_FIL1_RESONANCE,
    PARAM_FIL1_DISTORTION,
    PARAM_FIL1_OUTPUT,
    PARAM_FIL1_PAN,
    PARAM_FIL1_ENV_LFO_MIX,

    // Filter2 (7)
    PARAM_FIL2_TYPE,
    PARAM_FIL2_CUTOFF,
    PARAM_FIL2_RESONANCE,
    PARAM_FIL2_DISTORTION,
    PARAM_FIL2_OUTPUT,
    PARAM_FIL2_PAN,
    PARAM_FIL2_ENV_LFO_MIX,

    // Filter3 (7)
    PARAM_FIL3_TYPE,
    PARAM_FIL3_CUTOFF,
    PARAM_FIL3_RESONANCE,
    PARAM_FIL3_DISTORTION,
    PARAM_FIL3_OUTPUT,
    PARAM_FIL3_PAN,
    PARAM_FIL3_ENV_LFO_MIX,

    // FiltEnv1 (6)
    PARAM_FENV1_ATTACK,
    PARAM_FENV1_DECAY,
    PARAM_FENV1_SUSTAIN,
    PARAM_FENV1_SUS_TIME,
    PARAM_FENV1_RELEASE,
    PARAM_FENV1_SHAPE,

    // FiltEnv2 (6)
    PARAM_FENV2_ATTACK,
    PARAM_FENV2_DECAY,
    PARAM_FENV2_SUSTAIN,
    PARAM_FENV2_SUS_TIME,
    PARAM_FENV2_RELEASE,
    PARAM_FENV2_SHAPE,

    // FiltEnv3 (6)
    PARAM_FENV3_ATTACK,
    PARAM_FENV3_DECAY,
    PARAM_FENV3_SUSTAIN,
    PARAM_FENV3_SUS_TIME,
    PARAM_FENV3_RELEASE,
    PARAM_FENV3_SHAPE,

    // Env — main output envelope (6)
    PARAM_ENV_ATTACK,
    PARAM_ENV_DECAY,
    PARAM_ENV_SUSTAIN,
    PARAM_ENV_SUS_TIME,
    PARAM_ENV_RELEASE,
    PARAM_ENV_SHAPE,

    // LFO1 (3)
    PARAM_LFO1_SPEED,
    PARAM_LFO1_WAVE,
    PARAM_LFO1_PHASE,

    // LFO2 (3)
    PARAM_LFO2_SPEED,
    PARAM_LFO2_WAVE,
    PARAM_LFO2_PHASE,

    // LFO3 (3)
    PARAM_LFO3_SPEED,
    PARAM_LFO3_WAVE,
    PARAM_LFO3_PHASE,

    // MFO1 (3)
    PARAM_MFO1_SPEED,
    PARAM_MFO1_WAVE,
    PARAM_MFO1_PHASE,

    // MFO2 (3)
    PARAM_MFO2_SPEED,
    PARAM_MFO2_WAVE,
    PARAM_MFO2_PHASE,

    // MFO3 (3)
    PARAM_MFO3_SPEED,
    PARAM_MFO3_WAVE,
    PARAM_MFO3_PHASE,

    // MFO4 (3)
    PARAM_MFO4_SPEED,
    PARAM_MFO4_WAVE,
    PARAM_MFO4_PHASE,

    // Routing — filter input levels (9)
    PARAM_ROUTE_F1_OSC1,
    PARAM_ROUTE_F1_OSC2,
    PARAM_ROUTE_F1_OSC3,
    PARAM_ROUTE_F2_OSC1,
    PARAM_ROUTE_F2_OSC2,
    PARAM_ROUTE_F2_OSC3,
    PARAM_ROUTE_F3_OSC1,
    PARAM_ROUTE_F3_OSC2,
    PARAM_ROUTE_F3_OSC3,

    // FX (8)
    PARAM_FX_DISTORTION,
    PARAM_FX_SHAPE,
    PARAM_FX_DELAY,
    PARAM_FX_DELAY_PAN,
    PARAM_FX_REVERB_ROOM,
    PARAM_FX_REVERB_MIX,
    PARAM_FX_CHORUS_MOD,
    PARAM_FX_BYPASS,

    // Morph (4)
    PARAM_MORPH1,
    PARAM_MORPH2,
    PARAM_MORPH3,
    PARAM_MORPH4,

    // Arp (4)
    PARAM_ARP_ON,
    PARAM_ARP_SEQUENCER,
    PARAM_ARP_SPEED,
    PARAM_ARP_SHUFFLE,

    // EQ (8)
    PARAM_EQ_BAND1,
    PARAM_EQ_BAND2,
    PARAM_EQ_BAND3,
    PARAM_EQ_BAND4,
    PARAM_EQ_BAND5,
    PARAM_EQ_BAND6,
    PARAM_EQ_BAND7,
    PARAM_EQ_BYPASS,

    PARAM_COUNT  // = 120
};

// ============================================================================
// Parameter names — "Group:Name" convention for VSTBridgePanel auto-grouping
// ============================================================================
static const char* PARAM_NAMES[PARAM_COUNT] = {
    // Master (5)
    "Master:Volume", "Master:Glide", "Master:Octave", "Master:Note Offset", "Master:Sync",
    // Osc1 (4)
    "Osc1:Wave", "Osc1:Tune", "Osc1:FM Amount", "Osc1:Sync",
    // Osc2 (4)
    "Osc2:Wave", "Osc2:Tune", "Osc2:FM Amount", "Osc2:Sync",
    // Osc3 (4)
    "Osc3:Wave", "Osc3:Tune", "Osc3:FM Amount", "Osc3:Sync",
    // FM Osc (4)
    "FM Osc:Freq", "FM Osc:Shape", "FM Osc:Swing", "FM Osc:Shift",
    // Filter1 (7)
    "Filter1:Type", "Filter1:Cutoff", "Filter1:Resonance",
    "Filter1:Distortion", "Filter1:Output", "Filter1:Pan", "Filter1:Env-LFO Mix",
    // Filter2 (7)
    "Filter2:Type", "Filter2:Cutoff", "Filter2:Resonance",
    "Filter2:Distortion", "Filter2:Output", "Filter2:Pan", "Filter2:Env-LFO Mix",
    // Filter3 (7)
    "Filter3:Type", "Filter3:Cutoff", "Filter3:Resonance",
    "Filter3:Distortion", "Filter3:Output", "Filter3:Pan", "Filter3:Env-LFO Mix",
    // FiltEnv1 (6)
    "FiltEnv1:Attack", "FiltEnv1:Decay", "FiltEnv1:Sustain",
    "FiltEnv1:Sus Time", "FiltEnv1:Release", "FiltEnv1:Shape",
    // FiltEnv2 (6)
    "FiltEnv2:Attack", "FiltEnv2:Decay", "FiltEnv2:Sustain",
    "FiltEnv2:Sus Time", "FiltEnv2:Release", "FiltEnv2:Shape",
    // FiltEnv3 (6)
    "FiltEnv3:Attack", "FiltEnv3:Decay", "FiltEnv3:Sustain",
    "FiltEnv3:Sus Time", "FiltEnv3:Release", "FiltEnv3:Shape",
    // Env (6)
    "Env:Attack", "Env:Decay", "Env:Sustain",
    "Env:Sus Time", "Env:Release", "Env:Shape",
    // LFO1-3 (9)
    "LFO1:Speed", "LFO1:Wave", "LFO1:Phase",
    "LFO2:Speed", "LFO2:Wave", "LFO2:Phase",
    "LFO3:Speed", "LFO3:Wave", "LFO3:Phase",
    // MFO1-4 (12)
    "MFO1:Speed", "MFO1:Wave", "MFO1:Phase",
    "MFO2:Speed", "MFO2:Wave", "MFO2:Phase",
    "MFO3:Speed", "MFO3:Wave", "MFO3:Phase",
    "MFO4:Speed", "MFO4:Wave", "MFO4:Phase",
    // Routing (9)
    "Routing:F1\xe2\x86\x90Osc1", "Routing:F1\xe2\x86\x90Osc2", "Routing:F1\xe2\x86\x90Osc3",
    "Routing:F2\xe2\x86\x90Osc1", "Routing:F2\xe2\x86\x90Osc2", "Routing:F2\xe2\x86\x90Osc3",
    "Routing:F3\xe2\x86\x90Osc1", "Routing:F3\xe2\x86\x90Osc2", "Routing:F3\xe2\x86\x90Osc3",
    // FX (8)
    "FX:Distortion", "FX:Shape", "FX:Delay", "FX:Delay Pan",
    "FX:Reverb Room", "FX:Reverb Mix", "FX:Chorus Mod", "FX:Bypass",
    // Morph (4)
    "Morph:State 1", "Morph:State 2", "Morph:State 3", "Morph:State 4",
    // Arp (4)
    "Arp:On", "Arp:Sequencer", "Arp:Speed", "Arp:Shuffle",
    // EQ (8)
    "EQ:Band 1", "EQ:Band 2", "EQ:Band 3", "EQ:Band 4",
    "EQ:Band 5", "EQ:Band 6", "EQ:Band 7", "EQ:Bypass"
};

// ============================================================================
// Parameter defaults — sensible init patch
// ============================================================================
static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    // Master
    0.9f, 0.05f, 0, 0, 1,
    // Osc1 (SAW default for a useful init tone)
    1.0f, 0, 0, 0,
    // Osc2
    0, 0, 0, 1,
    // Osc3
    0, 0, 0, 1,
    // FM Osc
    0, 0, 0, 0,
    // Filter1
    1, 0.2f, 0.3f, 0, 0.75f, 0, -0.9f,
    // Filter2
    1, 0.2f, 0.3f, 0, 0.75f, 0, -0.9f,
    // Filter3
    1, 0.2f, 0.3f, 0, 0.75f, 0, -0.9f,
    // FiltEnv1
    0.05f, 0.02f, 0.9f, 1, 0.2f, 0,
    // FiltEnv2
    0.05f, 0.02f, 0.9f, 1, 0.2f, 0,
    // FiltEnv3
    0.05f, 0.02f, 0.9f, 1, 0.2f, 0,
    // Env (main output)
    0.05f, 0.02f, 0.9f, 1, 0.2f, 0,
    // LFO1-3
    4, 0, 0,  4, 0, 0,  4, 0, 0,
    // MFO1-4
    4, 0, 0,  4, 0, 0,  4, 0, 0,  4, 0, 0,
    // Routing (Osc1->Filter1 = 1, rest = 0)
    1, 0, 0,  0, 0, 0,  0, 0, 0,
    // FX
    0.6f, 0.05f, 0, 0, 0.333f, 0.75f, 0.333f, 1,
    // Morph
    0, 0, 0, 0,
    // Arp (off by default for simple note playback)
    0, 0, 0, 0,
    // EQ
    0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 1
};

// ============================================================================
// Parameter minimums
// ============================================================================
static const float PARAM_MINS[PARAM_COUNT] = {
    // Master
    0, 0, -2, 0, 0,
    // Osc1-3 (wave 0..3, tune -36..36, fm 0..1, sync 0..1)
    0, -36, 0, 0,
    0, -36, 0, 0,
    0, -36, 0, 0,
    // FM Osc
    0, 0, 0, 0,
    // Filter1-3 (type 1..7, cutoff/reso/dist/output 0..1, pan -1..1, mix -1..1)
    1, 0, 0, 0, 0, -1, -1,
    1, 0, 0, 0, 0, -1, -1,
    1, 0, 0, 0, 0, -1, -1,
    // FiltEnv1-3 (attack/decay/sustain/sus_time/release 0..1, shape -1..1)
    0, 0, 0, 0, 0, -1,
    0, 0, 0, 0, 0, -1,
    0, 0, 0, 0, 0, -1,
    // Env
    0, 0, 0, 0, 0, -1,
    // LFO1-3 (speed 0..16, wave/phase 0..1)
    0, 0, 0,  0, 0, 0,  0, 0, 0,
    // MFO1-4
    0, 0, 0,  0, 0, 0,  0, 0, 0,  0, 0, 0,
    // Routing
    0, 0, 0,  0, 0, 0,  0, 0, 0,
    // FX (delay_pan -1..1, rest 0..1)
    0, 0, 0, -1, 0, 0, 0, 0,
    // Morph
    0, 0, 0, 0,
    // Arp (speed -15..15, rest 0)
    0, 0, -15, 0,
    // EQ
    0, 0, 0, 0, 0, 0, 0, 0
};

// ============================================================================
// Parameter maximums
// ============================================================================
static const float PARAM_MAXS[PARAM_COUNT] = {
    // Master
    1, 1, 2, 12, 1,
    // Osc1-3
    3, 36, 1, 1,
    3, 36, 1, 1,
    3, 36, 1, 1,
    // FM Osc
    1, 1, 1, 1,
    // Filter1-3
    7, 1, 1, 1, 1, 1, 1,
    7, 1, 1, 1, 1, 1, 1,
    7, 1, 1, 1, 1, 1, 1,
    // FiltEnv1-3
    1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1,
    // Env
    1, 1, 1, 1, 1, 1,
    // LFO1-3
    16, 1, 1,  16, 1, 1,  16, 1, 1,
    // MFO1-4
    16, 1, 1,  16, 1, 1,  16, 1, 1,  16, 1, 1,
    // Routing
    1, 1, 1,  1, 1, 1,  1, 1, 1,
    // FX
    1, 1, 1, 1, 1, 1, 1, 1,
    // Morph
    1, 1, 1, 1,
    // Arp
    1, 1, 15, 15,
    // EQ
    1, 1, 1, 1, 1, 1, 1, 1
};

// ============================================================================
// MoniqueSynth — WASMSynthBase wrapper
// ============================================================================
class MoniqueSynth : public WASMSynthBase {
public:
    MoniqueSynth() {
        std::memcpy(params_, PARAM_DEFAULTS, sizeof(params_));
    }

    ~MoniqueSynth() {
        // Raw pointers -- destroy in reverse order of creation
        delete synth_;
        synth_ = nullptr;
        voice_ = nullptr; // owned by synth_
        delete synthData_;
        synthData_ = nullptr;
        smoothManager_ = nullptr;
        delete dataBuffer_;
        dataBuffer_ = nullptr;
        delete runtimeInfo_;
        runtimeInfo_ = nullptr;
        delete runtimeNotifyer_;
        runtimeNotifyer_ = nullptr;
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);

        // Create runtime infrastructure
        runtimeNotifyer_ = new RuntimeNotifyer();
        runtimeNotifyer_->set_sample_rate((double)sampleRate);
        runtimeNotifyer_->set_block_size(DEFAULT_BLOCK_SIZE);

        runtimeInfo_ = new RuntimeInfo();
        runtimeInfo_->bpm = 120.0;
        runtimeInfo_->samples_since_start = 0;
        runtimeInfo_->relative_samples_since_start = 0;

        // Create data buffer for DSP working storage
        dataBuffer_ = new DataBuffer(DEFAULT_BLOCK_SIZE);

        // Create synth data (parameters, morph groups, etc.)
        synthData_ = new MoniqueSynthData(
            MASTER,             // data type
            nullptr,            // no look and feel (WASM)
            nullptr,            // no audio processor (WASM wrapper replaces it)
            runtimeNotifyer_,
            runtimeInfo_,
            dataBuffer_,
            nullptr,            // smooth manager (created internally)
            nullptr             // no master data (this IS the master)
        );
        smoothManager_ = synthData_->smooth_manager;

        // Create the voice
        voice_ = new MoniqueSynthesiserVoice(
            nullptr,            // no audio processor
            synthData_,
            runtimeNotifyer_,
            runtimeInfo_,
            dataBuffer_
        );

        // Create synthesizer sound
        auto sound = std::make_shared<MoniqueSynthesiserSound>();

        // Create synthesizer and connect voice
        synth_ = new MoniqueSynthesizer(
            synthData_,
            voice_,
            sound,
            nullptr             // no MIDI control handler
        );

        synth_->setCurrentPlaybackSampleRate((double)sampleRate);

        // Allocate output buffer
        outputBuffer_.setSize(2, DEFAULT_BLOCK_SIZE);

        // Apply default parameters
        for (int i = 0; i < PARAM_COUNT; ++i) {
            applyParameter(i, params_[i]);
        }
    }

    void noteOn(int midiNote, int velocity) override {
        if (!isInitialized_) return;

        float vel = velocity / 127.0f;
        juce::MidiBuffer midiBuf;
        midiBuf.addEvent(juce::MidiMessage::noteOn(1, midiNote, vel), 0);

        // Route through synthesizer's MIDI handling
        synth_->render_next_block(outputBuffer_, midiBuf, 0, 0);
    }

    void noteOff(int midiNote) override {
        if (!isInitialized_) return;

        juce::MidiBuffer midiBuf;
        midiBuf.addEvent(juce::MidiMessage::noteOff(1, midiNote, 0.0f), 0);
        synth_->render_next_block(outputBuffer_, midiBuf, 0, 0);
    }

    void allNotesOff() override {
        if (!isInitialized_ || !voice_) return;
        voice_->reset(true);
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        // Process in blocks of DEFAULT_BLOCK_SIZE
        int samplesRemaining = numSamples;
        int offset = 0;

        while (samplesRemaining > 0) {
            int blockSize = std::min(samplesRemaining, DEFAULT_BLOCK_SIZE);

            // Resize output buffer if needed
            if (outputBuffer_.getNumSamples() < blockSize) {
                outputBuffer_.setSize(2, blockSize, false, true, true);
            }

            // Clear output buffer
            outputBuffer_.clear();

            // Update runtime info
            runtimeInfo_->samples_since_start += blockSize;
            double bpm = runtimeInfo_->bpm;
            if (bpm > 0) {
                runtimeInfo_->steps_per_sample = (bpm / 60.0) * 4.0 / (double)sampleRate_;
            }

            // Render through synthesizer
            juce::MidiBuffer emptyMidi;
            synth_->render_next_block(outputBuffer_, emptyMidi, 0, blockSize);

            // Copy to output
            const float* bufL = outputBuffer_.getReadPointer(0);
            const float* bufR = outputBuffer_.getNumChannels() > 1
                ? outputBuffer_.getReadPointer(1)
                : bufL;

            std::memcpy(outputL + offset, bufL, blockSize * sizeof(float));
            std::memcpy(outputR + offset, bufR, blockSize * sizeof(float));

            offset += blockSize;
            samplesRemaining -= blockSize;
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            params_[paramId] = value;
            if (isInitialized_) {
                applyParameter(paramId, value);
            }
        }
    }

    float getParameter(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            return params_[paramId];
        }
        return 0.0f;
    }

    void controlChange(int cc, int value) override {
        if (!isInitialized_) return;
        juce::MidiBuffer midiBuf;
        midiBuf.addEvent(juce::MidiMessage::controllerEvent(1, cc, value), 0);
        synth_->render_next_block(outputBuffer_, midiBuf, 0, 0);
    }

    void pitchBend(int value) override {
        if (!isInitialized_) return;
        juce::MidiBuffer midiBuf;
        midiBuf.addEvent(juce::MidiMessage::pitchWheel(1, value), 0);
        synth_->render_next_block(outputBuffer_, midiBuf, 0, 0);
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

    bool handleCommand(const char* commandType, const uint8_t* data, int length) override {
        if (!isInitialized_) return false;

        // Handle BPM changes
        if (std::strcmp(commandType, "setBPM") == 0 && length >= 4) {
            float bpm;
            std::memcpy(&bpm, data, sizeof(float));
            if (bpm > 0.0f && bpm < 999.0f) {
                runtimeInfo_->bpm = (double)bpm;
            }
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
    // ========================================================================
    // applyParameter — complete wiring to MoniqueSynthData fields
    // ========================================================================
    void applyParameter(int paramId, float value) {
        if (!synthData_) return;

        switch (paramId) {

        // ---- Master --------------------------------------------------------
        case PARAM_VOLUME:
            synthData_->volume.set_value(value);
            break;
        case PARAM_GLIDE:
            synthData_->glide.set_value(value);
            break;
        case PARAM_OCTAVE_OFFSET:
            synthData_->octave_offset.set_value((int)value);
            break;
        case PARAM_NOTE_OFFSET:
            synthData_->note_offset.set_value((int)value);
            break;
        case PARAM_SYNC:
            synthData_->sync.set_value(value > 0.5f);
            break;

        // ---- Oscillators (stride=4: wave, tune, fm_amount, sync) -----------
        case PARAM_OSC1_WAVE: case PARAM_OSC2_WAVE: case PARAM_OSC3_WAVE: {
            int i = (paramId - PARAM_OSC1_WAVE) / 4;
            synthData_->osc_datas[i]->wave.set_value(value);
            break;
        }
        case PARAM_OSC1_TUNE: case PARAM_OSC2_TUNE: case PARAM_OSC3_TUNE: {
            int i = (paramId - PARAM_OSC1_TUNE) / 4;
            synthData_->osc_datas[i]->tune.set_value(value);
            break;
        }
        case PARAM_OSC1_FM_AMOUNT: case PARAM_OSC2_FM_AMOUNT: case PARAM_OSC3_FM_AMOUNT: {
            int i = (paramId - PARAM_OSC1_FM_AMOUNT) / 4;
            synthData_->osc_datas[i]->fm_amount.set_value(value);
            break;
        }
        case PARAM_OSC1_SYNC: case PARAM_OSC2_SYNC: case PARAM_OSC3_SYNC: {
            int i = (paramId - PARAM_OSC1_SYNC) / 4;
            synthData_->osc_datas[i]->sync.set_value(value > 0.5f);
            break;
        }

        // ---- FM Oscillator -------------------------------------------------
        case PARAM_FM_FREQ:
            synthData_->fm_osc_data->fm_freq.set_value(value);
            break;
        case PARAM_FM_SHAPE:
            synthData_->fm_osc_data->fm_shape.set_value(value);
            break;
        case PARAM_FM_SWING:
            synthData_->fm_osc_data->fm_swing.set_value(value);
            break;
        case PARAM_FM_SHIFT:
            synthData_->fm_osc_data->master_shift.set_value(value);
            break;

        // ---- Filters (stride=7: type, cutoff, reso, dist, output, pan, mix)
        case PARAM_FIL1_TYPE: case PARAM_FIL2_TYPE: case PARAM_FIL3_TYPE: {
            int i = (paramId - PARAM_FIL1_TYPE) / 7;
            synthData_->filter_datas[i]->filter_type.set_value((int)value);
            break;
        }
        case PARAM_FIL1_CUTOFF: case PARAM_FIL2_CUTOFF: case PARAM_FIL3_CUTOFF: {
            int i = (paramId - PARAM_FIL1_CUTOFF) / 7;
            synthData_->filter_datas[i]->cutoff.set_value(value);
            break;
        }
        case PARAM_FIL1_RESONANCE: case PARAM_FIL2_RESONANCE: case PARAM_FIL3_RESONANCE: {
            int i = (paramId - PARAM_FIL1_RESONANCE) / 7;
            synthData_->filter_datas[i]->resonance.set_value(value);
            break;
        }
        case PARAM_FIL1_DISTORTION: case PARAM_FIL2_DISTORTION: case PARAM_FIL3_DISTORTION: {
            int i = (paramId - PARAM_FIL1_DISTORTION) / 7;
            synthData_->filter_datas[i]->distortion.set_value(value);
            break;
        }
        case PARAM_FIL1_OUTPUT: case PARAM_FIL2_OUTPUT: case PARAM_FIL3_OUTPUT: {
            int i = (paramId - PARAM_FIL1_OUTPUT) / 7;
            synthData_->filter_datas[i]->output.set_value(value);
            break;
        }
        case PARAM_FIL1_PAN: case PARAM_FIL2_PAN: case PARAM_FIL3_PAN: {
            int i = (paramId - PARAM_FIL1_PAN) / 7;
            synthData_->filter_datas[i]->pan.set_value(value);
            break;
        }
        case PARAM_FIL1_ENV_LFO_MIX: case PARAM_FIL2_ENV_LFO_MIX: case PARAM_FIL3_ENV_LFO_MIX: {
            int i = (paramId - PARAM_FIL1_ENV_LFO_MIX) / 7;
            synthData_->filter_datas[i]->adsr_lfo_mix.set_value(value);
            break;
        }

        // ---- Filter Envelopes (stride=6: A, D, S, ST, R, Shape) -----------
        case PARAM_FENV1_ATTACK: case PARAM_FENV2_ATTACK: case PARAM_FENV3_ATTACK: {
            int i = (paramId - PARAM_FENV1_ATTACK) / 6;
            synthData_->filter_datas[i]->env_data->attack.set_value(value);
            break;
        }
        case PARAM_FENV1_DECAY: case PARAM_FENV2_DECAY: case PARAM_FENV3_DECAY: {
            int i = (paramId - PARAM_FENV1_DECAY) / 6;
            synthData_->filter_datas[i]->env_data->decay.set_value(value);
            break;
        }
        case PARAM_FENV1_SUSTAIN: case PARAM_FENV2_SUSTAIN: case PARAM_FENV3_SUSTAIN: {
            int i = (paramId - PARAM_FENV1_SUSTAIN) / 6;
            synthData_->filter_datas[i]->env_data->sustain.set_value(value);
            break;
        }
        case PARAM_FENV1_SUS_TIME: case PARAM_FENV2_SUS_TIME: case PARAM_FENV3_SUS_TIME: {
            int i = (paramId - PARAM_FENV1_SUS_TIME) / 6;
            synthData_->filter_datas[i]->env_data->sustain_time.set_value(value);
            break;
        }
        case PARAM_FENV1_RELEASE: case PARAM_FENV2_RELEASE: case PARAM_FENV3_RELEASE: {
            int i = (paramId - PARAM_FENV1_RELEASE) / 6;
            synthData_->filter_datas[i]->env_data->release.set_value(value);
            break;
        }
        case PARAM_FENV1_SHAPE: case PARAM_FENV2_SHAPE: case PARAM_FENV3_SHAPE: {
            int i = (paramId - PARAM_FENV1_SHAPE) / 6;
            synthData_->filter_datas[i]->env_data->shape.set_value(value);
            break;
        }

        // ---- Main Output Envelope ------------------------------------------
        case PARAM_ENV_ATTACK:
            synthData_->env_data->attack.set_value(value);
            break;
        case PARAM_ENV_DECAY:
            synthData_->env_data->decay.set_value(value);
            break;
        case PARAM_ENV_SUSTAIN:
            synthData_->env_data->sustain.set_value(value);
            break;
        case PARAM_ENV_SUS_TIME:
            synthData_->env_data->sustain_time.set_value(value);
            break;
        case PARAM_ENV_RELEASE:
            synthData_->env_data->release.set_value(value);
            break;
        case PARAM_ENV_SHAPE:
            synthData_->env_data->shape.set_value(value);
            break;

        // ---- LFOs (stride=3: speed, wave, phase) --------------------------
        case PARAM_LFO1_SPEED: case PARAM_LFO2_SPEED: case PARAM_LFO3_SPEED: {
            int i = (paramId - PARAM_LFO1_SPEED) / 3;
            synthData_->lfo_datas[i]->speed.set_value((int)value);
            break;
        }
        case PARAM_LFO1_WAVE: case PARAM_LFO2_WAVE: case PARAM_LFO3_WAVE: {
            int i = (paramId - PARAM_LFO1_WAVE) / 3;
            synthData_->lfo_datas[i]->wave.set_value(value);
            break;
        }
        case PARAM_LFO1_PHASE: case PARAM_LFO2_PHASE: case PARAM_LFO3_PHASE: {
            int i = (paramId - PARAM_LFO1_PHASE) / 3;
            synthData_->lfo_datas[i]->phase_shift.set_value(value);
            break;
        }

        // ---- MFOs (stride=3: speed, wave, phase) --------------------------
        case PARAM_MFO1_SPEED: case PARAM_MFO2_SPEED:
        case PARAM_MFO3_SPEED: case PARAM_MFO4_SPEED: {
            int i = (paramId - PARAM_MFO1_SPEED) / 3;
            synthData_->mfo_datas[i]->speed.set_value((int)value);
            break;
        }
        case PARAM_MFO1_WAVE: case PARAM_MFO2_WAVE:
        case PARAM_MFO3_WAVE: case PARAM_MFO4_WAVE: {
            int i = (paramId - PARAM_MFO1_WAVE) / 3;
            synthData_->mfo_datas[i]->wave.set_value(value);
            break;
        }
        case PARAM_MFO1_PHASE: case PARAM_MFO2_PHASE:
        case PARAM_MFO3_PHASE: case PARAM_MFO4_PHASE: {
            int i = (paramId - PARAM_MFO1_PHASE) / 3;
            synthData_->mfo_datas[i]->phase_shift.set_value(value);
            break;
        }

        // ---- Routing — filter input sustains (3 filters x 3 osc inputs) ----
        case PARAM_ROUTE_F1_OSC1: case PARAM_ROUTE_F1_OSC2: case PARAM_ROUTE_F1_OSC3:
        case PARAM_ROUTE_F2_OSC1: case PARAM_ROUTE_F2_OSC2: case PARAM_ROUTE_F2_OSC3:
        case PARAM_ROUTE_F3_OSC1: case PARAM_ROUTE_F3_OSC2: case PARAM_ROUTE_F3_OSC3: {
            int idx = paramId - PARAM_ROUTE_F1_OSC1;
            int f = idx / 3;  // filter index 0..2
            int o = idx % 3;  // osc input index 0..2
            synthData_->filter_datas[f]->input_sustains[o].set_value(value);
            break;
        }

        // ---- FX ------------------------------------------------------------
        case PARAM_FX_DISTORTION:
            synthData_->distortion.set_value(value);
            break;
        case PARAM_FX_SHAPE:
            synthData_->shape.set_value(value);
            break;
        case PARAM_FX_DELAY:
            synthData_->delay.set_value(value);
            break;
        case PARAM_FX_DELAY_PAN:
            synthData_->delay_pan.set_value(value);
            break;
        case PARAM_FX_REVERB_ROOM:
            synthData_->reverb_data->room.set_value(value);
            break;
        case PARAM_FX_REVERB_MIX:
            synthData_->reverb_data->dry_wet_mix.set_value(value);
            break;
        case PARAM_FX_CHORUS_MOD:
            synthData_->chorus_data->modulation.set_value(value);
            break;
        case PARAM_FX_BYPASS:
            synthData_->effect_bypass.set_value(value);
            break;

        // ---- Morph ---------------------------------------------------------
        case PARAM_MORPH1: case PARAM_MORPH2:
        case PARAM_MORPH3: case PARAM_MORPH4: {
            int i = paramId - PARAM_MORPH1;
            synthData_->morhp_states[i].set_value(value);
            break;
        }

        // ---- Arp -----------------------------------------------------------
        case PARAM_ARP_ON:
            synthData_->arp_sequencer_data->is_on.set_value(value > 0.5f);
            break;
        case PARAM_ARP_SEQUENCER:
            synthData_->arp_sequencer_data->is_sequencer.set_value(value > 0.5f);
            break;
        case PARAM_ARP_SPEED:
            synthData_->arp_sequencer_data->speed_multi.set_value((int)value);
            break;
        case PARAM_ARP_SHUFFLE:
            synthData_->arp_sequencer_data->shuffle.set_value((int)value);
            break;

        // ---- EQ ------------------------------------------------------------
        case PARAM_EQ_BAND1: case PARAM_EQ_BAND2: case PARAM_EQ_BAND3:
        case PARAM_EQ_BAND4: case PARAM_EQ_BAND5: case PARAM_EQ_BAND6:
        case PARAM_EQ_BAND7: {
            int i = paramId - PARAM_EQ_BAND1;
            synthData_->eq_data->velocity[i].set_value(value);
            break;
        }
        case PARAM_EQ_BYPASS:
            synthData_->eq_data->bypass.set_value(value);
            break;

        default:
            break;
        }
    }

    // Monique core objects (raw pointers -- private ctors/dtors opened via #define)
    RuntimeNotifyer* runtimeNotifyer_ = nullptr;
    RuntimeInfo* runtimeInfo_ = nullptr;
    DataBuffer* dataBuffer_ = nullptr;
    SmoothManager* smoothManager_ = nullptr;
    MoniqueSynthData* synthData_ = nullptr;
    MoniqueSynthesiserVoice* voice_ = nullptr;  // owned by synth_
    MoniqueSynthesizer* synth_ = nullptr;

    // Audio output buffer
    juce::AudioBuffer<float> outputBuffer_;

    // Cached parameter values
    float params_[PARAM_COUNT];
};

} // namespace devilbox

EXPORT_WASM_SYNTH_EXTENDED_EX(MoniqueSynth, devilbox::MoniqueSynth, "MoniqueSynth")
