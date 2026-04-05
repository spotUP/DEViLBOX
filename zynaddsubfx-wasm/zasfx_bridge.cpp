/*
 * ZynAddSubFX WASM Bridge
 * 
 * Wraps the ZynAddSubFX Master engine for use in DEViLBOX.
 * Parameter index layout (128 params, all 0-127 range unless noted):
 *
 *   0-9:   Global / Master
 *   10-29: ADDsynth global
 *   30-49: ADDsynth voice 0
 *   50-59: SUBsynth
 *   60-69: PADsynth
 *   70-79: Filter (global)
 *   80-89: Amplitude envelope
 *   90-99: Filter envelope
 *   100-109: Frequency envelope
 *   110-119: LFO (amp/freq/filter)
 *   120-127: Effects
 */

#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <cmath>

#include "Misc/Master.h"
#include "Misc/Part.h"
#include "Misc/Allocator.h"
#include "Misc/Util.h"
#include "Misc/Config.h"
#include "Misc/XMLwrapper.h"
#include "Params/ADnoteParameters.h"
#include "Params/SUBnoteParameters.h"
#include "Params/PADnoteParameters.h"
#include "Params/FilterParams.h"
#include "Params/EnvelopeParams.h"
#include "Params/LFOParams.h"
#include "Params/Controller.h"
#include "Synth/OscilGen.h"
#include "Effects/EffectMgr.h"
#include "globals.h"

using namespace zyn;

#define NUM_PARAMS 128

enum ZasfxParam {
    P_MASTER_VOLUME = 0, P_MASTER_KEYSHIFT = 1,
    P_PART_VOLUME = 2, P_PART_PANNING = 3,
    P_PART_VELSCALE = 4, P_PART_VELSENSE = 5,
    P_POLYPHONY = 6, P_PORTAMENTO_ENABLE = 7,
    P_PORTAMENTO_TIME = 8, P_PORTAMENTO_THRESH = 9,

    P_ADD_ENABLE = 10, P_ADD_VOLUME = 11,
    P_ADD_PANNING = 12, P_ADD_DETUNE = 13,
    P_ADD_COARSE_DETUNE = 14, P_ADD_BANDWIDTH = 15,
    P_ADD_STEREO = 16, P_ADD_PUNCH_STRENGTH = 17,
    P_ADD_PUNCH_TIME = 18, P_ADD_PUNCH_STRETCH = 19,

    // Voice 0: 30-49
    P_ADDV0_ENABLE = 30, P_ADDV0_VOLUME = 31,
    P_ADDV0_PANNING = 32, P_ADDV0_DETUNE = 33,
    P_ADDV0_COARSE_DETUNE = 34, P_ADDV0_OSCIL_SHAPE = 35,
    P_ADDV0_OSCIL_MAG0 = 36, P_ADDV0_OSCIL_MAG1 = 37,
    P_ADDV0_OSCIL_MAG2 = 38, P_ADDV0_OSCIL_MAG3 = 39,
    P_ADDV0_UNISON_SIZE = 40, P_ADDV0_UNISON_SPREAD = 41,
    P_ADDV0_UNISON_VIBRATO = 42, P_ADDV0_UNISON_VIBSPEED = 43,
    P_ADDV0_FM_TYPE = 44, P_ADDV0_FM_VOLUME = 45,
    P_ADDV0_FM_DAMP = 46, P_ADDV0_NOISE_TYPE = 47,
    P_ADDV0_FILTER_BYPASS = 48, P_ADDV0_DELAY = 49,

    P_SUB_ENABLE = 50, P_SUB_VOLUME = 51,
    P_SUB_PANNING = 52, P_SUB_BANDWIDTH = 53,
    P_SUB_BWSCALE = 54, P_SUB_DETUNE = 55,
    P_SUB_COARSE_DETUNE = 56, P_SUB_NUM_STAGES = 57,
    P_SUB_MAG_TYPE = 58, P_SUB_START = 59,

    P_PAD_ENABLE = 60, P_PAD_VOLUME = 61,
    P_PAD_PANNING = 62, P_PAD_DETUNE = 63,
    P_PAD_COARSE_DETUNE = 64, P_PAD_BANDWIDTH = 65,
    P_PAD_BW_SCALE = 66, P_PAD_QUALITY = 67,
    P_PAD_STEREO = 68, P_PAD_MODE = 69,

    P_FILTER_TYPE = 70, P_FILTER_SUBTYPE = 71,
    P_FILTER_CUTOFF = 72, P_FILTER_RESONANCE = 73,
    P_FILTER_STAGES = 74, P_FILTER_GAIN = 75,
    P_FILTER_TRACKING = 76, P_FILTER_CATEGORY = 77,
    P_FILTER_VELSCALE = 78, P_FILTER_VELFUNC = 79,

    P_AMPENV_ATTACK = 80, P_AMPENV_DECAY = 81,
    P_AMPENV_SUSTAIN = 82, P_AMPENV_RELEASE = 83,
    P_AMPENV_STRETCH = 84, P_AMPENV_LINEARIZE = 85,
    P_AMPENV_FORCED_RELEASE = 86, P_AMPENV_REPEATING = 87,
    P_AMPENV_A_VALUE = 88, P_AMPENV_D_VALUE = 89,

    P_FILTENV_ATTACK = 90, P_FILTENV_DECAY = 91,
    P_FILTENV_SUSTAIN = 92, P_FILTENV_RELEASE = 93,
    P_FILTENV_DEPTH = 94, P_FILTENV_A_VALUE = 95,
    P_FILTENV_D_VALUE = 96, P_FILTENV_R_VALUE = 97,
    P_FILTENV_STRETCH = 98, P_FILTENV_FORCED_RELEASE = 99,

    P_FREQENV_ATTACK = 100, P_FREQENV_RELEASE = 101,
    P_FREQENV_DEPTH = 102, P_FREQENV_A_VALUE = 103,
    P_FREQENV_R_VALUE = 104, P_FREQENV_STRETCH = 105,
    P_FREQENV_FORCED_RELEASE = 106,

    P_LFO_AMP_FREQ = 110, P_LFO_AMP_DEPTH = 111,
    P_LFO_AMP_DELAY = 112, P_LFO_AMP_TYPE = 113,
    P_LFO_FREQ_FREQ = 114, P_LFO_FREQ_DEPTH = 115,
    P_LFO_FREQ_DELAY = 116, P_LFO_FREQ_TYPE = 117,
    P_LFO_FILT_FREQ = 118, P_LFO_FILT_DEPTH = 119,

    P_EFX1_TYPE = 120, P_EFX1_PRESET = 121,
    P_EFX2_TYPE = 122, P_EFX2_PRESET = 123,
    P_EFX3_TYPE = 124, P_EFX3_PRESET = 125,
    P_REVERB_MIX = 126, P_ECHO_MIX = 127,

    // Voice 1: 130-135 (essential params only)
    P_ADDV1_ENABLE = 130, P_ADDV1_VOLUME = 131,
    P_ADDV1_DETUNE = 132, P_ADDV1_COARSE_DETUNE = 133,
    P_ADDV1_OSCIL_SHAPE = 134,
    // Voice 2: 140-144
    P_ADDV2_ENABLE = 140, P_ADDV2_VOLUME = 141,
    P_ADDV2_DETUNE = 142, P_ADDV2_COARSE_DETUNE = 143,
    P_ADDV2_OSCIL_SHAPE = 144,
    // Voice 3: 150-154
    P_ADDV3_ENABLE = 150, P_ADDV3_VOLUME = 151,
    P_ADDV3_DETUNE = 152, P_ADDV3_COARSE_DETUNE = 153,
    P_ADDV3_OSCIL_SHAPE = 154,

    // SUBsynth harmonics: 160-175
    P_SUB_HMAG0 = 160, P_SUB_HMAG1 = 161, P_SUB_HMAG2 = 162,
    P_SUB_HMAG3 = 163, P_SUB_HMAG4 = 164, P_SUB_HMAG5 = 165,

    // Apply parameters trigger
    P_APPLY_PARAMS = 200,
};

struct ZasfxInstance {
    SYNTH_T synth;
    Config* config;
    Master* master;
    float*  tmpL;
    float*  tmpR;
    int     sampleRate;
    int     bufferSize;
};

static inline Part* getPart(ZasfxInstance* inst) {
    return inst->master->part[0];
}
static inline ADnoteParameters* getAD(ZasfxInstance* inst) {
    return getPart(inst)->kit[0].adpars;
}
static inline SUBnoteParameters* getSUB(ZasfxInstance* inst) {
    return getPart(inst)->kit[0].subpars;
}
static inline PADnoteParameters* getPAD(ZasfxInstance* inst) {
    return getPart(inst)->kit[0].padpars;
}
static inline unsigned char clamp127(float v) {
    if (v < 0.0f) return 0;
    if (v > 127.0f) return 127;
    return (unsigned char)(v + 0.5f);
}
// Convert 0-127 to 0.0-1.0 float
static inline float norm127(float v) {
    return (v < 0.0f) ? 0.0f : (v > 127.0f) ? 1.0f : v / 127.0f;
}

extern "C" {

void* zasfx_create(int sampleRate) {
    auto* inst = new ZasfxInstance();
    inst->sampleRate = sampleRate;
    inst->synth.samplerate = sampleRate;
    inst->synth.buffersize = 256;
    inst->synth.oscilsize  = 1024;
    inst->synth.alias();
    inst->bufferSize = inst->synth.buffersize;
    inst->config = new Config();
    inst->master = new Master(inst->synth, inst->config);
    inst->master->defaults();
    inst->master->partonoff(0, 1);
    Part* part = getPart(inst);
    part->kit[0].Padenabled = 1;
    // Allocate SUBsynth and PADsynth params (Part constructor only creates ADDsynth)
    if (!part->kit[0].subpars)
        part->kit[0].subpars = new SUBnoteParameters(&inst->master->time);
    if (!part->kit[0].padpars)
        part->kit[0].padpars = new PADnoteParameters(inst->synth, inst->master->fft, &inst->master->time);
    inst->master->applyparameters();
    inst->master->initialize_rt();
    // Boost master volume from default -6.67dB to 0dB
    inst->master->Volume = 0.0f;
    inst->tmpL = new float[inst->bufferSize];
    inst->tmpR = new float[inst->bufferSize];
    return (void*)inst;
}

void zasfx_destroy(void* ptr) {
    if (!ptr) return;
    auto* inst = (ZasfxInstance*)ptr;
    delete inst->master;
    delete inst->config;
    delete[] inst->tmpL;
    delete[] inst->tmpR;
    delete inst;
}

void zasfx_process(void* ptr, float* left, float* right, int nframes) {
    if (!ptr) return;
    auto* inst = (ZasfxInstance*)ptr;
    int remaining = nframes;
    int offset = 0;
    while (remaining > 0) {
        int chunk = (remaining > inst->bufferSize) ? inst->bufferSize : remaining;
        inst->master->GetAudioOutSamples(chunk, inst->sampleRate,
                                          inst->tmpL, inst->tmpR);
        memcpy(left + offset, inst->tmpL, chunk * sizeof(float));
        memcpy(right + offset, inst->tmpR, chunk * sizeof(float));
        offset += chunk;
        remaining -= chunk;
    }
}

void zasfx_note_on(void* ptr, int note, int velocity) {
    if (!ptr) return;
    auto* inst = (ZasfxInstance*)ptr;
    inst->master->noteOn(0, (note_t)note, (char)velocity);
}

void zasfx_note_off(void* ptr, int note) {
    if (!ptr) return;
    auto* inst = (ZasfxInstance*)ptr;
    // Part::NoteOff(note) searches the notePool by note value but fails to match
    // in mono/legato modes. Use Part::cleanup() which immediately kills all voices
    // on the part — same mechanism as Master::ShutUp() but per-part.
    // In a tracker, only one note plays per instrument at a time, so this is safe.
    getPart(inst)->cleanup();
}

void zasfx_all_notes_off(void* ptr) {
    if (!ptr) return;
    auto* inst = (ZasfxInstance*)ptr;
    inst->master->ShutUp();
}

int zasfx_get_num_params(void) {
    return NUM_PARAMS;
}

void zasfx_set_param(void* ptr, int index, float value) {
    if (!ptr) return;
    auto* inst = (ZasfxInstance*)ptr;
    Part* part = getPart(inst);
    ADnoteParameters* ad = getAD(inst);
    SUBnoteParameters* sub = getSUB(inst);
    PADnoteParameters* pad = getPAD(inst);
    unsigned char v = clamp127(value);

    switch (index) {
    // === Global (0-9) ===
    case P_MASTER_VOLUME: inst->master->Volume = norm127(value); break;
    case P_MASTER_KEYSHIFT: inst->master->setPkeyshift((char)v); break;
    case P_PART_VOLUME: part->Volume = norm127(value); break;
    case P_PART_PANNING: part->Ppanning = v; break;
    case P_PART_VELSCALE: part->Pvelsns = v; break;
    case P_PART_VELSENSE: part->Pveloffs = v; break;
    case P_POLYPHONY: part->Ppolymode = (v > 0) ? 1 : 0; break;
    case P_PORTAMENTO_ENABLE: part->ctl.portamento.portamento = (v > 63) ? 1 : 0; break;
    case P_PORTAMENTO_TIME: part->ctl.portamento.time = v; break;
    case P_PORTAMENTO_THRESH: part->ctl.portamento.pitchthresh = v; break;

    // === ADDsynth Global (10-29) ===
    case P_ADD_ENABLE: part->kit[0].Padenabled = (v > 0) ? 1 : 0; break;
    case P_ADD_VOLUME: if (ad) ad->GlobalPar.Volume = norm127(value); break;
    case P_ADD_PANNING: if (ad) ad->GlobalPar.PPanning = v; break;
    case P_ADD_DETUNE: if (ad) ad->GlobalPar.PDetune = (unsigned short)value; break;
    case P_ADD_COARSE_DETUNE: if (ad) ad->GlobalPar.PCoarseDetune = (unsigned short)value; break;
    case P_ADD_BANDWIDTH: if (ad) ad->GlobalPar.PBandwidth = v; break;
    case P_ADD_STEREO: if (ad) ad->GlobalPar.PStereo = (v > 63); break;
    case P_ADD_PUNCH_STRENGTH: if (ad) ad->GlobalPar.PPunchStrength = v; break;
    case P_ADD_PUNCH_TIME: if (ad) ad->GlobalPar.PPunchTime = v; break;
    case P_ADD_PUNCH_STRETCH: if (ad) ad->GlobalPar.PPunchStretch = v; break;

    // === ADDsynth Voice 0 (30-49) ===
    case P_ADDV0_ENABLE: if (ad) ad->VoicePar[0].Enabled = (v > 0) ? 1 : 0; break;
    case P_ADDV0_VOLUME: if (ad) ad->VoicePar[0].volume = norm127(value); break;
    case P_ADDV0_PANNING: if (ad) ad->VoicePar[0].PPanning = v; break;
    case P_ADDV0_DETUNE: if (ad) ad->VoicePar[0].PDetune = (unsigned short)value; break;
    case P_ADDV0_COARSE_DETUNE: if (ad) ad->VoicePar[0].PCoarseDetune = (unsigned short)value; break;
    case P_ADDV0_OSCIL_SHAPE:
        if (ad && ad->VoicePar[0].OscilGn) ad->VoicePar[0].OscilGn->Pcurrentbasefunc = v;
        break;
    case P_ADDV0_OSCIL_MAG0:
        if (ad && ad->VoicePar[0].OscilGn) ad->VoicePar[0].OscilGn->Phmag[0] = v;
        break;
    case P_ADDV0_OSCIL_MAG1:
        if (ad && ad->VoicePar[0].OscilGn) ad->VoicePar[0].OscilGn->Phmag[1] = v;
        break;
    case P_ADDV0_OSCIL_MAG2:
        if (ad && ad->VoicePar[0].OscilGn) ad->VoicePar[0].OscilGn->Phmag[2] = v;
        break;
    case P_ADDV0_OSCIL_MAG3:
        if (ad && ad->VoicePar[0].OscilGn) ad->VoicePar[0].OscilGn->Phmag[3] = v;
        break;
    case P_ADDV0_UNISON_SIZE: if (ad) ad->VoicePar[0].Unison_size = (v < 1) ? 1 : v; break;
    case P_ADDV0_UNISON_SPREAD: if (ad) ad->VoicePar[0].Unison_frequency_spread = v; break;
    case P_ADDV0_UNISON_VIBRATO: if (ad) ad->VoicePar[0].Unison_vibratto = v; break;
    case P_ADDV0_UNISON_VIBSPEED: if (ad) ad->VoicePar[0].Unison_vibratto_speed = v; break;
    case P_ADDV0_FM_TYPE:
        if (ad) ad->VoicePar[0].PFMEnabled = static_cast<FMTYPE>((int)value);
        break;
    case P_ADDV0_FM_VOLUME: if (ad) ad->VoicePar[0].FMvolume = norm127(value); break;
    case P_ADDV0_FM_DAMP: if (ad) ad->VoicePar[0].PFMVolumeDamp = v; break;
    case P_ADDV0_NOISE_TYPE: if (ad) ad->VoicePar[0].Type = v; break;
    case P_ADDV0_FILTER_BYPASS: if (ad) ad->VoicePar[0].Pfilterbypass = (v > 63) ? 1 : 0; break;
    case P_ADDV0_DELAY: if (ad) ad->VoicePar[0].PDelay = v; break;

    // === SUBsynth (50-59) ===
    case P_SUB_ENABLE: part->kit[0].Psubenabled = (v > 0) ? 1 : 0; break;
    case P_SUB_VOLUME: if (sub) sub->Volume = norm127(value); break;
    case P_SUB_PANNING: if (sub) sub->PPanning = v; break;
    case P_SUB_BANDWIDTH: if (sub) sub->Pbandwidth = v; break;
    case P_SUB_BWSCALE: if (sub) sub->Pbwscale = v; break;
    case P_SUB_DETUNE: if (sub) sub->PDetune = (unsigned short)value; break;
    case P_SUB_COARSE_DETUNE: if (sub) sub->PCoarseDetune = (unsigned short)value; break;
    case P_SUB_NUM_STAGES: if (sub) sub->Pnumstages = v; break;
    case P_SUB_MAG_TYPE: if (sub) sub->Phmagtype = v; break;
    case P_SUB_START: if (sub) sub->Pstart = v; break;

    // === PADsynth (60-69) ===
    case P_PAD_ENABLE: if (pad) part->kit[0].Ppadenabled = (v > 0) ? 1 : 0; break;
    case P_PAD_VOLUME: if (pad) pad->PVolume = v; break;
    case P_PAD_PANNING: if (pad) pad->PPanning = v; break;
    case P_PAD_DETUNE: if (pad) pad->PDetune = (unsigned short)value; break;
    case P_PAD_COARSE_DETUNE: if (pad) pad->PCoarseDetune = (unsigned short)value; break;
    case P_PAD_BANDWIDTH: if (pad) pad->Pbandwidth = (unsigned int)value; break;
    case P_PAD_BW_SCALE: if (pad) pad->Pbwscale = v; break;
    case P_PAD_QUALITY: if (pad) pad->Pquality.samplesize = v; break;
    case P_PAD_STEREO: if (pad) pad->PStereo = (v > 63); break;
    case P_PAD_MODE:
        if (pad) {
            int m = (int)value;
            if (m == 0) pad->Pmode = PADnoteParameters::pad_mode::bandwidth;
            else if (m == 1) pad->Pmode = PADnoteParameters::pad_mode::discrete;
            else pad->Pmode = PADnoteParameters::pad_mode::continous;
        }
        break;

    // === Filter (70-79) — uses float members ===
    case P_FILTER_TYPE:
        if (ad && ad->GlobalPar.GlobalFilter) ad->GlobalPar.GlobalFilter->Ptype = v;
        break;
    case P_FILTER_SUBTYPE:
        if (ad && ad->GlobalPar.GlobalFilter) ad->GlobalPar.GlobalFilter->Pcategory = v;
        break;
    case P_FILTER_CUTOFF:
        if (ad && ad->GlobalPar.GlobalFilter) {
            // Map 0-127 to ~20Hz-20kHz log scale
            float hz = 20.0f * powf(1000.0f, value / 127.0f);
            ad->GlobalPar.GlobalFilter->basefreq = hz;
        }
        break;
    case P_FILTER_RESONANCE:
        if (ad && ad->GlobalPar.GlobalFilter) {
            ad->GlobalPar.GlobalFilter->baseq = value / 127.0f * 10.0f;
        }
        break;
    case P_FILTER_STAGES:
        if (ad && ad->GlobalPar.GlobalFilter) ad->GlobalPar.GlobalFilter->Pstages = v;
        break;
    case P_FILTER_GAIN:
        if (ad && ad->GlobalPar.GlobalFilter) {
            ad->GlobalPar.GlobalFilter->gain = (value - 64.0f) / 64.0f * 30.0f;
        }
        break;
    case P_FILTER_TRACKING:
        if (ad && ad->GlobalPar.GlobalFilter) {
            ad->GlobalPar.GlobalFilter->freqtracking = (value - 64.0f) / 64.0f * 100.0f;
        }
        break;
    case P_FILTER_CATEGORY:
        if (ad && ad->GlobalPar.GlobalFilter) ad->GlobalPar.GlobalFilter->Pcategory = v;
        break;
    case P_FILTER_VELSCALE: if (ad) ad->GlobalPar.PFilterVelocityScale = v; break;
    case P_FILTER_VELFUNC: if (ad) ad->GlobalPar.PFilterVelocityScaleFunction = v; break;

    // === Amplitude Envelope (80-89) ===
    case P_AMPENV_ATTACK: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->A_dt = v; break;
    case P_AMPENV_DECAY: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->D_dt = v; break;
    case P_AMPENV_SUSTAIN: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->PS_val = v; break;
    case P_AMPENV_RELEASE: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->R_dt = v; break;
    case P_AMPENV_STRETCH: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->Penvstretch = v; break;
    case P_AMPENV_LINEARIZE: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->Plinearenvelope = (v > 63) ? 1 : 0; break;
    case P_AMPENV_FORCED_RELEASE: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->Pforcedrelease = (v > 63) ? 1 : 0; break;
    case P_AMPENV_REPEATING: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->Prepeating = (v > 63) ? 1 : 0; break;
    case P_AMPENV_A_VALUE: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->PA_val = v; break;
    case P_AMPENV_D_VALUE: if (ad && ad->GlobalPar.AmpEnvelope) ad->GlobalPar.AmpEnvelope->PD_val = v; break;

    // === Filter Envelope (90-99) ===
    case P_FILTENV_ATTACK: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->A_dt = v; break;
    case P_FILTENV_DECAY: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->D_dt = v; break;
    case P_FILTENV_SUSTAIN: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->PS_val = v; break;
    case P_FILTENV_RELEASE: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->R_dt = v; break;
    case P_FILTENV_DEPTH: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->PR_val = v; break;
    case P_FILTENV_A_VALUE: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->PA_val = v; break;
    case P_FILTENV_D_VALUE: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->PD_val = v; break;
    case P_FILTENV_R_VALUE: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->PR_val = v; break;
    case P_FILTENV_STRETCH: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->Penvstretch = v; break;
    case P_FILTENV_FORCED_RELEASE: if (ad && ad->GlobalPar.FilterEnvelope) ad->GlobalPar.FilterEnvelope->Pforcedrelease = (v > 63) ? 1 : 0; break;

    // === Frequency Envelope (100-109) ===
    case P_FREQENV_ATTACK: if (ad && ad->GlobalPar.FreqEnvelope) ad->GlobalPar.FreqEnvelope->A_dt = v; break;
    case P_FREQENV_RELEASE: if (ad && ad->GlobalPar.FreqEnvelope) ad->GlobalPar.FreqEnvelope->R_dt = v; break;
    case P_FREQENV_DEPTH: if (ad && ad->GlobalPar.FreqEnvelope) ad->GlobalPar.FreqEnvelope->PA_val = v; break;
    case P_FREQENV_A_VALUE: if (ad && ad->GlobalPar.FreqEnvelope) ad->GlobalPar.FreqEnvelope->PA_val = v; break;
    case P_FREQENV_R_VALUE: if (ad && ad->GlobalPar.FreqEnvelope) ad->GlobalPar.FreqEnvelope->PR_val = v; break;
    case P_FREQENV_STRETCH: if (ad && ad->GlobalPar.FreqEnvelope) ad->GlobalPar.FreqEnvelope->Penvstretch = v; break;
    case P_FREQENV_FORCED_RELEASE: if (ad && ad->GlobalPar.FreqEnvelope) ad->GlobalPar.FreqEnvelope->Pforcedrelease = (v > 63) ? 1 : 0; break;

    // === LFO (110-119) ===
    case P_LFO_AMP_FREQ: if (ad && ad->GlobalPar.AmpLfo) ad->GlobalPar.AmpLfo->freq = value; break;
    case P_LFO_AMP_DEPTH: if (ad && ad->GlobalPar.AmpLfo) ad->GlobalPar.AmpLfo->Pintensity = v; break;
    case P_LFO_AMP_DELAY: if (ad && ad->GlobalPar.AmpLfo) ad->GlobalPar.AmpLfo->delay = v; break;
    case P_LFO_AMP_TYPE: if (ad && ad->GlobalPar.AmpLfo) ad->GlobalPar.AmpLfo->PLFOtype = v; break;
    case P_LFO_FREQ_FREQ: if (ad && ad->GlobalPar.FreqLfo) ad->GlobalPar.FreqLfo->freq = value; break;
    case P_LFO_FREQ_DEPTH: if (ad && ad->GlobalPar.FreqLfo) ad->GlobalPar.FreqLfo->Pintensity = v; break;
    case P_LFO_FREQ_DELAY: if (ad && ad->GlobalPar.FreqLfo) ad->GlobalPar.FreqLfo->delay = v; break;
    case P_LFO_FREQ_TYPE: if (ad && ad->GlobalPar.FreqLfo) ad->GlobalPar.FreqLfo->PLFOtype = v; break;
    case P_LFO_FILT_FREQ: if (ad && ad->GlobalPar.FilterLfo) ad->GlobalPar.FilterLfo->freq = value; break;
    case P_LFO_FILT_DEPTH: if (ad && ad->GlobalPar.FilterLfo) ad->GlobalPar.FilterLfo->Pintensity = v; break;

    // === Effects (120-127) ===
    case P_EFX1_TYPE: if (part->partefx[0]) part->partefx[0]->changeeffect((int)value); break;
    case P_EFX1_PRESET: if (part->partefx[0]) part->partefx[0]->changepreset((int)value); break;
    case P_EFX2_TYPE: if (part->partefx[1]) part->partefx[1]->changeeffect((int)value); break;
    case P_EFX2_PRESET: if (part->partefx[1]) part->partefx[1]->changepreset((int)value); break;
    case P_EFX3_TYPE: if (part->partefx[2]) part->partefx[2]->changeeffect((int)value); break;
    case P_EFX3_PRESET: if (part->partefx[2]) part->partefx[2]->changepreset((int)value); break;
    case P_REVERB_MIX: inst->master->setPsysefxvol(0, 0, (char)v); break;
    case P_ECHO_MIX: inst->master->setPsysefxvol(0, 1, (char)v); break;

    // === ADDsynth Voice 1 (130-134) ===
    case P_ADDV1_ENABLE: if (ad) ad->VoicePar[1].Enabled = (v > 0) ? 1 : 0; break;
    case P_ADDV1_VOLUME: if (ad) ad->VoicePar[1].volume = norm127(value); break;
    case P_ADDV1_DETUNE: if (ad) ad->VoicePar[1].PDetune = (unsigned short)value; break;
    case P_ADDV1_COARSE_DETUNE: if (ad) ad->VoicePar[1].PCoarseDetune = (unsigned short)value; break;
    case P_ADDV1_OSCIL_SHAPE:
        if (ad && ad->VoicePar[1].OscilGn) ad->VoicePar[1].OscilGn->Pcurrentbasefunc = v;
        break;
    // === ADDsynth Voice 2 (140-144) ===
    case P_ADDV2_ENABLE: if (ad) ad->VoicePar[2].Enabled = (v > 0) ? 1 : 0; break;
    case P_ADDV2_VOLUME: if (ad) ad->VoicePar[2].volume = norm127(value); break;
    case P_ADDV2_DETUNE: if (ad) ad->VoicePar[2].PDetune = (unsigned short)value; break;
    case P_ADDV2_COARSE_DETUNE: if (ad) ad->VoicePar[2].PCoarseDetune = (unsigned short)value; break;
    case P_ADDV2_OSCIL_SHAPE:
        if (ad && ad->VoicePar[2].OscilGn) ad->VoicePar[2].OscilGn->Pcurrentbasefunc = v;
        break;
    // === ADDsynth Voice 3 (150-154) ===
    case P_ADDV3_ENABLE: if (ad) ad->VoicePar[3].Enabled = (v > 0) ? 1 : 0; break;
    case P_ADDV3_VOLUME: if (ad) ad->VoicePar[3].volume = norm127(value); break;
    case P_ADDV3_DETUNE: if (ad) ad->VoicePar[3].PDetune = (unsigned short)value; break;
    case P_ADDV3_COARSE_DETUNE: if (ad) ad->VoicePar[3].PCoarseDetune = (unsigned short)value; break;
    case P_ADDV3_OSCIL_SHAPE:
        if (ad && ad->VoicePar[3].OscilGn) ad->VoicePar[3].OscilGn->Pcurrentbasefunc = v;
        break;

    // === SUBsynth harmonics (160-165) ===
    case P_SUB_HMAG0: if (sub) sub->Phmag[0] = v; break;
    case P_SUB_HMAG1: if (sub) sub->Phmag[1] = v; break;
    case P_SUB_HMAG2: if (sub) sub->Phmag[2] = v; break;
    case P_SUB_HMAG3: if (sub) sub->Phmag[3] = v; break;
    case P_SUB_HMAG4: if (sub) sub->Phmag[4] = v; break;
    case P_SUB_HMAG5: if (sub) sub->Phmag[5] = v; break;

    // === Apply parameters (for PADsynth wavetable rebuild) ===
    case P_APPLY_PARAMS:
        inst->master->applyparameters();
        break;
    }
}

float zasfx_get_param(void* ptr, int index) {
    if (!ptr) return 0.0f;
    auto* inst = (ZasfxInstance*)ptr;
    Part* part = getPart(inst);
    ADnoteParameters* ad = getAD(inst);
    SUBnoteParameters* sub = getSUB(inst);
    PADnoteParameters* pad = getPAD(inst);

    switch (index) {
    case P_MASTER_VOLUME: return inst->master->Volume * 127.0f;
    case P_MASTER_KEYSHIFT: return inst->master->Pkeyshift;
    case P_PART_VOLUME: return part->Volume * 127.0f;
    case P_PART_PANNING: return part->Ppanning;

    case P_ADD_ENABLE: return part->kit[0].Padenabled;
    case P_ADD_VOLUME: return ad ? ad->GlobalPar.Volume * 127.0f : 0;
    case P_ADD_PANNING: return ad ? ad->GlobalPar.PPanning : 64;
    case P_ADD_BANDWIDTH: return ad ? ad->GlobalPar.PBandwidth : 0;
    case P_ADD_STEREO: return ad ? ad->GlobalPar.PStereo : 1;

    case P_ADDV0_ENABLE: return ad ? ad->VoicePar[0].Enabled : 0;
    case P_ADDV0_VOLUME: return ad ? ad->VoicePar[0].volume * 127.0f : 0;
    case P_ADDV0_OSCIL_SHAPE: return (ad && ad->VoicePar[0].OscilGn) ? ad->VoicePar[0].OscilGn->Pcurrentbasefunc : 0;

    case P_SUB_ENABLE: return part->kit[0].Psubenabled;
    case P_SUB_VOLUME: return sub ? sub->Volume * 127.0f : 0;
    case P_SUB_BANDWIDTH: return sub ? sub->Pbandwidth : 0;

    case P_PAD_ENABLE: return part->kit[0].Ppadenabled;
    case P_PAD_VOLUME: return pad ? pad->PVolume : 0;

    case P_FILTER_CUTOFF:
        if (ad && ad->GlobalPar.GlobalFilter)
            return 127.0f * logf(ad->GlobalPar.GlobalFilter->basefreq / 20.0f) / logf(1000.0f);
        return 64;
    case P_FILTER_RESONANCE:
        return (ad && ad->GlobalPar.GlobalFilter) ? ad->GlobalPar.GlobalFilter->baseq / 10.0f * 127.0f : 0;
    default: return 0.0f;
    }
}

// Load a complete instrument preset from XML string.
// Returns 0 on success, negative on error.
int zasfx_load_preset_xml(void* ptr, const char* xml_data, int len) {
    if (!ptr || !xml_data || len <= 0) return -1;

    auto* inst = (ZasfxInstance*)ptr;
    Part* part = getPart(inst);

    // Stop all notes before changing instrument
    part->AllNotesOff();
    part->defaultsinstrument();

    // Parse XML
    XMLwrapper xml;
    std::string xmlStr(xml_data, len);
    if (!xml.putXMLdata(xmlStr.c_str())) {
        return -2;
    }

    // Navigate to INSTRUMENT branch and load
    if (xml.enterbranch("INSTRUMENT") == 0) {
        return -3;
    }

    part->getfromXMLinstrument(xml);
    xml.exitbranch();

    // Apply non-realtime parameters (PADsynth wavetable generation etc.)
    part->applyparameters();

    return 0;
}

} // extern "C"
