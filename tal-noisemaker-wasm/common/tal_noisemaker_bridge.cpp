/*
  TAL-NoiseMaker WASM Bridge
  Standalone C API wrapping the TAL-NoiseMaker SynthEngine for Emscripten/WASM.
  
  Licensed under GPL v2 (same as original TAL-NoiseMaker).
*/

#include "../src/juce_compat.h"
#include "../src/Engine/Params.h"
#include "../src/EnvelopeEditor/SplinePoint.h"
#include "../src/EnvelopeEditor/SplineUtility.h"
#include "../src/EnvelopeEditor/EnvelopeEditor.h"
#include "../src/EnvelopeEditor/EnvelopeEditorHandler.h"
#include "../src/EnvelopeEditor/EnvelopeEditorVoiceHandler.h"
#include "../src/Engine/SynthEngine.h"

#include <cstring>

struct TalNoiseMakerWrapper {
    SynthEngine* engine;
    float params[NUMPARAM];
    float bpm;

    TalNoiseMakerWrapper(float sampleRate) : bpm(120.0f) {
        engine = new SynthEngine(sampleRate);
        // Load default parameter values (matching TalPreset defaults)
        for (int i = 0; i < NUMPARAM; i++) params[i] = 0.0f;

        params[VOLUME] = 0.5f;
        params[FILTERTYPE] = 1.0f;
        params[CUTOFF] = 1.0f;
        params[OSC1VOLUME] = 0.8f;
        params[OSC2VOLUME] = 0.0f;
        params[OSC3VOLUME] = 0.8f;
        params[OSC1WAVEFORM] = 1.0f;
        params[OSC2WAVEFORM] = 1.0f;
        params[OSCMASTERTUNE] = 0.5f;
        params[OSC1TUNE] = 0.25f;
        params[OSC2TUNE] = 0.5f;
        params[OSC1FINETUNE] = 0.5f;
        params[OSC2FINETUNE] = 0.5f;
        params[FILTERCONTOUR] = 0.5f;
        params[FILTERSUSTAIN] = 1.0f;
        params[AMPSUSTAIN] = 1.0f;
        params[VOICES] = 1.0f;
        params[PORTAMENTOMODE] = 1.0f;
        params[LFO1AMOUNT] = 0.5f;
        params[LFO2AMOUNT] = 0.5f;
        params[LFO1DESTINATION] = 1.0f;
        params[LFO2DESTINATION] = 1.0f;
        params[OSC1PW] = 0.5f;
        params[OSC1PHASE] = 0.5f;
        params[TRANSPOSE] = 0.5f;
        params[FREEADDESTINATION] = 1.0f;
        params[REVERBDECAY] = 0.5f;
        params[REVERBLOWCUT] = 1.0f;
        params[REVERBHIGHCUT] = 0.0f;
        params[OSCBITCRUSHER] = 1.0f;
        params[ENVELOPEEDITORDEST1] = 1.0f;
        params[ENVELOPEEDITORSPEED] = 1.0f;

        // Apply all defaults to engine
        for (int i = 0; i < NUMPARAM; i++) {
            applyParam(i, params[i]);
        }
    }

    ~TalNoiseMakerWrapper() {
        delete engine;
    }

    void applyParam(int index, float value) {
        switch (index) {
            case VOLUME: engine->setVolume(value); break;
            case CUTOFF: engine->setCutoff(value); break;
            case RESONANCE: engine->setResonance(value); break;
            case FILTERCONTOUR: engine->setFilterContour(value); break;
            case KEYFOLLOW: engine->setKeyfollow(value); break;
            case FILTERATTACK: engine->setFilterAttack(value); break;
            case FILTERDECAY: engine->setFilterDecay(value); break;
            case FILTERSUSTAIN: engine->setFilterSustain(value); break;
            case FILTERRELEASE: engine->setFilterRelease(value); break;
            case AMPATTACK: engine->setAmpAttack(value); break;
            case AMPDECAY: engine->setAmpDecay(value); break;
            case AMPSUSTAIN: engine->setAmpSustain(value); break;
            case AMPRELEASE: engine->setAmpRelease(value); break;
            case OSC1VOLUME: engine->setOsc1Volume(value); break;
            case OSC2VOLUME: engine->setOsc2Volume(value); break;
            case OSC3VOLUME: engine->setOsc3Volume(value); break;
            case OSC1WAVEFORM: engine->setOsc1Waveform(value); break;
            case OSC2WAVEFORM: engine->setOsc2Waveform(value); break;
            case OSC1TUNE: engine->setOsc1Tune(value); break;
            case OSC2TUNE: engine->setOsc2Tune(value); break;
            case OSC1FINETUNE: engine->setOsc1FineTune(value); break;
            case OSC2FINETUNE: engine->setOsc2FineTune(value); break;
            case OSCSYNC: engine->setOscSync(value > 0.0f); break;
            case PANIC: if (value > 0.0f) engine->setPanic(); break;
            case PORTAMENTO: engine->setPortamento(value); break;
            case PORTAMENTOMODE: engine->setPortamentoMode(value); break;
            case LFO1RATE: engine->setLfo1Rate(value, bpm); break;
            case LFO2RATE: engine->setLfo2Rate(value, bpm); break;
            case LFO1AMOUNT: engine->setLfo1Amount(value); break;
            case LFO2AMOUNT: engine->setLfo2Amount(value); break;
            case LFO1WAVEFORM: engine->setLfo1Waveform(value); break;
            case LFO2WAVEFORM: engine->setLfo2Waveform(value); break;
            case LFO1DESTINATION: engine->setLfo1Destination(value); break;
            case LFO2DESTINATION: engine->setLfo2Destination(value); break;
            case OSC1PW: engine->setOsc1Pw(value); break;
            case OSC1PHASE: engine->setOsc1Phase(value); break;
            case OSC2FM: engine->setOsc1Fm(value); break;
            case OSC2PHASE: engine->setOsc2Phase(value); break;
            case FREEADATTACK: engine->setFreeAdAttack(value); break;
            case FREEADDECAY: engine->setFreeAdDecay(value); break;
            case FREEADAMOUNT: engine->setFreeAdAmount(value); break;
            case FREEADDESTINATION: engine->setFreeAdDestination(value); break;
            case LFO1SYNC: engine->setLfo1Sync(value, params[LFO1RATE], bpm); break;
            case LFO1KEYTRIGGER: engine->setLfo1KeyTrigger(value); break;
            case LFO1PHASE: engine->setLfo1Phase(value); break;
            case LFO2SYNC: engine->setLfo2Sync(value, params[LFO2RATE], bpm); break;
            case LFO2KEYTRIGGER: engine->setLfo2KeyTrigger(value); break;
            case LFO2PHASE: engine->setLfo2Phase(value); break;
            case VELOCITYVOLUME: engine->setVelocityVolume(value); break;
            case VELOCITYCONTOUR: engine->setVelocityContour(value); break;
            case VELOCITYCUTOFF: engine->setVelocityCutoff(value); break;
            case PITCHWHEELCUTOFF: engine->setPitchwheelCutoff(value); break;
            case PITCHWHEELPITCH: engine->setPitchwheelPitch(value); break;
            case HIGHPASS: engine->setHighPass(value); break;
            case DETUNE: engine->setDetune(value); break;
            case VINTAGENOISE: engine->setVintageNoise(value); break;
            case OSCMASTERTUNE: engine->setMastertune(value); break;
            case TRANSPOSE: engine->setTranspose(value); break;
            case RINGMODULATION: engine->setRingmodulation(value); break;
            case CHORUS1ENABLE:
                engine->setChorus(value > 0.0f, params[CHORUS2ENABLE] > 0.0f);
                break;
            case CHORUS2ENABLE:
                engine->setChorus(params[CHORUS1ENABLE] > 0.0f, value > 0.0f);
                break;
            case REVERBWET: engine->setReverbWet(value); break;
            case REVERBDECAY: engine->setReverbDecay(value); break;
            case REVERBPREDELAY: engine->setReverbPreDelay(value); break;
            case REVERBHIGHCUT: engine->setReverbHighCut(value); break;
            case REVERBLOWCUT: engine->setReverbLowCut(value); break;
            case OSCBITCRUSHER: engine->setOscBitcrusher(value); break;
            case FILTERTYPE: engine->setFiltertype(value); break;
            case FILTERDRIVE: engine->setFilterDrive(value); break;
            case ENVELOPEEDITORDEST1: engine->setEnvelopeEditorDest1(value); break;
            case ENVELOPEEDITORSPEED: engine->setEnvelopeEditorSpeed(value); break;
            case ENVELOPEEDITORAMOUNT: engine->setEnvelopeEditorAmount(value); break;
            case ENVELOPEONESHOT: engine->setEnvelopeEditorOneShot(value > 0.0f); break;
            case ENVELOPEFIXTEMPO: engine->setEnvelopeEditorFixTempo(value > 0.0f); break;
            case VOICES: engine->setNumberOfVoices(value); break;
            case DELAYWET: engine->getDelayEngine()->setWet(value); break;
            case DELAYTIME: engine->getDelayEngine()->setDelay(value); break;
            case DELAYSYNC: engine->getDelayEngine()->setSync(value > 0); break;
            case DELAYFACTORL: engine->getDelayEngine()->setFactor2xL(value > 0); break;
            case DELAYFACTORR: engine->getDelayEngine()->setFactor2xR(value > 0); break;
            case DELAYHIGHSHELF: engine->getDelayEngine()->setHighCut(value); break;
            case DELAYLOWSHELF: engine->getDelayEngine()->setLowCut(value); break;
            case DELAYFEEDBACK: engine->getDelayEngine()->setFeedback(value); break;
            default: break;
        }
    }
};

extern "C" {

void* tal_nm_create(int sampleRate) {
    return new TalNoiseMakerWrapper((float)sampleRate);
}

void tal_nm_destroy(void* ptr) {
    delete static_cast<TalNoiseMakerWrapper*>(ptr);
}

void tal_nm_process(void* ptr, float* left, float* right, int nframes) {
    auto* w = static_cast<TalNoiseMakerWrapper*>(ptr);
    for (int i = 0; i < nframes; i++) {
        left[i] = 0.0f;
        right[i] = 0.0f;
        w->engine->process(&left[i], &right[i]);
    }
}

void tal_nm_note_on(void* ptr, int note, int velocity) {
    auto* w = static_cast<TalNoiseMakerWrapper*>(ptr);
    float vel = velocity / 127.0f;
    w->engine->setNoteOn(note, vel);
}

void tal_nm_note_off(void* ptr, int note) {
    auto* w = static_cast<TalNoiseMakerWrapper*>(ptr);
    w->engine->setNoteOff(note);
}

void tal_nm_set_param(void* ptr, int index, float value) {
    auto* w = static_cast<TalNoiseMakerWrapper*>(ptr);
    if (index >= 0 && index < NUMPARAM) {
        w->params[index] = value;
        w->applyParam(index, value);
    }
}

float tal_nm_get_param(void* ptr, int index) {
    auto* w = static_cast<TalNoiseMakerWrapper*>(ptr);
    if (index >= 0 && index < NUMPARAM) {
        return w->params[index];
    }
    return 0.0f;
}

int tal_nm_get_num_params(void* ptr) {
    (void)ptr;
    return NUMPARAM;
}

void tal_nm_all_notes_off(void* ptr) {
    auto* w = static_cast<TalNoiseMakerWrapper*>(ptr);
    w->engine->reset();
}

void tal_nm_pitch_bend(void* ptr, int value) {
    auto* w = static_cast<TalNoiseMakerWrapper*>(ptr);
    float normalized = (value - 8192.0f) / (16383.0f * 0.5f);
    w->engine->setPitchwheelAmount(normalized);
}

void tal_nm_set_bpm(void* ptr, float bpmVal) {
    auto* w = static_cast<TalNoiseMakerWrapper*>(ptr);
    w->bpm = bpmVal;
    w->engine->setDelayBpm(bpmVal);
    w->engine->setEnvelopeEditorBpm(bpmVal);
}

} // extern "C"
