/**
 * hippel_coso_synth.c — Jochen Hippel CoSo real-time synthesis WASM module
 *
 * Implements the format_synth_api for Jochen Hippel CoSo (.hipc, .soc) format.
 * Exported symbols use the "hc_" prefix.
 *
 * Synthesis model (ported from FlodJS JHPlayer.js by Christian Corti, Neoart):
 *   - Amiga period-based frequency (freq = 3546895 / period)
 *   - Frequency sequence (fseq): signed-byte table stepped each tick
 *     Special values: -32=loop, -31=end, -24=delay, others=transpose
 *   - Volume sequence (vseq): stepped each volSpeed ticks
 *     Special values: -32=loop, -24=sustain, others=volume (0-63)
 *   - Vibrato: triangle LFO on period, delayed by vibDelay ticks
 *     variants: simple bidirectional triangle delta
 *   - Portamento: period delta accumulation each tick
 *   - Square wave oscillator: polarity flips when phase crosses half-period
 *
 * Binary blob layout for hc_load_instrument():
 *   [0]       version byte (format marker, currently 0)
 *   [1]       volSpeed  (ticks per volume sequence step)
 *   [2]       vibSpeed  (ticks per vibrato LFO step, signed byte)
 *   [3]       vibDepth  (vibrato depth, 0=off)
 *   [4]       vibDelay  (ticks before vibrato starts)
 *   [5..6]    fseqLen   (uint16 LE, number of fseq bytes following)
 *   [7..N]    fseq data (signed bytes: transpose values + special codes)
 *   [N+1..N+2] vseqLen  (uint16 LE)
 *   [N+3..]   vseq data (signed bytes: volume 0-63 + special codes)
 *
 * Amiga period table (from FlodJS JHPlayer.js PERIODS[]):
 *   index 0..83 maps to C-1 through B-6 (or similar).
 *   CoSo clamps notes >83 to 0.
 *
 * Volume is 0-63 (Amiga range). Output normalised to [-1, +1] by dividing
 * by (63 * 128) — max volume * square wave amplitude.
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <emscripten.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define MAX_PLAYERS      8
#define TICKS_PER_SEC    50     /* Amiga 50 Hz timer */
#define MAX_SEQ_LEN      1024   /* max fseq / vseq length */

/* Fseq special command bytes (signed) */
#define FSEQ_LOOP        (-32)  /* loop: next byte = target position (& 63) */
#define FSEQ_END         (-31)  /* end of sequence: reset to position 0     */
#define FSEQ_DELAY       (-24)  /* delay: next byte = tick count             */

/* Vseq special command bytes (signed) */
#define VSEQ_LOOP        (-32)  /* loop: next byte = target position & 63   */
#define VSEQ_SUSTAIN     (-24)  /* sustain: next byte = tick count           */
/* Vseq range −31..−25 = treat as end-of-sequence / stop                     */

/* ── Amiga period table (from JHPlayer.js PERIODS[84]) ─────────────────────── */

static const uint16_t PERIODS[84] = {
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

#define AMIGA_CLOCK      3546895.0f   /* Paula clock (PAL) */

/* ── Instrument ─────────────────────────────────────────────────────────────── */

typedef struct {
  /* Volume sequence */
  int8_t   vseq[MAX_SEQ_LEN];
  int      vseqLen;
  uint8_t  volSpeed;   /* ticks per vseq step (≥1) */

  /* Frequency sequence */
  int8_t   fseq[MAX_SEQ_LEN];
  int      fseqLen;

  /* Vibrato */
  int8_t   vibSpeed;   /* signed: if negative, toggles direction each tick */
  uint8_t  vibDepth;   /* depth in period units */
  uint8_t  vibDelay;   /* ticks before vibrato activates */
} HCInstrument;

/* ── Player state ──────────────────────────────────────────────────────────── */

typedef struct {
  int          alive;
  int          sampleRate;
  int          samplesPerTick;

  HCInstrument ins;

  /* Playback state */
  int          playing;
  int          baseNote;      /* 0-83 Amiga note index */

  /* Tick sub-sample counter */
  int          sampleCtr;

  /* Oscillator */
  float        phase;         /* sample position within current half-period cycle */
  float        halfPeriodSamples; /* half-cycle length at current period */
  int          polarity;      /* +1 or -1 (square wave current half) */

  /* Frequency sequence */
  int          fseqPos;
  int          fseqTick;      /* tick delay countdown */
  int          fseqTranspose; /* current transpose value from fseq */

  /* Volume sequence */
  int          vseqPos;
  int          volCounter;    /* counts up to volSpeed */
  int          volSustain;    /* sustain countdown (ticks) */
  int          volume;        /* current volume 0-63 */

  /* Vibrato */
  int          vibDelayCtr;   /* ticks until vibrato starts */
  int          vibDelta;      /* current LFO delta */
  int          vibDir;        /* +1 = increasing, -1 = decreasing */
  int          vibToggle;     /* for variant1 toggle-each-tick */

  /* Portamento */
  int32_t      portaDelta;    /* accumulated portamento delta */
  int          portaInfo;     /* info byte (bit5 = portamento active) */
  int8_t       portaParam;    /* portamento parameter */

  /* Period */
  uint16_t     currentPeriod; /* Amiga period after all modulation */
} HCPlayer;

/* ── Context ────────────────────────────────────────────────────────────────── */

typedef struct {
  int       sampleRate;
  HCPlayer  players[MAX_PLAYERS];
} HCContext;

/* ── Helpers ────────────────────────────────────────────────────────────────── */

/**
 * Convert Amiga period → frequency in Hz.
 * freq = AMIGA_CLOCK / period
 */
static float periodToFreq(uint16_t period) {
  if (period == 0) return 0.0f;
  return AMIGA_CLOCK / (float)period;
}

/**
 * Compute half-period length in samples.
 * Square wave period in samples = sampleRate / freq = sampleRate * period / AMIGA_CLOCK
 * Half = that / 2
 */
static float computeHalfPeriodSamples(uint16_t period, int sampleRate) {
  if (period == 0) return (float)sampleRate;
  float fullPeriodSamples = (float)sampleRate * (float)period / AMIGA_CLOCK;
  return fullPeriodSamples * 0.5f;
}

/**
 * Clamp note index to valid range [0, 83].
 */
static int clampNote(int note) {
  if (note < 0)  note = 0;
  if (note > 83) note = 0;  /* JHPlayer: >83 → clamp to 0 */
  return note;
}

/* ── Tick-level update ─────────────────────────────────────────────────────── */

static void hc_player_tick(HCPlayer *p) {
  if (!p->playing) return;

  /* ── Frequency sequence step ─── */
  if (p->fseqTick > 0) {
    p->fseqTick--;
  } else {
    /* Walk fseq, processing commands */
    int limit = 4; /* guard against infinite loops in malformed data */
    while (limit-- > 0) {
      if (p->fseqPos < 0 || p->fseqPos >= p->ins.fseqLen) {
        p->fseqPos = 0;
        break;
      }
      int8_t v = p->ins.fseq[p->fseqPos];

      if (v == FSEQ_LOOP) {
        /* next byte = loop target position */
        int nextPos = p->fseqPos + 1;
        if (nextPos < p->ins.fseqLen) {
          int target = (uint8_t)p->ins.fseq[nextPos] & 63;
          p->fseqPos = target;
        } else {
          p->fseqPos = 0;
        }
        continue; /* process the byte at loop target */
      } else if (v == FSEQ_END) {
        /* reset to beginning */
        p->fseqPos = 0;
        continue;
      } else if (v == FSEQ_DELAY) {
        /* next byte = delay ticks */
        int nextPos = p->fseqPos + 1;
        if (nextPos < p->ins.fseqLen) {
          p->fseqTick = (uint8_t)p->ins.fseq[nextPos];
        }
        p->fseqPos += 2;
        break;
      } else {
        /* Normal transpose value */
        p->fseqTranspose = (int)v;
        p->fseqPos++;
        break;
      }
    }
  }

  /* ── Volume sequence step ─── */
  if (p->volSustain > 0) {
    p->volSustain--;
  } else {
    p->volCounter--;
    if (p->volCounter <= 0) {
      int speed = (int)p->ins.volSpeed;
      if (speed < 1) speed = 1;
      p->volCounter = speed;

      /* Walk vseq */
      int limit = 4;
      while (limit-- > 0) {
        if (p->vseqPos < 0 || p->vseqPos >= p->ins.vseqLen) {
          p->vseqPos = 0;
          break;
        }
        int8_t v = p->ins.vseq[p->vseqPos];

        /* Values ≤ -25 and ≥ -31 = end-of-sequence sentinel (stop) */
        if (v >= -31 && v <= -25) {
          /* hold last volume, no advance */
          break;
        }

        if (v == VSEQ_LOOP) {
          int nextPos = p->vseqPos + 1;
          if (nextPos < p->ins.vseqLen) {
            /* target is (readUbyte & 63) - 5 per JHPlayer vseq loop */
            int target = ((uint8_t)p->ins.vseq[nextPos] & 63);
            if (target < 5) target = 0;
            else target -= 5;
            p->vseqPos = target;
          } else {
            p->vseqPos = 0;
          }
          continue;
        } else if (v == VSEQ_SUSTAIN) {
          int nextPos = p->vseqPos + 1;
          if (nextPos < p->ins.vseqLen) {
            p->volSustain = (uint8_t)p->ins.vseq[nextPos];
          }
          p->vseqPos += 2;
          break;
        } else {
          /* Normal volume value */
          p->volume = (int)v;
          if (p->volume < 0)  p->volume = 0;
          if (p->volume > 63) p->volume = 63;
          p->vseqPos++;
          break;
        }
      }
    }
  }

  /* ── Compute period for this tick ─── */
  int noteIdx = clampNote(p->baseNote + p->fseqTranspose);
  uint16_t period = PERIODS[noteIdx];

  /* ── Vibrato ─── */
  if (p->vibDelayCtr > 0) {
    p->vibDelayCtr--;
  } else if (p->ins.vibDepth > 0) {
    int depth = (int)p->ins.vibDepth;
    int speed = (int)p->ins.vibSpeed;
    if (speed < 0) {
      /* signed speed: toggle direction each tick */
      speed &= 127;
      p->vibToggle ^= 1;
    }
    if (!p->vibToggle) {
      if (p->vibDir > 0) {
        p->vibDelta += speed;
        if (p->vibDelta >= depth * 2) {
          p->vibDir = -1;
          p->vibDelta = depth * 2;
        }
      } else {
        p->vibDelta -= speed;
        if (p->vibDelta < 0) {
          p->vibDir = 1;
          p->vibDelta = 0;
        }
      }
    }
    /* Apply: vibDelta - depth = offset in period units (variant1 style) */
    int periodDelta = p->vibDelta - depth;
    if (periodDelta != 0) {
      /* JHPlayer variant1/2 vibrato: shift period based on octave */
      int value = (int)period + 160;
      int delta = periodDelta;
      while (value < 256) {
        delta += delta;
        value += 24;
      }
      period = (uint16_t)((int)period + delta);
    }
  }

  /* Clamp period to valid range */
  if (period < 113) period = 113;
  if (period > 6848) period = 6848;

  p->currentPeriod = period;

  /* Update oscillator half-period length */
  p->halfPeriodSamples = computeHalfPeriodSamples(period, p->sampleRate);
  if (p->halfPeriodSamples < 1.0f) p->halfPeriodSamples = 1.0f;
}

/* ── WASM exports ─────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void *hc_init(int sampleRate) {
  HCContext *ctx = (HCContext *)calloc(1, sizeof(HCContext));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void hc_dispose(void *ctxPtr) {
  if (!ctxPtr) return;
  free(ctxPtr);
}

EMSCRIPTEN_KEEPALIVE
int hc_create_player(void *ctxPtr) {
  if (!ctxPtr) return -1;
  HCContext *ctx = (HCContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].alive) {
      memset(&ctx->players[i], 0, sizeof(HCPlayer));
      ctx->players[i].alive        = 1;
      ctx->players[i].sampleRate   = ctx->sampleRate;
      ctx->players[i].samplesPerTick = ctx->sampleRate / TICKS_PER_SEC;
      ctx->players[i].polarity     = 1;
      ctx->players[i].vibDir       = 1;
      ctx->players[i].baseNote     = -1;
      ctx->players[i].volCounter   = 1;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void hc_destroy_player(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  HCContext *ctx = (HCContext *)ctxPtr;
  memset(&ctx->players[handle], 0, sizeof(HCPlayer));
}

EMSCRIPTEN_KEEPALIVE
int hc_load_instrument(void *ctxPtr, int handle, const uint8_t *data, int len) {
  if (!ctxPtr || !data || len < 7) return -1;
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;

  HCContext *ctx = (HCContext *)ctxPtr;
  HCPlayer *p = &ctx->players[handle];

  memset(&p->ins, 0, sizeof(HCInstrument));

  /* Byte 0: version marker (currently unused) */
  /* Byte 1: volSpeed */
  p->ins.volSpeed  = data[1];
  if (p->ins.volSpeed < 1) p->ins.volSpeed = 1;

  /* Bytes 2-4: vibrato */
  p->ins.vibSpeed  = (int8_t)data[2];
  p->ins.vibDepth  = data[3];
  p->ins.vibDelay  = data[4];

  /* Bytes 5-6: fseqLen (LE uint16) */
  int fseqLen = (int)data[5] | ((int)data[6] << 8);
  if (fseqLen > MAX_SEQ_LEN) fseqLen = MAX_SEQ_LEN;
  p->ins.fseqLen = fseqLen;

  int pos = 7;
  if (fseqLen > 0 && pos + fseqLen <= len) {
    memcpy(p->ins.fseq, data + pos, fseqLen);
    pos += fseqLen;
  }

  /* vseqLen (LE uint16) */
  if (pos + 2 <= len) {
    int vseqLen = (int)data[pos] | ((int)data[pos + 1] << 8);
    if (vseqLen > MAX_SEQ_LEN) vseqLen = MAX_SEQ_LEN;
    p->ins.vseqLen = vseqLen;
    pos += 2;

    if (vseqLen > 0 && pos + vseqLen <= len) {
      memcpy(p->ins.vseq, data + pos, vseqLen);
    }
  }

  return 0;
}

EMSCRIPTEN_KEEPALIVE
void hc_note_on(void *ctxPtr, int handle, int note, int velocity) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  HCContext *ctx = (HCContext *)ctxPtr;
  HCPlayer *p = &ctx->players[handle];
  (void)velocity; /* velocity not used in CoSo — volume is sequence-driven */

  /* Map MIDI note to CoSo note index (MIDI 48 = C-3 = Amiga C-2 = index 24) */
  /* Amiga C-1 = index 12, so: index = note - 36 (MIDI 36 = C-2 = index 0) */
  /* We shift by 24 to put MIDI 60 (C-4) at Amiga index 36 (C-3) */
  int noteIdx = note - 24;
  if (noteIdx < 0)  noteIdx = 0;
  if (noteIdx > 83) noteIdx = 83;

  p->baseNote      = noteIdx;
  p->playing       = 1;
  p->phase         = 0.0f;
  p->polarity      = 1;
  p->sampleCtr     = 0;

  /* Reset sequences */
  p->fseqPos       = 0;
  p->fseqTick      = 0;
  p->fseqTranspose = 0;

  p->vseqPos       = 0;
  p->volSustain    = 0;
  p->volCounter    = 1;
  p->volume        = 0;

  /* Vibrato */
  p->vibDelayCtr   = (int)p->ins.vibDelay;
  p->vibDelta      = 0;
  p->vibDir        = 1;
  p->vibToggle     = 0;

  /* Portamento */
  p->portaDelta    = 0;

  /* Set initial period */
  p->currentPeriod = PERIODS[noteIdx];
  p->halfPeriodSamples = computeHalfPeriodSamples(p->currentPeriod, p->sampleRate);
  if (p->halfPeriodSamples < 1.0f) p->halfPeriodSamples = 1.0f;
}

EMSCRIPTEN_KEEPALIVE
void hc_note_off(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  HCContext *ctx = (HCContext *)ctxPtr;
  HCPlayer *p = &ctx->players[handle];
  p->playing = 0;
}

EMSCRIPTEN_KEEPALIVE
int hc_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
  if (!ctxPtr || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) return 0;
  HCContext *ctx = (HCContext *)ctxPtr;
  HCPlayer *p = &ctx->players[handle];

  memset(outL, 0, numSamples * sizeof(float));
  memset(outR, 0, numSamples * sizeof(float));

  if (!p->playing) return numSamples;

  /* Volume normalisation: max volume=63, square amplitude=1.0
   * Divide by 63 to get [0, 1] range. */
  const float volNorm = 1.0f / 63.0f;
  const int spTick = p->samplesPerTick > 0 ? p->samplesPerTick : (p->sampleRate / TICKS_PER_SEC);

  for (int i = 0; i < numSamples; i++) {
    if (!p->playing) break;

    /* Tick update at Amiga 50Hz */
    p->sampleCtr++;
    if (p->sampleCtr >= spTick) {
      p->sampleCtr = 0;
      hc_player_tick(p);
      if (!p->playing) break;
    }

    /* Square wave oscillator */
    p->phase += 1.0f;
    if (p->phase >= p->halfPeriodSamples) {
      p->phase -= p->halfPeriodSamples;
      p->polarity = -p->polarity;
    }

    float vol = (float)p->volume * volNorm;
    float sample = (float)p->polarity * vol;

    outL[i] = sample;
    outR[i] = sample;
  }

  return numSamples;
}

EMSCRIPTEN_KEEPALIVE
void hc_set_param(void *ctxPtr, int handle, int paramId, float value) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  HCContext *ctx = (HCContext *)ctxPtr;
  HCPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 0: /* volume (0-1 → 0-63) */
      p->volume = (int)(value * 63.0f);
      if (p->volume < 0)  p->volume = 0;
      if (p->volume > 63) p->volume = 63;
      break;
    case 1: /* vibDepth (0-1 → 0-255) */
      p->ins.vibDepth = (uint8_t)(value * 255.0f);
      break;
    case 2: /* vibSpeed (0-1 → 0-127, signed treated as unsigned) */
      p->ins.vibSpeed = (int8_t)(value * 127.0f);
      break;
    case 3: /* vibDelay (0-1 → 0-255) */
      p->ins.vibDelay = (uint8_t)(value * 255.0f);
      break;
    case 4: /* volSpeed (0-1 → 1-16) */
      {
        int sp = 1 + (int)(value * 15.0f);
        if (sp < 1) sp = 1;
        p->ins.volSpeed = (uint8_t)sp;
      }
      break;
  }
}

EMSCRIPTEN_KEEPALIVE
float hc_get_param(void *ctxPtr, int handle, int paramId) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return -1.0f;
  HCContext *ctx = (HCContext *)ctxPtr;
  HCPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 0: return (float)p->volume / 63.0f;
    case 1: return (float)p->ins.vibDepth / 255.0f;
    case 2: return (float)(uint8_t)p->ins.vibSpeed / 127.0f;
    case 3: return (float)p->ins.vibDelay / 255.0f;
    case 4: return (float)(p->ins.volSpeed - 1) / 15.0f;
  }
  return -1.0f;
}
