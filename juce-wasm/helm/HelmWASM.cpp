/**
 * HelmWASM.cpp - Helm Synth -> WASMSynthBase adapter
 *
 * Wraps Matt Tytel's Helm synthesizer for use in DEViLBOX's VSTBridge framework.
 * Helm is GPL3 licensed. Its DSP engine (mopo) is pure C++ with zero JUCE deps.
 *
 * Architecture:
 *   HelmSynth (WASMSynthBase)
 *     +-- HelmEngine* -- complete synthesis engine (voices, filters, FX)
 *     +-- control_map  -- cached parameter Value* pointers from engine
 *
 * Parameters use "Group:Name" naming for VSTBridgePanel auto-grouping.
 * 108 sound-relevant params across 19 groups (step seq steps via handleCommand).
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

#include "helm_engine.h"
#include "helm_common.h"

#include <cstring>
#include <cmath>
#include <vector>
#include <string>
#include <map>

namespace devilbox {

// ============================================================================
// Parameter mapping: index -> { "Group:Name", "helm_internal_name" }
// ============================================================================
struct ParamDef {
    const char* groupedName;   // "Group:Name" for VSTBridgePanel
    const char* helmName;      // Internal Helm parameter name
};

static const ParamDef PARAM_DEFS[] = {
    // --- Master (7) ---
    { "Master:Volume",          "volume" },
    { "Master:Polyphony",       "polyphony" },
    { "Master:Legato",          "legato" },
    { "Master:Vel Track",       "velocity_track" },
    { "Master:PB Range",        "pitch_bend_range" },
    { "Master:Portamento",      "portamento" },
    { "Master:Porta Type",      "portamento_type" },

    // --- Osc1 (7) ---
    { "Osc1:Waveform",          "osc_1_waveform" },
    { "Osc1:Volume",            "osc_1_volume" },
    { "Osc1:Transpose",         "osc_1_transpose" },
    { "Osc1:Tune",              "osc_1_tune" },
    { "Osc1:Unison Voices",     "osc_1_unison_voices" },
    { "Osc1:Unison Detune",     "osc_1_unison_detune" },
    { "Osc1:Harmonize",         "unison_1_harmonize" },

    // --- Osc2 (7) ---
    { "Osc2:Waveform",          "osc_2_waveform" },
    { "Osc2:Volume",            "osc_2_volume" },
    { "Osc2:Transpose",         "osc_2_transpose" },
    { "Osc2:Tune",              "osc_2_tune" },
    { "Osc2:Unison Voices",     "osc_2_unison_voices" },
    { "Osc2:Unison Detune",     "osc_2_unison_detune" },
    { "Osc2:Harmonize",         "unison_2_harmonize" },

    // --- Sub Osc (4) ---
    { "Sub Osc:Waveform",       "sub_waveform" },
    { "Sub Osc:Volume",         "sub_volume" },
    { "Sub Osc:Shuffle",        "sub_shuffle" },
    { "Sub Osc:Octave Down",    "sub_octave" },

    // --- Osc Common (5) ---
    { "Osc:Cross Mod",          "cross_modulation" },
    { "Osc:Noise Vol",          "noise_volume" },
    { "Osc:Feedback Amt",       "osc_feedback_amount" },
    { "Osc:Feedback Transpose", "osc_feedback_transpose" },
    { "Osc:Feedback Tune",      "osc_feedback_tune" },

    // --- Filter (8) ---
    { "Filter:On",              "filter_on" },
    { "Filter:Cutoff",          "cutoff" },
    { "Filter:Resonance",       "resonance" },
    { "Filter:Drive",           "filter_drive" },
    { "Filter:Blend",           "filter_blend" },
    { "Filter:Style",           "filter_style" },
    { "Filter:Shelf",           "filter_shelf" },
    { "Filter:Key Track",       "keytrack" },

    // --- Filter Env (5) ---
    { "Filter Env:Attack",      "fil_attack" },
    { "Filter Env:Decay",       "fil_decay" },
    { "Filter Env:Sustain",     "fil_sustain" },
    { "Filter Env:Release",     "fil_release" },
    { "Filter Env:Depth",       "fil_env_depth" },

    // --- Formant (3) ---
    { "Formant:On",             "formant_on" },
    { "Formant:X",              "formant_x" },
    { "Formant:Y",              "formant_y" },

    // --- Amp Env (4) ---
    { "Amp Env:Attack",         "amp_attack" },
    { "Amp Env:Decay",          "amp_decay" },
    { "Amp Env:Sustain",        "amp_sustain" },
    { "Amp Env:Release",        "amp_release" },

    // --- Mod Env (4) ---
    { "Mod Env:Attack",         "mod_attack" },
    { "Mod Env:Decay",          "mod_decay" },
    { "Mod Env:Sustain",        "mod_sustain" },
    { "Mod Env:Release",        "mod_release" },

    // --- Mono LFO1 (6) ---
    { "Mono LFO1:Waveform",    "mono_lfo_1_waveform" },
    { "Mono LFO1:Frequency",   "mono_lfo_1_frequency" },
    { "Mono LFO1:Amplitude",   "mono_lfo_1_amplitude" },
    { "Mono LFO1:Sync",        "mono_lfo_1_sync" },
    { "Mono LFO1:Tempo",       "mono_lfo_1_tempo" },
    { "Mono LFO1:Retrigger",   "mono_lfo_1_retrigger" },

    // --- Mono LFO2 (6) ---
    { "Mono LFO2:Waveform",    "mono_lfo_2_waveform" },
    { "Mono LFO2:Frequency",   "mono_lfo_2_frequency" },
    { "Mono LFO2:Amplitude",   "mono_lfo_2_amplitude" },
    { "Mono LFO2:Sync",        "mono_lfo_2_sync" },
    { "Mono LFO2:Tempo",       "mono_lfo_2_tempo" },
    { "Mono LFO2:Retrigger",   "mono_lfo_2_retrigger" },

    // --- Poly LFO (5) ---
    { "Poly LFO:Waveform",     "poly_lfo_waveform" },
    { "Poly LFO:Frequency",    "poly_lfo_frequency" },
    { "Poly LFO:Amplitude",    "poly_lfo_amplitude" },
    { "Poly LFO:Sync",         "poly_lfo_sync" },
    { "Poly LFO:Tempo",        "poly_lfo_tempo" },

    // --- Step Seq (6) ---
    { "Step Seq:Num Steps",     "num_steps" },
    { "Step Seq:Frequency",     "step_frequency" },
    { "Step Seq:Sync",          "step_sequencer_sync" },
    { "Step Seq:Tempo",         "step_sequencer_tempo" },
    { "Step Seq:Retrigger",     "step_sequencer_retrigger" },
    { "Step Seq:Smoothing",     "step_smoothing" },

    // --- Delay (6) ---
    { "Delay:On",               "delay_on" },
    { "Delay:Frequency",        "delay_frequency" },
    { "Delay:Feedback",         "delay_feedback" },
    { "Delay:Dry/Wet",          "delay_dry_wet" },
    { "Delay:Sync",             "delay_sync" },
    { "Delay:Tempo",            "delay_tempo" },

    // --- Distortion (4) ---
    { "Distortion:On",          "distortion_on" },
    { "Distortion:Type",        "distortion_type" },
    { "Distortion:Drive",       "distortion_drive" },
    { "Distortion:Mix",         "distortion_mix" },

    // --- Reverb (4) ---
    { "Reverb:On",              "reverb_on" },
    { "Reverb:Feedback",        "reverb_feedback" },
    { "Reverb:Damping",         "reverb_damping" },
    { "Reverb:Dry/Wet",         "reverb_dry_wet" },

    // --- Stutter (8) ---
    { "Stutter:On",             "stutter_on" },
    { "Stutter:Frequency",      "stutter_frequency" },
    { "Stutter:Sync",           "stutter_sync" },
    { "Stutter:Tempo",          "stutter_tempo" },
    { "Stutter:Resample Freq",  "stutter_resample_frequency" },
    { "Stutter:Resample Sync",  "stutter_resample_sync" },
    { "Stutter:Resample Tempo", "stutter_resample_tempo" },
    { "Stutter:Softness",       "stutter_softness" },

    // --- Arp (7) ---
    { "Arp:On",                 "arp_on" },
    { "Arp:Frequency",          "arp_frequency" },
    { "Arp:Gate",               "arp_gate" },
    { "Arp:Octaves",            "arp_octaves" },
    { "Arp:Pattern",            "arp_pattern" },
    { "Arp:Sync",               "arp_sync" },
    { "Arp:Tempo",              "arp_tempo" },
};

static constexpr int PARAM_COUNT = sizeof(PARAM_DEFS) / sizeof(ParamDef);

// ============================================================================
// HelmSynth - WASMSynthBase wrapper around HelmEngine
// ============================================================================
class HelmSynth : public WASMSynthBase {
public:
    HelmSynth() {
        // Pre-fill cached params with defaults from Helm's parameter_list
        for (int i = 0; i < PARAM_COUNT; ++i) {
            const std::string& name = PARAM_DEFS[i].helmName;
            if (mopo::Parameters::isParameter(name)) {
                const auto& details = mopo::Parameters::getDetails(name);
                cachedParams_[i] = (float)details.default_value;
            } else {
                cachedParams_[i] = 0.0f;
            }
        }
    }

    ~HelmSynth() {
        delete engine_;
        engine_ = nullptr;
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);

        engine_ = new mopo::HelmEngine();
        engine_->setSampleRate(sampleRate);
        engine_->setBufferSize(DEFAULT_BLOCK_SIZE);

        // Cache Value* pointers from engine's control map
        mopo::control_map controls = engine_->getControls();
        for (int i = 0; i < PARAM_COUNT; ++i) {
            auto it = controls.find(PARAM_DEFS[i].helmName);
            if (it != controls.end()) {
                controlPtrs_[i] = it->second;
            } else {
                controlPtrs_[i] = nullptr;
            }
        }

        // Also cache step sequencer Value* pointers for handleCommand
        for (int s = 0; s < 32; ++s) {
            char name[16];
            snprintf(name, sizeof(name), "step_seq_%02d", s);
            auto it = controls.find(name);
            stepSeqPtrs_[s] = (it != controls.end()) ? it->second : nullptr;
        }

        // Cache beats_per_minute control
        auto bpmIt = controls.find("beats_per_minute");
        bpmControl_ = (bpmIt != controls.end()) ? bpmIt->second : nullptr;

        // Apply defaults
        for (int i = 0; i < PARAM_COUNT; ++i) {
            if (controlPtrs_[i]) {
                controlPtrs_[i]->set((mopo::mopo_float)cachedParams_[i]);
            }
        }
    }

    void noteOn(int midiNote, int velocity) override {
        if (!isInitialized_ || !engine_) return;
        engine_->noteOn((mopo::mopo_float)midiNote,
                        (mopo::mopo_float)velocity / 127.0, 0, 0);
    }

    void noteOff(int midiNote) override {
        if (!isInitialized_ || !engine_) return;
        engine_->noteOff((mopo::mopo_float)midiNote, 0);
    }

    void allNotesOff() override {
        if (!isInitialized_ || !engine_) return;
        engine_->allNotesOff(0);
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_ || !engine_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        int offset = 0;
        int remaining = numSamples;

        while (remaining > 0) {
            // mopo max buffer is 256
            int blockSize = remaining < DEFAULT_BLOCK_SIZE ? remaining : DEFAULT_BLOCK_SIZE;

            engine_->setBufferSize(blockSize);
            engine_->process();

            // HelmEngine output(0) = left, output(1) = right
            const mopo::mopo_float* srcL = engine_->output(0)->buffer;
            const mopo::mopo_float* srcR = engine_->output(1)->buffer;

            // Convert mopo_float (double) to float
            for (int i = 0; i < blockSize; ++i) {
                outputL[offset + i] = (float)srcL[i];
                outputR[offset + i] = (float)srcR[i];
            }

            offset += blockSize;
            remaining -= blockSize;
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        cachedParams_[paramId] = value;
        if (isInitialized_ && controlPtrs_[paramId]) {
            controlPtrs_[paramId]->set((mopo::mopo_float)value);
        }
    }

    float getParameter(int paramId) const override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return 0.0f;
        return cachedParams_[paramId];
    }

    void controlChange(int cc, int value) override {
        if (!isInitialized_ || !engine_) return;
        // CC1 = mod wheel
        if (cc == 1) {
            engine_->setModWheel((mopo::mopo_float)value / 127.0, 0);
        }
    }

    void pitchBend(int value) override {
        if (!isInitialized_ || !engine_) return;
        // Convert 14-bit (0..16383, center=8192) to -1..1
        mopo::mopo_float normalized = ((mopo::mopo_float)value - 8192.0) / 8192.0;
        engine_->setPitchWheel(normalized, 0);
    }

    int getParameterCount() const override { return PARAM_COUNT; }

    const char* getParameterName(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_DEFS[paramId].groupedName;
        return "";
    }

    float getParameterMin(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            const std::string& name = PARAM_DEFS[paramId].helmName;
            if (mopo::Parameters::isParameter(name))
                return (float)mopo::Parameters::getDetails(name).min;
        }
        return 0.0f;
    }

    float getParameterMax(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            const std::string& name = PARAM_DEFS[paramId].helmName;
            if (mopo::Parameters::isParameter(name))
                return (float)mopo::Parameters::getDetails(name).max;
        }
        return 1.0f;
    }

    float getParameterDefault(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            const std::string& name = PARAM_DEFS[paramId].helmName;
            if (mopo::Parameters::isParameter(name))
                return (float)mopo::Parameters::getDetails(name).default_value;
        }
        return 0.0f;
    }

    bool handleCommand(const char* commandType, const uint8_t* data, int length) override {
        if (!isInitialized_) return false;

        // Set BPM: 4 bytes float
        if (std::strcmp(commandType, "setBPM") == 0 && length >= 4) {
            float bpm;
            std::memcpy(&bpm, data, sizeof(float));
            if (bpm > 0.0f && bpm < 999.0f) {
                engine_->setBpm((mopo::mopo_float)bpm);
            }
            return true;
        }

        // Set step sequencer values: 32 floats (128 bytes)
        if (std::strcmp(commandType, "setStepSeq") == 0 && length >= 128) {
            const float* steps = reinterpret_cast<const float*>(data);
            for (int i = 0; i < 32; ++i) {
                if (stepSeqPtrs_[i]) {
                    stepSeqPtrs_[i]->set((mopo::mopo_float)steps[i]);
                }
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
    mopo::HelmEngine* engine_ = nullptr;
    mopo::Value* controlPtrs_[PARAM_COUNT] = {};
    mopo::Value* stepSeqPtrs_[32] = {};
    mopo::Value* bpmControl_ = nullptr;
    float cachedParams_[PARAM_COUNT] = {};
};

} // namespace devilbox

EXPORT_WASM_SYNTH_EXTENDED_EX(HelmSynth, devilbox::HelmSynth, "HelmSynth")
