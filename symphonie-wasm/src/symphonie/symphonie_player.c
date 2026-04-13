/**
 * symphonie_player.c — Symphonie Pro replayer (C port from 68k ASM v3.3d)
 *
 * Rewritten 1:1 from: Symphonie Source.Assembler (Patrick Meng, Oct 2000)
 *
 * Architecture: Software mixer with N channels → stereo float output.
 * No Paula emulation — Symphonie is its own mixer.
 *
 * NAMING CONVENTION: In Symphonie's ASM source, "vibrato" modulates VOLUME
 * and "tremolo" modulates PITCH. This is backwards from standard music
 * terminology. The C code preserves the original naming.
 *
 * Key ASM reference line numbers:
 *   BuildFreqList:      35070-35114
 *   GetNoteFreq:        35045-35066
 *   PlaySong:           32302-32318
 *   PlaySongData:       32322-32398
 *   PlaySongPattern:    32401-32440
 *   PlayStereoPatLine:  32444-32478
 *   PlayLineNote:       32517-32732
 *   ComplexFX handlers: 32735-33500
 *   StartSample:        39425-39514
 *   CopySample:         38214-38590
 *   ProcessCV:          38594-38641
 *   CopyVoiceBuffer:    36043-36161
 */

#include "symphonie_player.h"
/* math.h not needed — no floating-point math functions used */
#include <string.h>

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

/* ASM Gleichschwebend (equal-tempered) base frequencies, ×10000 (line 41515) */
static const uint16_t s_equalTempBase[12] = {
    10000, 10595, 11225, 11892, 12599, 13348,
    14142, 14983, 15874, 16818, 17818, 18878
};


/* ---- Internal helpers ---- */

static inline float clampf(float v, float lo, float hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static inline SymVoice* get_voice(SymSong* song, int ch) {
    if (ch < 0 || ch >= SYM_MAX_CHANNELS) return NULL;
    return &song->voices[ch];
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
    delay &= ~1;

    if (dsp->fxType == SYM_DSP_CROSSDELAY || dsp->fxType == SYM_DSP_ECHO) {
        dsp->writePtr = delay - 1;
    } else {
        dsp->writePtr = delay;
    }
    if (dsp->writePtr < 0) dsp->writePtr = 0;
    if (dsp->newFxLength > 0) dsp->running = 1;
}

static void dsp_stop(SymDSP* dsp) { dsp->running = 0; }

static void dsp_set_fx_class(SymDSP* dsp, int type) {
    dsp_stop(dsp);
    dsp->fxType = type;
    dsp->overwritePrev = 1;
    if (type == SYM_DSP_CROSSECHO || type == SYM_DSP_ECHO) dsp->overwritePrev = 0;
    dsp->bufLenSub = (type == SYM_DSP_ECHO) ? 1 : 2;
    if (type != SYM_DSP_OFF) dsp_start(dsp);
}

static void dsp_add_sample(SymDSP* dsp, float sample) {
    if (dsp->running) dsp->ringBuffer[dsp->writePtr] += sample;
}

static void dsp_advance_write(SymDSP* dsp) {
    if (dsp->running) {
        if (dsp->writePtr == 0) dsp->fxLength = dsp->newFxLength;
        dsp->writePtr = dsp_advance_ptr(dsp, dsp->writePtr);
    }
}

static float dsp_get_wet(SymDSP* dsp) {
    if (!dsp->running || dsp->fxType == SYM_DSP_OFF) return 0.0f;
    dsp->ringBuffer[dsp->readPtr] *= dsp->intensity;
    float sample = dsp->ringBuffer[dsp->readPtr];
    if (dsp->overwritePrev) dsp->ringBuffer[dsp->readPtr] = 0.0f;
    return sample * dsp->wetMix;
}

static void dsp_advance_read(SymDSP* dsp) {
    if (dsp->running) dsp->readPtr = dsp_advance_ptr(dsp, dsp->readPtr);
}


/* ---- Frequency table (ASM BuildFreqList, lines 35070-35114) ---- */

void sym_build_freq_table(SymSong* song) {
    /*
     * Replicates ASM BuildFreqList exactly:
     *   step = (base[note] * System_FreqBase) / 3500, shifted by octave.
     *
     * System_FreqBase = VexPeriod * 131 = 124 * 131 = 16244 (default quality).
     * ASM DMA rate = PAL_clock / (2 * VexPeriod).
     * VexPeriod cancels in the final pitch formula:
     *   playbackHz = step / 65536 * DMA_rate
     *              = base * 131 * PAL_clock / (3500 * 2 * 65536)
     *
     * For WASM at outputRate, scale: WASM_step = ASM_step * (DMA_rate / outputRate)
     * Since DMA_rate = PAL_clock / (2 * VexPeriod) and SFB = VexPeriod * 131:
     *   WASM_step = base * 131 * PAL_clock / (3500 * 2 * outputRate)
     *
     * Table layout: 12 octaves × 12 notes = 144 entries.
     * Octave shift starts at -2 (freq/4) and increments each octave.
     * FREQLIST_OFFSET = 12 (added to note pitch in GetNoteFreq).
     */
    float outputRate = song->outputRate;
    if (outputRate <= 0) outputRate = 44100.0f;

    const double PAL_CLOCK = 3546895.0;
    double factor = 131.0 * PAL_CLOCK / (7000.0 * (double)outputRate);

    int idx = 0;
    int octaveShift = -2; /* ASM: moveq #-2,d3 — start 2 octaves below base */

    for (int oct = 0; oct < 12 && idx < SYM_FREQ_TABLE_SIZE; oct++) {
        for (int note = 0; note < 12 && idx < SYM_FREQ_TABLE_SIZE; note++) {
            /* ASM: mulu.l base,d1:d2; divu.l #3500,d1:d2 — then shift by octave */
            double freq = (double)s_equalTempBase[note] * factor;

            if (octaveShift < 0)
                freq /= (double)(1 << (-octaveShift));
            else if (octaveShift > 0)
                freq *= (double)(1 << octaveShift);

            song->freqTable[idx] = (int32_t)(freq + 0.5);
            idx++;
        }
        octaveShift++;
    }

    /* Fill remaining entries */
    for (; idx < SYM_FREQ_TABLE_SIZE; idx++) {
        song->freqTable[idx] = song->freqTable[idx > 0 ? idx - 1 : 0];
    }
}

/* Get frequency step from note value (ASM GetNoteFreq, line 35045) */
static int32_t get_note_freq(const SymSong* song, int noteVal) {
    /* ASM: add.w FREQLIST_OFFSET(a0),d0 — FREQLIST_OFFSET = 12 (Normal_FREQDEF) */
    noteVal += 12;
    if (noteVal < 0) noteVal = 0;
    if (noteVal >= SYM_FREQ_TABLE_SIZE) noteVal = SYM_FREQ_TABLE_SIZE - 1;
    return song->freqTable[noteVal];
}


/* ---- Voice management ---- */

static void voice_reset(SymVoice* v) {
    v->samplePtr = NULL;
    v->sampleStartPtr = NULL;
    v->sampleEndPtr = NULL;
    v->retrigPtr = NULL;
    v->hiOffset = 0;
    v->freq = 0;
    v->status = 0;
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
    v->cvol = 100 * 256;
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
    v->tickVolume = 0;
    v->tickFreq = 0;
    v->tickVolFactor = 0;
    v->declickCount = 0;
}

void sym_reset_voices(SymSong* song) {
    for (int i = 0; i < SYM_MAX_CHANNELS; i++)
        voice_reset(&song->voices[i]);
}


/* ---- StartSample (ASM lines 39425-39514) ---- */

static void start_sample(SymSong* song, SymVoice* v, SymInstrument* inst,
                          int32_t freq, uint8_t vol, int doSampleDiff) {
    /* ASM: tst.w INSTR_TYPE(a4); bmi StartSample_FASTX */
    if (inst->type < 0) return;
    if (!inst->sampleData || inst->numSamples <= 0) return;

    /* Finetune (ASM lines 39434-39447): mulu.l d0,d4:d5; divu.l #$800,d4:d5 */
    if (inst->finetune != 0) {
        int32_t ft = inst->finetune;
        if (ft > 0) {
            uint64_t prod = (uint64_t)(uint32_t)freq * (uint32_t)ft;
            int32_t adj = (int32_t)(prod / 0x800);
            freq += adj;
        } else {
            ft = -ft;
            uint64_t prod = (uint64_t)(uint32_t)freq * (uint32_t)ft;
            int32_t adj = (int32_t)(prod / 0x800);
            freq -= adj;
        }
    }

    /* Volume commands on note trigger (ASM lines 39450-39543) */
    if (vol == SYM_VCMD_SETPITCH) {
        /* ASM: clr.w SAMPLE_PITCHSLIDE; move.l d0,SAMPLE_FREQUENZ */
        v->pitchSlide = 0;
        v->freq = freq;
        return;
    }

    if (vol == SYM_VCMD_PITCHUP) {
        /* ASM: lsr.l #PITCHFXSHIFT,d0; add.l d0,SAMPLE_FREQUENZ */
        uint32_t delta = (uint32_t)v->freq >> SYM_PITCHFX_SHIFT;
        v->freq += (int32_t)delta;
        vol = SYM_VOLUME_MAX;
    } else if (vol == SYM_VCMD_PITCHDOWN) {
        uint32_t delta = (uint32_t)v->freq >> SYM_PITCHFX_SHIFT;
        v->freq -= (int32_t)delta;
        vol = SYM_VOLUME_MAX;
    } else if (vol >= SYM_VCMD_PITCHDOWN3 && vol <= SYM_VCMD_PITCHUP2) {
        /* ASM: moveq #100,d3 — fall through to normal trigger */
        vol = SYM_VOLUME_MAX;
    }

    /* Catch-all: any volume > 100 not handled above → default to max.
     * Covers SPEEDUP(249), SPEEDDOWN(250), KEYOFF(251), STARTSAMPLE(252),
     * CONTSAMPLE(253), STOPSAMPLE(254), and invalid range 101-241. */
    if (vol > SYM_VOLUME_MAX) vol = SYM_VOLUME_MAX;

    /* Set instrument (ASM lines 39458-39469) */
    v->instrument = inst;
    v->instrType = inst->type;

    if (doSampleDiff && song->sampleDiff > 0) {
        /* ASM StartSampleSet_DIFFSTART: offset R channel sample start by SAMPLEDIFF.
         * sampleDiff is in sample units (module stores value, Pro doubles for 16-bit bytes;
         * our pointers are int16_t* so arithmetic is already in sample units). */
        int32_t diff = song->sampleDiff;
        int16_t* offsetPtr = inst->sampleData + diff;
        int32_t remainingSamples = inst->numSamples - diff;
        if (remainingSamples > 0) {
            v->samplePtr = offsetPtr;
            v->retrigPtr = offsetPtr;
            v->sampleStartPtr = offsetPtr;
            v->sampleEndPtr = offsetPtr + remainingSamples;
        } else {
            /* ASM BAK_DIFFSTARTERR: fallback to normal start */
            v->samplePtr = inst->sampleData;
            v->retrigPtr = inst->sampleData;
            v->sampleStartPtr = inst->sampleData;
            v->sampleEndPtr = inst->sampleData + inst->numSamples;
        }
    } else {
        v->samplePtr = inst->sampleData;
        v->retrigPtr = inst->sampleData;
        v->sampleStartPtr = inst->sampleData;
        v->sampleEndPtr = inst->sampleData + inst->numSamples;
    }

    /* ASM: move.b #FALSE,SAMPLE_ENDREACHED */
    v->endReached = 0;

    /* Declick (ASM lines 39472-39476):
     * clr.b SAMPLE_DECLICK; if status==INUSE: SAMPLE_DECLICK = -1 */
    v->declick = 0;
    if (v->status == 1) {
        v->declick = -1; /* ASM uses -1 (0xFF) as declick flag, not step count */
    }

    /* ASM lines 39482-39488 */
    v->volSlide = 0;
    v->pitchSlide = 0;
    v->hiOffset = 0;
    v->freq = freq;
    v->volume = (int16_t)vol << 8;  /* ASM: lsl.w #8,d3 */
    v->status = 1; /* SAMPLEST_INUSE */

    /* Loop setup (ASM lines 39490-39512) */
    if (inst->type == SYM_INSTRTYPE_NONE) {
        return;
    }
    if (inst->type == SYM_INSTRTYPE_LOOP) {
        /* Guard: only set up loop if loop points are valid */
        if (inst->loopEnd > inst->loopStart && inst->loopEnd <= inst->numSamples) {
            v->loopStartPtr = inst->sampleData + inst->loopStart;
            v->loopEndPtr = inst->sampleData + inst->loopEnd;
            v->sampleEndPtr = v->loopEndPtr;
        }
        /* else: invalid loop, leave sampleEndPtr at full sample end */
    } else if (inst->type == SYM_INSTRTYPE_SUST) {
        if (inst->loopEnd > inst->loopStart && inst->loopEnd <= inst->numSamples) {
            v->loopStartPtr = inst->sampleData + inst->loopStart;
            v->loopEndPtr = inst->sampleData + inst->loopEnd;
            v->sampleEndPtr = v->loopEndPtr;
        }
        if (inst->sustEnd > inst->sustStart && inst->sustEnd <= inst->numSamples) {
            v->sustStartPtr = inst->sampleData + inst->sustStart;
            v->sustEndPtr = inst->sampleData + inst->sustEnd;
        }
        v->loopNumb = inst->loopNumb;
    }
}


/* ---- Effect handlers (ASM PlayLineNote complex FX, lines 32735-33500) ---- */

static void fx_volume_slide_up(SymVoice* v, uint8_t param) {
    /* ASM: moveq #0,d3; move.b vol,d3; lsl.w #VOLUMESLIDE_LN,d3 */
    v->volSlide = (int16_t)param << SYM_VOLUMESLIDE_LN;
}

static void fx_volume_slide_down(SymVoice* v, uint8_t param) {
    /* ASM: lsl.w #VOLUMESLIDE_LN,d3; neg.w d3 */
    v->volSlide = -((int16_t)param << SYM_VOLUMESLIDE_LN);
}

static void fx_pitch_slide_up(SymVoice* v, uint8_t param) {
    v->pitchSlide = (int16_t)param;
}

static void fx_pitch_slide_down(SymVoice* v, uint8_t param) {
    v->pitchSlide = -(int16_t)param;
}

static void fx_set_speed(SymSong* song, uint8_t param) {
    if (param > 0) song->speed = param;
}

static void fx_add_pitch(SymVoice* v, uint8_t param) {
    /* ASM: lsr.l #FXADDPITCH_LN,d0; ext.w d3; muls d3,d0; add.l d0,freq */
    int32_t base = v->freq >> SYM_FXADDPITCH_LN;
    int32_t delta = base * (int8_t)param;
    v->freq += delta;
}

static void fx_add_volume(SymVoice* v, uint8_t param) {
    /* ASM: ext.w d3; asl.w #FXADDVOL_LN,d3; add.w d3,SAMPLE_VOLUME */
    int16_t delta = (int8_t)param << SYM_FXADDVOL_LN;
    int16_t newVol = v->volume + delta;
    if (newVol < SYM_VOLUME_MIN * 256) newVol = SYM_VOLUME_MIN * 256;
    if (newVol > SYM_VOLUME_MAX * 256) newVol = SYM_VOLUME_MAX * 256;
    v->volume = newVol;
}

static void fx_vibrato(SymVoice* v, uint8_t vol, uint8_t instr) {
    v->vibDepth = vol;
    v->vibLfoAdd = instr;
    if (vol == 0 && instr == 0) v->vibLfoActual = 0;
}

static void fx_tremolo(SymVoice* v, uint8_t vol, uint8_t instr) {
    v->tremDepth = vol;
    v->tremLfoAdd = instr;
    if (vol == 0 && instr == 0) v->tremLfoActual = 0;
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
    if (note->pitch != 0xFF && v->instrument) {
        int pitch = note->pitch + v->instrument->tune;
        v->destFreq = get_note_freq(song, pitch);
    }
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
    uint8_t lastPitch = (v->lastNote >> 16) & 0xFF;
    int newPitch = lastPitch + (int8_t)param;
    if (newPitch < 0) newPitch = 0;
    if (newPitch > SYM_NOTEPITCH_MAX) newPitch = SYM_NOTEPITCH_MAX;
    if (v->instrument) {
        v->freq = get_note_freq(song, newPitch + v->instrument->tune);
    }
}

static void fx_channel_volume(SymVoice* v, uint8_t pitch, uint8_t vol, uint8_t instr) {
    if (pitch == 0) {
        v->cvol = (int16_t)(int8_t)vol * 256;
        v->cvolAdd = 0;
        v->cvType = 0;
    } else if (pitch == 4) {
        v->cvol = (int16_t)(int8_t)vol * 256;
        v->cvolAdd = 0;
        v->cvType = 0;
    }
    (void)instr;
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
    v->fromAdd += (sampleLen * (int8_t)vol) >> SYM_FROMADDSTEP_LN;
}

static void fx_replay_from(SymSong* song, SymVoice* v, uint8_t vol, uint8_t instr_idx) {
    /* If voice was never keyed on, initialise from instrument at default pitch */
    if (!v->sampleStartPtr || !v->sampleEndPtr) {
        if (instr_idx < song->numInstruments) {
            SymInstrument* inst = &song->instruments[instr_idx];
            int32_t freq = get_note_freq(song, inst->tune);
            start_sample(song, v, inst, freq, SYM_VOLUME_MAX, 0);
        }
        if (!v->sampleStartPtr || !v->sampleEndPtr) return;
    }
    int32_t sampleLen = (int32_t)(v->sampleEndPtr - v->sampleStartPtr);
    int32_t startPos = vol;

    /* Sample vibrato modulation */
    if (v->savibDepth > 0) {
        int tableIdx = (v->savibLfoActual >> 1) & 0xFF;
        int16_t lfoVal = s_sineTable[tableIdx];
        int32_t mod = ((lfoVal + 0x7F) * v->savibDepth) >> 8;
        mod = (mod * startPos) >> 8;
        startPos -= mod;
        if (startPos < 0) startPos = 0;
    }

    int32_t offset = (sampleLen >> 8) * startPos;

    if (v->fromAdd != 0) {
        offset += v->fromAdd;
        if (offset < 0) { v->fromAdd = 0; offset = 0; }
    }

    v->samplePtr = v->sampleStartPtr + offset;
    if (v->samplePtr >= v->sampleEndPtr) v->samplePtr = v->sampleStartPtr;
    v->retrigPtr = v->samplePtr;
    v->endReached = 0;
    v->status = 1;
    v->declick = -1; /* FADESAMPLE flag */
    v->hiOffset = 0;
}

static void fx_filter(SymVoice* v, uint8_t pitch, uint8_t vol, uint8_t instr) {
    if (pitch >= 5) return; /* global filter — not per-channel */
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
    v->filterType = (pitch >= 1 && pitch <= 3) ? pitch : SYM_FILTER_LP;
}

static void fx_dsp_echo(SymSong* song, uint8_t pitch, uint8_t vol, uint8_t instr) {
    if (pitch == 0) { dsp_stop(&song->dsp); return; }
    song->dsp.intensity = (float)instr / 127.0f;
    dsp_set_fx_class(&song->dsp, pitch);
    if (vol > 0) {
        /* readPtrDelay is a percentage (0-100); vol is bufLen (0-127) — scale accordingly.
         * dsp_start() computes: delay_samples = (fxLength - 2) * readPtrDelay / 100 */
        song->dsp.readPtrDelay = (vol * 100) / 127;
    }
    dsp_start(&song->dsp);
}


/* ---- Note processing (ASM PlayLineNote, lines 32517-32732) ---- */

static void play_line_note(SymSong* song, int channel, const SymNote* note, int doSampleDiff) {
    SymVoice* v = get_voice(song, channel);
    if (!v) return;

    /* ASM: cmpi.l #NOTE_FULLEMPTY,(a2) */
    if (note->fx == 0 && note->pitch == 0xFF && note->volume == 0 && note->instr == 0)
        return;

    /* ASM: cmpi.b #FX_MIN,NOTE_FX → PlayLineNote_IsComplexFX */
    if (note->fx >= 1) {
        switch (note->fx) {
            case SYM_FX_VSLIDE_UP:   fx_volume_slide_up(v, note->volume); return;
            case SYM_FX_VSLIDE_DOWN: fx_volume_slide_down(v, note->volume); return;
            case SYM_FX_PSLIDE_UP:   fx_pitch_slide_up(v, note->volume); return;
            case SYM_FX_PSLIDE_DOWN: fx_pitch_slide_down(v, note->volume); return;
            case SYM_FX_REPLAY_FROM: fx_replay_from(song, v, note->volume, note->instr); return;
            case SYM_FX_FROM_AND_PITCH:
                if (note->pitch != 0xFF && note->instr < song->numInstruments) {
                    SymInstrument* inst = &song->instruments[note->instr];
                    if (inst->sampleData) {
                        int pitch = note->pitch + inst->tune + song->patternTune;
                        v->freq = get_note_freq(song, pitch);
                    }
                }
                fx_replay_from(song, v, note->volume, note->instr);
                return;
            case SYM_FX_SET_FROMADD: fx_set_fromadd(v, note->volume); return;
            case SYM_FX_FROMADD:     fx_fromadd(v, note->volume); return;
            case SYM_FX_SET_SPEED:   fx_set_speed(song, note->volume); return;
            case SYM_FX_ADD_PITCH:   fx_add_pitch(v, note->volume); return;
            case SYM_FX_ADD_VOLUME:  fx_add_volume(v, note->volume); return;
            case SYM_FX_VIBRATO:     fx_vibrato(v, note->volume, note->instr); return;
            case SYM_FX_TREMOLO:     fx_tremolo(v, note->volume, note->instr); return;
            case SYM_FX_SAMPLE_VIB:  fx_sample_vib(v, note->volume, note->instr); return;
            case SYM_FX_PSLIDE_TO:   fx_portamento(song, v, note); return;
            case SYM_FX_RETRIG:      fx_retrigger(v, note->volume, note->instr); return;
            case SYM_FX_EMPHASIS:    fx_emphasis(v, note->pitch, note->volume, note->instr); return;
            case SYM_FX_ADD_HALFTONE: fx_add_halftone(song, v, note->volume); return;
            case SYM_FX_CV:          fx_channel_volume(v, note->pitch, note->volume, note->instr); return;
            case SYM_FX_CV_ADD:      return; /* disabled in ASM */
            case SYM_FX_FILTER:      fx_filter(v, note->pitch, note->volume, note->instr); return;
            case SYM_FX_DSP_ECHO:
            case SYM_FX_DSP_DELAY:   fx_dsp_echo(song, note->pitch, note->volume, note->instr); return;
            default: return;
        }
    }

    /* ASM: cmpi.b #NOTEPITCH_NONOTE → PlayLineNote_NoNote */
    if (note->pitch == 0xFF) {
        /* No note — volume change only */
        uint8_t vol = note->volume;
        if (vol == 0) return;

        if (vol > SYM_VOLUME_COMMAND) {
            /* Volume commands (ASM lines 32622-32731) */
            switch (vol) {
                case SYM_VCMD_STOPSAMPLE:
                    v->status = 0;
                    v->fadeout = -1; /* ASM: move.b #-1,SAMPLE_FADEOUT */
                    break;
                case SYM_VCMD_CONTSAMPLE:
                    if (!v->endReached) {
                        v->status = 1;
                        v->declick = -1;
                    }
                    break;
                case SYM_VCMD_KEYOFF:
                    if (v->instrType == SYM_INSTRTYPE_SUST) {
                        v->samplePtr = v->sustStartPtr;
                        v->sampleEndPtr = v->sustEndPtr;
                        v->loopNumb = -1;
                        v->declick = -1;
                    }
                    break;
                case SYM_VCMD_SPEEDUP:   song->speed++; break;
                case SYM_VCMD_SPEEDDOWN: if (song->speed > 1) song->speed--; break;
                case SYM_VCMD_PITCHUP:
                    { uint32_t d = (uint32_t)v->freq >> SYM_PITCHFX_SHIFT; v->freq += d; } break;
                case SYM_VCMD_PITCHDOWN:
                    { uint32_t d = (uint32_t)v->freq >> SYM_PITCHFX_SHIFT; v->freq -= d; } break;
                case SYM_VCMD_PITCHUP2:
                    { uint32_t d = (uint32_t)v->freq >> (SYM_PITCHFX_SHIFT - 1); v->freq += d; } break;
                case SYM_VCMD_PITCHDOWN2:
                    { uint32_t d = (uint32_t)v->freq >> (SYM_PITCHFX_SHIFT - 1); v->freq -= d; } break;
                case SYM_VCMD_PITCHUP3:
                    { uint32_t d = (uint32_t)v->freq >> (SYM_PITCHFX_SHIFT - 2); v->freq += d; } break;
                case SYM_VCMD_PITCHDOWN3:
                    { uint32_t d = (uint32_t)v->freq >> (SYM_PITCHFX_SHIFT - 2); v->freq -= d; } break;
                default: break;
            }
        } else {
            /* Direct volume set: ASM: lsl.w #8,d3; move.w d3,SAMPLE_VOLUME */
            v->volume = vol * 256;
            v->declick = -1;
        }
        return;
    }

    /* ---- Note with instrument — trigger sample ---- */
    /* ASM lines 32554-32597 */
    if (note->instr < song->numInstruments) {
        SymInstrument* inst = &song->instruments[note->instr];

        int pitch = note->pitch + inst->tune;

        /* Position transpose (unless DODETUNE flag set) */
        if (song->patternTune != 0 && !(inst->playFlags & SYM_PFLAG_DODETUNE))
            pitch += song->patternTune;

        /* ASM: bsr GetNoteFreq — returns frequency step directly */
        int32_t freq = get_note_freq(song, pitch);

        /* Store last note (ASM: move.l (a2),SAMPLE_LASTNOTE) */
        v->lastNote = ((uint32_t)note->fx << 24) | ((uint32_t)note->pitch << 16) |
                      ((uint32_t)note->volume << 8) | note->instr;
        v->destFreq = 0;

        uint8_t vol = note->volume;
        if (vol == 0) vol = SYM_VOLUME_MAX;

        start_sample(song, v, inst, freq, vol, doSampleDiff);
    }
}


/* ---- Song traversal (ASM PlayStereoPatLine, lines 32444-32478) ---- */

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

    /*
     * ASM layout: Pattern has numChannels notes per row ([L0][R0][L1][R1]...).
     * The worklet sends only L channels (even), mapped to pair indices 0..numPairs-1.
     * So our pattern data has numPairs notes per row (one per stereo pair).
     * Both L and R voice channels in a pair play the same note.
     * R channel gets DOSAMPLEDIFF: sample start offset by song->sampleDiff (ASM lines 32467-32469).
     */
    int numChannels = song->numChannels;
    if (numChannels < 2) numChannels = 2;
    int numPairs = numChannels / 2;
    for (int pair = 0; pair < numPairs; pair++) {
        int lCh = pair * 2;
        int rCh = pair * 2 + 1;

        int noteIdx = row * numPairs + pair;
        if (noteIdx < 0 || noteIdx >= pat->numRows * numPairs) break;

        const SymNote* note = &pat->data[noteIdx];

        /* Play note into left channel (no sample diff) */
        play_line_note(song, lCh, note, 0);

        /* Play same note into right channel with DOSAMPLEDIFF offset */
        play_line_note(song, rCh, note, 1);
    }
}


/* ---- Song position advancement (ASM PlaySongData, lines 32322-32398) ---- */

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

    song->rowIdx++;
    if (song->rowIdx >= pos->length) {
        song->rowIdx = 0;

        /* Position loop (ASM: subq.w #1,POSITION_LOOPCOUNT) */
        pos->loopCount--;
        if (pos->loopCount > 0) return;

        /* Next position (ASM: subq.w #1,SONG_SEQCOUNT) */
        song->posIdx++;
        song->seqCount--;

        if (song->seqCount <= 0) {
            /* End of sequence */
            song->seqCounter--;
            if (song->seqCounter <= 0) {
                /* Advance to next sequence */
                song->seqIdx++;
                SymSequence* newSeq;

                while (song->seqIdx < song->numSequences) {
                    newSeq = &song->sequences[song->seqIdx];
                    if (newSeq->info == -1) { song->seqIdx = 0; break; }
                    if (newSeq->info == 1 || newSeq->loop == 0) {
                        song->seqIdx++;
                        continue;
                    }
                    break;
                }
                if (song->seqIdx >= song->numSequences) song->seqIdx = 0;

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
            song->speed = newPos->speed > 0 ? newPos->speed : 6;
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
        play_stereo_pat_line(song);
        advance_position(song);
    }
}


/* ---- Per-channel resonant filter (ASM ResoFilterPreMix/PostMix, lines 35773-35940) ---- */

static int16_t apply_channel_filter_i16(SymVoice* v, int16_t input) {
    if (v->filterType == SYM_FILTER_OFF) return input;

    int32_t inp = input;
    int32_t low  = v->filterBuf[0];
    int32_t band = v->filterBuf[1];
    int32_t freq = v->filterFreq;
    int32_t reso = v->filterReso;

    /* State-variable filter (ASM lines 35849-35893) */
    int32_t high = inp - low;
    band += (freq * high) >> 8;
    low  += (freq * band) >> 6;
    if (reso > 0) low += (reso * low) >> 6;
    low >>= 2;

    v->filterBuf[0] = low;
    v->filterBuf[1] = band;

    switch (v->filterType) {
        case SYM_FILTER_LP: return (int16_t)low;
        case SYM_FILTER_HP: return (int16_t)high;
        case SYM_FILTER_BP: return (int16_t)(inp - high - low);
        default: return input;
    }
}


/*
 * ---- Per-tick voice effect processing (ASM CopySample top, lines 38226-38378) ----
 *
 * In the ASM, CopySample is called once per audio buffer fill per channel.
 * Effects at the top of CopySample are applied ONCE before the inner
 * rendering loop runs. We replicate this by calling process_voice_tick()
 * once per sequencer tick, then rendering samplesPerTick audio samples
 * with the computed parameters.
 *
 * This contains: retrigger, fadeout, volume slide, vibrato (vol LFO),
 * pitch slide, portamento, tremolo (pitch LFO), sample vibrato, ProcessCV.
 */

static void process_voice_tick(SymSong* song, SymVoice* v) {
    /* Retrigger (ASM lines 38226-38239) */
    if (v->retrigNumb > 0) {
        v->retrigCount--;
        if (v->retrigCount <= 0) {
            v->retrigNumb--;
            if (v->retrigNumb > 0) {
                v->retrigCount = v->retrigCycl;
                v->samplePtr = v->retrigPtr;
                v->endReached = 0;
                v->status = 1;
                v->declick = 0;
                v->hiOffset = 0;
            }
        }
    }

    if (v->endReached && v->status == 0) return;

    /* Volume slide (ASM lines 38303-38319) */
    if (v->volSlide != 0) {
        int16_t vol = v->volume + v->volSlide;
        if (vol < 0) { vol = 0; v->volSlide = 0; }
        if (vol >= (SYM_VOLUME_MAX + 1) * 256) { vol = SYM_VOLUME_MAX * 256; v->volSlide = 0; }
        v->volume = vol;
    }

    /* Vibrato = volume LFO (ASM lines 38324-38326 → CopySample_DoVibrato) */
    /* The actual vibrato modulation is applied per-tick to compute the effective volume.
     * We store the result in a tick-computed field. Since the ASM LFO advances per buffer-fill,
     * we advance per tick here. */
    v->tickVolume = v->volume; /* start with base volume */
    if (v->vibDepth > 0) {
        v->vibLfoActual = (v->vibLfoActual + v->vibLfoAdd) & 0x1FF;
        int tableIdx = (v->vibLfoActual >> 1) & 0xFF;
        int16_t lfoVal = s_sineTable[tableIdx];

        int32_t vol = v->volume;
        int32_t modVol = ((int32_t)vol * lfoVal) / 0x7F;
        int32_t depth = (v->vibDepth / 2) + 1;
        int32_t dryMix = 255 - depth;
        int32_t result = ((int32_t)vol * dryMix >> 8) + (modVol * depth >> 8);
        if (result > SYM_VOLUME_MAX * 256) result = SYM_VOLUME_MAX * 256;
        if (result < 0) result = 0;
        v->tickVolume = (int16_t)result;
    }

    /* VFade / Emphasis */
    if (v->vfade != 0 && v->sampleStartPtr && v->sampleEndPtr) {
        int32_t sampleLen = (int32_t)(v->sampleEndPtr - v->sampleStartPtr);
        if (sampleLen > 0) {
            int32_t pos = (int32_t)(v->samplePtr - v->sampleStartPtr);
            if (pos < 0) pos = 0;
            if (pos > sampleLen) pos = sampleLen;
            int32_t fadeRange = v->vfadeEnd - v->vfadeStart;
            int32_t progress = (fadeRange * pos) / sampleLen + 1;

            switch (v->vfade) {
                case 1: break;
                case 2: progress = 100 - progress; break;
                case 3:
                    if (progress > 50) progress = 200 - 2 * progress;
                    else progress *= 2;
                    break;
            }
            int16_t emphVol = (int16_t)((progress + v->vfadeStart) * 256);
            if (emphVol > SYM_VOLUME_MAX * 256) emphVol = SYM_VOLUME_MAX * 256;
            if (emphVol < 0) emphVol = 0;
            v->tickVolume = emphVol;
        }
    }

    /* Convert volume from 8.8 to byte (ASM: lsr.w #8,d3) */
    int volByte = v->tickVolume >> 8;

    /* Pitch slide (ASM lines 38332-38343) */
    if (v->pitchSlide != 0) {
        /* ASM: move.l d2,d3; lsr.l #8,d3; move.w PITCHSLIDE,d0; ext.l; muls.l d3,d0;
         *      asr.l #PITCHSLIDE_LN,d0; sub.l d0,d2 */
        int32_t freq8 = v->freq >> 8;
        int32_t delta = (int32_t)v->pitchSlide * freq8;
        delta >>= SYM_PITCHSLIDE_LN;
        v->freq -= delta;
    }

    /* Portamento (ASM lines 38345-38369) */
    if (v->destFreq != 0) {
        int32_t diff = v->destFreq - v->freq;
        if (diff == 0) {
            v->destFreq = 0;
        } else if (v->pslideToSpd > 0) {
            /* ASM: addq.l #1,d7; divs.l d6,d7 */
            int32_t step = (diff + 1) / (int32_t)v->pslideToSpd;
            v->freq += step;
        }
    }
    v->tickFreq = v->freq; /* base freq after pitch effects */

    /* Tremolo = pitch LFO (ASM lines 38372-38374 → CopySample_DoTremolo) */
    if (v->tremDepth > 0) {
        v->tremLfoActual = (v->tremLfoActual + v->tremLfoAdd) & 0x1FF;
        int tableIdx = (v->tremLfoActual >> 1) & 0xFF;
        int16_t lfoVal = s_sineTable[tableIdx];

        /* ASM: lsr.l #1,d4; muls.l d0,d3:d4; divs.l #$80,d3:d4;
         *      muls.l d0,d3:d4; divs.l #100,d3:d4; add.l d4,d2 */
        int64_t halfFreq = (uint32_t)v->freq >> 1;
        int64_t result = halfFreq * (int32_t)lfoVal;
        result /= 0x80;
        result *= (int32_t)v->tremDepth;
        result /= 100;
        v->tickFreq += (int32_t)result;
    }

    /* Sample vibrato — advance phase */
    if (v->savibDepth > 0) {
        v->savibLfoActual = (v->savibLfoActual + v->savibLfoAdd) & 0x3FF;
    }

    /* ProcessCV (ASM lines 38594-38641) */
    {
        int16_t prevCvol = v->cvol;
        int16_t newCvol = prevCvol + v->cvolAdd;

        if (v->cvType != 0) {
            int16_t destDiff = v->destVol - prevCvol;
            int16_t newDiff  = v->destVol - newCvol;
            if ((destDiff >= 0 && newDiff <= 0) || (destDiff < 0 && newDiff >= 0)) {
                v->cvType = 0;
                v->cvolAdd = 0;
                v->cvol = v->destVol;
            } else {
                v->cvol = newCvol;
            }
        } else {
            if (newCvol >= -100 * 256 && newCvol <= 100 * 256) {
                v->cvol = newCvol;
            }
        }
    }

    /* Apply CV to volume (ASM lines 38610-38617) */
    if (v->cvol < 100 * 256) {
        int16_t signedVol = (int8_t)volByte;
        int32_t result = (int32_t)signedVol * v->cvol;
        result /= (100 * 256);
        volByte = result & 0xFF;
    }

    if (volByte > SYM_VOLUME_MAX) volByte = SYM_VOLUME_MAX;
    if (volByte < -SYM_VOLUME_MAX) volByte = -SYM_VOLUME_MAX;
    v->endVol = (int8_t)volByte;

    /* Pre-compute volume factor for inner loop (ASM: d4 = vol * 256 / 100) */
    v->tickVolFactor = (int16_t)volByte * 256 / 100;
}


/*
 * ---- Per-sample voice rendering (ASM CopySample inner loop, lines 38482-38509) ----
 *
 * This is the inner mixing loop. Effects have already been processed by
 * process_voice_tick(). This function is called once per output sample per voice.
 * It reads the sample, applies volume, advances the position, handles loops.
 *
 * ASM inner loop:
 *   move.w (a4),d0           ; read 16-bit sample
 *   swap d1                  ; get integer part of HIOFFSET
 *   lea.l (a2,d1.w*2),a4    ; new position = base + int*2
 *   swap d1                  ; restore
 *   muls d4,d0               ; volume scale
 *   asr.l #8,d0              ; shift down
 *   add.l d2,d1              ; advance fractional accumulator
 *   add.w d0,(a1)            ; accumulate to mix buffer
 */

static int16_t render_voice_sample_i16(SymSong* song, SymVoice* v) {
    if (v->endReached) return 0;
    if (v->status == 0) {
        /* Fadeout (ASM lines 38250-38279) */
        if (v->fadeout) {
            int16_t ls = v->lastSample;
            if (ls == 0) { v->fadeout = 0; return 0; }
            /* Simple linear fadeout over ~8 steps */
            int16_t step = ls / 8;
            if (step == 0) step = (ls > 0) ? 1 : -1;
            v->lastSample -= step;
            return v->lastSample;
        }
        return 0;
    }
    if (!v->instrument || !v->samplePtr) return 0;

    int16_t* curPtr = v->samplePtr;
    int16_t* endPtr = v->sampleEndPtr;
    if (!endPtr || curPtr >= endPtr) {
        v->endReached = 1;
        v->status = 0;
        return 0;
    }

    /* Read sample (no interpolation — matches ASM which uses nearest-neighbor) */
    int16_t rawSample = *curPtr;

    /* Apply tick-computed volume: ASM muls d4,d0; asr.l #8,d0 */
    int32_t scaled = (int32_t)rawSample * v->tickVolFactor;
    scaled >>= 8;
    int16_t output = (int16_t)scaled;

    /* Declick crossfade (ASM lines 38426-38478) */
    if (v->declick != 0) {
        /* ASM uses a linear crossfade: blend lastSample → current over FADETOSTEPS(9) */
        int16_t ls = v->lastSample;
        if (v->declickCount > 0) {
            int32_t blend = (int32_t)ls * v->declickCount / SYM_FADETO_STEPS +
                            (int32_t)output * (SYM_FADETO_STEPS - v->declickCount) / SYM_FADETO_STEPS;
            output = (int16_t)blend;
            v->declickCount--;
            if (v->declickCount <= 0) v->declick = 0;
        } else {
            /* Start declick: set counter */
            v->declickCount = SYM_FADETO_STEPS;
            int32_t blend = (int32_t)ls * v->declickCount / SYM_FADETO_STEPS +
                            (int32_t)output * (SYM_FADETO_STEPS - v->declickCount) / SYM_FADETO_STEPS;
            output = (int16_t)blend;
            v->declickCount--;
        }
    }

    v->lastSample = output;

    /* Advance sample position (fixed-point 16.16) */
    /* ASM: add.l d2,d1 — adds FREQUENZ to HIOFFSET */
    uint32_t freq = (uint32_t)v->tickFreq;
    v->hiOffset += freq;
    int32_t advance = (int32_t)(v->hiOffset >> 16);
    v->hiOffset &= 0xFFFF;
    v->samplePtr += advance;

    /* End-of-sample / loop handling (ASM lines 38525-38579) */
    if (v->samplePtr >= v->sampleEndPtr) {
        if (v->instrType == SYM_INSTRTYPE_NONE) {
            /* No loop — end */
            v->endReached = 1;
            v->status = 0;
            v->declick = 0;
        } else if (v->instrType == SYM_INSTRTYPE_LOOP) {
            /* Loop back (ASM lines 38531-38542) */
            if (v->loopStartPtr && v->loopEndPtr && v->loopEndPtr > v->loopStartPtr) {
                v->samplePtr = v->loopStartPtr;
                v->sampleEndPtr = v->loopEndPtr;
                v->hiOffset = 0;
            } else {
                v->endReached = 1;
                v->status = 0;
                v->declick = 0;
            }
        } else if (v->instrType == SYM_INSTRTYPE_SUST) {
            /* Sustain (ASM lines 38546-38579) */
            if (v->loopNumb < 0) {
                /* Already in sustain release — end */
                v->endReached = 1;
                v->status = 0;
                v->declick = 0;
            } else {
                v->loopNumb--;
                if (v->loopNumb < 0 && v->sustStartPtr && v->sustEndPtr &&
                    v->sustEndPtr > v->sustStartPtr) {
                    /* Switch to sustain region */
                    v->samplePtr = v->sustStartPtr;
                    v->sampleEndPtr = v->sustEndPtr;
                } else if (v->loopStartPtr && v->loopEndPtr &&
                           v->loopEndPtr > v->loopStartPtr) {
                    /* Loop back */
                    v->samplePtr = v->loopStartPtr;
                    v->sampleEndPtr = v->loopEndPtr;
                } else {
                    /* No valid loop or sustain — end */
                    v->endReached = 1;
                    v->status = 0;
                    v->declick = 0;
                }
                v->hiOffset = 0;
            }
        } else {
            v->endReached = 1;
            v->status = 0;
            v->declick = 0;
        }
    }

    /* Apply per-channel filter */
    output = apply_channel_filter_i16(v, output);

    return output;
}


/* ---- Main render function ---- */

int sym_render(SymSong* song, float* buffer, int frames) {
    if (!song->playing) {
        memset(buffer, 0, frames * 2 * sizeof(float));
        return 0;
    }

    int numPairs = song->numChannels / 2;
    if (numPairs < 1) numPairs = 1;

    /* ASM ProcMVol: masterVol scaling then 14-bit clamped output.
     * No per-pair normalization in the ASM — just additive 16-bit mixing.
     * Convert to float [-1, 1] range and clamp at the end. */

    for (int i = 0; i < frames; i++) {
        /* Tick the sequencer */
        song->tickAccum += 1.0f;
        if (song->tickAccum >= song->samplesPerTick) {
            song->tickAccum -= song->samplesPerTick;
            play_song_tick(song);

            /* Process effects for all active voices (ASM: CopySample per voice) */
            for (int ch = 0; ch < song->numChannels; ch++) {
                process_voice_tick(song, &song->voices[ch]);
            }
        }

        if (song->finished) {
            buffer[i * 2] = 0.0f;
            buffer[i * 2 + 1] = 0.0f;
            continue;
        }

        /* Mix all channels — integer mixing like ASM */
        int32_t mixL = 0;
        int32_t mixR = 0;

        for (int pair = 0; pair < numPairs; pair++) {
            int lCh = pair * 2;
            int rCh = pair * 2 + 1;

            int16_t smpL = render_voice_sample_i16(song, &song->voices[lCh]);
            int16_t smpR = render_voice_sample_i16(song, &song->voices[rCh]);

            mixL += smpL;
            mixR += smpR;
        }

        /* Convert to float — normalize for full 16-bit samples (each voice max ±32767).
         * With numPairs voices per channel, max accumulator = 32767 * numPairs.
         * Divide by numPairs * 32768 to map full-scale output to ±1.0. */
        float mixDiv = (float)numPairs * 32768.0f;
        float fMixL = (float)mixL / mixDiv;
        float fMixR = (float)mixR / mixDiv;

        /* DSP wet mix — feed dry mono mix into ring buffer, then read delayed output */
        dsp_add_sample(&song->dsp, (fMixL + fMixR) * 0.5f);
        dsp_advance_write(&song->dsp);
        float wet = dsp_get_wet(&song->dsp);
        dsp_advance_read(&song->dsp);
        fMixL += wet;
        fMixR += wet;

        /* Master volume + balance (ASM ProcMVol, lines 36635-36700)
         * ASM: d2 = masterVol*256*127/100, then sample*d2*2>>16
         * At max vol (100): d2=32512, factor ≈ 0.992 (essentially 1.0)
         * We use a simpler float equivalent: masterVol/100 */
        float masterVol = (float)song->masterVolume / 100.0f;
        float volL = masterVol;
        float volR = masterVol;

        /* Balance (ASM: cross-ratio reduction of opposite channel) */
        int bal = song->balance;
        if (bal < 50 && bal > 0) {
            /* Reduce RIGHT: ASM: right = left * balance / (100 - balance) */
            volR = masterVol * (float)bal / (float)(100 - bal);
        } else if (bal > 50 && bal < 100) {
            /* Reduce LEFT: ASM: left = right * (100-balance) / balance */
            volL = masterVol * (float)(100 - bal) / (float)bal;
        }
        fMixL *= volL;
        fMixR *= volR;

        buffer[i * 2]     = clampf(fMixL, -1.0f, 1.0f);
        buffer[i * 2 + 1] = clampf(fMixR, -1.0f, 1.0f);
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
        if (seq->info == -1) { song->seqIdx = 0; break; }
        if (seq->info != 1 && seq->loop > 0) break;
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
    song->speedCount = 1;

    /* Init first position */
    int posOff = seq->startPos;
    if (posOff >= 0 && posOff < song->numPositions) {
        SymPosition* pos = &song->positions[posOff];
        song->speed = pos->speed > 0 ? pos->speed : 6;
        song->patternTune = pos->tune + song->seqTune;
        pos->loopCount = pos->loopNumb;
    }

    /* Timing: 50 Hz base tick rate (ASM VBL rate) */
    song->samplesPerTick = song->outputRate / 50.0f;
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
