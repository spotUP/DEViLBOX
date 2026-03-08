/**
 * symphonie_player.c — Symphonie Pro replayer (C port from 68k ASM v3.3d)
 *
 * Ported line-by-line from: Symphonie Source.Assembler
 * Author of original: Patrick Meng (RealTime Software, Switzerland)
 *
 * Architecture: Software mixer with N channels → stereo float output.
 * No Paula emulation needed — Symphonie is its own mixer.
 *
 * NAMING CONVENTION: In Symphonie's ASM source, "vibrato" modulates VOLUME
 * and "tremolo" modulates PITCH. This is backwards from standard music
 * terminology. The C code preserves the original naming.
 */

#include "symphonie_player.h"
#include <string.h>
#include <math.h>

/* ---- LFO sine table (256 entries, signed 16-bit, matches ASM VibratoTab) ---- */
static const int16_t s_sineTable[256] = {
       0,    3,    6,    9,   12,   16,   19,   22,   25,   28,   31,   34,   37,   40,   43,   46,
      49,   51,   54,   57,   60,   63,   65,   68,   71,   73,   76,   78,   81,   83,   85,   88,
      90,   92,   94,   96,   98,  100,  102,  104,  106,  107,  109,  111,  112,  113,  115,  116,
     117,  118,  120,  121,  122,  122,  123,  124,  125,  125,  126,  126,  126,  127,  127,  127,
     127,  127,  127,  127,  126,  126,  126,  125,  125,  124,  123,  122,  122,  121,  120,  118,
     117,  116,  115,  113,  112,  111,  109,  107,  106,  104,  102,  100,   98,   96,   94,   92,
      90,   88,   85,   83,   81,   78,   76,   73,   71,   68,   65,   63,   60,   57,   54,   51,
      49,   46,   43,   40,   37,   34,   31,   28,   25,   22,   19,   16,   12,    9,    6,    3,
       0,   -3,   -6,   -9,  -12,  -16,  -19,  -22,  -25,  -28,  -31,  -34,  -37,  -40,  -43,  -46,
     -49,  -51,  -54,  -57,  -60,  -63,  -65,  -68,  -71,  -73,  -76,  -78,  -81,  -83,  -85,  -88,
     -90,  -92,  -94,  -96,  -98, -100, -102, -104, -106, -107, -109, -111, -112, -113, -115, -116,
    -117, -118, -120, -121, -122, -122, -123, -124, -125, -125, -126, -126, -126, -127, -127, -127,
    -127, -127, -127, -127, -126, -126, -126, -125, -125, -124, -123, -122, -122, -121, -120, -118,
    -117, -116, -115, -113, -112, -111, -109, -107, -106, -104, -102, -100,  -98,  -96,  -94,  -92,
     -90,  -88,  -85,  -83,  -81,  -78,  -76,  -73,  -71,  -68,  -65,  -63,  -60,  -57,  -54,  -51,
     -49,  -46,  -43,  -40,  -37,  -34,  -31,  -28,  -25,  -22,  -19,  -16,  -12,   -9,   -6,   -3,
};

/* Equal temperament frequency ratios within one octave */
static const float s_freqBase[12] = {
    1.0000f, 1.0595f, 1.1225f, 1.1892f, 1.2599f, 1.3348f,
    1.4142f, 1.4983f, 1.5874f, 1.6818f, 1.7818f, 1.8878f,
};

/* ---- Internal helpers ---- */

static inline int32_t clamp_i32(int32_t v, int32_t lo, int32_t hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static inline float clampf(float v, float lo, float hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

/* Get voice pointer for channel index */
static inline SymVoice* get_voice(SymSong* song, int ch) {
    if (ch < 0 || ch >= SYM_MAX_CHANNELS) return NULL;
    return &song->voices[ch];
}

/* Get note frequency from table (matches ASM GetNoteFreq) */
static int32_t get_note_freq(const SymSong* song, int noteVal) {
    if (noteVal < 0) noteVal = 0;
    if (noteVal >= SYM_FREQ_TABLE_SIZE) noteVal = SYM_FREQ_TABLE_SIZE - 1;
    return song->freqTable[noteVal];
}

/* ---- DSP ---- */

static void dsp_init(SymDSP* dsp) {
    memset(dsp->ringBuffer, 0, sizeof(dsp->ringBuffer));
    dsp->readPtr = 0;
    dsp->writePtr = 0;
    dsp->fxLength = SYM_DSP_RING_SIZE;
    dsp->newFxLength = SYM_DSP_RING_SIZE;
    dsp->readPtrDelay = 100;
    dsp->intensity = 0.5f;
    dsp->wetMix = 0.75f;
    dsp->fxType = SYM_DSP_OFF;
    dsp->running = 0;
    dsp->overwritePrev = 0;
    dsp->bufLenSub = 1;
}

static int32_t dsp_advance_ptr(SymDSP* dsp, int32_t ptr) {
    ptr++;
    if (ptr >= dsp->fxLength - dsp->bufLenSub) ptr = 0;
    return ptr;
}

static void dsp_start(SymDSP* dsp) {
    dsp->running = 0;
    memset(dsp->ringBuffer, 0, sizeof(dsp->ringBuffer));
    dsp->fxLength = dsp->newFxLength;
    dsp->readPtr = 0;

    int32_t delay = (int32_t)(((int64_t)(dsp->fxLength - 2) * dsp->readPtrDelay) / 100);
    delay &= ~1; /* force even */

    if (dsp->fxType == SYM_DSP_CROSSDELAY || dsp->fxType == SYM_DSP_ECHO) {
        dsp->writePtr = delay - 1;
    } else {
        dsp->writePtr = delay;
    }
    if (dsp->writePtr < 0) dsp->writePtr = 0;

    if (dsp->newFxLength > 0) dsp->running = 1;
}

static void dsp_stop(SymDSP* dsp) {
    dsp->running = 0;
}

static void dsp_set_fx_class(SymDSP* dsp, int type) {
    dsp_stop(dsp);
    dsp->fxType = type;
    dsp->overwritePrev = 1;
    if (type == SYM_DSP_CROSSECHO || type == SYM_DSP_ECHO) {
        dsp->overwritePrev = 0;
    }
    dsp->bufLenSub = (type == SYM_DSP_ECHO) ? 1 : 2;
    if (type != SYM_DSP_OFF) dsp_start(dsp);
}

static void dsp_add_sample(SymDSP* dsp, float sample) {
    if (dsp->running) {
        dsp->ringBuffer[dsp->writePtr] += sample;
    }
}

static void dsp_advance_write(SymDSP* dsp) {
    if (dsp->running) {
        if (dsp->writePtr == 0) dsp->fxLength = dsp->newFxLength;
        dsp->writePtr = dsp_advance_ptr(dsp, dsp->writePtr);
    }
}

static float dsp_get_wet(SymDSP* dsp) {
    if (!dsp->running || dsp->fxType == SYM_DSP_OFF) return 0.0f;

    /* Apply feedback attenuation */
    dsp->ringBuffer[dsp->readPtr] *= dsp->intensity;

    float sample = dsp->ringBuffer[dsp->readPtr];
    if (dsp->overwritePrev) {
        dsp->ringBuffer[dsp->readPtr] = 0.0f;
    }
    return sample * dsp->wetMix;
}

static void dsp_advance_read(SymDSP* dsp) {
    if (dsp->running) {
        dsp->readPtr = dsp_advance_ptr(dsp, dsp->readPtr);
    }
}

/* ---- Frequency table ---- */

void sym_build_freq_table(SymSong* song) {
    /* Build equal temperament table matching ASM BuildFreqList.
     * The JS worklet uses: FreqTable[i] = FreqBase[i%12] * factor
     * where factor starts at 0.095 and doubles each octave.
     * getPitchToFreq then multiplies by 110.0 to get Hz.
     *
     * For the C version, we store frequencies as fixed-point values
     * that represent the sample step increment per output sample.
     */
    float factor = 0.095f;
    int idx = 0;
    for (int octave = 0; octave < (SYM_FREQ_TABLE_SIZE / 12) + 1 && idx < SYM_FREQ_TABLE_SIZE; octave++) {
        for (int note = 0; note < 12 && idx < SYM_FREQ_TABLE_SIZE; note++) {
            /* Store as float frequency ratio × 110.0 × factor */
            float freq = s_freqBase[note] * factor * 110.0f;
            /* Convert to fixed-point for compatibility with ASM mixing */
            song->freqTable[idx] = (int32_t)(freq * 65536.0f);
            idx++;
        }
        factor *= 2.0f;
    }
}

/* Get playback frequency in Hz from note value + finetune */
static float get_pitch_to_freq(const SymSong* song, int pitch, int finetune) {
    int basePitchOffset = 24;
    pitch += basePitchOffset;
    if (pitch < 0) pitch = 0;
    if (pitch >= SYM_FREQ_TABLE_SIZE - 1) pitch = SYM_FREQ_TABLE_SIZE - 2;

    float f = (float)song->freqTable[pitch] / 65536.0f;
    if (finetune > 0 && pitch + 1 < SYM_FREQ_TABLE_SIZE) {
        float f1 = (float)song->freqTable[pitch + 1] / 65536.0f;
        f = f + (f1 - f) * ((float)finetune / 127.0f);
    } else if (finetune < 0 && pitch > 0) {
        float f1 = (float)song->freqTable[pitch - 1] / 65536.0f;
        f = f + (f - f1) * ((float)finetune / 128.0f);
    }
    return f;
}

/* ---- Voice management ---- */

static void voice_reset(SymVoice* v) {
    v->samplePtr = NULL;
    v->sampleStartPtr = NULL;
    v->sampleEndPtr = NULL;
    v->retrigPtr = NULL;
    v->hiOffset = 0;
    v->freq = 0;
    v->status = 0; /* PENDING */
    v->volume = SYM_VOLUME_MAX * 256;
    v->endReached = 1;
    v->declick = 0;
    v->fadeout = 0;
    v->lastSample = 0;
    v->instrument = NULL;
    v->instrType = 0;
    v->loopStartPtr = NULL;
    v->loopEndPtr = NULL;
    v->sustStartPtr = NULL;
    v->sustEndPtr = NULL;
    v->loopNumb = 0;
    v->volSlide = 0;
    v->pitchSlide = 0;
    v->destFreq = 0;
    v->pslideToSpd = 0;
    v->fromAdd = 0;
    v->vibDepth = 0;
    v->vibLfoAdd = 0;
    v->vibLfoActual = 0;
    v->tremDepth = 0;
    v->tremLfoAdd = 0;
    v->tremLfoActual = 0;
    v->savibDepth = 0;
    v->savibLfoAdd = 0;
    v->savibLfoActual = 0;
    v->retrigNumb = 0;
    v->retrigCycl = 0;
    v->retrigCount = 0;
    v->vfade = 0;
    v->vfadeStart = 0;
    v->vfadeEnd = 0;
    v->cvol = 100 * 256; /* 100% channel volume */
    v->cvolAdd = 0;
    v->destVol = 0;
    v->cvType = 0;
    v->endVol = 0;
    v->filterType = 0;
    v->filterFreq = 0;
    v->filterReso = 0;
    v->filterBuf[0] = 0;
    v->filterBuf[1] = 0;
    v->filterBuf[2] = 0;
    v->lastNote = 0;
}

void sym_reset_voices(SymSong* song) {
    for (int i = 0; i < SYM_MAX_CHANNELS; i++) {
        voice_reset(&song->voices[i]);
    }
}

/* ---- Start sample (matches ASM StartSample) ---- */

static void start_sample(SymSong* song, SymVoice* v, SymInstrument* inst,
                          int32_t freq, uint8_t vol) {
    if (inst->type < 0) return; /* KILL or SILENT */

    /* Apply finetune to frequency */
    if (inst->finetune != 0) {
        int32_t ft = inst->finetune;
        if (ft > 0) {
            int32_t adj = (int32_t)(((int64_t)freq * ft) / 0x800);
            freq += adj;
        } else {
            ft = -ft;
            int32_t adj = (int32_t)(((int64_t)freq * ft) / 0x800);
            freq -= adj;
        }
    }

    /* Handle special volume commands on note trigger */
    if (vol == SYM_VCMD_SETPITCH) {
        v->pitchSlide = 0;
        v->freq = freq;
        return;
    }
    if (vol == SYM_VCMD_PITCHUP) {
        int32_t delta = v->freq >> SYM_PITCHFX_SHIFT;
        v->freq += delta;
        vol = SYM_VOLUME_MAX;
    } else if (vol == SYM_VCMD_PITCHDOWN) {
        int32_t delta = v->freq >> SYM_PITCHFX_SHIFT;
        v->freq -= delta;
        vol = SYM_VOLUME_MAX;
    } else if (vol >= SYM_VCMD_PITCHDOWN3 && vol <= SYM_VCMD_PITCHUP3) {
        /* Other pitch commands on trigger — treat as normal */
        vol = SYM_VOLUME_MAX;
    }

    /* Set instrument */
    v->instrument = inst;
    v->instrType = inst->type;

    /* Set sample pointers */
    v->samplePtr = inst->sampleData;
    v->retrigPtr = inst->sampleData;
    v->sampleStartPtr = inst->sampleData;
    v->sampleEndPtr = inst->sampleData + inst->numSamples;

    v->endReached = 0;

    /* Declick: if voice was already in use, crossfade */
    if (v->status == 1) {
        v->declick = -1;
    } else {
        v->declick = 0;
    }

    /* Clear slide effects */
    v->volSlide = 0;
    v->pitchSlide = 0;
    v->hiOffset = 0;
    v->freq = freq;
    v->volume = (int16_t)vol * 256;
    v->status = 1; /* INUSE */

    /* Set up loop/sustain */
    if (inst->type == SYM_INSTRTYPE_LOOP) {
        v->loopStartPtr = inst->sampleData + inst->loopStart;
        v->loopEndPtr = inst->sampleData + inst->loopEnd;
        v->sampleEndPtr = v->loopEndPtr; /* loop end IS the sample end */
    } else if (inst->type == SYM_INSTRTYPE_SUST) {
        v->loopStartPtr = inst->sampleData + inst->loopStart;
        v->loopEndPtr = inst->sampleData + inst->loopEnd;
        v->sustStartPtr = inst->sampleData + inst->sustStart;
        v->sustEndPtr = inst->sampleData + inst->sustEnd;
        v->loopNumb = inst->loopNumb;
        v->sampleEndPtr = v->loopEndPtr;
    }
}

/* ---- Effect handlers ---- */

static void fx_volume_slide_up(SymVoice* v, uint8_t param) {
    v->volSlide = (int16_t)param << SYM_VOLUMESLIDE_LN;
}

static void fx_volume_slide_down(SymVoice* v, uint8_t param) {
    v->volSlide = -((int16_t)param << SYM_VOLUMESLIDE_LN);
}

static void fx_pitch_slide_up(SymVoice* v, uint8_t param) {
    v->pitchSlide = (int16_t)param;
}

static void fx_pitch_slide_down(SymVoice* v, uint8_t param) {
    v->pitchSlide = -(int16_t)param;
}

static void fx_set_speed(SymSong* song, uint8_t param) {
    if (param > 0) {
        song->speed = param;
    }
}

static void fx_add_pitch(SymVoice* v, uint8_t param) {
    int32_t delta = (v->freq >> SYM_FXADDPITCH_LN) * (int8_t)param;
    v->freq += delta;
}

static void fx_add_volume(SymVoice* v, uint8_t param) {
    int16_t delta = (int8_t)param << SYM_FXADDVOL_LN;
    int16_t newVol = v->volume + delta;
    if (newVol < SYM_VOLUME_MIN * 256) newVol = SYM_VOLUME_MIN * 256;
    if (newVol > SYM_VOLUME_MAX * 256) newVol = SYM_VOLUME_MAX * 256;
    v->volume = newVol;
}

static void fx_vibrato(SymVoice* v, uint8_t vol, uint8_t instr) {
    /* Vibrato = volume LFO in Symphonie */
    v->vibDepth = vol;
    v->vibLfoAdd = instr;
    if (vol == 0 && instr == 0) {
        v->vibLfoActual = 0;
    }
}

static void fx_tremolo(SymVoice* v, uint8_t vol, uint8_t instr) {
    /* Tremolo = pitch LFO in Symphonie */
    v->tremDepth = vol;
    v->tremLfoAdd = instr;
    if (vol == 0 && instr == 0) {
        v->tremLfoActual = 0;
    }
}

static void fx_sample_vib(SymVoice* v, uint8_t vol, uint8_t instr) {
    v->savibDepth = vol;
    v->savibLfoAdd = instr;
    if (vol == 0 && instr == 0) {
        v->savibLfoActual = 0;
        v->savibDepth = 0;
    }
}

static void fx_portamento(SymSong* song, SymVoice* v, const SymNote* note) {
    /* Save current frequency, compute target from note pitch */
    int32_t oldFreq = v->freq;
    if (note->pitch != 0xFF && v->instrument) {
        int pitch = note->pitch + v->instrument->tune;
        float targetHz = get_pitch_to_freq(song, pitch, v->instrument->finetune);
        /* Convert Hz to fixed-point freq increment for mixing */
        if (v->instrument->sampledFreq > 0) {
            v->destFreq = (int32_t)(targetHz / v->instrument->sampledFreq * 65536.0f);
        }
    }
    v->freq = oldFreq;
    v->pslideToSpd = note->volume;
    if (v->pslideToSpd == 0) v->destFreq = 0;
}

static void fx_retrigger(SymVoice* v, uint8_t vol, uint8_t instr) {
    v->retrigCycl = instr + 1;
    v->retrigCount = instr + 1;
    v->retrigNumb = vol + 1;
}

static void fx_emphasis(SymVoice* v, uint8_t pitch, uint8_t vol, uint8_t instr) {
    v->vfade = vol;
    v->vfadeStart = instr;
    v->vfadeEnd = pitch;
}

static void fx_add_halftone(SymSong* song, SymVoice* v, uint8_t param) {
    /* Get the last note's pitch and add semitones */
    uint8_t lastPitch = (v->lastNote >> 16) & 0xFF;
    int newPitch = lastPitch + (int8_t)param;
    if (newPitch < 0) newPitch = 0;
    if (newPitch > SYM_NOTEPITCH_MAX) newPitch = SYM_NOTEPITCH_MAX;

    if (v->instrument) {
        int pitch = newPitch + v->instrument->tune;
        float hz = get_pitch_to_freq(song, pitch, v->instrument->finetune);
        if (v->instrument->sampledFreq > 0) {
            v->freq = (int32_t)(hz / v->instrument->sampledFreq * 65536.0f);
        }
    }
}

static void fx_channel_volume(SymVoice* v, uint8_t pitch, uint8_t vol, uint8_t instr) {
    if (pitch == 0) {
        /* Set channel volume */
        v->cvol = (int16_t)(int8_t)vol * 256;
        v->cvolAdd = 0;
        v->cvType = 0;
    } else if (pitch == 4) {
        /* Stereo panning: vol=amplitude, instr=pan (0..128..255) */
        v->cvol = (int16_t)(int8_t)vol * 256;
        v->cvolAdd = 0;
        v->cvType = 0;
        /* Panning is applied at mix time via the L/R channel pair */
    }
}

static void fx_channel_volume_add(SymVoice* v, uint8_t vol) {
    v->cvolAdd = (int16_t)(int8_t)vol;
}

static void fx_set_fromadd(SymVoice* v, uint8_t vol) {
    if (vol == 0) {
        v->fromAdd = 0;
    } else {
        int32_t sampleLen = (int32_t)(v->sampleEndPtr - v->sampleStartPtr);
        v->fromAdd = (sampleLen * vol) >> 8;
    }
}

static void fx_fromadd(SymVoice* v, uint8_t vol) {
    int32_t sampleLen = (int32_t)(v->sampleEndPtr - v->sampleStartPtr);
    int32_t delta = (sampleLen * (int8_t)vol) >> SYM_FROMADDSTEP_LN;
    v->fromAdd += delta;
}

static void fx_replay_from(SymVoice* v, uint8_t vol) {
    if (!v->sampleStartPtr || !v->sampleEndPtr) return;

    int32_t sampleLen = (int32_t)(v->sampleEndPtr - v->sampleStartPtr);
    int32_t startPos = vol;

    /* Apply sample vibrato modulation */
    if (v->savibDepth > 0) {
        int tableIdx = (v->savibLfoActual >> 1) & 0xFF;
        int16_t lfoVal = s_sineTable[tableIdx];
        int32_t modulated = ((lfoVal + 0x7F) * v->savibDepth) >> 8;
        modulated = (modulated * startPos) >> 8;
        startPos -= modulated;
        if (startPos < 0) startPos = 0;
    }

    /* Compute pointer from percentage (0-255) */
    int32_t offset = (sampleLen >> 8) * startPos;

    /* Apply fromAdd */
    if (v->fromAdd != 0) {
        offset += v->fromAdd;
        if (offset < 0) {
            v->fromAdd = 0;
            offset = 0;
        }
    }

    v->samplePtr = v->sampleStartPtr + offset;
    v->retrigPtr = v->samplePtr;
    v->endReached = 0;
    v->status = 1;
    v->declick = -1;
    v->hiOffset = 0;
}

static void fx_filter(SymVoice* v, uint8_t pitch, uint8_t vol, uint8_t instr) {
    if (pitch >= 5) {
        /* Global filter — not per-channel, skip for now */
        return;
    }

    /* Per-channel filter */
    if (vol == 0 && instr == 0) {
        v->filterType = SYM_FILTER_OFF;
        v->filterBuf[0] = 0;
        v->filterBuf[1] = 0;
        v->filterBuf[2] = 0;
        return;
    }

    v->filterFreq = vol;
    if (v->filterFreq > SYM_FILTER_MAXFREQ) v->filterFreq = SYM_FILTER_MAXFREQ;
    v->filterReso = instr;
    if (v->filterReso > SYM_FILTER_MAXRESO) v->filterReso = SYM_FILTER_MAXRESO;
    v->filterType = (pitch < 4) ? pitch : SYM_FILTER_LP;
    if (v->filterType == 0) v->filterType = SYM_FILTER_LP;
}

static void fx_dsp_echo(SymSong* song, uint8_t pitch, uint8_t vol, uint8_t instr) {
    if (pitch == 0) {
        dsp_stop(&song->dsp);
        return;
    }
    song->dsp.intensity = (float)instr / 127.0f;
    dsp_set_fx_class(&song->dsp, pitch);
    if (vol > 0) {
        int32_t maxLen = song->dsp.fxLength - 2;
        int32_t delay = (maxLen * vol) / 100;
        if (delay > 0) {
            song->dsp.readPtrDelay = delay;
            dsp_start(&song->dsp);
        }
    }
    dsp_start(&song->dsp);
}

/* ---- Note processing (matches ASM PlayLineNote) ---- */

static void play_line_note(SymSong* song, int channel, const SymNote* note) {
    SymVoice* v = get_voice(song, channel);
    if (!v) return;

    /* Empty note check */
    if (note->fx == 0 && note->pitch == 0xFF && note->volume == 0 && note->instr == 0) {
        return;
    }

    /* Complex FX dispatch */
    if (note->fx >= 1) {
        /* Get voice for effects that need it */
        switch (note->fx) {
            case SYM_FX_VSLIDE_UP:
                fx_volume_slide_up(v, note->volume);
                return;
            case SYM_FX_VSLIDE_DOWN:
                fx_volume_slide_down(v, note->volume);
                return;
            case SYM_FX_PSLIDE_UP:
                fx_pitch_slide_up(v, note->volume);
                return;
            case SYM_FX_PSLIDE_DOWN:
                fx_pitch_slide_down(v, note->volume);
                return;
            case SYM_FX_REPLAY_FROM:
                fx_replay_from(v, note->volume);
                return;
            case SYM_FX_FROM_AND_PITCH:
                /* Set pitch, then replay from position */
                if (note->pitch != 0xFF && note->instr < song->numInstruments) {
                    SymInstrument* inst = &song->instruments[note->instr];
                    int pitch = note->pitch + inst->tune + song->patternTune;
                    float hz = get_pitch_to_freq(song, pitch, inst->finetune);
                    if (inst->sampledFreq > 0) {
                        v->freq = (int32_t)(hz / inst->sampledFreq * 65536.0f);
                    }
                }
                fx_replay_from(v, note->volume);
                return;
            case SYM_FX_SET_FROMADD:
                fx_set_fromadd(v, note->volume);
                return;
            case SYM_FX_FROMADD:
                fx_fromadd(v, note->volume);
                return;
            case SYM_FX_SET_SPEED:
                fx_set_speed(song, note->volume);
                return;
            case SYM_FX_ADD_PITCH:
                fx_add_pitch(v, note->volume);
                return;
            case SYM_FX_ADD_VOLUME:
                fx_add_volume(v, note->volume);
                return;
            case SYM_FX_VIBRATO:
                fx_vibrato(v, note->volume, note->instr);
                return;
            case SYM_FX_TREMOLO:
                fx_tremolo(v, note->volume, note->instr);
                return;
            case SYM_FX_SAMPLE_VIB:
                fx_sample_vib(v, note->volume, note->instr);
                return;
            case SYM_FX_PSLIDE_TO:
                fx_portamento(song, v, note);
                return;
            case SYM_FX_RETRIG:
                fx_retrigger(v, note->volume, note->instr);
                return;
            case SYM_FX_EMPHASIS:
                fx_emphasis(v, note->pitch, note->volume, note->instr);
                return;
            case SYM_FX_ADD_HALFTONE:
                fx_add_halftone(song, v, note->volume);
                return;
            case SYM_FX_CV:
                fx_channel_volume(v, note->pitch, note->volume, note->instr);
                return;
            case SYM_FX_CV_ADD:
                fx_channel_volume_add(v, note->volume);
                return;
            case SYM_FX_FILTER:
                fx_filter(v, note->pitch, note->volume, note->instr);
                return;
            case SYM_FX_DSP_ECHO:
            case SYM_FX_DSP_DELAY:
                fx_dsp_echo(song, note->pitch, note->volume, note->instr);
                return;
            default:
                return;
        }
    }

    /* No note — handle volume change */
    if (note->pitch == 0xFF) {
        uint8_t vol = note->volume;
        if (vol == 0) return;

        if (vol > SYM_VOLUME_COMMAND) {
            /* Volume command */
            switch (vol) {
                case SYM_VCMD_STOPSAMPLE:
                    if (v->instrument) {
                        /* Clear instrument sample position */
                    }
                    v->status = 0; /* PENDING */
                    v->fadeout = -1;
                    break;
                case SYM_VCMD_CONTSAMPLE:
                    if (!v->endReached) {
                        v->status = 1; /* INUSE */
                        v->declick = -1;
                    }
                    break;
                case SYM_VCMD_KEYOFF:
                    if (v->instrType == SYM_INSTRTYPE_SUST) {
                        v->samplePtr = v->sustStartPtr;
                        v->sampleEndPtr = v->sustEndPtr;
                        v->loopNumb = -1; /* no more sustain loops */
                        v->declick = -1;
                    }
                    break;
                case SYM_VCMD_SPEEDUP:
                    song->speed++;
                    break;
                case SYM_VCMD_SPEEDDOWN:
                    if (song->speed > 1) song->speed--;
                    break;
                case SYM_VCMD_PITCHUP:
                    { int32_t d = v->freq >> SYM_PITCHFX_SHIFT; v->freq += d; }
                    break;
                case SYM_VCMD_PITCHDOWN:
                    { int32_t d = v->freq >> SYM_PITCHFX_SHIFT; v->freq -= d; }
                    break;
                case SYM_VCMD_PITCHUP2:
                    { int32_t d = v->freq >> (SYM_PITCHFX_SHIFT - 1); v->freq += d; }
                    break;
                case SYM_VCMD_PITCHDOWN2:
                    { int32_t d = v->freq >> (SYM_PITCHFX_SHIFT - 1); v->freq -= d; }
                    break;
                case SYM_VCMD_PITCHUP3:
                    { int32_t d = v->freq >> (SYM_PITCHFX_SHIFT - 2); v->freq += d; }
                    break;
                case SYM_VCMD_PITCHDOWN3:
                    { int32_t d = v->freq >> (SYM_PITCHFX_SHIFT - 2); v->freq -= d; }
                    break;
                default:
                    break;
            }
        } else {
            /* Direct volume set */
            v->volume = vol * 256;
            v->declick = -1;
        }
        return;
    }

    /* Note with instrument — start sample */
    if (note->instr < song->numInstruments) {
        SymInstrument* inst = &song->instruments[note->instr];

        int pitch = note->pitch + inst->tune;

        /* Apply position transpose (unless DODETUNE flag) */
        if (song->patternTune != 0 && !(inst->playFlags & SYM_PFLAG_DODETUNE)) {
            pitch += song->patternTune;
        }

        float hz = get_pitch_to_freq(song, pitch, inst->finetune);
        int32_t freq = 0;
        if (inst->sampledFreq > 0) {
            freq = (int32_t)(hz / inst->sampledFreq * 65536.0f);
        }

        /* Store last note data */
        v->lastNote = ((uint32_t)note->fx << 24) | ((uint32_t)note->pitch << 16) |
                      ((uint32_t)note->volume << 8) | note->instr;
        v->destFreq = 0;

        uint8_t vol = note->volume;
        if (vol == 0) vol = SYM_VOLUME_MAX;

        start_sample(song, v, inst, freq, vol);
    }
}

/* ---- Song traversal (matches ASM PlaySong / PlaySongData) ---- */

static void play_stereo_pat_line(SymSong* song) {
    int seqIdx = song->seqIdx;
    if (seqIdx < 0 || seqIdx >= song->numSequences) return;

    SymSequence* seq = &song->sequences[seqIdx];
    int posOff = seq->startPos + song->posIdx;
    if (posOff < 0 || posOff >= song->numPositions) return;

    SymPosition* pos = &song->positions[posOff];
    int patIdx = pos->patternIdx;
    if (patIdx < 0 || patIdx >= song->numPatterns) return;

    SymPattern* pat = &song->patterns[patIdx];
    if (!pat->data) return;

    int row = song->rowIdx;
    if (row < 0 || row >= pat->numRows) return;

    /* Process channels in stereo pairs: L, R, L, R, ... */
    int numPairs = song->numChannels / 2;
    if (numPairs < 1) numPairs = 1;

    for (int pair = 0; pair < numPairs; pair++) {
        int lCh = pair * 2;
        int rCh = pair * 2 + 1;

        /* Each pair reads one note from the pattern data */
        int noteIdx = row * numPairs + pair;
        if (noteIdx >= pat->numRows * numPairs) break;

        const SymNote* note = &pat->data[noteIdx];

        /* Play note into left channel */
        play_line_note(song, lCh, note);

        /* Play same note into right channel (stereo pair) */
        play_line_note(song, rCh, note);
    }
}

static void advance_position(SymSong* song) {
    int seqIdx = song->seqIdx;
    if (seqIdx < 0 || seqIdx >= song->numSequences) {
        song->finished = 1;
        return;
    }

    SymSequence* seq = &song->sequences[seqIdx];
    int posOff = seq->startPos + song->posIdx;
    if (posOff < 0 || posOff >= song->numPositions) {
        song->finished = 1;
        return;
    }

    SymPosition* pos = &song->positions[posOff];

    /* Advance row */
    song->rowIdx++;
    if (song->rowIdx >= pos->length) {
        song->rowIdx = 0;

        /* Handle position looping */
        pos->loopCount--;
        if (pos->loopCount > 0) {
            /* Still looping this position */
            return;
        }

        /* Move to next position */
        song->posIdx++;
        song->seqCount--;

        if (song->seqCount <= 0) {
            /* End of sequence — move to next */
            song->seqCounter--;
            if (song->seqCounter <= 0) {
                /* Advance to next sequence */
                song->seqIdx++;
                if (song->seqIdx >= song->numSequences) {
                    /* End of song — loop to first sequence */
                    song->seqIdx = 0;
                }

                SymSequence* newSeq = &song->sequences[song->seqIdx];
                while (song->seqIdx < song->numSequences) {
                    if (newSeq->info == -1) {
                        /* End marker — loop song */
                        song->seqIdx = 0;
                        newSeq = &song->sequences[0];
                        break;
                    }
                    if (newSeq->info == 1 || newSeq->loop == 0) {
                        /* Skip */
                        song->seqIdx++;
                        if (song->seqIdx >= song->numSequences) {
                            song->seqIdx = 0;
                            break;
                        }
                        newSeq = &song->sequences[song->seqIdx];
                        continue;
                    }
                    break;
                }

                newSeq = &song->sequences[song->seqIdx];
                song->seqCounter = newSeq->loop;
            }

            /* Re-init sequence */
            SymSequence* curSeq = &song->sequences[song->seqIdx];
            song->posIdx = 0;
            song->seqCount = curSeq->length;
            song->seqTune = curSeq->tune;
        }

        /* Init new position */
        int newPosOff = song->sequences[song->seqIdx].startPos + song->posIdx;
        if (newPosOff >= 0 && newPosOff < song->numPositions) {
            SymPosition* newPos = &song->positions[newPosOff];
            song->speed = newPos->speed;
            song->patternTune = newPos->tune + song->seqTune;
            newPos->loopCount = newPos->loopNumb;
        }
    }
}

static void play_song_tick(SymSong* song) {
    if (!song->playing) return;

    song->speedCount--;
    if (song->speedCount <= 0) {
        song->speedCount = song->speed;

        /* Play one row of pattern data */
        play_stereo_pat_line(song);

        /* Advance to next row/position/sequence */
        advance_position(song);
    }
}

/* ---- Per-channel resonant filter (state-variable, matches ASM) ---- */

static float apply_channel_filter(SymVoice* v, float input) {
    if (v->filterType == SYM_FILTER_OFF) return input;

    int32_t inp = (int32_t)(input * 32768.0f);
    int32_t low = v->filterBuf[0];
    int32_t band = v->filterBuf[1];
    int32_t freq = v->filterFreq;
    int32_t reso = v->filterReso;

    /* State-variable filter (from ASM) */
    int32_t high = inp - low;

    int32_t d6 = (freq * high) >> 8;
    band += d6;

    d6 = (freq * band) >> 6;  /* note: >>6 not >>8 */
    low += d6;

    if (reso > 0) {
        d6 = (reso * low) >> 6;
        low += d6;
    }

    low >>= 2;

    v->filterBuf[0] = low;
    v->filterBuf[1] = band;

    float result;
    switch (v->filterType) {
        case SYM_FILTER_LP:
            result = (float)low / 32768.0f;
            break;
        case SYM_FILTER_HP:
            result = (float)high / 32768.0f;
            break;
        case SYM_FILTER_BP:
            result = (float)(inp - high - low) / 32768.0f;
            break;
        default:
            result = input;
            break;
    }
    return result;
}

/* ---- Per-sample voice rendering (matches ASM CopySample) ---- */

static float render_voice_sample(SymSong* song, SymVoice* v) {
    if (v->status == 0 && !v->fadeout) return 0.0f;
    if (v->endReached && !v->fadeout) return 0.0f;
    if (!v->instrument || !v->samplePtr) return 0.0f;

    /* Retrigger check */
    if (v->retrigNumb > 0) {
        v->retrigCount--;
        if (v->retrigCount <= 0 && v->retrigNumb > 1) {
            v->retrigNumb--;
            v->retrigCount = v->retrigCycl;
            v->samplePtr = v->retrigPtr;
            v->endReached = 0;
            v->status = 1;
            v->declick = 0;
            v->hiOffset = 0;
        }
    }

    /* Fadeout handling (PENDING + fadeout flag) */
    if (v->status == 0 && v->fadeout) {
        v->fadeout = 0;
        /* Quick fade of last sample value to zero */
        float sample = (float)v->lastSample / 32768.0f;
        v->lastSample = 0;
        return sample * 0.5f; /* fast decay */
    }

    /* Volume slide (continuous per-frame) */
    int16_t vol = v->volume;
    if (v->volSlide != 0) {
        vol += v->volSlide;
        if (vol < 0) { vol = 0; v->volSlide = 0; }
        if (vol >= (SYM_VOLUME_MAX + 1) * 256) { vol = SYM_VOLUME_MAX * 256; v->volSlide = 0; }
        v->volume = vol;
    }

    /* VFade / Emphasis */
    if (v->vfade != 0 && v->sampleStartPtr && v->sampleEndPtr) {
        int32_t sampleLen = (int32_t)(v->sampleEndPtr - v->sampleStartPtr);
        if (sampleLen > 0) {
            int32_t pos = (int32_t)(v->sampleEndPtr - v->samplePtr);
            if (pos < 0) pos = 0;
            int32_t fadeRange = v->vfadeEnd - v->vfadeStart;
            int32_t progress = (fadeRange * pos) / sampleLen + 1;

            switch (v->vfade) {
                case 1: /* linear */ break;
                case 2: progress = 100 - progress; break;
                case 3: /* triangle */
                    if (progress > 50) progress = 200 - 2 * progress;
                    else progress *= 2;
                    break;
            }

            vol = (int16_t)((progress + v->vfadeStart) * 256);
            if (vol > SYM_VOLUME_MAX * 256) vol = SYM_VOLUME_MAX * 256;
            if (vol < 0) vol = 0;
        }
    }

    /* Vibrato = volume modulation in Symphonie */
    if (v->vibDepth > 0) {
        v->vibLfoActual = (v->vibLfoActual + v->vibLfoAdd) & 0x1FF;
        int tableIdx = (v->vibLfoActual >> 1) & 0xFF;
        int16_t lfoVal = s_sineTable[tableIdx];

        int32_t modVol = ((int32_t)vol * lfoVal) / 0x7F;
        int32_t depth = (v->vibDepth / 2) + 1;
        int32_t dryMix = 255 - depth;

        int32_t result = ((int32_t)vol * dryMix >> 8) + (modVol * depth >> 8);
        if (result > SYM_VOLUME_MAX * 256) result = SYM_VOLUME_MAX * 256;
        if (result < 0) result = 0;
        vol = (int16_t)result;
    }

    /* Convert volume from 8.8 to 0-100 byte */
    int volByte = vol >> 8;

    /* Pitch slide */
    int32_t freq = v->freq;
    if (v->pitchSlide != 0) {
        int32_t delta = (freq >> 8) * v->pitchSlide;
        delta >>= SYM_PITCHSLIDE_LN;
        freq -= delta; /* positive pitchSlide = pitch up */
        v->freq = freq;
    }

    /* Portamento slide to */
    if (v->destFreq != 0) {
        int32_t diff = v->destFreq - freq;
        if (diff == 0) {
            v->destFreq = 0;
        } else if (v->pslideToSpd > 0) {
            int32_t step = (diff + 1) / v->pslideToSpd;
            freq += step;
            v->freq = freq;
        }
    }

    /* Tremolo = pitch modulation in Symphonie */
    if (v->tremDepth > 0) {
        v->tremLfoActual = (v->tremLfoActual + v->tremLfoAdd) & 0x1FF;
        int tableIdx = (v->tremLfoActual >> 1) & 0xFF;
        int16_t lfoVal = s_sineTable[tableIdx];

        int32_t halfFreq = freq >> 1;
        int32_t modulation = ((int64_t)halfFreq * lfoVal) / 0x80;
        modulation = (modulation * v->tremDepth) / 100;
        freq += (int32_t)modulation;
    }

    /* Sample vibrato — advance phase (actual modulation applied in ReplayFrom) */
    if (v->savibDepth > 0) {
        v->savibLfoActual = (v->savibLfoActual + v->savibLfoAdd) & 0x3FF;
    }

    /* Channel volume (CV) processing */
    if (v->cvolAdd != 0) {
        v->cvol += v->cvolAdd;
        if (v->cvType != 0) {
            /* Sliding to destination */
            int32_t diff = v->destVol - v->cvol;
            if ((v->cvolAdd > 0 && diff <= 0) || (v->cvolAdd < 0 && diff >= 0)) {
                v->cvType = 0;
                v->cvolAdd = 0;
                v->cvol = v->destVol;
            }
        } else {
            if (v->cvol < -100 * 256) v->cvol = -100 * 256;
            if (v->cvol > 100 * 256) v->cvol = 100 * 256;
        }
    }

    /* Apply CV to volume */
    if (v->cvol != 100 * 256) {
        volByte = (volByte * v->cvol) / (100 * 256);
    }

    if (volByte > SYM_VOLUME_MAX) volByte = SYM_VOLUME_MAX;
    if (volByte < -SYM_VOLUME_MAX) volByte = -SYM_VOLUME_MAX;

    v->endVol = (int8_t)volByte;

    /* Volume scaling: convert 0-100 to multiplier */
    float volScale = (float)volByte / 100.0f;

    /* ---- Main sample rendering ---- */
    int16_t* curPtr = v->samplePtr;
    if (!curPtr || v->endReached) return 0.0f;

    /* Read current sample (16-bit) */
    float sample = (float)(*curPtr) / 32768.0f;

    /* Apply volume */
    sample *= volScale;

    /* Apply instrument volume */
    if (v->instrument) {
        sample *= (float)v->instrument->volume / 100.0f;
    }

    /* Declick crossfade */
    if (v->declick) {
        /* Crossfade from lastSample to current over FADETO_STEPS */
        float lastSmp = (float)v->lastSample / 32768.0f;
        sample = lastSmp * 0.5f + sample * 0.5f; /* simplified crossfade */
        v->declick = 0;
    }

    v->lastSample = (int16_t)(sample * 32768.0f);

    /* Advance sample position (fixed-point) */
    v->hiOffset += (uint32_t)freq;
    int32_t advance = (int32_t)(v->hiOffset >> 16);
    v->hiOffset &= 0xFFFF;
    v->samplePtr += advance;

    /* End of sample / loop handling */
    if (v->samplePtr >= v->sampleEndPtr) {
        if (v->instrType == SYM_INSTRTYPE_LOOP) {
            /* Wrap to loop start */
            v->samplePtr = v->loopStartPtr;
            v->sampleEndPtr = v->loopEndPtr;
        } else if (v->instrType == SYM_INSTRTYPE_SUST) {
            if (v->loopNumb >= 0) {
                v->loopNumb--;
                if (v->loopNumb < 0) {
                    /* Sustain release */
                    v->samplePtr = v->sustStartPtr;
                    v->sampleEndPtr = v->sustEndPtr;
                } else {
                    /* Loop back */
                    v->samplePtr = v->loopStartPtr;
                    v->sampleEndPtr = v->loopEndPtr;
                }
            } else {
                /* No more loops — end */
                v->endReached = 1;
                v->status = 0;
                return sample;
            }
        } else {
            /* No loop — end of sample */
            v->endReached = 1;
            v->status = 0;
            return sample;
        }
    }

    /* Apply per-channel filter */
    sample = apply_channel_filter(v, sample);

    /* Add to DSP ring buffer (unless NoDsp) */
    if (v->instrument && !(v->instrument->playFlags & SYM_PFLAG_NODSP)) {
        dsp_add_sample(&song->dsp, sample);
    }

    return sample;
}

/* ---- Main render function ---- */

int sym_render(SymSong* song, float* buffer, int frames) {
    if (!song->playing) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return 0;
    }

    int numPairs = song->numChannels / 2;
    if (numPairs < 1) numPairs = 1;

    /* Scale mix by number of channel pairs to prevent clipping.
     * Symphonie Pro is a software mixer — all virtual channels sum to stereo.
     * Without scaling, N pairs at full volume can reach N.0 before clamp. */
    float mixScale = 1.0f / (float)numPairs;

    for (int i = 0; i < frames; i++) {
        /* Tick the sequencer */
        song->tickAccum += 1.0f;
        while (song->tickAccum >= song->samplesPerTick) {
            song->tickAccum -= song->samplesPerTick;
            play_song_tick(song);
        }

        if (song->finished) {
            buffer[i * 2] = 0.0f;
            buffer[i * 2 + 1] = 0.0f;
            continue;
        }

        /* Mix all channels */
        float mixL = 0.0f;
        float mixR = 0.0f;

        for (int pair = 0; pair < numPairs; pair++) {
            int lCh = pair * 2;
            int rCh = pair * 2 + 1;

            float smpL = render_voice_sample(song, &song->voices[lCh]);
            float smpR = render_voice_sample(song, &song->voices[rCh]);

            mixL += smpL;
            mixR += smpR;
        }

        /* Scale by channel count */
        mixL *= mixScale;
        mixR *= mixScale;

        /* DSP wet mix */
        dsp_advance_write(&song->dsp);
        float wetL = dsp_get_wet(&song->dsp);
        dsp_advance_read(&song->dsp);
        dsp_advance_write(&song->dsp);
        float wetR = dsp_get_wet(&song->dsp);
        dsp_advance_read(&song->dsp);

        mixL += wetL;
        mixR += wetR;

        /* Master volume */
        float masterVol = (float)song->masterVolume / 100.0f;
        mixL *= masterVol;
        mixR *= masterVol;

        /* Master balance */
        if (song->balance != 50) {
            if (song->balance < 50) {
                float rightScale = (float)song->balance / 50.0f;
                mixR *= rightScale;
            } else {
                float leftScale = (float)(100 - song->balance) / 50.0f;
                mixL *= leftScale;
            }
        }

        /* Clamp output */
        buffer[i * 2]     = clampf(mixL, -1.0f, 1.0f);
        buffer[i * 2 + 1] = clampf(mixR, -1.0f, 1.0f);
    }

    return frames;
}

/* ---- Init / Play / Stop ---- */

void sym_init(SymSong* song) {
    memset(song, 0, sizeof(SymSong));
    song->masterVolume = 100;
    song->balance = 50;
    song->outputRate = 44100.0f;
    song->speed = 6;
    song->speedCount = 1;
    dsp_init(&song->dsp);
}

void sym_play(SymSong* song) {
    sym_reset_voices(song);
    sym_build_freq_table(song);

    /* Find first playable sequence */
    song->seqIdx = 0;
    while (song->seqIdx < song->numSequences) {
        SymSequence* seq = &song->sequences[song->seqIdx];
        if (seq->info == -1) {
            /* End marker at start — loop back */
            song->seqIdx = 0;
            break;
        }
        if (seq->info != 1 && seq->loop > 0) break; /* playable */
        song->seqIdx++;
    }
    if (song->seqIdx >= song->numSequences) {
        song->finished = 1;
        return;
    }

    SymSequence* seq = &song->sequences[song->seqIdx];
    song->posIdx = 0;
    song->rowIdx = 0;
    song->seqCount = seq->length;
    song->seqCounter = seq->loop;
    song->seqTune = seq->tune;
    song->speedCount = 1; /* fire immediately on first tick */

    /* Init first position */
    int posOff = seq->startPos;
    if (posOff >= 0 && posOff < song->numPositions) {
        SymPosition* pos = &song->positions[posOff];
        song->speed = pos->speed > 0 ? pos->speed : 6;
        song->patternTune = pos->tune + song->seqTune;
        pos->loopCount = pos->loopNumb;
    }

    /* Calculate timing */
    song->samplesPerTick = song->outputRate / 50.0f; /* 50 Hz base tick rate */
    song->tickAccum = 0.0f;

    song->playing = 1;
    song->finished = 0;
}

void sym_stop(SymSong* song) {
    song->playing = 0;
    sym_reset_voices(song);
}

void sym_get_position(const SymSong* song, int* seqIdx, int* posIdx, int* rowIdx) {
    if (seqIdx) *seqIdx = song->seqIdx;
    if (posIdx) *posIdx = song->posIdx;
    if (rowIdx) *rowIdx = song->rowIdx;
}

void sym_set_position(SymSong* song, int seqIdx, int posIdx, int rowIdx) {
    if (seqIdx >= 0 && seqIdx < song->numSequences) {
        song->seqIdx = seqIdx;
        SymSequence* seq = &song->sequences[seqIdx];
        song->seqCount = seq->length - posIdx;
        song->seqCounter = seq->loop;
        song->seqTune = seq->tune;
    }
    song->posIdx = posIdx;
    song->rowIdx = rowIdx;
    song->speedCount = 1;
}
