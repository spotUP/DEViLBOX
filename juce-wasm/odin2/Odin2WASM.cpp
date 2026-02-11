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

// Parameter IDs for the WASM interface (119 total, Group:Name convention)
enum Odin2Params {
    // --- Master (6) ---
    PARAM_MASTER_VOL = 0,
    PARAM_MASTER_GAIN,
    PARAM_MASTER_PAN,
    PARAM_MASTER_GLIDE,
    PARAM_MASTER_VELOCITY,
    PARAM_MASTER_UNISON_DETUNE,

    // --- Osc1 (11) ---
    PARAM_OSC1_TYPE,
    PARAM_OSC1_VOL,
    PARAM_OSC1_OCTAVE,
    PARAM_OSC1_SEMI,
    PARAM_OSC1_FINE,
    PARAM_OSC1_WAVE,
    PARAM_OSC1_PW,
    PARAM_OSC1_POSITION,
    PARAM_OSC1_FM_AMT,
    PARAM_OSC1_DRIFT,
    PARAM_OSC1_RESET,

    // --- Osc2 (12) ---
    PARAM_OSC2_TYPE,
    PARAM_OSC2_VOL,
    PARAM_OSC2_OCTAVE,
    PARAM_OSC2_SEMI,
    PARAM_OSC2_FINE,
    PARAM_OSC2_WAVE,
    PARAM_OSC2_PW,
    PARAM_OSC2_POSITION,
    PARAM_OSC2_FM_AMT,
    PARAM_OSC2_DRIFT,
    PARAM_OSC2_SYNC,
    PARAM_OSC2_RESET,

    // --- Osc3 (12) ---
    PARAM_OSC3_TYPE,
    PARAM_OSC3_VOL,
    PARAM_OSC3_OCTAVE,
    PARAM_OSC3_SEMI,
    PARAM_OSC3_FINE,
    PARAM_OSC3_WAVE,
    PARAM_OSC3_PW,
    PARAM_OSC3_POSITION,
    PARAM_OSC3_FM_AMT,
    PARAM_OSC3_DRIFT,
    PARAM_OSC3_SYNC,
    PARAM_OSC3_RESET,

    // --- Filter1 (11) ---
    PARAM_FIL1_TYPE,
    PARAM_FIL1_FREQ,
    PARAM_FIL1_RES,
    PARAM_FIL1_GAIN,
    PARAM_FIL1_ENV,
    PARAM_FIL1_SAT,
    PARAM_FIL1_VEL,
    PARAM_FIL1_KBD,
    PARAM_FIL1_OSC1,
    PARAM_FIL1_OSC2,
    PARAM_FIL1_OSC3,

    // --- Filter2 (12) ---
    PARAM_FIL2_TYPE,
    PARAM_FIL2_FREQ,
    PARAM_FIL2_RES,
    PARAM_FIL2_GAIN,
    PARAM_FIL2_ENV,
    PARAM_FIL2_SAT,
    PARAM_FIL2_VEL,
    PARAM_FIL2_KBD,
    PARAM_FIL2_OSC1,
    PARAM_FIL2_OSC2,
    PARAM_FIL2_OSC3,
    PARAM_FIL2_FIL1,

    // --- Routing (2) ---
    PARAM_FIL1_TO_AMP,
    PARAM_FIL2_TO_AMP,

    // --- Env1 (5) ---
    PARAM_ENV1_ATTACK,
    PARAM_ENV1_DECAY,
    PARAM_ENV1_SUSTAIN,
    PARAM_ENV1_RELEASE,
    PARAM_ENV1_LOOP,

    // --- Env2 (5) ---
    PARAM_ENV2_ATTACK,
    PARAM_ENV2_DECAY,
    PARAM_ENV2_SUSTAIN,
    PARAM_ENV2_RELEASE,
    PARAM_ENV2_LOOP,

    // --- Env3 (5) ---
    PARAM_ENV3_ATTACK,
    PARAM_ENV3_DECAY,
    PARAM_ENV3_SUSTAIN,
    PARAM_ENV3_RELEASE,
    PARAM_ENV3_LOOP,

    // --- LFO1 (3) → Filter1 cutoff ---
    PARAM_LFO1_FREQ,
    PARAM_LFO1_WAVE,
    PARAM_LFO1_DEPTH,

    // --- LFO2 (3) → Osc pitch (vibrato) ---
    PARAM_LFO2_FREQ,
    PARAM_LFO2_WAVE,
    PARAM_LFO2_DEPTH,

    // --- LFO3 (3) → Amplitude (tremolo) ---
    PARAM_LFO3_FREQ,
    PARAM_LFO3_WAVE,
    PARAM_LFO3_DEPTH,

    // --- Distortion (3, per-voice) ---
    PARAM_DIST_ON,
    PARAM_DIST_BOOST,
    PARAM_DIST_DRYWET,

    // --- Delay (6) ---
    PARAM_DELAY_ON,
    PARAM_DELAY_TIME,
    PARAM_DELAY_FEEDBACK,
    PARAM_DELAY_HP,
    PARAM_DELAY_DRY,
    PARAM_DELAY_WET,

    // --- Phaser (5) ---
    PARAM_PHASER_ON,
    PARAM_PHASER_RATE,
    PARAM_PHASER_MOD,
    PARAM_PHASER_FEEDBACK,
    PARAM_PHASER_DRYWET,

    // --- Flanger (5) ---
    PARAM_FLANGER_ON,
    PARAM_FLANGER_RATE,
    PARAM_FLANGER_AMOUNT,
    PARAM_FLANGER_FEEDBACK,
    PARAM_FLANGER_DRYWET,

    // --- Chorus (5) ---
    PARAM_CHORUS_ON,
    PARAM_CHORUS_RATE,
    PARAM_CHORUS_AMOUNT,
    PARAM_CHORUS_FEEDBACK,
    PARAM_CHORUS_DRYWET,

    // --- Reverb (5) ---
    PARAM_REVERB_ON,
    PARAM_REVERB_HALL,
    PARAM_REVERB_DAMPING,
    PARAM_REVERB_PREDELAY,
    PARAM_REVERB_DRYWET,

    PARAM_COUNT  // 119
};

static const char* PARAM_NAMES[PARAM_COUNT] = {
    // Master
    "Master:Volume", "Master:Gain", "Master:Pan", "Master:Glide",
    "Master:Velocity", "Master:Unison Detune",
    // Osc1
    "Osc1:Type", "Osc1:Vol", "Osc1:Octave", "Osc1:Semi", "Osc1:Fine",
    "Osc1:Wave", "Osc1:Pulse Width", "Osc1:Position", "Osc1:FM Amt",
    "Osc1:Drift", "Osc1:Reset",
    // Osc2
    "Osc2:Type", "Osc2:Vol", "Osc2:Octave", "Osc2:Semi", "Osc2:Fine",
    "Osc2:Wave", "Osc2:Pulse Width", "Osc2:Position", "Osc2:FM Amt",
    "Osc2:Drift", "Osc2:Sync", "Osc2:Reset",
    // Osc3
    "Osc3:Type", "Osc3:Vol", "Osc3:Octave", "Osc3:Semi", "Osc3:Fine",
    "Osc3:Wave", "Osc3:Pulse Width", "Osc3:Position", "Osc3:FM Amt",
    "Osc3:Drift", "Osc3:Sync", "Osc3:Reset",
    // Filter1
    "Filter1:Type", "Filter1:Frequency", "Filter1:Resonance", "Filter1:Gain",
    "Filter1:Env Amt", "Filter1:Saturation", "Filter1:Velocity",
    "Filter1:Keyboard", "Filter1:Osc1", "Filter1:Osc2", "Filter1:Osc3",
    // Filter2
    "Filter2:Type", "Filter2:Frequency", "Filter2:Resonance", "Filter2:Gain",
    "Filter2:Env Amt", "Filter2:Saturation", "Filter2:Velocity",
    "Filter2:Keyboard", "Filter2:Osc1", "Filter2:Osc2", "Filter2:Osc3",
    "Filter2:Filter1",
    // Routing
    "Routing:F1 to Amp", "Routing:F2 to Amp",
    // Env1
    "Env1:Attack", "Env1:Decay", "Env1:Sustain", "Env1:Release", "Env1:Loop",
    // Env2
    "Env2:Attack", "Env2:Decay", "Env2:Sustain", "Env2:Release", "Env2:Loop",
    // Env3
    "Env3:Attack", "Env3:Decay", "Env3:Sustain", "Env3:Release", "Env3:Loop",
    // LFO1
    "LFO1:Freq", "LFO1:Wave", "LFO1:Depth",
    // LFO2
    "LFO2:Freq", "LFO2:Wave", "LFO2:Depth",
    // LFO3
    "LFO3:Freq", "LFO3:Wave", "LFO3:Depth",
    // Distortion
    "Distortion:On", "Distortion:Boost", "Distortion:Dry/Wet",
    // Delay
    "Delay:On", "Delay:Time", "Delay:Feedback", "Delay:HP",
    "Delay:Dry", "Delay:Wet",
    // Phaser
    "Phaser:On", "Phaser:Rate", "Phaser:Mod", "Phaser:Feedback", "Phaser:Dry/Wet",
    // Flanger
    "Flanger:On", "Flanger:Rate", "Flanger:Amount", "Flanger:Feedback", "Flanger:Dry/Wet",
    // Chorus
    "Chorus:On", "Chorus:Rate", "Chorus:Amount", "Chorus:Feedback", "Chorus:Dry/Wet",
    // Reverb
    "Reverb:On", "Reverb:Hall", "Reverb:Damping", "Reverb:Pre-Delay", "Reverb:Dry/Wet",
};

static const float PARAM_DEFAULTS[PARAM_COUNT] = {
    // Master: Vol, Gain, Pan, Glide, Velocity, Unison Detune
    0.7f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f,
    // Osc1: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Reset
    (float)OSC_TYPE_ANALOG, 0.7f, 0, 0, 0, 0, 0.5f, 0, 0, 0, 0,
    // Osc2: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Sync, Reset
    0, 0.7f, 0, 0, 0, 0, 0.5f, 0, 0, 0, 0, 0,
    // Osc3: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Sync, Reset
    0, 0.7f, 0, 0, 0, 0, 0.5f, 0, 0, 0, 0, 0,
    // Filter1: Type, Freq, Res, Gain, Env, Sat, Vel, Kbd, Osc1, Osc2, Osc3
    (float)FILTER_TYPE_LP24, 10000.0f, 0.2f, 1.0f, 0.5f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f,
    // Filter2: Type, Freq, Res, Gain, Env, Sat, Vel, Kbd, Osc1, Osc2, Osc3, Fil1
    (float)FILTER_TYPE_NONE, 10000.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f,
    // Routing: F1→Amp, F2→Amp
    1.0f, 0.0f,
    // Env1: A, D, S, R, Loop
    0.005f, 0.3f, 0.8f, 0.3f, 0.0f,
    // Env2: A, D, S, R, Loop
    0.01f, 0.5f, 0.3f, 0.5f, 0.0f,
    // Env3: A, D, S, R, Loop
    0.01f, 0.3f, 0.5f, 0.3f, 0.0f,
    // LFO1: Freq, Wave, Depth
    2.0f, 0.0f, 0.0f,
    // LFO2: Freq, Wave, Depth
    5.0f, 0.0f, 0.0f,
    // LFO3: Freq, Wave, Depth
    4.0f, 0.0f, 0.0f,
    // Distortion: On, Boost, DryWet
    0.0f, 0.5f, 1.0f,
    // Delay: On, Time, Feedback, HP, Dry, Wet
    0.0f, 0.3f, 0.4f, 80.0f, 1.0f, 0.3f,
    // Phaser: On, Rate, Mod, Feedback, DryWet
    0.0f, 0.5f, 0.5f, 0.3f, 0.5f,
    // Flanger: On, Rate, Amount, Feedback, DryWet
    0.0f, 0.3f, 0.5f, 0.3f, 0.5f,
    // Chorus: On, Rate, Amount, Feedback, DryWet
    0.0f, 0.3f, 0.5f, 0.0f, 0.5f,
    // Reverb: On, Hall, Damping, PreDelay, DryWet
    0.0f, 2.0f, 6000.0f, 0.04f, 0.3f,
};

static const float PARAM_MINS[PARAM_COUNT] = {
    // Master: Vol, Gain, Pan, Glide, Velocity, Unison Detune
    0, -24, -1, 0, 0, 0,
    // Osc1: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Reset
    0, 0, -4, -12, -100, 0, 0.02f, 0, 0, 0, 0,
    // Osc2: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Sync, Reset
    0, 0, -4, -12, -100, 0, 0.02f, 0, 0, 0, 0, 0,
    // Osc3: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Sync, Reset
    0, 0, -4, -12, -100, 0, 0.02f, 0, 0, 0, 0, 0,
    // Filter1: Type, Freq, Res, Gain, Env, Sat, Vel, Kbd, Osc1..3
    0, 20, 0, 0, -1, 0, 0, 0, 0, 0, 0,
    // Filter2: Type, Freq, Res, Gain, Env, Sat, Vel, Kbd, Osc1..3, Fil1
    0, 20, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0,
    // Routing
    0, 0,
    // Env1-3: A, D, S, R, Loop (×3)
    0.001f, 0.001f, 0, 0.001f, 0,
    0.001f, 0.001f, 0, 0.001f, 0,
    0.001f, 0.001f, 0, 0.001f, 0,
    // LFO1-3: Freq, Wave, Depth (×3)
    0.01f, 0, 0,  0.01f, 0, 0,  0.01f, 0, 0,
    // Distortion: On, Boost, DryWet
    0, 0, 0,
    // Delay: On, Time, Feedback, HP, Dry, Wet
    0, 0.01f, 0, 20, 0, 0,
    // Phaser: On, Rate, Mod, Feedback, DryWet
    0, 0.01f, 0, 0, 0,
    // Flanger: On, Rate, Amount, Feedback, DryWet
    0, 0.01f, 0, -0.98f, 0,
    // Chorus: On, Rate, Amount, Feedback, DryWet
    0, 0.01f, 0, -0.98f, 0,
    // Reverb: On, Hall, Damping, PreDelay, DryWet
    0, 0.2f, 500, 0.001f, 0,
};

static const float PARAM_MAXS[PARAM_COUNT] = {
    // Master: Vol, Gain, Pan, Glide, Velocity, Unison Detune
    1, 12, 1, 1, 1, 1,
    // Osc1: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Reset
    22, 1, 4, 12, 100, 15, 0.98f, 1, 1, 1, 1,
    // Osc2: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Sync, Reset
    22, 1, 4, 12, 100, 15, 0.98f, 1, 1, 1, 1, 1,
    // Osc3: Type, Vol, Oct, Semi, Fine, Wave, PW, Pos, FM, Drift, Sync, Reset
    22, 1, 4, 12, 100, 15, 0.98f, 1, 1, 1, 1, 1,
    // Filter1: Type, Freq, Res, Gain, Env, Sat, Vel, Kbd, Osc1..3
    40, 20000, 1, 2, 1, 1, 1, 1, 1, 1, 1,
    // Filter2: Type, Freq, Res, Gain, Env, Sat, Vel, Kbd, Osc1..3, Fil1
    40, 20000, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1,
    // Routing
    1, 1,
    // Env1-3: A, D, S, R, Loop (×3)
    5, 5, 1, 5, 1,
    5, 5, 1, 5, 1,
    5, 5, 1, 5, 1,
    // LFO1-3: Freq, Wave, Depth (×3)
    20, 15, 1,  20, 15, 1,  20, 15, 1,
    // Distortion: On, Boost, DryWet
    1, 1, 1,
    // Delay: On, Time, Feedback, HP, Dry, Wet
    1, 2, 1, 2000, 1, 1,
    // Phaser: On, Rate, Mod, Feedback, DryWet
    1, 10, 1.5f, 0.97f, 1,
    // Flanger: On, Rate, Amount, Feedback, DryWet
    1, 10, 1, 0.98f, 1,
    // Chorus: On, Rate, Amount, Feedback, DryWet
    1, 10, 1, 0.98f, 1,
    // Reverb: On, Hall, Damping, PreDelay, DryWet
    1, 10, 20000, 0.5f, 1,
};

class Odin2Synth : public WASMSynthBase {
public:
    Odin2Synth() {
        for (int i = 0; i < PARAM_COUNT; i++) params_[i] = PARAM_DEFAULTS[i];
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

            // Set ALL mod pointers on per-voice objects to fxModZero_
            // Distortion mod pointers
            for (int d = 0; d < 2; d++) {
                voice_[v].distortion[d].setThresholdModPointer(&fxModZero_);
                voice_[v].distortion[d].setDryWetModPointer(&fxModZero_);
            }
            // Amp mod pointers
            voice_[v].amp.setGainModPointer(&fxModZero_);
            voice_[v].amp.setPanModPointer(&fxModZero_);
            voice_[v].amp.setVelModPointer(&fxModZero_);
            // Filter mod pointers (all filter types share base class pointers)
            for (int fil = 0; fil < 2; fil++) {
                voice_[v].ladder_filter[fil].setFreqModPointer(&fxModZero_);
                voice_[v].ladder_filter[fil].setResModPointer(&fxModZero_);
                voice_[v].ladder_filter[fil].setVelModPointer(&fxModZero_);
                voice_[v].ladder_filter[fil].setKbdModPointer(&fxModZero_);
                voice_[v].ladder_filter[fil].setSaturationModPointer(&fxModZero_);
                voice_[v].ladder_filter[fil].setEnvModPointer(&fxModZero_);

                voice_[v].SEM_filter_12[fil].setFreqModPointer(&fxModZero_);
                voice_[v].SEM_filter_12[fil].setResModPointer(&fxModZero_);
                voice_[v].SEM_filter_12[fil].setVelModPointer(&fxModZero_);
                voice_[v].SEM_filter_12[fil].setKbdModPointer(&fxModZero_);
                voice_[v].SEM_filter_12[fil].setSaturationModPointer(&fxModZero_);
                voice_[v].SEM_filter_12[fil].setEnvModPointer(&fxModZero_);

                voice_[v].korg_filter[fil].setFreqModPointer(&fxModZero_);
                voice_[v].korg_filter[fil].setResModPointer(&fxModZero_);
                voice_[v].korg_filter[fil].setVelModPointer(&fxModZero_);
                voice_[v].korg_filter[fil].setKbdModPointer(&fxModZero_);
                voice_[v].korg_filter[fil].setSaturationModPointer(&fxModZero_);
                voice_[v].korg_filter[fil].setEnvModPointer(&fxModZero_);

                voice_[v].diode_filter[fil].setFreqModPointer(&fxModZero_);
                voice_[v].diode_filter[fil].setResModPointer(&fxModZero_);
                voice_[v].diode_filter[fil].setVelModPointer(&fxModZero_);
                voice_[v].diode_filter[fil].setKbdModPointer(&fxModZero_);
                voice_[v].diode_filter[fil].setSaturationModPointer(&fxModZero_);
                voice_[v].diode_filter[fil].setEnvModPointer(&fxModZero_);

                voice_[v].formant_filter[fil].setFreqModPointer(&fxModZero_);
                voice_[v].formant_filter[fil].setResModPointer(&fxModZero_);
                voice_[v].formant_filter[fil].setVelModPointer(&fxModZero_);
                voice_[v].formant_filter[fil].setKbdModPointer(&fxModZero_);
                voice_[v].formant_filter[fil].setSaturationModPointer(&fxModZero_);
                voice_[v].formant_filter[fil].setEnvModPointer(&fxModZero_);
            }
            // Oscillator mod pointers
            for (int osc = 0; osc < 3; osc++) {
                voice_[v].analog_osc[osc].setPWMModPointer(&fxModZero_);
                voice_[v].analog_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].analog_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].wavetable_osc[osc].setPosModPointer(&fxModZero_);
                voice_[v].wavetable_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].wavetable_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].multi_osc[osc].setPosModPointer(&fxModZero_);
                voice_[v].multi_osc[osc].setDetuneModPointer(&fxModZero_);
                voice_[v].multi_osc[osc].setSpreadModPointer(&fxModZero_);
                voice_[v].multi_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].multi_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].vector_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].vector_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].chiptune_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].chiptune_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].fm_osc[osc].setFMModPointer(&fxModZero_);
                voice_[v].fm_osc[osc].setCarrierRatioModPointer(&fxModZero_);
                voice_[v].fm_osc[osc].setModulatorRatioModPointer(&fxModZero_);
                voice_[v].fm_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].fm_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].pm_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].pm_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].wavedraw_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].wavedraw_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].chipdraw_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].chipdraw_osc[osc].setPitchModLinPointer(&fxModZero_);
                voice_[v].specdraw_osc[osc].setPitchModExpPointer(&fxModZero_);
                voice_[v].specdraw_osc[osc].setPitchModLinPointer(&fxModZero_);
            }
            // Envelope mod pointers
            for (int e = 0; e < 3; e++) {
                voice_[v].env[e].setAttackModPointer(&fxModZero_);
                voice_[v].env[e].setDecayModPointer(&fxModZero_);
                voice_[v].env[e].setSustainModPointer(&fxModZero_);
                voice_[v].env[e].setReleaseModPointer(&fxModZero_);
            }
        }
        voiceManager_.reset();

        // Initialize FX
        delay_.setSampleRate(sr);
        delay_.setTimeModPointer(&fxModZero_);
        delay_.setFeedbackModPointer(&fxModZero_);
        delay_.setDryModPointer(&fxModZero_);
        delay_.setWetModPointer(&fxModZero_);
        delay_.setHPFreqModPointer(&fxModZero_);
        delay_.reset();

        chorus_.setSampleRate(sr);
        chorus_.setFreqModPointer(&fxModZero_);
        chorus_.setAmountModPointer(&fxModZero_);
        chorus_.setDryWetModPointer(&fxModZero_);
        chorus_.setFeedbackModPointer(&fxModZero_);
        chorus_.reset();

        flanger_.setSampleRate(sr);
        flanger_.setFreqModPointer(&fxModZero_);
        flanger_.setAmountModPointer(&fxModZero_);
        flanger_.setDryWetModPointer(&fxModZero_);
        flanger_.setFeedbackModPointer(&fxModZero_);
        flanger_.reset();

        phaser_.setSampleRate(sr);
        phaser_.setRateModPointer(&fxModZero_);
        phaser_.setAmountModPointer(&fxModZero_);
        phaser_.setDryWetModPointer(&fxModZero_);
        phaser_.setFreqModPointer(&fxModZero_);
        phaser_.setFeedbackModPointer(&fxModZero_);
        phaser_.reset();

        reverb_.setSampleRate(sr);
        reverb_.set_rtmid(2.0f);
        reverb_.set_fdamp(6000.0f);
        reverb_.set_delay(0.04f);
        reverb_.set_opmix(0.3f);
        reverb_.set_xover(200.0f);
        reverb_.prepare();
        reverb_.reset();

        // Apply all defaults to FX and voices
        for (int i = 0; i < PARAM_COUNT; i++) {
            applyParam(i, params_[i]);
        }

        // Initialize smoothing values
        for (int i = 0; i < 3; i++) {
            oscVolSmooth_[i] = 0.0f;
            filFreqSmooth_[i] = 0.0f;
            filGainSmooth_[i] = 0.0f;
        }
        masterSmooth_ = 0.0f;
        std::memset(lfoPhase_, 0, sizeof(lfoPhase_));
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
        int oscType[3] = {
            (int)params_[PARAM_OSC1_TYPE],
            (int)params_[PARAM_OSC2_TYPE],
            (int)params_[PARAM_OSC3_TYPE]
        };
        float oscVol[3] = {
            params_[PARAM_OSC1_VOL],
            params_[PARAM_OSC2_VOL],
            params_[PARAM_OSC3_VOL]
        };

        int filType[2] = { (int)params_[PARAM_FIL1_TYPE], (int)params_[PARAM_FIL2_TYPE] };
        float filFreq[2] = { params_[PARAM_FIL1_FREQ], params_[PARAM_FIL2_FREQ] };
        float filGain[2] = { params_[PARAM_FIL1_GAIN], params_[PARAM_FIL2_GAIN] };
        bool filOsc[2][3] = {
            { params_[PARAM_FIL1_OSC1] > 0.5f, params_[PARAM_FIL1_OSC2] > 0.5f, params_[PARAM_FIL1_OSC3] > 0.5f },
            { params_[PARAM_FIL2_OSC1] > 0.5f, params_[PARAM_FIL2_OSC2] > 0.5f, params_[PARAM_FIL2_OSC3] > 0.5f }
        };
        bool fil2Fil1 = params_[PARAM_FIL2_FIL1] > 0.5f;
        bool fil1ToAmp = params_[PARAM_FIL1_TO_AMP] > 0.5f;
        bool fil2ToAmp = params_[PARAM_FIL2_TO_AMP] > 0.5f;
        float masterVol = params_[PARAM_MASTER_VOL];

        // LFO cached params
        float lfoFreq[3] = { params_[PARAM_LFO1_FREQ], params_[PARAM_LFO2_FREQ], params_[PARAM_LFO3_FREQ] };
        float lfoDepth[3] = { params_[PARAM_LFO1_DEPTH], params_[PARAM_LFO2_DEPTH], params_[PARAM_LFO3_DEPTH] };

        // Distortion cached
        bool distOn = params_[PARAM_DIST_ON] > 0.5f;

        // FX on/off
        bool delayOn = params_[PARAM_DELAY_ON] > 0.5f;
        bool phaserOn = params_[PARAM_PHASER_ON] > 0.5f;
        bool flangerOn = params_[PARAM_FLANGER_ON] > 0.5f;
        bool chorusOn = params_[PARAM_CHORUS_ON] > 0.5f;
        bool reverbOn = params_[PARAM_REVERB_ON] > 0.5f;

        float sr = static_cast<float>(sampleRate_);

        // Update envelope parameters for all active voices
        for (int v = 0; v < VOICES; v++) {
            if (voice_[v]) {
                voice_[v].env[0].setAttack(params_[PARAM_ENV1_ATTACK]);
                voice_[v].env[0].setDecay(params_[PARAM_ENV1_DECAY]);
                voice_[v].env[0].setSustain(params_[PARAM_ENV1_SUSTAIN]);
                voice_[v].env[0].setRelease(params_[PARAM_ENV1_RELEASE]);
                voice_[v].env[0].setLoop(params_[PARAM_ENV1_LOOP] > 0.5f);

                voice_[v].env[1].setAttack(params_[PARAM_ENV2_ATTACK]);
                voice_[v].env[1].setDecay(params_[PARAM_ENV2_DECAY]);
                voice_[v].env[1].setSustain(params_[PARAM_ENV2_SUSTAIN]);
                voice_[v].env[1].setRelease(params_[PARAM_ENV2_RELEASE]);
                voice_[v].env[1].setLoop(params_[PARAM_ENV2_LOOP] > 0.5f);

                voice_[v].env[2].setAttack(params_[PARAM_ENV3_ATTACK]);
                voice_[v].env[2].setDecay(params_[PARAM_ENV3_DECAY]);
                voice_[v].env[2].setSustain(params_[PARAM_ENV3_SUSTAIN]);
                voice_[v].env[2].setRelease(params_[PARAM_ENV3_RELEASE]);
                voice_[v].env[2].setLoop(params_[PARAM_ENV3_LOOP] > 0.5f);

                for (int fil = 0; fil < 2; fil++) {
                    voice_[v].setFilterRes(params_[fil == 0 ? PARAM_FIL1_RES : PARAM_FIL2_RES], fil);
                    voice_[v].setEnvModAmount(params_[fil == 0 ? PARAM_FIL1_ENV : PARAM_FIL2_ENV], fil);
                    voice_[v].setSaturation(params_[fil == 0 ? PARAM_FIL1_SAT : PARAM_FIL2_SAT], fil);
                    voice_[v].setVelModAmount(params_[fil == 0 ? PARAM_FIL1_VEL : PARAM_FIL2_VEL], fil);
                    voice_[v].setKbd(params_[fil == 0 ? PARAM_FIL1_KBD : PARAM_FIL2_KBD], fil);
                }
            }
        }

        // Per-sample processing loop
        for (int sample = 0; sample < numSamples; sample++) {
            // Smoothing
            for (int i = 0; i < 3; i++) {
                oscVolSmooth_[i] = oscVolSmooth_[i] * GAIN_SMOOTHIN_FACTOR +
                                   (1.0f - GAIN_SMOOTHIN_FACTOR) * oscVol[i];
            }
            for (int i = 0; i < 2; i++) {
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

                // --- LFOs (simple sine phase accumulators) ---
                float lfoVal[3];
                for (int l = 0; l < 3; l++) {
                    lfoPhase_[v][l] += lfoFreq[l] / sr;
                    if (lfoPhase_[v][l] >= 1.0f) lfoPhase_[v][l] -= 1.0f;
                    lfoVal[l] = sinf(lfoPhase_[v][l] * 6.283185307f);
                }

                // LFO1 → Filter1 cutoff modulation
                float fil1FreqMod = filFreqSmooth_[0];
                if (lfoDepth[0] > 0.001f) {
                    fil1FreqMod *= (1.0f + lfoVal[0] * lfoDepth[0] * 2.0f);
                    if (fil1FreqMod < 20.0f) fil1FreqMod = 20.0f;
                    if (fil1FreqMod > 20000.0f) fil1FreqMod = 20000.0f;
                }

                // Envelopes
                float adsr[3];
                adsr[0] = voice_[v].env[0].doEnvelope();
                adsr[1] = voice_[v].env[1].doEnvelope();
                adsr[2] = voice_[v].env[2].doEnvelope();

                voice_[v].setFilterEnvValue(adsr[1]);

                // Oscillators
                float oscOutput[3] = {0.0f, 0.0f, 0.0f};
                for (int osc = 0; osc < 3; osc++) {
                    // LFO2 → pitch vibrato (apply as frequency mod before oscillation)
                    // Handled via m_mod_freq_exp which is already connected via pointer
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
                    if (fil == 1 && fil2Fil1) {
                        filterInput += filterOutput[0];
                    }

                    // Use LFO-modulated freq for filter 1, normal for filter 2
                    float freq = (fil == 0) ? fil1FreqMod : filFreqSmooth_[1];

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
                        voice_[v].ladder_filter[fil].m_freq_base = freq;
                        voice_[v].ladder_filter[fil].update();
                        filterOutput[fil] = voice_[v].ladder_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_SEM12:
                        voice_[v].SEM_filter_12[fil].m_freq_base = freq;
                        voice_[v].SEM_filter_12[fil].update();
                        filterOutput[fil] = voice_[v].SEM_filter_12[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_KORG_LP:
                    case FILTER_TYPE_KORG_HP:
                        voice_[v].korg_filter[fil].m_freq_base = freq;
                        voice_[v].korg_filter[fil].update();
                        filterOutput[fil] = voice_[v].korg_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_DIODE:
                        voice_[v].diode_filter[fil].m_freq_base = freq;
                        voice_[v].diode_filter[fil].update();
                        filterOutput[fil] = voice_[v].diode_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_FORMANT:
                        voice_[v].formant_filter[fil].m_freq_base = freq;
                        voice_[v].formant_filter[fil].update();
                        filterOutput[fil] = voice_[v].formant_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_COMB:
                        voice_[v].comb_filter[fil].setCombFreq(freq);
                        filterOutput[fil] = voice_[v].comb_filter[fil].doFilter(filterInput);
                        break;
                    case FILTER_TYPE_RINGMOD:
                        voice_[v].ring_mod[fil].setBaseFrequency(freq);
                        voice_[v].ring_mod[fil].setGlideTargetFrequency(freq);
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

                // Per-voice distortion (after filter, before amp)
                if (distOn) {
                    voiceOutput = (float)voice_[v].distortion[0].doDistortion((double)voiceOutput);
                }

                // LFO3 → amplitude (tremolo)
                if (lfoDepth[2] > 0.001f) {
                    voiceOutput *= (1.0f - lfoDepth[2] * 0.5f * (1.0f - lfoVal[2]));
                }

                // Amplifier (stereo panning)
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

            // --- Post-voice FX chain ---
            float fxL = stereoSignal[0] * masterSmooth_;
            float fxR = stereoSignal[1] * masterSmooth_;

            if (delayOn)   { fxL = delay_.doDelayLeft(fxL);  fxR = delay_.doDelayRight(fxR); }
            if (chorusOn)  { fxL = chorus_.doChorus(fxL);     fxR = chorus_.doChorus(fxR); }
            if (flangerOn) { fxL = flanger_.doFlanger(fxL);   fxR = flanger_.doFlanger(fxR); }
            if (phaserOn)  { fxL = phaser_.doPhaserLeft(fxL); fxR = phaser_.doPhaserRight(fxR); }
            if (reverbOn)  { float rv[2] = {fxL, fxR}; reverb_.process(rv); fxL = rv[0]; fxR = rv[1]; }

            outputL[sample] = fxL;
            outputR[sample] = fxR;
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId >= 0 && paramId < PARAM_COUNT) {
            params_[paramId] = value;
            applyParam(paramId, value);
        }
    }

    float getParameter(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return params_[paramId];
        return 0.0f;
    }

    void controlChange(int cc, int value) override {
        if (cc == 1) {
            // Mod wheel — could modulate filter freq, LFO depth, etc.
        } else if (cc == 64) {
            bool sustain = value >= 64;
            voiceManager_.setSustainActive(sustain);
            if (!sustain) {
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
        float bend = ((float)value - 8192.0f) / 8192.0f;
        (void)bend;
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
    // Helper: get osc param offsets per osc index
    static constexpr int oscTypeParam(int osc) {
        return (osc == 0) ? PARAM_OSC1_TYPE : (osc == 1) ? PARAM_OSC2_TYPE : PARAM_OSC3_TYPE;
    }
    static constexpr int oscOctParam(int osc) {
        return (osc == 0) ? PARAM_OSC1_OCTAVE : (osc == 1) ? PARAM_OSC2_OCTAVE : PARAM_OSC3_OCTAVE;
    }
    static constexpr int oscSemiParam(int osc) {
        return (osc == 0) ? PARAM_OSC1_SEMI : (osc == 1) ? PARAM_OSC2_SEMI : PARAM_OSC3_SEMI;
    }
    static constexpr int oscFineParam(int osc) {
        return (osc == 0) ? PARAM_OSC1_FINE : (osc == 1) ? PARAM_OSC2_FINE : PARAM_OSC3_FINE;
    }

    void applyOscPitchChanges() {
        for (int v = 0; v < VOICES; v++) {
            for (int osc = 0; osc < 3; osc++) {
                voice_[v].setOctave((int)params_[oscOctParam(osc)], osc);
                voice_[v].setSemitones((int)params_[oscSemiParam(osc)], osc);
                voice_[v].setFinetune(params_[oscFineParam(osc)], osc);
            }
        }
    }

    void applyParam(int paramId, float value) {
        switch (paramId) {
        // --- Master ---
        case PARAM_MASTER_GLIDE:
            for (int v = 0; v < VOICES; v++) voice_[v].setGlide(value);
            break;
        case PARAM_MASTER_GAIN:
            for (int v = 0; v < VOICES; v++) voice_[v].amp.setGainDecibels(value);
            break;
        case PARAM_MASTER_PAN:
            for (int v = 0; v < VOICES; v++) voice_[v].amp.setPan(value);
            break;
        case PARAM_MASTER_VELOCITY:
            for (int v = 0; v < VOICES; v++) voice_[v].amp.setVelocityAmount(value);
            break;
        case PARAM_MASTER_UNISON_DETUNE:
            for (int v = 0; v < VOICES; v++) voice_[v].setUnisonDetuneAmount(value);
            break;

        // --- Osc pitch params ---
        case PARAM_OSC1_OCTAVE: case PARAM_OSC1_SEMI: case PARAM_OSC1_FINE:
        case PARAM_OSC2_OCTAVE: case PARAM_OSC2_SEMI: case PARAM_OSC2_FINE:
        case PARAM_OSC3_OCTAVE: case PARAM_OSC3_SEMI: case PARAM_OSC3_FINE:
            applyOscPitchChanges();
            break;

        // --- Osc1 params ---
        case PARAM_OSC1_PW:
            for (int v = 0; v < VOICES; v++) voice_[v].analog_osc[0].setPWMDuty(value);
            break;
        case PARAM_OSC1_DRIFT:
            for (int v = 0; v < VOICES; v++) voice_[v].analog_osc[0].setDrift(value);
            break;
        case PARAM_OSC1_POSITION:
            for (int v = 0; v < VOICES; v++) {
                voice_[v].wavetable_osc[0].setPosition(value);
                voice_[v].multi_osc[0].setPosition(value);
            }
            break;
        case PARAM_OSC1_FM_AMT:
            for (int v = 0; v < VOICES; v++) voice_[v].fm_osc[0].setFMAmount(value);
            break;
        case PARAM_OSC1_RESET:
            for (int v = 0; v < VOICES; v++) voice_[v].setReset(value > 0.5f, 0);
            break;

        // --- Osc2 params ---
        case PARAM_OSC2_PW:
            for (int v = 0; v < VOICES; v++) voice_[v].analog_osc[1].setPWMDuty(value);
            break;
        case PARAM_OSC2_DRIFT:
            for (int v = 0; v < VOICES; v++) voice_[v].analog_osc[1].setDrift(value);
            break;
        case PARAM_OSC2_POSITION:
            for (int v = 0; v < VOICES; v++) {
                voice_[v].wavetable_osc[1].setPosition(value);
                voice_[v].multi_osc[1].setPosition(value);
            }
            break;
        case PARAM_OSC2_FM_AMT:
            for (int v = 0; v < VOICES; v++) voice_[v].fm_osc[1].setFMAmount(value);
            break;
        case PARAM_OSC2_SYNC:
            for (int v = 0; v < VOICES; v++) voice_[v].setOscSyncEnabled(value > 0.5f, 1);
            break;
        case PARAM_OSC2_RESET:
            for (int v = 0; v < VOICES; v++) voice_[v].setReset(value > 0.5f, 1);
            break;

        // --- Osc3 params ---
        case PARAM_OSC3_PW:
            for (int v = 0; v < VOICES; v++) voice_[v].analog_osc[2].setPWMDuty(value);
            break;
        case PARAM_OSC3_DRIFT:
            for (int v = 0; v < VOICES; v++) voice_[v].analog_osc[2].setDrift(value);
            break;
        case PARAM_OSC3_POSITION:
            for (int v = 0; v < VOICES; v++) {
                voice_[v].wavetable_osc[2].setPosition(value);
                voice_[v].multi_osc[2].setPosition(value);
            }
            break;
        case PARAM_OSC3_FM_AMT:
            for (int v = 0; v < VOICES; v++) voice_[v].fm_osc[2].setFMAmount(value);
            break;
        case PARAM_OSC3_SYNC:
            for (int v = 0; v < VOICES; v++) voice_[v].setOscSyncEnabled(value > 0.5f, 2);
            break;
        case PARAM_OSC3_RESET:
            for (int v = 0; v < VOICES; v++) voice_[v].setReset(value > 0.5f, 2);
            break;

        // --- Distortion ---
        case PARAM_DIST_BOOST:
            // Threshold is inverted: 0=max distortion, 1=clean. Boost maps 0→1 to 1→0.
            for (int v = 0; v < VOICES; v++) voice_[v].distortion[0].setThreshold(1.0f - value);
            break;
        case PARAM_DIST_DRYWET:
            for (int v = 0; v < VOICES; v++) voice_[v].distortion[0].setDryWet(value);
            break;

        // --- Delay ---
        case PARAM_DELAY_TIME:     delay_.setDelayTime(value); break;
        case PARAM_DELAY_FEEDBACK: delay_.setFeedback(value);  break;
        case PARAM_DELAY_HP:       delay_.setHPFreq(value);    break;
        case PARAM_DELAY_DRY:      delay_.setDry(value);       break;
        case PARAM_DELAY_WET:      delay_.setWet(value);       break;

        // --- Phaser ---
        case PARAM_PHASER_RATE:     phaser_.setLFOFreq(value);      break;
        case PARAM_PHASER_MOD:      phaser_.setLFOAmplitude(value);  break;
        case PARAM_PHASER_FEEDBACK: phaser_.setFeedback(value);      break;
        case PARAM_PHASER_DRYWET:   phaser_.setDryWet(value);        break;

        // --- Flanger ---
        case PARAM_FLANGER_RATE:     flanger_.setLFOFreq(value);   break;
        case PARAM_FLANGER_AMOUNT:   flanger_.setLFOAmount(value); break;
        case PARAM_FLANGER_FEEDBACK: flanger_.setFeedback(value);  break;
        case PARAM_FLANGER_DRYWET:   flanger_.setDryWet(value);    break;

        // --- Chorus ---
        case PARAM_CHORUS_RATE:     chorus_.setLFOFreq(value);  break;
        case PARAM_CHORUS_AMOUNT:   chorus_.setAmount(value);   break;
        case PARAM_CHORUS_FEEDBACK: chorus_.setFeedback(value); break;
        case PARAM_CHORUS_DRYWET:   chorus_.setDryWet(value);   break;

        // --- Reverb ---
        case PARAM_REVERB_HALL:     reverb_.set_rtmid(value); reverb_.prepare(); break;
        case PARAM_REVERB_DAMPING:  reverb_.set_fdamp(value); reverb_.prepare(); break;
        case PARAM_REVERB_PREDELAY: reverb_.set_delay(value); reverb_.prepare(); break;
        case PARAM_REVERB_DRYWET:   reverb_.set_opmix(value); reverb_.prepare(); break;

        default:
            // Params read in process loop (osc types, volumes, filter freq/type/gain/routing,
            // env ADSR, LFO, on/off switches) don't need immediate voice updates
            break;
        }
    }

    ::Voice voice_[VOICES];
    ::VoiceManager voiceManager_;
    ::Tunings::Tuning tuning_;

    // FX processors
    ::Delay delay_;
    ::Phaser phaser_;
    ::Flanger flanger_;
    ::Chorus chorus_;
    ::ZitaReverb reverb_;
    float fxModZero_ = 0.0f;  // All mod pointers point here

    float params_[PARAM_COUNT];
    int lastMidiNote_ = 60;

    // LFO phase accumulators (per-voice, 3 LFOs)
    float lfoPhase_[VOICES][3] = {};

    // Smoothing state
    float oscVolSmooth_[3] = {};
    float filFreqSmooth_[2] = {};
    float filGainSmooth_[2] = {};
    float masterSmooth_ = 0.0f;
};

} // namespace devilbox

EXPORT_WASM_SYNTH_EXTENDED_EX(Odin2Synth, devilbox::Odin2Synth, "Odin2Synth")
