/**
 * symphonie_player.h — Symphonie Pro replayer (C port from 68k ASM)
 *
 * Ported from: Symphonie Source.Assembler v3.3d (Patrick Meng, Oct 2000)
 * Original: MC68020 software mixer, up to 256 channels → stereo output
 *
 * IMPORTANT: In Symphonie, "vibrato" = volume modulation, "tremolo" = pitch modulation.
 * This is the opposite of standard music terminology. The C code preserves the
 * original naming from the ASM source.
 */
#pragma once
#ifndef SYMPHONIE_PLAYER_H
#define SYMPHONIE_PLAYER_H

#include <stdint.h>

/* ---- Constants ---- */

#define SYM_MAX_CHANNELS     256
#define SYM_MAX_INSTRUMENTS  256
#define SYM_MAX_PATTERNS     512
#define SYM_MAX_POSITIONS    512
#define SYM_MAX_SEQUENCES    64
#define SYM_NOTEPITCH_MAX    84    /* 7 octaves × 12 */
#define SYM_FREQ_TABLE_SIZE  (SYM_NOTEPITCH_MAX + 48)  /* extra headroom for transpose */

#define SYM_VOLUME_MIN       1
#define SYM_VOLUME_MAX       100
#define SYM_VOLUME_COMMAND   200

/* Volume commands (stored in NOTE_VOLUME byte, >= 242) */
#define SYM_VCMD_PITCHDOWN3  242
#define SYM_VCMD_PITCHUP3    243
#define SYM_VCMD_PITCHDOWN2  244
#define SYM_VCMD_PITCHUP2    245
#define SYM_VCMD_PITCHDOWN   246
#define SYM_VCMD_PITCHUP     247
#define SYM_VCMD_SETPITCH    248
#define SYM_VCMD_SPEEDUP     249
#define SYM_VCMD_SPEEDDOWN   250
#define SYM_VCMD_KEYOFF      251
#define SYM_VCMD_STARTSAMPLE 252
#define SYM_VCMD_CONTSAMPLE  253
#define SYM_VCMD_STOPSAMPLE  254

/* Effects (FX byte, 1-25) */
#define SYM_FX_NONE          0
#define SYM_FX_VSLIDE_UP     1
#define SYM_FX_VSLIDE_DOWN   2
#define SYM_FX_PSLIDE_UP     3
#define SYM_FX_PSLIDE_DOWN   4
#define SYM_FX_REPLAY_FROM   5
#define SYM_FX_FROM_AND_PITCH 6
#define SYM_FX_SET_FROMADD   7
#define SYM_FX_FROMADD       8
#define SYM_FX_SET_SPEED     9
#define SYM_FX_ADD_PITCH     10
#define SYM_FX_ADD_VOLUME    11
#define SYM_FX_VIBRATO       12   /* NOTE: modulates volume in Symphonie! */
#define SYM_FX_TREMOLO       13   /* NOTE: modulates pitch in Symphonie! */
#define SYM_FX_SAMPLE_VIB    14
#define SYM_FX_PSLIDE_TO     15
#define SYM_FX_RETRIG        16
#define SYM_FX_EMPHASIS      17
#define SYM_FX_ADD_HALFTONE  18
#define SYM_FX_CV            19
#define SYM_FX_CV_ADD        20
#define SYM_FX_FILTER        23
#define SYM_FX_DSP_ECHO      24
#define SYM_FX_DSP_DELAY     25
#define SYM_FX_MAX           25

/* Shift constants (from ASM) */
#define SYM_PITCHFX_SHIFT    7
#define SYM_PITCHSLIDE_LN    5
#define SYM_VOLUMESLIDE_LN   4
#define SYM_FROMADDSTEP_LN   14
#define SYM_FXADDPITCH_LN    10
#define SYM_FXADDVOL_LN      5

#define SYM_FADETO_STEPS     9    /* declick crossfade */
#define SYM_FADEOUT_STEPS     28   /* fadeout */

/* Instrument types */
#define SYM_INSTRTYPE_SILENT -8
#define SYM_INSTRTYPE_KILL   -4
#define SYM_INSTRTYPE_NONE    0
#define SYM_INSTRTYPE_LOOP    4
#define SYM_INSTRTYPE_SUST    8

/* Play flags (bitfield) */
#define SYM_PFLAG_DODETUNE   (1 << 0)
#define SYM_PFLAG_NODSP      (1 << 1)
#define SYM_PFLAG_SUPERFAST  (1 << 2)

/* Filter constants */
#define SYM_FILTER_MAXFREQ   240
#define SYM_FILTER_MAXRESO   185
#define SYM_FILTER_OFF       0
#define SYM_FILTER_LP        1
#define SYM_FILTER_HP        2
#define SYM_FILTER_BP        3

/* DSP types */
#define SYM_DSP_OFF          0
#define SYM_DSP_ECHO         1
#define SYM_DSP_CROSSECHO    2
#define SYM_DSP_DELAY        3
#define SYM_DSP_CROSSDELAY   4
#define SYM_DSP_RING_SIZE    128000  /* stereo samples */

/* ---- Data structures ---- */

/* Note event (4 bytes, matching ASM layout) */
typedef struct {
    uint8_t fx;        /* effect command (0 = none, 1-25 = effect) */
    uint8_t pitch;     /* note pitch (0-84, 0xFF = no note) */
    uint8_t volume;    /* volume (0-100) or volume command (242-254) */
    uint8_t instr;     /* instrument number (0-based) */
} SymNote;

/* Instrument */
typedef struct {
    int16_t  type;         /* NONE/LOOP/SUST/KILL/SILENT */
    int16_t  finetune;     /* signed fine tuning */
    int16_t  tune;         /* signed coarse tuning (semitones) */
    uint16_t playFlags;    /* DODETUNE | NODSP | SUPERFAST */
    uint8_t  volume;       /* instrument volume (0-100) */
    uint8_t  multiChannel; /* 0=mono, 1=stereoL, 2=stereoR */

    /* Sample data (16-bit PCM, host-endian) */
    int16_t* sampleData;   /* pointer to sample start */
    int32_t  numSamples;   /* number of 16-bit samples */
    int32_t  loopStart;    /* loop start (sample offset) */
    int32_t  loopEnd;      /* loop end (sample offset) */
    int32_t  sustStart;    /* sustain start (sample offset) */
    int32_t  sustEnd;      /* sustain end (sample offset) */
    int16_t  loopNumb;     /* sustain loop count (0 = infinite) */
    float    sampledFreq;  /* original sample rate */
} SymInstrument;

/* Pattern */
typedef struct {
    int32_t  numRows;      /* number of rows in pattern */
    SymNote* data;         /* pattern data: numRows × numChannels */
} SymPattern;

/* Sequence entry */
typedef struct {
    int16_t startPos;      /* first position in sequence */
    int16_t length;        /* number of positions */
    int16_t loop;          /* number of loops (0 = skip) */
    int16_t info;          /* 0=play, 1=skip, -1=end */
    int16_t tune;          /* sequence transpose (semitones) */
} SymSequence;

/* Position entry */
typedef struct {
    int16_t patternIdx;    /* pattern index */
    int16_t startRow;      /* starting row within pattern */
    int16_t length;        /* number of rows to play */
    int16_t speed;         /* ticks per row */
    int16_t tune;          /* position transpose (semitones) */
    int16_t loopNumb;      /* number of times to loop this position */
    int16_t loopCount;     /* runtime: current loop counter */
} SymPosition;

/* Per-channel voice state (mirrors SAMPLE_ structure from ASM) */
typedef struct {
    /* Sample playback */
    int16_t* samplePtr;        /* current playback pointer */
    int16_t* sampleStartPtr;   /* sample start (for offset calc) */
    int16_t* sampleEndPtr;     /* sample end pointer */
    int16_t* retrigPtr;        /* retrigger restart pointer */
    uint32_t hiOffset;         /* fractional position (16.16 fixed) */
    int32_t  freq;             /* frequency increment (fixed-point) */
    int16_t  status;           /* 0=pending, 1=in use */
    int16_t  volume;           /* channel volume (8.8 fixed: 0-25600) */
    int8_t   endReached;       /* TRUE when sample ends */
    int8_t   declick;          /* >0 = remaining crossfade steps */
    int8_t   fadeout;          /* -1 = do fadeout */
    int16_t  lastSample;       /* last rendered sample value */

    /* Instrument reference */
    SymInstrument* instrument;
    int16_t  instrType;        /* cached instrument type */

    /* Loop */
    int16_t* loopStartPtr;
    int16_t* loopEndPtr;
    int16_t* sustStartPtr;
    int16_t* sustEndPtr;
    int16_t  loopNumb;         /* sustain loop counter */

    /* Effects */
    int16_t  volSlide;         /* volume slide per tick (signed) */
    int16_t  pitchSlide;       /* pitch slide per tick (signed) */
    int32_t  destFreq;         /* portamento target freq (0=off) */
    int16_t  pslideToSpd;      /* portamento speed (divisor) */
    int32_t  fromAdd;          /* sample offset accumulator */

    /* Vibrato (= volume modulation in Symphonie) */
    int16_t  vibDepth;
    int16_t  vibLfoAdd;        /* LFO speed */
    int16_t  vibLfoActual;     /* LFO phase (0-511) */

    /* Tremolo (= pitch modulation in Symphonie) */
    int16_t  tremDepth;
    int16_t  tremLfoAdd;
    int16_t  tremLfoActual;

    /* Sample vibrato */
    int16_t  savibDepth;
    int16_t  savibLfoAdd;
    int16_t  savibLfoActual;

    /* Retrigger */
    int16_t  retrigNumb;       /* number of retrigs remaining */
    int16_t  retrigCycl;       /* retrig interval */
    int16_t  retrigCount;      /* countdown */

    /* VFade / Emphasis */
    int8_t   vfade;            /* 0=off, 1/2/3=type */
    int16_t  vfadeStart;       /* start percentage */
    int16_t  vfadeEnd;         /* end percentage */

    /* Channel Volume (CV) / panning */
    int16_t  cvol;             /* channel mix volume (8.8 fixed, signed) */
    int16_t  cvolAdd;          /* per-tick change */
    int16_t  destVol;          /* target volume */
    int16_t  cvType;           /* 0=normal, 1=use destVol */
    int8_t   endVol;           /* final scaled volume (signed byte) */

    /* Per-channel resonant filter */
    int8_t   filterType;       /* 0=off, 1=LP, 2=HP, 3=BP */
    int16_t  filterFreq;       /* filter cutoff */
    int16_t  filterReso;       /* filter resonance */
    int32_t  filterBuf[3];     /* state variables (low, band, high) */

    /* Last note data (for FX_ADD_HALFTONE) */
    uint32_t lastNote;         /* packed NOTE data */

    /* Per-tick computed values (set by process_voice_tick, used by render inner loop) */
    int16_t  tickVolume;       /* volume after vibrato/emphasis (8.8 fixed) */
    int32_t  tickFreq;         /* frequency after pitch effects (16.16 fixed) */
    int16_t  tickVolFactor;    /* pre-computed vol * 256 / 100 for inner loop */
    int16_t  declickCount;     /* countdown for declick crossfade */
} SymVoice;

/* DSP ring buffer */
typedef struct {
    float    ringBuffer[SYM_DSP_RING_SIZE];
    int32_t  readPtr;
    int32_t  writePtr;
    int32_t  fxLength;
    int32_t  newFxLength;
    int32_t  readPtrDelay;
    float    intensity;        /* feedback (0.0-1.0) */
    float    wetMix;           /* wet volume (0.0-1.0) */
    int32_t  fxType;           /* SYM_DSP_xxx */
    int8_t   running;
    int8_t   overwritePrev;    /* clear after read */
    int32_t  bufLenSub;       /* 1=normal, 2=cross */
} SymDSP;

/* Song state */
typedef struct {
    /* Song configuration */
    int32_t  numChannels;      /* number of voice channels (always even, L/R pairs) */
    int32_t  numInstruments;
    int32_t  numPatterns;
    int32_t  numPositions;
    int32_t  numSequences;

    /* Data arrays */
    SymInstrument instruments[SYM_MAX_INSTRUMENTS];
    SymPattern    patterns[SYM_MAX_PATTERNS];
    SymPosition   positions[SYM_MAX_POSITIONS];
    SymSequence   sequences[SYM_MAX_SEQUENCES];

    /* Frequency table */
    int32_t  freqTable[SYM_FREQ_TABLE_SIZE];

    /* Voices */
    SymVoice voices[SYM_MAX_CHANNELS];

    /* DSP */
    SymDSP   dsp;

    /* Playback state */
    int16_t  speed;            /* ticks per row */
    int16_t  speedCount;       /* tick countdown */
    int32_t  seqIdx;           /* current sequence index */
    int32_t  posIdx;           /* current position within sequence */
    int32_t  rowIdx;           /* current row within pattern */
    int16_t  patternTune;      /* current transpose */
    int16_t  seqTune;          /* sequence transpose */
    int16_t  seqCount;         /* positions remaining in sequence */
    int16_t  seqCounter;       /* sequence loop counter */
    int8_t   playing;          /* 1 = playing */
    int8_t   finished;         /* 1 = song ended */

    /* Stereo sample offset (ASM: SAMPLEDIFF — offset applied to R channel sample start) */
    int32_t  sampleDiff;       /* byte offset for R channel (0-2000, from module header type 12) */

    /* Master volume / balance */
    int16_t  masterVolume;     /* 0-100 */
    int16_t  balance;          /* 0-100, 50 = center */

    /* Mixing */
    int      interpMode;       /* 0=none (original), 1=linear, 2=cubic */
    float    outputRate;       /* output sample rate (e.g. 44100) */
    float    tickRate;         /* ticks per second */
    float    samplesPerTick;   /* output samples per tick */
    float    tickAccum;        /* accumulator for tick timing */

    /* Mix buffers (stereo interleaved) */
    float    mixBufL[8192];
    float    mixBufR[8192];
} SymSong;

/* ---- API ---- */

/** Initialize a song structure (zeroes everything) */
void sym_init(SymSong* song);

/** Build the frequency table */
void sym_build_freq_table(SymSong* song);

/** Start playback from the beginning */
void sym_play(SymSong* song);

/** Stop playback */
void sym_stop(SymSong* song);

/** Render audio frames (stereo interleaved float output) */
int sym_render(SymSong* song, float* buffer, int frames);

/** Get current playback position */
void sym_get_position(const SymSong* song, int* seqIdx, int* posIdx, int* rowIdx);

/** Set playback position */
void sym_set_position(SymSong* song, int seqIdx, int posIdx, int rowIdx);

/** Reset all voices */
void sym_reset_voices(SymSong* song);

#endif /* SYMPHONIE_PLAYER_H */
