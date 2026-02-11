/**
 * OBXfWASM.cpp - OB-Xf → WASMSynthBase adapter
 *
 * Wraps the OB-Xf synthesizer (GPL3, Surge Synth Team / Vadim Filatov)
 * for use in DEViLBOX's VSTBridge framework.
 *
 * OB-Xf is a header-only DSP engine modeled after the Oberheim OB-X/OB-Xa.
 * All parameters are 0-1 normalized and dispatched via process*() methods.
 *
 * Architecture:
 *   OBXfSynth (WASMSynthBase)
 *     +-- SynthEngine -- polyphonic OB-X engine (voices, LFOs, filters)
 *
 * Parameters use "Group:Name" naming for VSTBridgePanel auto-grouping.
 * 83 params across 12 groups.
 */

#include "../common/WASMSynthBase.h"
#include "../common/WASMExports.h"

// Helper functions needed by SynthEngine (from Utils.h, extracted to avoid deps)
inline static float linsc(float param, const float min, const float max)
{
    return (param) * (max - min) + min;
}

inline static float logsc(float param, const float min, const float max, const float rolloff = 19.f)
{
    return ((expf(param * logf(rolloff + 1.f)) - 1.f) / (rolloff)) * (max - min) + min;
}

inline static float getPitch(float index) { return 440.f * expf(0.69314718056f / 12.f * index); }

// Include the header-only OB-Xf engine
#include "SynthEngine.h"

#include <cstring>
#include <cmath>

namespace devilbox {

// ============================================================================
// Parameter definitions: enum index -> "Group:Name"
// All params are 0-1 normalized matching SynthEngine::process*() inputs.
// ============================================================================
enum OBXfParam {
    // Master (3)
    kVolume, kTranspose, kTune,
    // Global (8)
    kPolyphony, kHQMode, kUnisonVoices, kPortamento, kUnison,
    kUnisonDetune, kEnvLegatoMode, kNotePriority,
    // Osc (12)
    kOsc1Pitch, kOsc2Pitch, kOsc2Detune, kOsc1Saw, kOsc1Pulse,
    kOsc2Saw, kOsc2Pulse, kOscPW, kOsc2PWOffset, kOscSync,
    kOscCrossmod, kOscBrightness,
    // Mixer (5)
    kOsc1Volume, kOsc2Volume, kRingModVolume, kNoiseVolume, kNoiseColor,
    // Filter (10)
    kFilterCutoff, kFilterResonance, kFilter4PoleMode, kFilterMode,
    kFilterEnvAmount, kFilterKeyTrack, kFilter2PoleBPBlend,
    kFilter2PolePush, kFilter4PoleXpander, kFilterXpanderMode,
    // Filter Env (7)
    kFilterEnvInvert, kFilterEnvAttack, kFilterEnvDecay,
    kFilterEnvSustain, kFilterEnvRelease, kFilterEnvAttackCurve,
    kVelToFilterEnv,
    // Amp Env (6)
    kAmpEnvAttack, kAmpEnvDecay, kAmpEnvSustain, kAmpEnvRelease,
    kAmpEnvAttackCurve, kVelToAmpEnv,
    // Osc Mod (6)
    kEnvToPitchAmount, kEnvToPitchBothOscs, kEnvToPitchInvert,
    kEnvToPWAmount, kEnvToPWBothOscs, kEnvToPWInvert,
    // LFO 1 (13)
    kLFO1Rate, kLFO1Sync, kLFO1ModAmount1, kLFO1ModAmount2,
    kLFO1Wave1, kLFO1Wave2, kLFO1Wave3, kLFO1PW,
    kLFO1ToOsc1Pitch, kLFO1ToOsc2Pitch, kLFO1ToFilterCutoff,
    kLFO1ToOsc1PW, kLFO1ToOsc2PW,
    // LFO 2 (13) - not including LFO1ToVolume which is separate
    kLFO1ToVolume,
    kLFO2Rate, kLFO2Sync, kLFO2ModAmount1, kLFO2ModAmount2,
    kLFO2Wave1, kLFO2Wave2, kLFO2Wave3, kLFO2PW,
    kLFO2ToOsc1Pitch, kLFO2ToOsc2Pitch, kLFO2ToFilterCutoff,
    kLFO2ToOsc1PW, kLFO2ToOsc2PW, kLFO2ToVolume,
    // Control (5)
    kPitchBendUp, kPitchBendDown, kBendOsc2Only,
    kVibratoRate, kVibratoWave,
    // Voice Variation (4)
    kPortamentoSlop, kFilterSlop, kEnvelopeSlop, kLevelSlop,
    PARAM_COUNT
};

static const char* PARAM_NAMES[] = {
    // Master
    "Master:Volume", "Master:Transpose", "Master:Tune",
    // Global
    "Global:Polyphony", "Global:HQ Mode", "Global:Unison Voices",
    "Global:Portamento", "Global:Unison", "Global:Unison Detune",
    "Global:Env Legato", "Global:Note Priority",
    // Osc
    "Osc:Osc1 Pitch", "Osc:Osc2 Pitch", "Osc:Osc2 Detune",
    "Osc:Osc1 Saw", "Osc:Osc1 Pulse", "Osc:Osc2 Saw", "Osc:Osc2 Pulse",
    "Osc:Pulsewidth", "Osc:Osc2 PW Offset", "Osc:Sync",
    "Osc:Cross Mod", "Osc:Brightness",
    // Mixer
    "Mixer:Osc1 Vol", "Mixer:Osc2 Vol", "Mixer:Ring Mod",
    "Mixer:Noise Vol", "Mixer:Noise Color",
    // Filter
    "Filter:Cutoff", "Filter:Resonance", "Filter:4-Pole",
    "Filter:Mode", "Filter:Env Amount", "Filter:Key Track",
    "Filter:BP Blend", "Filter:2P Push", "Filter:Xpander", "Filter:Xpander Mode",
    // Filter Env
    "Filter Env:Invert", "Filter Env:Attack", "Filter Env:Decay",
    "Filter Env:Sustain", "Filter Env:Release", "Filter Env:Atk Curve",
    "Filter Env:Vel Sens",
    // Amp Env
    "Amp Env:Attack", "Amp Env:Decay", "Amp Env:Sustain",
    "Amp Env:Release", "Amp Env:Atk Curve", "Amp Env:Vel Sens",
    // Osc Mod
    "Osc Mod:Env→Pitch", "Osc Mod:Pitch Both", "Osc Mod:Pitch Inv",
    "Osc Mod:Env→PW", "Osc Mod:PW Both", "Osc Mod:PW Inv",
    // LFO 1
    "LFO1:Rate", "LFO1:Sync", "LFO1:Mod Amt 1", "LFO1:Mod Amt 2",
    "LFO1:Wave 1", "LFO1:Wave 2", "LFO1:Wave 3", "LFO1:PW",
    "LFO1:→Osc1 Pitch", "LFO1:→Osc2 Pitch", "LFO1:→Filter",
    "LFO1:→Osc1 PW", "LFO1:→Osc2 PW", "LFO1:→Volume",
    // LFO 2
    "LFO2:Rate", "LFO2:Sync", "LFO2:Mod Amt 1", "LFO2:Mod Amt 2",
    "LFO2:Wave 1", "LFO2:Wave 2", "LFO2:Wave 3", "LFO2:PW",
    "LFO2:→Osc1 Pitch", "LFO2:→Osc2 Pitch", "LFO2:→Filter",
    "LFO2:→Osc1 PW", "LFO2:→Osc2 PW", "LFO2:→Volume",
    // Control
    "Control:Bend Up", "Control:Bend Down", "Control:Bend Osc2",
    "Control:Vib Rate", "Control:Vib Wave",
    // Voice Variation
    "Slop:Portamento", "Slop:Filter", "Slop:Envelope", "Slop:Level",
};

// All parameters are 0-1 normalized
static const float PARAM_DEFAULTS[] = {
    // Master
    0.5f, 0.5f, 0.5f,
    // Global
    0.25f, 0.0f, 0.25f, 0.0f, 0.0f, 0.25f, 0.0f, 0.0f,
    // Osc
    0.5f, 0.5f, 0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0.5f, 0.0f, 0.0f, 0.0f, 1.0f,
    // Mixer
    1.0f, 0.0f, 0.0f, 0.0f, 0.0f,
    // Filter
    1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f,
    // Filter Env
    0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f,
    // Amp Env
    0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f,
    // Osc Mod
    0.0f, 1.0f, 0.0f, 0.0f, 1.0f, 0.0f,
    // LFO 1
    0.5f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.5f,
    0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f,
    // LFO 2
    0.5f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.5f,
    0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f,
    // Control
    0.042f, 0.042f, 0.0f, 0.3f, 0.0f,
    // Slop
    0.25f, 0.25f, 0.25f, 0.25f,
};

// ============================================================================
// OBXfSynth — WASMSynthBase wrapper around OB-Xf's SynthEngine
// ============================================================================
class OBXfSynth : public WASMSynthBase {
public:
    OBXfSynth() {
        for (int i = 0; i < PARAM_COUNT; ++i) {
            cachedParams_[i] = PARAM_DEFAULTS[i];
        }
    }

    void initialize(int sampleRate) override {
        WASMSynthBase::initialize(sampleRate);
        engine_.setSampleRate((float)sampleRate);

        // Apply all defaults
        for (int i = 0; i < PARAM_COUNT; ++i) {
            applyParam(i, cachedParams_[i]);
        }
    }

    void noteOn(int midiNote, int velocity) override {
        if (!isInitialized_) return;
        if (velocity == 0) { noteOff(midiNote); return; }
        engine_.processNoteOn(midiNote, (float)velocity / 127.0f, 0);
    }

    void noteOff(int midiNote) override {
        if (!isInitialized_) return;
        engine_.processNoteOff(midiNote, 0.0f, 0);
    }

    void allNotesOff() override {
        if (!isInitialized_) return;
        engine_.allNotesOff();
    }

    void controlChange(int cc, int value) override {
        if (!isInitialized_) return;
        if (cc == 1) { // mod wheel
            engine_.processModWheel((float)value / 127.0f);
        } else if (cc == 64) { // sustain
            if (value >= 64) engine_.sustainOn();
            else engine_.sustainOff();
        }
    }

    void pitchBend(int value) override {
        if (!isInitialized_) return;
        // 14-bit (0..16383, center=8192) → -1..+1
        float normalized = ((float)value - 8192.0f) / 8192.0f;
        engine_.processPitchWheel(normalized);
    }

    void process(float* outputL, float* outputR, int numSamples) override {
        if (!isInitialized_ || numSamples <= 0) {
            if (numSamples > 0) {
                std::memset(outputL, 0, numSamples * sizeof(float));
                std::memset(outputR, 0, numSamples * sizeof(float));
            }
            return;
        }

        for (int i = 0; i < numSamples; ++i) {
            float left = 0.0f, right = 0.0f;
            engine_.processSample(&left, &right);
            outputL[i] = left;
            outputR[i] = right;
        }
    }

    void setParameter(int paramId, float value) override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return;
        cachedParams_[paramId] = value;
        if (isInitialized_) {
            applyParam(paramId, value);
        }
    }

    float getParameter(int paramId) const override {
        if (paramId < 0 || paramId >= PARAM_COUNT) return 0.0f;
        return cachedParams_[paramId];
    }

    int getParameterCount() const override { return PARAM_COUNT; }

    const char* getParameterName(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_NAMES[paramId];
        return "";
    }

    float getParameterMin(int /*paramId*/) const override { return 0.0f; }
    float getParameterMax(int /*paramId*/) const override { return 1.0f; }

    float getParameterDefault(int paramId) const override {
        if (paramId >= 0 && paramId < PARAM_COUNT) return PARAM_DEFAULTS[paramId];
        return 0.0f;
    }

#ifdef __EMSCRIPTEN__
    void processJS(uintptr_t outputLPtr, uintptr_t outputRPtr, int numSamples) {
        process(reinterpret_cast<float*>(outputLPtr),
                reinterpret_cast<float*>(outputRPtr), numSamples);
    }
#endif

private:
    SynthEngine engine_;
    float cachedParams_[PARAM_COUNT] = {};

    void applyParam(int id, float v) {
        switch (id) {
            // Master
            case kVolume:              engine_.processVolume(v); break;
            case kTranspose:           engine_.processTranspose(v); break;
            case kTune:                engine_.processTune(v); break;
            // Global
            case kPolyphony:           engine_.processPolyphony(v); break;
            case kHQMode:              engine_.processHQMode(v); break;
            case kUnisonVoices:        engine_.processUnisonVoices(v); break;
            case kPortamento:          engine_.processPortamento(v); break;
            case kUnison:              engine_.processUnison(v); break;
            case kUnisonDetune:        engine_.processUnisonDetune(v); break;
            case kEnvLegatoMode:       engine_.processEnvLegatoMode(v); break;
            case kNotePriority:        engine_.processNotePriority(v); break;
            // Osc
            case kOsc1Pitch:           engine_.processOsc1Pitch(v); break;
            case kOsc2Pitch:           engine_.processOsc2Pitch(v); break;
            case kOsc2Detune:          engine_.processOsc2Detune(v); break;
            case kOsc1Saw:             engine_.processOsc1Saw(v); break;
            case kOsc1Pulse:           engine_.processOsc1Pulse(v); break;
            case kOsc2Saw:             engine_.processOsc2Saw(v); break;
            case kOsc2Pulse:           engine_.processOsc2Pulse(v); break;
            case kOscPW:               engine_.processOscPW(v); break;
            case kOsc2PWOffset:        engine_.processOsc2PWOffset(v); break;
            case kOscSync:             engine_.processOscSync(v); break;
            case kOscCrossmod:         engine_.processCrossmod(v); break;
            case kOscBrightness:       engine_.processOscBrightness(v); break;
            // Mixer
            case kOsc1Volume:          engine_.processOsc1Volume(v); break;
            case kOsc2Volume:          engine_.processOsc2Volume(v); break;
            case kRingModVolume:       engine_.processRingModVolume(v); break;
            case kNoiseVolume:         engine_.processNoiseVolume(v); break;
            case kNoiseColor:          engine_.processNoiseColor(v); break;
            // Filter
            case kFilterCutoff:        engine_.processFilterCutoff(v); break;
            case kFilterResonance:     engine_.processFilterResonance(v); break;
            case kFilter4PoleMode:     engine_.processFilter4PoleMode(v); break;
            case kFilterMode:          engine_.processFilterMode(v); break;
            case kFilterEnvAmount:     engine_.processFilterEnvAmount(v); break;
            case kFilterKeyTrack:      engine_.processFilterKeyTrack(v); break;
            case kFilter2PoleBPBlend:  engine_.processFilter2PoleBPBlend(v); break;
            case kFilter2PolePush:     engine_.processFilter2PolePush(v); break;
            case kFilter4PoleXpander:  engine_.processFilter4PoleXpander(v); break;
            case kFilterXpanderMode:   engine_.processFilterXpanderMode(v); break;
            // Filter Env
            case kFilterEnvInvert:     engine_.processFilterEnvInvert(v); break;
            case kFilterEnvAttack:     engine_.processFilterEnvAttack(v); break;
            case kFilterEnvDecay:      engine_.processFilterEnvDecay(v); break;
            case kFilterEnvSustain:    engine_.processFilterEnvSustain(v); break;
            case kFilterEnvRelease:    engine_.processFilterEnvRelease(v); break;
            case kFilterEnvAttackCurve: engine_.processFilterEnvAttackCurve(v); break;
            case kVelToFilterEnv:      engine_.processVelToFilterEnv(v); break;
            // Amp Env
            case kAmpEnvAttack:        engine_.processAmpEnvAttack(v); break;
            case kAmpEnvDecay:         engine_.processAmpEnvDecay(v); break;
            case kAmpEnvSustain:       engine_.processAmpEnvSustain(v); break;
            case kAmpEnvRelease:       engine_.processAmpEnvRelease(v); break;
            case kAmpEnvAttackCurve:   engine_.processAmpEnvAttackCurve(v); break;
            case kVelToAmpEnv:         engine_.processVelToAmpEnv(v); break;
            // Osc Mod
            case kEnvToPitchAmount:    engine_.processEnvToPitchAmount(v); break;
            case kEnvToPitchBothOscs:  engine_.processPitchBothOscs(v); break;
            case kEnvToPitchInvert:    engine_.processEnvToPitchInvert(v); break;
            case kEnvToPWAmount:       engine_.processEnvToPWAmount(v); break;
            case kEnvToPWBothOscs:     engine_.processEnvToPWBothOscs(v); break;
            case kEnvToPWInvert:       engine_.processEnvToPWInvert(v); break;
            // LFO 1
            case kLFO1Rate:            engine_.processLFO1Rate(v); break;
            case kLFO1Sync:            engine_.processLFO1Sync(v); break;
            case kLFO1ModAmount1:      engine_.processLFO1ModAmount1(v); break;
            case kLFO1ModAmount2:      engine_.processLFO1ModAmount2(v); break;
            case kLFO1Wave1:           engine_.processLFO1Wave1(v); break;
            case kLFO1Wave2:           engine_.processLFO1Wave2(v); break;
            case kLFO1Wave3:           engine_.processLFO1Wave3(v); break;
            case kLFO1PW:              engine_.processLFO1PW(v); break;
            case kLFO1ToOsc1Pitch:     engine_.processLFO1ToOsc1Pitch(v); break;
            case kLFO1ToOsc2Pitch:     engine_.processLFO1ToOsc2Pitch(v); break;
            case kLFO1ToFilterCutoff:  engine_.processLFO1ToFilterCutoff(v); break;
            case kLFO1ToOsc1PW:        engine_.processLFO1ToOsc1PW(v); break;
            case kLFO1ToOsc2PW:        engine_.processLFO1ToOsc2PW(v); break;
            case kLFO1ToVolume:        engine_.processLFO1ToVolume(v); break;
            // LFO 2
            case kLFO2Rate:            engine_.processLFO2Rate(v); break;
            case kLFO2Sync:            engine_.processLFO2Sync(v); break;
            case kLFO2ModAmount1:      engine_.processLFO2ModAmount1(v); break;
            case kLFO2ModAmount2:      engine_.processLFO2ModAmount2(v); break;
            case kLFO2Wave1:           engine_.processLFO2Wave1(v); break;
            case kLFO2Wave2:           engine_.processLFO2Wave2(v); break;
            case kLFO2Wave3:           engine_.processLFO2Wave3(v); break;
            case kLFO2PW:              engine_.processLFO2PW(v); break;
            case kLFO2ToOsc1Pitch:     engine_.processLFO2ToOsc1Pitch(v); break;
            case kLFO2ToOsc2Pitch:     engine_.processLFO2ToOsc2Pitch(v); break;
            case kLFO2ToFilterCutoff:  engine_.processLFO2ToFilterCutoff(v); break;
            case kLFO2ToOsc1PW:        engine_.processLFO2ToOsc1PW(v); break;
            case kLFO2ToOsc2PW:        engine_.processLFO2ToOsc2PW(v); break;
            case kLFO2ToVolume:        engine_.processLFO2ToVolume(v); break;
            // Control
            case kPitchBendUp:         engine_.processBendUpRange(v); break;
            case kPitchBendDown:       engine_.processBendDownRange(v); break;
            case kBendOsc2Only:        engine_.processBendOsc2Only(v); break;
            case kVibratoRate:         engine_.processVibratoLFORate(v); break;
            case kVibratoWave:         engine_.processVibratoLFOWave(v); break;
            // Voice Variation
            case kPortamentoSlop:      engine_.processPortamentoSlop(v); break;
            case kFilterSlop:          engine_.processFilterSlop(v); break;
            case kEnvelopeSlop:        engine_.processEnvelopeSlop(v); break;
            case kLevelSlop:           engine_.processLevelSlop(v); break;
            default: break;
        }
    }
};

} // namespace devilbox

EXPORT_WASM_SYNTH_EXTENDED_EX(OBXfSynth, devilbox::OBXfSynth, "OBXfSynth")
