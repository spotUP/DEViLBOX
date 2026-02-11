/**
 * Odin2WASM.cpp - Odin2 Semi-Modular Synth → WASMSynthBase adapter
 *
 * Wraps Odin2's Voice objects directly for use in DEViLBOX's VSTBridge framework.
 * Odin2 is a hybrid semi-modular synthesizer by The Wave Warden (GPL v3).
 *
 * This bypasses OdinAudioProcessor (which requires full JUCE) and instead
 * manages Voice objects and the per-sample processing loop directly,
 * following the same pattern as the existing DexedSynth WASM wrapper.
 *
 * Architecture:
 *   Odin2Synth (WASMSynthBase)
 *     ├── Voice[24] (polyphonic voices)
 *     │     ├── Oscillator × 3 (11 types: analog, wavetable, FM, PM, etc.)
 *     │     ├── Filter × 2 (7 types: ladder, SEM, Korg35, diode, etc.)
 *     │     ├── ADSR × 3
 *     │     ├── LFO × 3
 *     │     └── Amplifier + Distortion
 *     └── VoiceManager (voice allocation)
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

#include "audio/Voice.h"
#include "audio/FX/Delay.h"
#include "audio/FX/Chorus.h"
#include "audio/FX/Flanger.h"
#include "audio/FX/Phaser.h"
#include "audio/FX/ZitaReverb.h"

#include <cstring>
#include <cmath>
#include <vector>
#include <string>

namespace devilbox {

// Parameter IDs for the WASM interface
enum Odin2Params {
    // Oscillator params (per osc: 0,1,2)
    PARAM_OSC1_TYPE = 0,
    PARAM_OSC1_VOL,
    PARAM_OSC1_OCTAVE,
    PARAM_OSC1_SEMI,
    PARAM_OSC1_FINE,
    PARAM_OSC2_TYPE,
    PARAM_OSC2_VOL,
    PARAM_OSC2_OCTAVE,
    PARAM_OSC2_SEMI,
    PARAM_OSC2_FINE,
    PARAM_OSC3_TYPE,
    PARAM_OSC3_VOL,
    PARAM_OSC3_OCTAVE,
    PARAM_OSC3_SEMI,
    PARAM_OSC3_FINE,

    // Filter params (per filter: 0,1)
    PARAM_FIL1_TYPE,
    PARAM_FIL1_FREQ,
    PARAM_FIL1_RES,
    PARAM_FIL1_GAIN,
    PARAM_FIL1_OSC1,
    PARAM_FIL1_OSC2,
    PARAM_FIL1_OSC3,
    PARAM_FIL2_TYPE,
    PARAM_FIL2_FREQ,
    PARAM_FIL2_RES,
    PARAM_FIL2_GAIN,
    PARAM_FIL2_OSC1,
    PARAM_FIL2_OSC2,
    PARAM_FIL2_OSC3,
    PARAM_FIL2_FIL1,

    // ADSR Envelope 1 (Amp)
    PARAM_ENV1_ATTACK,
    PARAM_ENV1_DECAY,
    PARAM_ENV1_SUSTAIN,
    PARAM_ENV1_RELEASE,

    // ADSR Envelope 2 (Filter)
    PARAM_ENV2_ATTACK,
    PARAM_ENV2_DECAY,
    PARAM_ENV2_SUSTAIN,
    PARAM_ENV2_RELEASE,

    // Filter envelope amount
    PARAM_FIL1_ENV,
    PARAM_FIL2_ENV,

    // Routing
    PARAM_FIL1_TO_AMP,
    PARAM_FIL2_TO_AMP,

    // Master
    PARAM_MASTER_VOL,
    PARAM_GLIDE,

    PARAM_COUNT
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    "Osc1 Type", "Osc1 Vol", "Osc1 Oct", "Osc1 Semi", "Osc1 Fine",
    "Osc2 Type", "Osc2 Vol", "Osc2 Oct", "Osc2 Semi", "Osc2 Fine",
    "Osc3 Type", "Osc3 Vol", "Osc3 Oct", "Osc3 Semi", "Osc3 Fine",
    "Fil1 Type", "Fil1 Freq", "Fil1 Res", "Fil1 Gain", "Fil1<-Osc1", "Fil1<-Osc2", "Fil1<-Osc3",
    "Fil2 Type", "Fil2 Freq", "Fil2 Res", "Fil2 Gain", "Fil2<-Osc1", "Fil2<-Osc2", "Fil2<-Osc3", "Fil2<-Fil1",
    "Env1 Attack", "Env1 Decay", "Env1 Sustain", "Env1 Release",
    "Env2 Attack", "Env2 Decay", "Env2 Sustain", "Env2 Release",
    "Fil1 Env Amt", "Fil2 Env Amt",
    "Fil1->Amp", "Fil2->Amp",
    "Master Vol", "Glide"
};

class Odin2Synth : public WASMSynthBase {
public:
    Odin2Synth() {
        // Set default parameter values
        std::memset(params_, 0, sizeof(params_));
        // Osc1: Analog saw, full volume
        params_[PARAM_OSC1_TYPE] = OSC_TYPE_ANALOG;
        params_[PARAM_OSC1_VOL] = 0.7f;
        // Osc2/3: off
        params_[PARAM_OSC2_TYPE] = 0;
        params_[PARAM_OSC3_TYPE] = 0;
        // Filter 1: LP24 at 10kHz, moderate resonance
        params_[PARAM_FIL1_TYPE] = FILTER_TYPE_LP24;
        params_[PARAM_FIL1_FREQ] = 10000.0f;
        params_[PARAM_FIL1_RES] = 0.2f;
        params_[PARAM_FIL1_GAIN] = 1.0f;
        params_[PARAM_FIL1_OSC1] = 1.0f;
        params_[PARAM_FIL1_OSC2] = 1.0f;
        params_[PARAM_FIL1_OSC3] = 1.0f;
        // Filter 2: off
        params_[PARAM_FIL2_TYPE] = FILTER_TYPE_NONE;
        params_[PARAM_FIL2_GAIN] = 1.0f;
        // Amp Envelope: fast attack, medium decay, full sustain, medium release
        params_[PARAM_ENV1_ATTACK] = 0.005f;
        params_[PARAM_ENV1_DECAY] = 0.3f;
        params_[PARAM_ENV1_SUSTAIN] = 0.8f;
        params_[PARAM_ENV1_RELEASE] = 0.3f;
        // Filter Envelope
        params_[PARAM_ENV2_ATTACK] = 0.01f;
        params_[PARAM_ENV2_DECAY] = 0.5f;
        params_[PARAM_ENV2_SUSTAIN] = 0.3f;
        params_[PARAM_ENV2_RELEASE] = 0.5f;
        params_[PARAM_FIL1_ENV] = 0.5f;
        // Routing: Filter 1 to amp
        params_[PARAM_FIL1_TO_AMP] = 1.0f;
        // Master volume
        params_[PARAM_MASTER_VOL] = 0.7f;
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);
        float sr = static_cast<float>(sampleRate);

        // Initialize tuning (standard 12-TET)
        tuning_ = ::Tunings::Tuning();

        // Initialize all voices and set up VoiceManager pointers
        for (int v = 0; v < VOICES; v++) {
            voice_[v].setTuningPtr(&tuning_);
            voice_[v].setSampleRate(sr);
            voice_[v].hardReset();
            voiceManager_.m_actual_voice_pointers[v] = &voice_[v];
        }
        voiceManager_.reset();

        // Initialize smoothing values
        for (int i = 0; i < 3; i++) {
            oscVolSmooth_[i] = 0.0f;
            filFreqSmooth_[i] = 0.0f;
            filGainSmooth_[i] = 0.0f;
        }
        masterSmooth_ = 0.0f;
    }

    void noteOn(int midiNote, int velocity) override {
        if (!isInitialized_) return;

        int lastNote = lastMidiNote_;
        auto voices = voiceManager_.getVoices(midiNote, 1);
        for (int vi : voices) {
            voice_[vi].start(midiNote, velocity, lastNote,
                             0.0f,   // unison pan
                             0.0f,   // unison detune
                             1.0f,   // unison gain reduction
                             false,  // unison active
                             0.0f, 0.0f);  // arp mods
            voiceManager_.voice_busy[vi] = true;
        }
        lastMidiNote_ = midiNote;
    }

    void noteOff(int midiNote) override {
        if (!isInitialized_) return;
        for (int v = 0; v < VOICES; v++) {
            if (voice_[v].keyUp(midiNote)) {
                // Voice is now in release
            }
        }
    }

    void allNotesOff() override {
        for (int v = 0; v < VOICES; v++) {
            if (voice_[v]) {
                voice_[v].forceKeyUp();
            }
        }
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_) {
            std::memset(outputL, 0, numSamples * sizeof(float));
            std::memset(outputR, 0, numSamples * sizeof(float));
            return;
        }

        // Cache parameter values
        int oscType[3];
        float oscVol[3];
        float filFreq[3];
        float filGain[3];
        int filType[2];
        bool filOsc[2][3];
        bool fil2Fil1 = params_[PARAM_FIL2_FIL1] > 0.5f;
        bool fil1ToAmp = params_[PARAM_FIL1_TO_AMP] > 0.5f;
        bool fil2ToAmp = params_[PARAM_FIL2_TO_AMP] > 0.5f;
        float masterVol = params_[PARAM_MASTER_VOL];

        for (int i = 0; i < 3; i++) {
            int base = i * 5;
            oscType[i] = (int)params_[base + 0];
            oscVol[i] = params_[base + 1];
        }

        filType[0] = (int)params_[PARAM_FIL1_TYPE];
        filFreq[0] = params_[PARAM_FIL1_FREQ];
        filGain[0] = params_[PARAM_FIL1_GAIN];
        filOsc[0][0] = params_[PARAM_FIL1_OSC1] > 0.5f;
        filOsc[0][1] = params_[PARAM_FIL1_OSC2] > 0.5f;
        filOsc[0][2] = params_[PARAM_FIL1_OSC3] > 0.5f;

        filType[1] = (int)params_[PARAM_FIL2_TYPE];
        filFreq[1] = params_[PARAM_FIL2_FREQ];
        filGain[1] = params_[PARAM_FIL2_GAIN];
        filOsc[1][0] = params_[PARAM_FIL2_OSC1] > 0.5f;
        filOsc[1][1] = params_[PARAM_FIL2_OSC2] > 0.5f;
        filOsc[1][2] = params_[PARAM_FIL2_OSC3] > 0.5f;

        // Update envelope parameters for all active voices
        for (int v = 0; v < VOICES; v++) {
            if (voice_[v]) {
                // Amp envelope (env[0])
                voice_[v].env[0].setAttack(params_[PARAM_ENV1_ATTACK]);
                voice_[v].env[0].setDecay(params_[PARAM_ENV1_DECAY]);
                voice_[v].env[0].setSustain(params_[PARAM_ENV1_SUSTAIN]);
                voice_[v].env[0].setRelease(params_[PARAM_ENV1_RELEASE]);

                // Filter envelope (env[1])
                voice_[v].env[1].setAttack(params_[PARAM_ENV2_ATTACK]);
                voice_[v].env[1].setDecay(params_[PARAM_ENV2_DECAY]);
                voice_[v].env[1].setSustain(params_[PARAM_ENV2_SUSTAIN]);
                voice_[v].env[1].setRelease(params_[PARAM_ENV2_RELEASE]);

                // Filter settings
                for (int fil = 0; fil < 2; fil++) {
                    voice_[v].setFilterRes(params_[fil == 0 ? PARAM_FIL1_RES : PARAM_FIL2_RES], fil);
                    voice_[v].setEnvModAmount(params_[fil == 0 ? PARAM_FIL1_ENV : PARAM_FIL2_ENV], fil);
                }
            }
        }

        // Per-sample processing loop (matching PluginProcessorProcess.cpp structure)
        for (int sample = 0; sample < numSamples; sample++) {
            // Smoothing
            for (int i = 0; i < 3; i++) {
                oscVolSmooth_[i] = oscVolSmooth_[i] * GAIN_SMOOTHIN_FACTOR +
                                   (1.0f - GAIN_SMOOTHIN_FACTOR) * oscVol[i];
                filFreqSmooth_[i] = filFreqSmooth_[i] * FILTER_FREQ_SMOOTHING_FACTOR +
                                    (1.0f - FILTER_FREQ_SMOOTHING_FACTOR) * filFreq[i];
                filGainSmooth_[i] = filGainSmooth_[i] * GAIN_SMOOTHIN_FACTOR +
                                    (1.0f - GAIN_SMOOTHIN_FACTOR) * filGain[i];
            }
            masterSmooth_ = masterSmooth_ * GAIN_SMOOTHIN_FACTOR +
                            (1.0f - GAIN_SMOOTHIN_FACTOR) * masterVol;

            float stereoSignal[2] = {0.0f, 0.0f};

            // Process all active voices
            for (int v = 0; v < VOICES; v++) {
                if (!voice_[v]) continue;

                // Envelopes
                float adsr[3];
                adsr[0] = voice_[v].env[0].doEnvelope();
                adsr[1] = voice_[v].env[1].doEnvelope();
                adsr[2] = voice_[v].env[2].doEnvelope();

                // Set filter envelope value
                voice_[v].setFilterEnvValue(adsr[1]);

                // Oscillators
                float oscOutput[3] = {0.0f, 0.0f, 0.0f};
                for (int osc = 0; osc < 3; osc++) {
                    switch (oscType[osc]) {
                    case OSC_TYPE_ANALOG:
                        voice_[v].analog_osc[osc].update();
                        oscOutput[osc] = voice_[v].analog_osc[osc].doOscillateWithSync();
                        break;
                    case OSC_TYPE_WAVETABLE:
                        voice_[v].wavetable_osc[osc].update();
                        oscOutput[osc] = voice_[v].wavetable_osc[osc].doOscillateWithSync();
                        break;
                    case OSC_TYPE_MULTI:
                        voice_[v].multi_osc[osc].update();
                        oscOutput[osc] = voice_[v].multi_osc[osc].doOscillate();
                        break;
                    case OSC_TYPE_VECTOR:
                        voice_[v].vector_osc[osc].update();
                        oscOutput[osc] = voice_[v].vector_osc[osc].doOscillateWithSync();
                        break;
                    case OSC_TYPE_CHIPTUNE:
                        voice_[v].chiptune_osc[osc].update();
                        oscOutput[osc] = voice_[v].chiptune_osc[osc].doOscillateWithSync();
                        break;
                    case OSC_TYPE_FM:
                        voice_[v].fm_osc[osc].update();
                        oscOutput[osc] = voice_[v].fm_osc[osc].doOscillate();
                        break;
                    case OSC_TYPE_PM:
                        voice_[v].pm_osc[osc].update();
                        oscOutput[osc] = voice_[v].pm_osc[osc].doOscillate();
                        break;
                    case OSC_TYPE_NOISE:
                        oscOutput[osc] = voice_[v].noise_osc[osc].doNoise();
                        break;
                    case OSC_TYPE_WAVEDRAW:
                        voice_[v].wavedraw_osc[osc].update();
                        oscOutput[osc] = voice_[v].wavedraw_osc[osc].doOscillateWithSync();
                        break;
                    case OSC_TYPE_CHIPDRAW:
                        voice_[v].chipdraw_osc[osc].update();
                        oscOutput[osc] = voice_[v].chipdraw_osc[osc].doOscillateWithSync();
                        break;
                    case OSC_TYPE_SPECDRAW:
                        voice_[v].specdraw_osc[osc].update();
                        oscOutput[osc] = voice_[v].specdraw_osc[osc].doOscillateWithSync();
                        break;
                    default:
                        break;
                    }
                    oscOutput[osc] *= oscVolSmooth_[osc];
                }

                // Filters
                float filterOutput[2] = {0.0f, 0.0f};
                for (int fil = 0; fil < 2; fil++) {
                    float filterInput = 0.0f;
                    for (int osc = 0; osc < 3; osc++) {
                        if (filOsc[fil][osc]) {
                            filterInput += oscOutput[osc];
                        }
                    }
                    // Add filter 1 output to filter 2 input
                    if (fil == 1 && fil2Fil1) {
                        filterInput += filterOutput[0];
                    }

                    switch (filType[fil]) {
                    case FILTER_TYPE_NONE:
                    default:
                        filterOutput[fil] = filterInput;
                        break;
                    case FILTER_TYPE_LP24:
                    case FILTER_TYPE_LP12:
                    case FILTER_TYPE_BP24:
                    case FILTER_TYPE_BP12:
                    case FILTER_TYPE_HP24:
                    case FILTER_TYPE_HP12:
                        voice_[v].ladder_filter[fil].m_freq_base = filFreqSmooth_[fil];
                        voice_[v].ladder_filter[fil].update();
                        filterOutput[fil] = voice_[v].ladder_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_SEM12:
                        voice_[v].SEM_filter_12[fil].m_freq_base = filFreqSmooth_[fil];
                        voice_[v].SEM_filter_12[fil].update();
                        filterOutput[fil] = voice_[v].SEM_filter_12[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_KORG_LP:
                    case FILTER_TYPE_KORG_HP:
                        voice_[v].korg_filter[fil].m_freq_base = filFreqSmooth_[fil];
                        voice_[v].korg_filter[fil].update();
                        filterOutput[fil] = voice_[v].korg_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_DIODE:
                        voice_[v].diode_filter[fil].m_freq_base = filFreqSmooth_[fil];
                        voice_[v].diode_filter[fil].update();
                        filterOutput[fil] = voice_[v].diode_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_FORMANT:
                        voice_[v].formant_filter[fil].m_freq_base = filFreqSmooth_[fil];
                        voice_[v].formant_filter[fil].update();
                        filterOutput[fil] = voice_[v].formant_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_COMB:
                        voice_[v].comb_filter[fil].setCombFreq(filFreqSmooth_[fil]);
                        filterOutput[fil] = voice_[v].comb_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_RINGMOD:
                        voice_[v].ring_mod[fil].setBaseFrequency(filFreqSmooth_[fil]);
                        voice_[v].ring_mod[fil].setGlideTargetFrequency(filFreqSmooth_[fil]);
                        voice_[v].ring_mod[fil].update();
                        filterOutput[fil] = voice_[v].ring_mod[fil].doRingModulator(filterInput);
                        break;
                    }
                    filterOutput[fil] *= filGainSmooth_[fil];
                }

                // Mix filter outputs to voice output
                float voiceOutput = 0.0f;
                if (fil1ToAmp) voiceOutput += filterOutput[0];
                if (fil2ToAmp) voiceOutput += filterOutput[1];

                // Amplifier (stereo unison panning)
                float stereoVoice[2];
                voice_[v].amp.doAmplifier(voiceOutput, stereoVoice[0], stereoVoice[1]);

                // Apply amp envelope
                stereoSignal[0] += stereoVoice[0] * adsr[0];
                stereoSignal[1] += stereoVoice[1] * adsr[0];

                // Check if voice finished
                if (voice_[v].env[0].isEnvelopeOff() && voice_[v].isInRelease()) {
                    voice_[v].m_voice_active = false;
                    voiceManager_.freeVoice(v);
                }
            }

            // Master volume
            outputL[sample] = stereoSignal[0] * masterSmooth_;
            outputR[sample] = stereoSignal[1] * masterSmooth_;
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            params_[paramId] = value;

            // Apply immediate changes that need voice updates
            if (paramId >= PARAM_OSC1_OCTAVE && paramId <= PARAM_OSC3_FINE) {
                applyOscPitchChanges();
            }
            if (paramId == PARAM_GLIDE) {
                for (int v = 0; v < VOICES; v++) {
                    voice_[v].setGlide(value);
                }
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
        // Basic MIDI CC handling
        if (cc == 1) {
            // Mod wheel — could route to filter freq etc.
        } else if (cc == 64) {
            // Sustain pedal
            bool sustain = value >= 64;
            voiceManager_.setSustainActive(sustain);
            if (!sustain) {
                // Release sustained notes
                for (int v = 0; v < VOICES; v++) {
                    if (voice_[v] && voiceManager_.isOnKillList(v)) {
                        voice_[v].forceKeyUp();
                        voiceManager_.removeFromKillList(v);
                    }
                }
            }
        }
    }

    void pitchBend(int value) override {
        // 14-bit: 8192 = center, range = ±2 semitones by default
        float bend = ((float)value - 8192.0f) / 8192.0f;
        // Could apply to oscillator pitch via modulation
        (void)bend;
    }

    int getParameterCount() const override { return PARAM_COUNT; }

    const char* getParameterName(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_NAMES[paramId];
        return "";
    }

    float getParameterMin(int /*paramId*/) const override { return 0.0f; }
    float getParameterMax(int /*paramId*/) const override { return 1.0f; }
    float getParameterDefault(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return params_[paramId];
        return 0.0f;
    }

    bool handleCommand(const char* commandType, const uint8_t* data, int length) override {
        (void)commandType; (void)data; (void)length;
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
    void applyOscPitchChanges() {
        for (int v = 0; v < VOICES; v++) {
            for (int osc = 0; osc < 3; osc++) {
                int base = osc * 5;
                int octave = (int)params_[base + 2];
                int semi = (int)params_[base + 3];
                float fine = params_[base + 4];
                voice_[v].setOctave(octave, osc);
                voice_[v].setSemitones(semi, osc);
                voice_[v].setFinetune(fine, osc);
            }
        }
    }

    ::Voice voice_[VOICES];
    ::VoiceManager voiceManager_;
    ::Tunings::Tuning tuning_;

    float params_[PARAM_COUNT];
    int lastMidiNote_ = 60;

    // Smoothing state
    float oscVolSmooth_[3] = {};
    float filFreqSmooth_[3] = {};
    float filGainSmooth_[3] = {};
    float masterSmooth_ = 0.0f;
};

} // namespace devilbox

EXPORT_WASM_SYNTH_EXTENDED_EX(Odin2Synth, devilbox::Odin2Synth, "Odin2Synth")
