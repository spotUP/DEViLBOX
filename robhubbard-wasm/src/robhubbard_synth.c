/**
 * robhubbard_synth.c — Rob Hubbard Amiga music synthesis WASM module
 *
 * Implements the format_synth_api for Rob Hubbard's Amiga music format (.rh, .rhp).
 * Exported symbols use the "rh_" prefix.
 *
 * Synthesis model (ported from FlodJS RHPlayer.js by Christian Corti, Neoart):
 *   - Amiga Paula-based period synthesis (period → frequency = 3546895 / period)
 *   - PCM sample playback with loop support
 *   - Per-note "synthPos" wobble oscillator (hiPos / loPos wave morphing)
 *   - Vibrato: table-driven LFO applied to period each tick (divider-based)
 *   - Portamento: signed period delta added each tick
 *   - Per-instrument sample data stored in a mixer "memory" array
 *   - Volume is Amiga 0-64 range; output normalised to [-1, +1]
 *
 * Binary blob layout for rh_load_instrument():
 *   [0]       version byte (0)
 *   [1..2]    sampleLen    (uint16 LE, sample data length in bytes)
 *   [3..4]    loopOffset   (int16 LE, loop start relative to sample start;
 *                           <0 = no loop, 0 = loop from beginning)
 *   [5..6]    sampleVolume (uint16 LE, Amiga 0-64)
 *   [7..8]    relative     (uint16 LE: = 3579545 / freqHz; used to detune by
 *                           instrument. Stored as already-computed integer.)
 *   [9..10]   divider      (uint16 LE, vibrato depth divider; 0 = no vibrato)
 *   [11..12]  vibratoIdx   (uint16 LE, index into vibrato table blob)
 *   [13..14]  hiPos        (uint16 LE, wobble hi boundary; 0 = no wobble)
 *   [15..16]  loPos        (uint16 LE, wobble lo boundary)
 *   [17..18]  vibratoLen   (uint16 LE, length of following vibrato table)
 *   [19..19+vibratoLen-1]  vibrato table (signed int8 bytes, with -124 loop marker)
 *   [19+vibratoLen..end]   sample PCM data (signed int8 bytes)
 *
 * Note:
 *   - The Rob Hubbard format uses a "relative" value per instrument such that:
 *       period = PERIODS[note] * relative >> 10
 *     where PERIODS[] is the standard Amiga ProTracker period table.
 *   - Vibrato is computed as: (period / divider) * vibTable[vibratoPos]
 *     and the result added to the base period.
 *   - Wobble: when hiPos > 0, the sample byte at (pointer + synthPos) is set to
 *     60 each time synthPos bounces off hiPos or loPos boundaries. This creates
 *     the characteristic waveform-morphing wobble effect.
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define MAX_PLAYERS       8
#define TICKS_PER_SEC     50     /* Amiga 50 Hz timer */
#define AMIGA_CLOCK       3546895.0f
#define MAX_VIB_LEN       256
#define MAX_SAMPLE_LEN    65536

/* Period clamp bounds (ProTracker standard) */
#define MIN_PERIOD        113
#define MAX_PERIOD        6848

/* Vibrato loop marker (from RHPlayer.js: -124 = loop) */
#define VIB_LOOP_MARKER   (-124)

/* ── Amiga ProTracker period table (84 entries, C-0 through B-6) ────────────
 * Matches RHPlayer.js usage: PERIODS[note] for note 0..83
 * (same as JHPlayer.js / standard Amiga period table)
 */
static const uint16_t RH_PERIODS[84] = {
  1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,
   960, 906, 856, 808, 762, 720, 678, 640, 604, 570,
   538, 508, 480, 453, 428, 404, 381, 360, 339, 320,
   302, 285, 269, 254, 240, 226, 214, 202, 190, 180,
   170, 160, 151, 143, 135, 127, 120, 113, 113, 113,
   113, 113, 113, 113, 113, 113, 113, 113, 113, 113,
  3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,
  1920,1812,6848,6464,6096,5760,5424,5120,4832,4560,
  4304,4064,3840,3624
};

/* ── Instrument ─────────────────────────────────────────────────────────────── */

typedef struct {
  /* Sample PCM data */
  int8_t  *sampleData;     /* signed 8-bit PCM (owned by instrument) */
  int      sampleLen;      /* length in bytes */
  int32_t  loopOffset;     /* loop start offset; <0 = no loop */
  uint16_t volume;         /* Amiga volume 0-64 */

  /* Pitch adjustment */
  int      relative;       /* integer: 3579545 / hz (computed at parse) */

  /* Vibrato */
  uint16_t divider;        /* period divisor for vibrato; 0 = off */
  int8_t   vibTable[MAX_VIB_LEN]; /* signed vibrato wave table */
  int      vibTableLen;    /* length of vibTable */
  int      vibStartIdx;    /* the instrument's own vibratoIdx offset */

  /* Wobble oscillator */
  uint16_t hiPos;          /* wobble upper bound; 0 = no wobble */
  uint16_t loPos;          /* wobble lower bound */
} RHInstrument;

/* ── Player state ──────────────────────────────────────────────────────────── */

typedef struct {
  int           alive;
  int           sampleRate;
  int           samplesPerTick;

  RHInstrument  ins;

  /* Playback state */
  int           playing;
  int           note;          /* 0-83 Amiga note index */
  uint16_t      basePeriod;    /* period from period table * relative >> 10 */
  uint16_t      currentPeriod; /* period after portamento + vibrato */

  /* Tick sub-sample counter */
  int           sampleCtr;

  /* Oscillator: tracks position in PCM sample */
  float         phase;         /* current sample position (float for sub-sample) */

  /* Volume */
  int           volume;        /* 0-64 Amiga volume for this note */

  /* Portamento */
  int           portaActive;   /* 1 if portamento is running */
  int8_t        portaSpeed;    /* signed delta per tick */

  /* Vibrato */
  int           vibratoPos;    /* current position in vibTable */
  int           vibratoStart;  /* initial position (reset on note-on) */

  /* Wobble */
  int           synthPos;      /* current wobble position in sample */
  int           wobbleDir;     /* 0=forward, 1=backward */
  int           busy;          /* 0=allow loop pointer update (from RHPlayer.js) */
} RHPlayer;

/* ── Context ────────────────────────────────────────────────────────────────── */

typedef struct {
  int       sampleRate;
  RHPlayer  players[MAX_PLAYERS];
} RHContext;

/* ── Helpers ────────────────────────────────────────────────────────────────── */

/**
 * Convert Amiga period to audio frequency in Hz.
 */
static float rh_periodToFreq(uint16_t period) {
  if (period == 0) return 440.0f;
  return AMIGA_CLOCK / (float)period;
}

/**
 * Clamp note index to valid range [0, 83].
 */
static int rh_clampNote(int note) {
  if (note < 0)  note = 0;
  if (note > 83) note = 0;
  return note;
}

/* ── Tick-level update ─────────────────────────────────────────────────────── */

static void rh_player_tick(RHPlayer *p) {
  if (!p->playing) return;

  /* ── Portamento ── */
  if (p->portaActive) {
    p->currentPeriod = (uint16_t)((int)p->currentPeriod + (int)p->portaSpeed);
    if (p->currentPeriod < MIN_PERIOD) p->currentPeriod = MIN_PERIOD;
    if (p->currentPeriod > MAX_PERIOD) p->currentPeriod = MAX_PERIOD;
  }

  /* ── Vibrato: RHPlayer divider-based LFO ── */
  if (p->ins.divider > 0 && p->ins.vibTableLen > 0) {
    /* Read vibrato table; -124 is loop marker → reset to start */
    int8_t vibVal = p->ins.vibTable[p->vibratoPos];

    if (vibVal == VIB_LOOP_MARKER) {
      p->vibratoPos = p->vibratoStart;
      vibVal = p->ins.vibTable[p->vibratoPos];
    }

    p->vibratoPos++;
    if (p->vibratoPos >= p->ins.vibTableLen) {
      p->vibratoPos = p->vibratoStart;
    }

    /* Apply: vibrato amount = (period / divider) * vibVal */
    /* Use current period (which may include portamento) */
    int periodBase = (int)p->currentPeriod;
    int vibAmount  = 0;
    if (p->ins.divider != 0) {
      vibAmount = (periodBase / (int)p->ins.divider) * (int)vibVal;
    }
    /* Note: RHPlayer says: chan.period = voice.period + value
     * where value = parseInt(voice.period / sample.divider) * vibVal
     * So we show the result as currentPeriod + vibAmount, but only update
     * the playback frequency (not the stored portamento period). */
    int displayPeriod = (int)p->currentPeriod + vibAmount;
    if (displayPeriod < MIN_PERIOD) displayPeriod = MIN_PERIOD;
    if (displayPeriod > MAX_PERIOD) displayPeriod = MAX_PERIOD;
    /* Store as the effective rendering period in a separate field */
    /* We reuse basePeriod as "display period" here temporarily */
    p->basePeriod = (uint16_t)displayPeriod;
  } else {
    p->basePeriod = p->currentPeriod;
  }

  /* ── Wobble oscillator: RHPlayer hiPos / loPos morphing ── */
  if (p->ins.hiPos > 0 && p->ins.sampleData != NULL) {
    int synthPos = p->synthPos;
    int loPos    = (int)p->ins.loPos;
    int hiPos    = (int)p->ins.hiPos;

    if (p->wobbleDir == 1) {
      /* backward */
      synthPos--;
      if (synthPos <= loPos) {
        p->wobbleDir = 0;
        /* Set a "click" at this position — per RHPlayer.js: memory[pointer + synthPos] = 60 */
        if (synthPos >= 0 && synthPos < p->ins.sampleLen) {
          p->ins.sampleData[synthPos] = 60;
        }
      }
    } else {
      /* forward */
      synthPos++;
      if (synthPos > hiPos) {
        p->wobbleDir = 1;
        if (synthPos >= 0 && synthPos < p->ins.sampleLen) {
          p->ins.sampleData[synthPos] = 60;
        }
      }
    }

    p->synthPos = synthPos;
    if (p->synthPos < 0)                    p->synthPos = 0;
    if (p->synthPos >= p->ins.sampleLen)    p->synthPos = p->ins.sampleLen - 1;
  }
}

/* ── WASM exports ─────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void *rh_init(int sampleRate) {
  RHContext *ctx = (RHContext *)calloc(1, sizeof(RHContext));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void rh_dispose(void *ctxPtr) {
  if (!ctxPtr) return;
  RHContext *ctx = (RHContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (ctx->players[i].ins.sampleData) {
      free(ctx->players[i].ins.sampleData);
      ctx->players[i].ins.sampleData = NULL;
    }
  }
  free(ctx);
}

EMSCRIPTEN_KEEPALIVE
int rh_create_player(void *ctxPtr) {
  if (!ctxPtr) return -1;
  RHContext *ctx = (RHContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].alive) {
      /* Free old sample data before clearing */
      if (ctx->players[i].ins.sampleData) {
        free(ctx->players[i].ins.sampleData);
      }
      memset(&ctx->players[i], 0, sizeof(RHPlayer));
      ctx->players[i].alive      = 1;
      ctx->players[i].sampleRate = ctx->sampleRate;
      ctx->players[i].samplesPerTick = ctx->sampleRate / TICKS_PER_SEC;
      ctx->players[i].busy       = 1;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void rh_destroy_player(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  RHContext *ctx = (RHContext *)ctxPtr;
  RHPlayer *p = &ctx->players[handle];
  if (p->ins.sampleData) {
    free(p->ins.sampleData);
    p->ins.sampleData = NULL;
  }
  memset(p, 0, sizeof(RHPlayer));
}

/**
 * Load instrument from binary blob.
 *
 * Blob layout:
 *   [0]       version byte (0, ignored)
 *   [1..2]    sampleLen    (uint16 LE)
 *   [3..4]    loopOffset   (int16 LE, signed; <0 = no loop)
 *   [5..6]    sampleVolume (uint16 LE, 0-64)
 *   [7..8]    relative     (uint16 LE)
 *   [9..10]   divider      (uint16 LE; 0 = no vibrato)
 *   [11..12]  vibratoIdx   (uint16 LE, index into vibTable where to reset on loop)
 *   [13..14]  hiPos        (uint16 LE; 0 = no wobble)
 *   [15..16]  loPos        (uint16 LE)
 *   [17..18]  vibratoLen   (uint16 LE)
 *   [19..19+vibratoLen-1]  vibrato table (signed int8)
 *   [19+vibratoLen..]      sample PCM (signed int8)
 */
EMSCRIPTEN_KEEPALIVE
int rh_load_instrument(void *ctxPtr, int handle, const uint8_t *data, int len) {
  if (!ctxPtr || !data || len < 19) return -1;
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;

  RHContext *ctx = (RHContext *)ctxPtr;
  RHPlayer *p = &ctx->players[handle];

  /* Free existing sample data */
  if (p->ins.sampleData) {
    free(p->ins.sampleData);
    p->ins.sampleData = NULL;
  }

  memset(&p->ins, 0, sizeof(RHInstrument));

  /* Byte 0: version (ignored) */
  /* Bytes 1-2: sampleLen */
  int sampleLen = (int)data[1] | ((int)data[2] << 8);
  /* Bytes 3-4: loopOffset (signed int16) */
  int loopRaw = (int)data[3] | ((int)data[4] << 8);
  /* Sign-extend from 16 bits */
  if (loopRaw >= 32768) loopRaw -= 65536;
  /* Bytes 5-6: sampleVolume */
  int sampleVol = (int)data[5] | ((int)data[6] << 8);
  /* Bytes 7-8: relative */
  int relative = (int)data[7] | ((int)data[8] << 8);
  /* Bytes 9-10: divider */
  int divider = (int)data[9] | ((int)data[10] << 8);
  /* Bytes 11-12: vibratoIdx */
  int vibratoIdx = (int)data[11] | ((int)data[12] << 8);
  /* Bytes 13-14: hiPos */
  int hiPos = (int)data[13] | ((int)data[14] << 8);
  /* Bytes 15-16: loPos */
  int loPos = (int)data[15] | ((int)data[16] << 8);
  /* Bytes 17-18: vibratoLen */
  int vibratoLen = (int)data[17] | ((int)data[18] << 8);

  if (vibratoLen > MAX_VIB_LEN) vibratoLen = MAX_VIB_LEN;

  p->ins.sampleLen   = sampleLen;
  p->ins.loopOffset  = loopRaw;
  p->ins.volume      = (sampleVol > 64) ? 64 : (uint16_t)sampleVol;
  p->ins.relative    = (relative <= 0) ? 1 : relative;
  p->ins.divider     = (uint16_t)divider;
  p->ins.hiPos       = (uint16_t)hiPos;
  p->ins.loPos       = (uint16_t)loPos;
  p->ins.vibTableLen = vibratoLen;
  p->ins.vibStartIdx = (vibratoIdx < vibratoLen) ? vibratoIdx : 0;

  /* Copy vibrato table */
  int vibOff = 19;
  if (vibratoLen > 0) {
    if (vibOff + vibratoLen <= len) {
      for (int i = 0; i < vibratoLen; i++) {
        p->ins.vibTable[i] = (int8_t)data[vibOff + i];
      }
    }
  }

  /* Copy sample PCM data */
  int pcmOff = vibOff + vibratoLen;
  if (sampleLen > 0 && pcmOff + sampleLen <= len) {
    if (sampleLen > MAX_SAMPLE_LEN) sampleLen = MAX_SAMPLE_LEN;
    p->ins.sampleData = (int8_t *)malloc(sampleLen);
    if (!p->ins.sampleData) return -4;
    for (int i = 0; i < sampleLen; i++) {
      p->ins.sampleData[i] = (int8_t)data[pcmOff + i];
    }
    p->ins.sampleLen = sampleLen;
  } else if (sampleLen > 0) {
    /* Partial data: allocate zeroed buffer */
    if (sampleLen > MAX_SAMPLE_LEN) sampleLen = MAX_SAMPLE_LEN;
    p->ins.sampleData = (int8_t *)calloc(sampleLen, 1);
    if (!p->ins.sampleData) return -4;
    p->ins.sampleLen = sampleLen;
  }

  return 0;
}

EMSCRIPTEN_KEEPALIVE
void rh_note_on(void *ctxPtr, int handle, int note, int velocity) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  RHContext *ctx = (RHContext *)ctxPtr;
  RHPlayer *p = &ctx->players[handle];
  (void)velocity; /* Rob Hubbard uses per-instrument volume, not velocity */

  int noteIdx = rh_clampNote(note - 24); /* MIDI 48 = Amiga C-2 = index 12 */
  if (noteIdx < 0)  noteIdx = 0;
  if (noteIdx > 83) noteIdx = 83;

  p->note = noteIdx;
  p->playing = 1;
  p->phase = 0.0f;
  p->sampleCtr = 0;
  p->busy = 0; /* allow loop pointer update on first tick */

  /* Compute base period: PERIODS[note] * relative >> 10 */
  int rawPeriod = ((int)RH_PERIODS[noteIdx] * p->ins.relative) >> 10;
  if (rawPeriod < MIN_PERIOD) rawPeriod = MIN_PERIOD;
  if (rawPeriod > MAX_PERIOD) rawPeriod = MAX_PERIOD;
  p->basePeriod    = (uint16_t)rawPeriod;
  p->currentPeriod = (uint16_t)rawPeriod;

  /* Volume: instrument volume (unless voice has overridden) */
  p->volume = (int)p->ins.volume;

  /* Reset portamento */
  p->portaActive = 0;
  p->portaSpeed  = 0;

  /* Reset vibrato to instrument start position */
  p->vibratoPos   = p->ins.vibStartIdx;
  p->vibratoStart = p->ins.vibStartIdx;

  /* Reset wobble */
  p->synthPos  = (int)p->ins.loPos;
  p->wobbleDir = 0;
}

EMSCRIPTEN_KEEPALIVE
void rh_note_off(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  RHContext *ctx = (RHContext *)ctxPtr;
  RHPlayer *p = &ctx->players[handle];
  p->playing = 0;
}

EMSCRIPTEN_KEEPALIVE
int rh_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
  if (!ctxPtr || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) return 0;
  RHContext *ctx = (RHContext *)ctxPtr;
  RHPlayer *p = &ctx->players[handle];

  memset(outL, 0, numSamples * sizeof(float));
  memset(outR, 0, numSamples * sizeof(float));

  if (!p->playing || !p->ins.sampleData || p->ins.sampleLen == 0) return numSamples;

  /* Volume normalisation: max Amiga vol=64, max sample amplitude=127 */
  const float volNorm = 1.0f / (64.0f * 127.0f);
  const int spTick = p->samplesPerTick > 0 ? p->samplesPerTick : (p->sampleRate / TICKS_PER_SEC);

  for (int i = 0; i < numSamples; i++) {
    if (!p->playing) break;

    /* Tick update at Amiga 50Hz */
    p->sampleCtr++;
    if (p->sampleCtr >= spTick) {
      p->sampleCtr = 0;
      rh_player_tick(p);
      if (!p->playing) break;
    }

    /* PCM playback at current period frequency */
    float freq = rh_periodToFreq(p->basePeriod);
    float phaseInc = freq / (float)p->sampleRate;

    int idx = (int)p->phase;

    if (idx >= p->ins.sampleLen) {
      if (p->ins.loopOffset >= 0) {
        /* Loop: jump back to loopOffset */
        while (idx >= p->ins.sampleLen) {
          idx -= (p->ins.sampleLen - (int)p->ins.loopOffset);
        }
        p->phase = (float)idx;
      } else {
        /* No loop: silence */
        p->playing = 0;
        break;
      }
    }

    if (idx < 0) idx = 0;
    if (idx >= p->ins.sampleLen) {
      p->playing = 0;
      break;
    }

    float sampleVal = (float)p->ins.sampleData[idx] * (float)p->volume * volNorm;

    outL[i] = sampleVal;
    outR[i] = sampleVal;

    p->phase += phaseInc;
  }

  return numSamples;
}

EMSCRIPTEN_KEEPALIVE
void rh_set_param(void *ctxPtr, int handle, int paramId, float value) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  RHContext *ctx = (RHContext *)ctxPtr;
  RHPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 0: /* volume (0-1 → 0-64) */
      p->volume = (int)(value * 64.0f);
      if (p->volume < 0)  p->volume = 0;
      if (p->volume > 64) p->volume = 64;
      break;
    case 1: /* portaSpeed (-1..+1 → signed int8) */
      p->portaSpeed = (int8_t)(value * 127.0f);
      p->portaActive = (p->portaSpeed != 0) ? 1 : 0;
      break;
    case 2: /* divider (0-1 → 0-255) */
      p->ins.divider = (uint16_t)(value * 255.0f);
      break;
  }
}

EMSCRIPTEN_KEEPALIVE
float rh_get_param(void *ctxPtr, int handle, int paramId) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return -1.0f;
  RHContext *ctx = (RHContext *)ctxPtr;
  RHPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 0: return (float)p->volume / 64.0f;
    case 1: return (float)p->portaSpeed / 127.0f;
    case 2: return (float)p->ins.divider / 255.0f;
  }
  return -1.0f;
}
