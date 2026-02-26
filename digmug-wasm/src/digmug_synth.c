/**
 * digmug_synth.c — Digital Mugician real-time wavetable synthesis WASM module
 *
 * Implements the format_synth_api.h interface for Digital Mugician (.dmu, .mug) formats.
 * Exported symbols use the "dm_" prefix.
 *
 * Instrument model:
 *   - Type 0 (wavetable): up to 128-byte embedded waveform cycled as an oscillator,
 *     with optional morphing between 4 waveform slots, arpeggio, and vibrato.
 *   - Type 1 (pcm): Raw 8-bit PCM playback with loop, arpeggio, and vibrato.
 *
 * Binary blob layout for dm_load_instrument():
 *   [0]       type: 0=wavetable, 1=pcm
 *   --- WAVETABLE (type=0) ---
 *   [1]       wave[0] index (0-31, reference only — actual data in waveData)
 *   [2]       wave[1] index
 *   [3]       wave[2] index
 *   [4]       wave[3] index
 *   [5]       waveBlend: 0-63 (morph position across 4 wave slots)
 *   [6]       waveSpeed: 0-63 (morph rate per tick)
 *   [7]       volume: 0-64
 *   [8]       arpSpeed: 0-15 ticks per step
 *   [9..16]   arpTable[8] (signed bytes: semitone offsets)
 *   [17]      vibSpeed: 0-63 ticks per LFO step
 *   [18]      vibDepth: 0-63 (1/32 semitone units)
 *   [19]      reserved (0)
 *   [20..23]  waveDataLen (uint32 LE) — N bytes of embedded waveform samples
 *   [24..]    waveData (signed int8 PCM, one cycle; length = waveDataLen)
 *   --- PCM (type=1) ---
 *   [1]       volume: 0-64
 *   [2]       arpSpeed: 0-15
 *   [3..10]   arpTable[8] (signed bytes)
 *   [11]      vibSpeed: 0-63
 *   [12]      vibDepth: 0-63
 *   [13..16]  pcmLen (uint32 LE)
 *   [17..20]  loopStart (uint32 LE)
 *   [21..24]  loopLength (uint32 LE, 0=no loop)
 *   [25..]    pcmData (signed int8)
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <emscripten.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define DM_WAVE_MAX    128
#define DM_ARP_SIZE     8
#define MAX_PLAYERS     8

/* ── Instrument structure ───────────────────────────────────────────────────── */

typedef struct {
  int     type;           /* 0=wavetable, 1=pcm */

  /* Wavetable */
  int8_t  waveData[DM_WAVE_MAX];
  int     waveLen;        /* actual length of embedded waveform (1-128) */
  uint8_t waveBlend;      /* 0-63: morph position */
  uint8_t waveSpeed;      /* 0-63: morph rate */
  uint8_t volume;         /* 0-64 */

  /* Arpeggio */
  int8_t  arpTable[DM_ARP_SIZE];
  uint8_t arpSpeed;       /* 0-15 ticks per step */

  /* Vibrato */
  uint8_t vibSpeed;       /* 0-63 ticks per LFO step */
  uint8_t vibDepth;       /* 0-63 (semitone/32 units) */

  /* PCM fields */
  int8_t *pcmData;
  int     pcmLen;
  int     loopStart;
  int     loopLen;
} DMInstrument;

/* ── Player state ──────────────────────────────────────────────────────────── */

typedef struct {
  int         alive;
  int         sampleRate;

  DMInstrument ins;

  float       phase;          /* for wavetable: [0, waveLen); for pcm: byte index */
  float       phaseInc;       /* per-sample increment */
  int         baseNote;
  int         playing;

  /* Vibrato */
  float       vibPhase;       /* [0, 64) */
  int         vibTickCtr;
  int         vibTickSamples;

  /* Arpeggio (tick-driven at ~50Hz) */
  int         samplesPerTick;
  int         tickCtr;
  int         arpIdx;
  int         arpTickCtr;
} DMPlayer;

/* ── Context ──────────────────────────────────────────────────────────────── */

typedef struct {
  int       sampleRate;
  DMPlayer  players[MAX_PLAYERS];
} DMContext;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

static float midiNoteToFreq(int note) {
  return 440.0f * powf(2.0f, (note - 69) / 12.0f);
}

static float sineLFO(float phase) {
  return sinf(phase * 6.283185307f / 64.0f);
}

/* ── WASM exports ─────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void *dm_init(int sampleRate) {
  DMContext *ctx = (DMContext *)calloc(1, sizeof(DMContext));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void dm_dispose(void *ctxPtr) {
  if (!ctxPtr) return;
  DMContext *ctx = (DMContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (ctx->players[i].ins.pcmData) {
      free(ctx->players[i].ins.pcmData);
      ctx->players[i].ins.pcmData = NULL;
    }
  }
  free(ctx);
}

EMSCRIPTEN_KEEPALIVE
int dm_create_player(void *ctxPtr) {
  if (!ctxPtr) return -1;
  DMContext *ctx = (DMContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].alive) {
      memset(&ctx->players[i], 0, sizeof(DMPlayer));
      ctx->players[i].alive = 1;
      ctx->players[i].sampleRate = ctx->sampleRate;
      ctx->players[i].samplesPerTick = ctx->sampleRate / 50;
      ctx->players[i].baseNote = -1;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void dm_destroy_player(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  DMContext *ctx = (DMContext *)ctxPtr;
  DMPlayer *p = &ctx->players[handle];
  if (p->ins.pcmData) { free(p->ins.pcmData); p->ins.pcmData = NULL; }
  memset(p, 0, sizeof(DMPlayer));
}

EMSCRIPTEN_KEEPALIVE
int dm_load_instrument(void *ctxPtr, int handle, const uint8_t *data, int len) {
  if (!ctxPtr || !data || len < 1) return -1;
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;

  DMContext *ctx = (DMContext *)ctxPtr;
  DMPlayer *p = &ctx->players[handle];

  if (p->ins.pcmData) { free(p->ins.pcmData); p->ins.pcmData = NULL; }
  memset(&p->ins, 0, sizeof(DMInstrument));

  p->ins.type = data[0];

  if (p->ins.type == 0) {
    /* Wavetable instrument */
    if (len < 24) return -2;

    /* wave[0..3] indices are stored but actual data is below */
    p->ins.waveBlend = data[5] & 0x3F;
    p->ins.waveSpeed = data[6] & 0x3F;
    p->ins.volume    = data[7] > 64 ? 64 : data[7];
    p->ins.arpSpeed  = data[8] & 0xF;

    for (int i = 0; i < DM_ARP_SIZE; i++) {
      p->ins.arpTable[i] = (int8_t)data[9 + i];
    }

    p->ins.vibSpeed = data[17] & 0x3F;
    p->ins.vibDepth = data[18] & 0x3F;

    /* Read embedded waveform data */
    uint32_t waveDataLen = (uint32_t)data[20] | ((uint32_t)data[21] << 8)
                         | ((uint32_t)data[22] << 16) | ((uint32_t)data[23] << 24);

    if (waveDataLen > 0 && waveDataLen <= DM_WAVE_MAX && len >= (int)(24 + waveDataLen)) {
      memcpy(p->ins.waveData, data + 24, waveDataLen);
      p->ins.waveLen = (int)waveDataLen;
    } else if (waveDataLen == 0 || p->ins.waveLen == 0) {
      /* Fallback: generate a sawtooth waveform */
      for (int i = 0; i < DM_WAVE_MAX; i++) {
        p->ins.waveData[i] = (int8_t)(127 - (i * 2));
      }
      p->ins.waveLen = DM_WAVE_MAX;
    }

  } else {
    /* PCM instrument */
    if (len < 25) return -2;

    p->ins.volume   = data[1] > 64 ? 64 : data[1];
    p->ins.arpSpeed = data[2] & 0xF;

    for (int i = 0; i < DM_ARP_SIZE; i++) {
      p->ins.arpTable[i] = (int8_t)data[3 + i];
    }

    p->ins.vibSpeed = data[11] & 0x3F;
    p->ins.vibDepth = data[12] & 0x3F;

    uint32_t pcmLen   = (uint32_t)data[13] | ((uint32_t)data[14] << 8)
                      | ((uint32_t)data[15] << 16) | ((uint32_t)data[16] << 24);
    uint32_t loopStart = (uint32_t)data[17] | ((uint32_t)data[18] << 8)
                       | ((uint32_t)data[19] << 16) | ((uint32_t)data[20] << 24);
    uint32_t loopLen   = (uint32_t)data[21] | ((uint32_t)data[22] << 8)
                       | ((uint32_t)data[23] << 16) | ((uint32_t)data[24] << 24);

    if (pcmLen > 0 && len >= (int)(25 + pcmLen)) {
      p->ins.pcmData   = (int8_t *)malloc(pcmLen);
      if (!p->ins.pcmData) return -4;
      memcpy(p->ins.pcmData, data + 25, pcmLen);
      p->ins.pcmLen    = (int)pcmLen;
      p->ins.loopStart = (int)loopStart;
      p->ins.loopLen   = (int)loopLen;
    }
  }

  return 0;
}

EMSCRIPTEN_KEEPALIVE
void dm_note_on(void *ctxPtr, int handle, int note, int velocity) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  DMContext *ctx = (DMContext *)ctxPtr;
  DMPlayer *p = &ctx->players[handle];

  p->baseNote   = note;
  p->playing    = 1;
  p->phase      = 0.0f;
  p->vibPhase   = 0.0f;
  p->vibTickCtr = 0;
  p->vibTickSamples = (p->ins.vibSpeed > 0) ? (p->samplesPerTick * p->ins.vibSpeed) : p->samplesPerTick;
  p->arpIdx     = 0;
  p->arpTickCtr = 0;
  p->tickCtr    = 0;

  (void)velocity;
}

EMSCRIPTEN_KEEPALIVE
void dm_note_off(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  DMContext *ctx = (DMContext *)ctxPtr;
  DMPlayer *p = &ctx->players[handle];
  /* DM wavetable instruments typically sustain until note-off then stop */
  p->playing = 0;
}

EMSCRIPTEN_KEEPALIVE
int dm_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
  if (!ctxPtr || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) return 0;
  DMContext *ctx = (DMContext *)ctxPtr;
  DMPlayer *p = &ctx->players[handle];

  memset(outL, 0, numSamples * sizeof(float));
  memset(outR, 0, numSamples * sizeof(float));

  if (!p->playing) return numSamples;

  /* Volume normalisation: max volume (64) * max waveform (128) → 1.0 */
  const float volNorm = (float)p->ins.volume / (64.0f * 128.0f);

  for (int i = 0; i < numSamples; i++) {
    if (!p->playing) break;

    /* ── Tick counter for arpeggio ── */
    p->tickCtr++;
    if (p->tickCtr >= p->samplesPerTick) {
      p->tickCtr = 0;
      int hasArp = 0;
      for (int a = 0; a < DM_ARP_SIZE; a++) {
        if (p->ins.arpTable[a] != 0) { hasArp = 1; break; }
      }
      if (hasArp && p->ins.arpSpeed > 0) {
        p->arpTickCtr++;
        if (p->arpTickCtr >= p->ins.arpSpeed) {
          p->arpTickCtr = 0;
          p->arpIdx = (p->arpIdx + 1) % DM_ARP_SIZE;
        }
      }
    }

    /* ── Vibrato LFO ── */
    float vibSemitones = 0.0f;
    if (p->ins.vibDepth > 0) {
      p->vibTickCtr++;
      if (p->vibTickCtr >= p->vibTickSamples) {
        p->vibTickCtr = 0;
        p->vibPhase += 1.0f;
        if (p->vibPhase >= 64.0f) p->vibPhase -= 64.0f;
      }
      vibSemitones = sineLFO(p->vibPhase) * (p->ins.vibDepth / 32.0f);
    }

    /* ── Phase increment with arpeggio + vibrato ── */
    float arpSemitones = (float)p->ins.arpTable[p->arpIdx];
    float freq = midiNoteToFreq(p->baseNote + arpSemitones + vibSemitones);

    float sample = 0.0f;

    if (p->ins.type == 0) {
      /* Wavetable oscillator */
      int waveLen = p->ins.waveLen > 0 ? p->ins.waveLen : DM_WAVE_MAX;
      int idx = (int)p->phase;
      if (idx < 0) idx = 0;
      if (idx >= waveLen) idx = waveLen - 1;
      sample = (float)p->ins.waveData[idx] * volNorm;

      float phaseInc = freq * (float)waveLen / (float)p->sampleRate;
      p->phase += phaseInc;
      if (p->phase >= (float)waveLen) {
        p->phase -= (float)waveLen;
      }
    } else {
      /* PCM playback */
      if (!p->ins.pcmData) { p->playing = 0; break; }
      int idx = (int)p->phase;
      if (idx >= p->ins.pcmLen) {
        if (p->ins.loopLen > 2) {
          while (idx >= p->ins.loopStart + p->ins.loopLen)
            idx -= p->ins.loopLen;
          p->phase = (float)idx;
        } else {
          p->playing = 0;
          break;
        }
      }
      if (idx < p->ins.pcmLen) {
        sample = (float)p->ins.pcmData[idx] * volNorm;
      }

      float phaseInc = freq / (float)p->sampleRate;
      p->phase += phaseInc * (float)p->ins.pcmLen;
    }

    outL[i] = sample;
    outR[i] = sample;
  }

  return numSamples;
}

EMSCRIPTEN_KEEPALIVE
void dm_set_param(void *ctxPtr, int handle, int paramId, float value) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  DMContext *ctx = (DMContext *)ctxPtr;
  DMPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 0: /* VOLUME */
      p->ins.volume = (uint8_t)(value * 64.0f);
      break;
    case 5: /* VIB_SPEED */
      p->ins.vibSpeed = (uint8_t)(value * 63.0f);
      break;
    case 6: /* VIB_DEPTH */
      p->ins.vibDepth = (uint8_t)(value * 63.0f);
      break;
    case 8: /* ARP_SPEED */
      p->ins.arpSpeed = (uint8_t)(value * 15.0f);
      break;
    default:
      break;
  }
}

EMSCRIPTEN_KEEPALIVE
float dm_get_param(void *ctxPtr, int handle, int paramId) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return -1.0f;
  DMContext *ctx = (DMContext *)ctxPtr;
  DMPlayer *p = &ctx->players[handle];
  switch (paramId) {
    case 0: return p->ins.volume / 64.0f;
    case 5: return p->ins.vibSpeed / 63.0f;
    case 6: return p->ins.vibDepth / 63.0f;
    case 8: return p->ins.arpSpeed / 15.0f;
    default: return -1.0f;
  }
}
