/**
 * davidwhittaker_synth.c — David Whittaker Amiga real-time synthesis WASM module
 *
 * Implements the format_synth_api for David Whittaker (.dw, .dwold) format.
 * Exported symbols use the "dw_" prefix.
 *
 * Synthesis model (ported from FlodJS DWPlayer.js by Christian Corti, Neoart):
 *   - Amiga period-based frequency: each tick steps through a frequency sequence
 *   - frqseq: signed-byte table; each byte is a semitone offset added to note index
 *     Special value: -128 (0x80) = loop, next byte = loop target (& 0x7f)
 *   - volseq: signed-byte table; normal bytes are volume (0-64)
 *     Special value: -128 (0x80) = loop, next byte = loop target (& 0x7f)
 *   - relative: tuning multiplier; freq period = (PERIODS[note + frqOff] * relative) >> 10
 *   - Vibrato: vibratoDelta moves toward vibratoDepth then reverses (triangle)
 *   - Square wave oscillator at period-based frequency
 *
 * Binary blob layout for dw_load_instrument():
 *   [0]         version = 0
 *   [1]         defaultVolume (0-64)
 *   [2]         relative_lo (relative & 0xFF)
 *   [3]         relative_hi ((relative >> 8) & 0xFF)
 *   [4]         vibratoSpeed (0-255)
 *   [5]         vibratoDepth (0-255)
 *   [6..7]      volseqLen (LE uint16)
 *   [8..]       volseq bytes (0-64 = volume; -128 = loop, next byte = target & 0x7f)
 *   [8+vl..9+vl] frqseqLen (LE uint16)
 *   [10+vl..]   frqseq bytes (signed, added to note index; -128 = loop, next byte = target)
 *
 * Standard Amiga period table (PAL, 5 octaves, 60 entries, C-1 through B-5):
 *   index 0  = C-1 (period 856)
 *   index 24 = C-3 (period 214, maps to MIDI 60)
 *
 * MIDI note mapping:
 *   amiga_note = midi_note - 36  (MIDI 60 = C-4 → amiga index 24)
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define MAX_PLAYERS      8
#define TICKS_PER_SEC    50      /* Amiga 50 Hz timer */
#define MAX_SEQ_LEN      1024    /* max frqseq / volseq length */

/* Special sequence value: -128 (0x80 as signed) = loop marker */
#define SEQ_LOOP         (-128)

/* ── Standard Amiga period table (60 entries, PAL) ──────────────────────────── */
/*   Entry 0 = C-1 (856), entry 59 = B-5 (28)                                   */

static const uint16_t PERIODS[60] = {
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,  /* C-1 .. B-1 */
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,  /* C-2 .. B-2 */
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,  /* C-3 .. B-3 */
  107, 101,  95,  90,  85,  80,  75,  71,  67,  63,  60,  56,  /* C-4 .. B-4 */
   53,  50,  47,  45,  42,  40,  37,  35,  33,  31,  30,  28   /* C-5 .. B-5 */
};

#define AMIGA_CLOCK  3546895.0f   /* Paula clock (PAL) */
#define PERIODS_LEN  60

/* ── Instrument ─────────────────────────────────────────────────────────────── */

typedef struct {
  uint8_t  defaultVolume;    /* 0-64 */
  uint16_t relative;         /* tuning multiplier (~8364 for A-440) */
  uint8_t  vibratoSpeed;     /* 0-255: LFO step size */
  uint8_t  vibratoDepth;     /* 0-255: LFO depth in period units */

  int8_t   volseq[MAX_SEQ_LEN];
  int      volseqLen;

  int8_t   frqseq[MAX_SEQ_LEN];
  int      frqseqLen;
} DWInstrument;

/* ── Player state ──────────────────────────────────────────────────────────── */

typedef struct {
  int          alive;
  int          sampleRate;
  int          samplesPerTick;

  DWInstrument ins;

  /* Playback */
  int          playing;
  int          baseNote;       /* 0-59 Amiga note index */

  /* Tick sub-sample counter */
  int          sampleCtr;

  /* Oscillator */
  float        phase;
  float        halfPeriodSamples;
  int          polarity;

  /* Frequency sequence */
  int          frqseqPos;
  int          frqseqOffset;   /* current signed offset from frqseq */

  /* Volume sequence */
  int          volseqPos;
  int          volume;         /* current volume 0-64 */

  /* Vibrato */
  int          vibratoDelta;   /* current LFO accumulator */
  int          vibratoDir;     /* +1 = increasing, -1 = decreasing */
} DWPlayer;

/* ── Context ────────────────────────────────────────────────────────────────── */

typedef struct {
  int       sampleRate;
  DWPlayer  players[MAX_PLAYERS];
} DWContext;

/* ── Helpers ────────────────────────────────────────────────────────────────── */

static int clampNote(int note) {
  if (note < 0)              note = 0;
  if (note >= PERIODS_LEN)   note = PERIODS_LEN - 1;
  return note;
}

static float computeHalfPeriodSamples(uint32_t amigaPeriod, int sampleRate) {
  if (amigaPeriod == 0) return (float)sampleRate;
  float full = (float)sampleRate * (float)amigaPeriod / AMIGA_CLOCK;
  return full * 0.5f;
}

/* ── Sequence stepper helpers ─────────────────────────────────────────────── */

/**
 * Advance frqseq by one step.
 * If current byte == SEQ_LOOP, read next byte as loop target and jump there.
 * Returns the signed offset to add to note index.
 */
static void dw_step_frqseq(DWPlayer *p) {
  int limit = 4;
  while (limit-- > 0) {
    if (p->frqseqPos < 0 || p->frqseqPos >= p->ins.frqseqLen) {
      p->frqseqPos = 0;
      return;
    }
    int8_t v = p->ins.frqseq[p->frqseqPos];
    if (v == (int8_t)SEQ_LOOP) {
      /* Next byte = loop target */
      int nextPos = p->frqseqPos + 1;
      if (nextPos < p->ins.frqseqLen) {
        int target = (uint8_t)p->ins.frqseq[nextPos] & 0x7f;
        p->frqseqPos = target;
      } else {
        p->frqseqPos = 0;
      }
      /* Continue to process byte at target */
      continue;
    }
    /* Normal offset value */
    p->frqseqOffset = (int)v;
    p->frqseqPos++;
    return;
  }
}

/**
 * Advance volseq by one step.
 * If current byte == SEQ_LOOP, jump to loop target (next byte & 0x7f).
 */
static void dw_step_volseq(DWPlayer *p) {
  int limit = 4;
  while (limit-- > 0) {
    if (p->volseqPos < 0 || p->volseqPos >= p->ins.volseqLen) {
      p->volseqPos = 0;
      return;
    }
    int8_t v = p->ins.volseq[p->volseqPos];
    if (v == (int8_t)SEQ_LOOP) {
      int nextPos = p->volseqPos + 1;
      if (nextPos < p->ins.volseqLen) {
        int target = (uint8_t)p->ins.volseq[nextPos] & 0x7f;
        p->volseqPos = target;
      } else {
        p->volseqPos = 0;
      }
      continue;
    }
    /* Normal volume value (0-64) */
    p->volume = (int)(uint8_t)v;
    if (p->volume > 64) p->volume = 64;
    p->volseqPos++;
    return;
  }
}

/* ── Tick-level update ─────────────────────────────────────────────────────── */

static void dw_player_tick(DWPlayer *p) {
  if (!p->playing) return;

  /* Step frequency sequence */
  dw_step_frqseq(p);

  /* Step volume sequence */
  dw_step_volseq(p);

  /* Compute Amiga period */
  int noteIdx = clampNote(p->baseNote + p->frqseqOffset);
  uint32_t period = PERIODS[noteIdx];

  /* Scale by relative tuning: period = (period * relative) >> 10 */
  if (p->ins.relative > 0) {
    period = ((uint32_t)period * (uint32_t)p->ins.relative) >> 10;
  }

  /* Vibrato: triangle LFO applied as period offset */
  if (p->ins.vibratoDepth > 0 && p->ins.vibratoSpeed > 0) {
    int depth = (int)p->ins.vibratoDepth;
    int speed = (int)p->ins.vibratoSpeed;

    if (p->vibratoDir > 0) {
      p->vibratoDelta += speed;
      if (p->vibratoDelta >= depth) {
        p->vibratoDelta = depth;
        p->vibratoDir = -1;
      }
    } else {
      p->vibratoDelta -= speed;
      if (p->vibratoDelta <= 0) {
        p->vibratoDelta = 0;
        p->vibratoDir = 1;
      }
    }

    period = (uint32_t)((int32_t)period + p->vibratoDelta);
  }

  /* Clamp period to valid Amiga range */
  if (period < 28)    period = 28;
  if (period > 65535) period = 65535;

  /* Update oscillator half-period */
  p->halfPeriodSamples = computeHalfPeriodSamples(period, p->sampleRate);
  if (p->halfPeriodSamples < 1.0f) p->halfPeriodSamples = 1.0f;
}

/* ── WASM exports ─────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void *dw_init(int sampleRate) {
  DWContext *ctx = (DWContext *)calloc(1, sizeof(DWContext));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void dw_dispose(void *ctxPtr) {
  if (!ctxPtr) return;
  free(ctxPtr);
}

EMSCRIPTEN_KEEPALIVE
int dw_create_player(void *ctxPtr) {
  if (!ctxPtr) return -1;
  DWContext *ctx = (DWContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].alive) {
      memset(&ctx->players[i], 0, sizeof(DWPlayer));
      ctx->players[i].alive          = 1;
      ctx->players[i].sampleRate     = ctx->sampleRate;
      ctx->players[i].samplesPerTick = ctx->sampleRate / TICKS_PER_SEC;
      ctx->players[i].polarity       = 1;
      ctx->players[i].vibratoDir     = 1;
      ctx->players[i].baseNote       = -1;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void dw_destroy_player(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  DWContext *ctx = (DWContext *)ctxPtr;
  memset(&ctx->players[handle], 0, sizeof(DWPlayer));
}

EMSCRIPTEN_KEEPALIVE
int dw_load_instrument(void *ctxPtr, int handle, const uint8_t *data, int len) {
  if (!ctxPtr || !data || len < 8) return -1;
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;

  DWContext *ctx = (DWContext *)ctxPtr;
  DWPlayer  *p   = &ctx->players[handle];

  memset(&p->ins, 0, sizeof(DWInstrument));

  /* Byte 0: version (unused) */
  /* Byte 1: defaultVolume */
  p->ins.defaultVolume = data[1] & 0x7F;
  if (p->ins.defaultVolume > 64) p->ins.defaultVolume = 64;

  /* Bytes 2-3: relative (LE uint16) */
  p->ins.relative = (uint16_t)data[2] | ((uint16_t)data[3] << 8);
  if (p->ins.relative == 0) p->ins.relative = 8364; /* default A-440 */

  /* Byte 4: vibratoSpeed */
  p->ins.vibratoSpeed = data[4];

  /* Byte 5: vibratoDepth */
  p->ins.vibratoDepth = data[5];

  /* Bytes 6-7: volseqLen (LE uint16) */
  int volseqLen = (int)data[6] | ((int)data[7] << 8);
  if (volseqLen > MAX_SEQ_LEN) volseqLen = MAX_SEQ_LEN;
  p->ins.volseqLen = volseqLen;

  int pos = 8;
  if (volseqLen > 0 && pos + volseqLen <= len) {
    memcpy(p->ins.volseq, data + pos, volseqLen);
    pos += volseqLen;
  }

  /* frqseqLen (LE uint16) */
  if (pos + 2 <= len) {
    int frqseqLen = (int)data[pos] | ((int)data[pos + 1] << 8);
    if (frqseqLen > MAX_SEQ_LEN) frqseqLen = MAX_SEQ_LEN;
    p->ins.frqseqLen = frqseqLen;
    pos += 2;

    if (frqseqLen > 0 && pos + frqseqLen <= len) {
      memcpy(p->ins.frqseq, data + pos, frqseqLen);
    }
  }

  return 0;
}

EMSCRIPTEN_KEEPALIVE
void dw_note_on(void *ctxPtr, int handle, int note, int velocity) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  DWContext *ctx = (DWContext *)ctxPtr;
  DWPlayer  *p   = &ctx->players[handle];
  (void)velocity; /* velocity not used — volume is sequence-driven */

  /* Map MIDI note to Amiga note index.
   * MIDI 60 (C-4) → Amiga index 24 (C-3, period 214)
   * Formula: amiga_note = midi_note - 36  */
  int noteIdx = note - 36;
  if (noteIdx < 0)             noteIdx = 0;
  if (noteIdx >= PERIODS_LEN)  noteIdx = PERIODS_LEN - 1;

  p->baseNote     = noteIdx;
  p->playing      = 1;
  p->phase        = 0.0f;
  p->polarity     = 1;
  p->sampleCtr    = 0;

  /* Reset sequences */
  p->frqseqPos    = 0;
  p->frqseqOffset = 0;
  p->volseqPos    = 0;
  p->volume       = (int)p->ins.defaultVolume;

  /* Reset vibrato */
  p->vibratoDelta = 0;
  p->vibratoDir   = 1;

  /* Set initial period */
  uint32_t period = PERIODS[noteIdx];
  if (p->ins.relative > 0) {
    period = ((uint32_t)period * (uint32_t)p->ins.relative) >> 10;
  }
  if (period < 28)    period = 28;
  if (period > 65535) period = 65535;

  p->halfPeriodSamples = computeHalfPeriodSamples(period, p->sampleRate);
  if (p->halfPeriodSamples < 1.0f) p->halfPeriodSamples = 1.0f;
}

EMSCRIPTEN_KEEPALIVE
void dw_note_off(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  DWContext *ctx = (DWContext *)ctxPtr;
  ctx->players[handle].playing = 0;
}

EMSCRIPTEN_KEEPALIVE
int dw_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
  if (!ctxPtr || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) return 0;
  DWContext *ctx = (DWContext *)ctxPtr;
  DWPlayer  *p   = &ctx->players[handle];

  memset(outL, 0, numSamples * sizeof(float));
  memset(outR, 0, numSamples * sizeof(float));

  if (!p->playing) return numSamples;

  /* Volume normalisation: max volume=64, square amplitude=1.0 */
  const float volNorm = 1.0f / 64.0f;
  const int spTick = p->samplesPerTick > 0 ? p->samplesPerTick : (p->sampleRate / TICKS_PER_SEC);

  for (int i = 0; i < numSamples; i++) {
    if (!p->playing) break;

    /* Tick update at Amiga 50 Hz */
    p->sampleCtr++;
    if (p->sampleCtr >= spTick) {
      p->sampleCtr = 0;
      dw_player_tick(p);
      if (!p->playing) break;
    }

    /* Square wave oscillator */
    p->phase += 1.0f;
    if (p->phase >= p->halfPeriodSamples) {
      p->phase -= p->halfPeriodSamples;
      p->polarity = -p->polarity;
    }

    float vol    = (float)p->volume * volNorm;
    float sample = (float)p->polarity * vol;

    outL[i] = sample;
    outR[i] = sample;
  }

  return numSamples;
}

EMSCRIPTEN_KEEPALIVE
void dw_set_param(void *ctxPtr, int handle, int paramId, float value) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  DWContext *ctx = (DWContext *)ctxPtr;
  DWPlayer  *p   = &ctx->players[handle];

  switch (paramId) {
    case 0: /* volume (0-1 → 0-64) */
      p->volume = (int)(value * 64.0f);
      if (p->volume < 0)  p->volume = 0;
      if (p->volume > 64) p->volume = 64;
      break;
    case 1: /* vibratoDepth (0-1 → 0-255) */
      p->ins.vibratoDepth = (uint8_t)(value * 255.0f);
      break;
    case 2: /* vibratoSpeed (0-1 → 0-255) */
      p->ins.vibratoSpeed = (uint8_t)(value * 255.0f);
      break;
    case 3: /* relative tuning (0-1 → 1-16383) */
      {
        int rel = 1 + (int)(value * 16382.0f);
        if (rel < 1)     rel = 1;
        if (rel > 16383) rel = 16383;
        p->ins.relative = (uint16_t)rel;
      }
      break;
  }
}

EMSCRIPTEN_KEEPALIVE
float dw_get_param(void *ctxPtr, int handle, int paramId) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return -1.0f;
  DWContext *ctx = (DWContext *)ctxPtr;
  DWPlayer  *p   = &ctx->players[handle];

  switch (paramId) {
    case 0: return (float)p->volume / 64.0f;
    case 1: return (float)p->ins.vibratoDepth / 255.0f;
    case 2: return (float)p->ins.vibratoSpeed / 255.0f;
    case 3: return (float)(p->ins.relative - 1) / 16382.0f;
  }
  return -1.0f;
}
