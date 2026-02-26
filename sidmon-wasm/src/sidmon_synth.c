/**
 * sidmon_synth.c — SidMon II real-time SID-like synthesis WASM module
 *
 * Implements the format_synth_api.h interface for SidMon II (.sid2, .smn) formats.
 * Exported symbols use the "smn_" prefix (SidMoN) to avoid collision with sm_ (SoundMon).
 *
 * Instrument model:
 *   - Type 0 (synth): 4 mathematical waveforms (triangle, sawtooth, pulse, noise)
 *     with SID-style ADSR envelope, arpeggio, vibrato, and a simple IIR filter.
 *   - Type 1 (pcm): Raw 8-bit PCM playback with SID-style ADSR envelope,
 *     arpeggio, and vibrato on top.
 *
 * Binary blob layout for smn_load_instrument():
 *   [0]       type: 0=synth, 1=pcm
 *   --- SYNTH (type=0) ---
 *   [1]       waveform: 0=triangle, 1=sawtooth, 2=pulse, 3=noise
 *   [2]       pulseWidth: 0-255
 *   [3]       attack:  0-15 (SID timing index)
 *   [4]       decay:   0-15 (SID timing index)
 *   [5]       sustain: 0-15 (level: sustain = value * 1/15)
 *   [6]       release: 0-15 (SID timing index)
 *   [7]       arpSpeed: 0-15 ticks per step
 *   [8..15]   arpTable[8] (signed bytes: semitone offsets)
 *   [16]      vibDelay: 0-255 ticks
 *   [17]      vibSpeed: 0-63 ticks per LFO step
 *   [18]      vibDepth: 0-63 (1/32 semitone units)
 *   [19]      filterCutoff: 0-255
 *   [20]      filterResonance: 0-15
 *   [21]      filterMode: 0=LP, 1=HP, 2=BP
 *   --- PCM (type=1) ---
 *   [1]       attack:  0-15
 *   [2]       decay:   0-15
 *   [3]       sustain: 0-15 (level)
 *   [4]       release: 0-15
 *   [5]       arpSpeed: 0-15
 *   [6..13]   arpTable[8] (signed bytes)
 *   [14]      vibDelay: 0-255
 *   [15]      vibSpeed: 0-63
 *   [16]      vibDepth: 0-63
 *   [17]      finetune: signed int8 (-8..+7)
 *   [18..21]  pcmLen (uint32 LE)
 *   [22..25]  loopStart (uint32 LE)
 *   [26..29]  loopLength (uint32 LE, 0=no loop)
 *   [30..]    pcmData (pcmLen bytes of signed int8)
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <emscripten.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define SMN_ARP_SIZE     8
#define MAX_PLAYERS      8

/* ── SID ADSR timing tables ─────────────────────────────────────────────────
 * Standard SID 6581 attack/decay/release times (in seconds).
 * Index 0-15 → time constant for the phase to reach target.
 * Attack: time to reach peak (0→1).
 * Decay/Release: time to decay (1→0) at full range.
 */

static const float SID_ATTACK_SEC[16] = {
  0.002f, 0.008f, 0.016f, 0.024f, 0.038f, 0.056f, 0.068f, 0.080f,
  0.100f, 0.250f, 0.500f, 0.800f, 1.000f, 3.000f, 5.000f, 8.000f
};

static const float SID_DECAY_SEC[16] = {
  0.006f, 0.024f, 0.048f, 0.072f, 0.114f, 0.168f, 0.204f, 0.240f,
  0.300f, 0.750f, 1.500f, 2.400f, 3.000f, 9.000f, 15.000f, 24.000f
};

/* ── Instrument structure ───────────────────────────────────────────────────── */

typedef struct {
  int      type;            /* 0=synth, 1=pcm */

  /* Synth waveform */
  int      waveform;        /* 0=triangle, 1=sawtooth, 2=pulse, 3=noise */
  uint8_t  pulseWidth;      /* 0-255, duty cycle for pulse waveform */

  /* SID-style ADSR (indices 0-15) */
  uint8_t  attack;
  uint8_t  decay;
  uint8_t  sustain;         /* level: 0-15 maps to 0.0-1.0 */
  uint8_t  release;

  /* Arpeggio */
  int8_t   arpTable[SMN_ARP_SIZE];
  uint8_t  arpSpeed;

  /* Vibrato */
  uint8_t  vibDelay;
  uint8_t  vibSpeed;
  uint8_t  vibDepth;

  /* Filter (simple 1-pole IIR) */
  uint8_t  filterCutoff;
  uint8_t  filterResonance;
  uint8_t  filterMode;

  /* PCM fields */
  int8_t  *pcmData;
  int      pcmLen;
  int      loopStart;
  int      loopLen;
  int8_t   finetune;

  /* Precomputed per-sample ADSR increments (set at note-on based on sampleRate) */
  float    attackInc;       /* volume increment per sample during attack */
  float    decayInc;        /* volume decrement per sample during decay */
  float    releaseInc;      /* volume decrement per sample during release */
  float    sustainLevel;    /* sustain level [0.0, 1.0] */
} SMNInstrument;

/* ── Player state ──────────────────────────────────────────────────────────── */

typedef enum { ENV_ATTACK, ENV_DECAY, ENV_SUSTAIN, ENV_RELEASE, ENV_OFF } EnvPhase;

typedef struct {
  int         alive;
  int         sampleRate;

  SMNInstrument ins;

  /* Oscillator */
  float       phase;          /* for synth: [0.0, 1.0) ; for pcm: byte index */
  float       phaseInc;       /* per-sample phase increment */
  int         baseNote;
  int         playing;

  /* LFSR for noise (32-bit) */
  uint32_t    noiseLfsr;

  /* ADSR envelope */
  EnvPhase    envPhase;
  float       envVol;         /* [0.0, 1.0] */

  /* Vibrato */
  int         vibDelaySamples;  /* countdown samples until vibrato starts */
  int         vibDelayCtr;
  float       vibPhase;         /* [0, 64) */
  int         vibTickSamples;   /* samples per vib LFO step */
  int         vibTickCtr;

  /* Arpeggio (tick-driven at ~50Hz) */
  int         samplesPerTick;
  int         tickCtr;
  int         arpIdx;
  int         arpTickCtr;

  /* Filter state */
  float       filterBuf0;
  float       filterBuf1;
} SMNPlayer;

/* ── Context ──────────────────────────────────────────────────────────────── */

typedef struct {
  int        sampleRate;
  SMNPlayer  players[MAX_PLAYERS];
} SMNContext;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

static float midiNoteToFreq(int note) {
  return 440.0f * powf(2.0f, (note - 69) / 12.0f);
}

static float sineLFO(float phase) {
  /* phase in [0, 64) */
  return sinf(phase * 6.283185307f / 64.0f);
}

/* Sawtooth wave: phase [0,1) → [-1,+1] ramp down */
static float sawWave(float ph) {
  return 1.0f - 2.0f * ph;
}

/* Triangle wave: phase [0,1) → [-1,+1] */
static float triWave(float ph) {
  if (ph < 0.5f) return -1.0f + 4.0f * ph;
  else           return 3.0f - 4.0f * ph;
}

/* Pulse wave: phase [0,1), pw in [0,255] → 0-1 duty cycle */
static float pulseWave(float ph, int pw) {
  float duty = (float)pw / 255.0f;
  return (ph < duty) ? 1.0f : -1.0f;
}

/* Recompute ADSR increments for current sampleRate */
static void smn_recompute_adsr(SMNInstrument *ins, int sampleRate) {
  float sus = (float)ins->sustain / 15.0f;
  ins->sustainLevel = sus;

  float attackTime  = SID_ATTACK_SEC[ins->attack  & 0xF];
  float decayTime   = SID_DECAY_SEC[ins->decay   & 0xF];
  float releaseTime = SID_DECAY_SEC[ins->release & 0xF];

  float sr = (float)sampleRate;

  ins->attackInc  = (attackTime  > 0.0f) ? (1.0f / (attackTime  * sr)) : 2.0f;
  ins->decayInc   = (decayTime   > 0.0f) ? ((1.0f - sus) / (decayTime   * sr)) : 2.0f;
  ins->releaseInc = (releaseTime > 0.0f) ? (sus / (releaseTime * sr)) : 2.0f;
}

/* ── WASM exports ─────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void *smn_init(int sampleRate) {
  SMNContext *ctx = (SMNContext *)calloc(1, sizeof(SMNContext));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void smn_dispose(void *ctxPtr) {
  if (!ctxPtr) return;
  SMNContext *ctx = (SMNContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (ctx->players[i].ins.pcmData) {
      free(ctx->players[i].ins.pcmData);
      ctx->players[i].ins.pcmData = NULL;
    }
  }
  free(ctx);
}

EMSCRIPTEN_KEEPALIVE
int smn_create_player(void *ctxPtr) {
  if (!ctxPtr) return -1;
  SMNContext *ctx = (SMNContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].alive) {
      memset(&ctx->players[i], 0, sizeof(SMNPlayer));
      ctx->players[i].alive = 1;
      ctx->players[i].sampleRate = ctx->sampleRate;
      ctx->players[i].samplesPerTick = ctx->sampleRate / 50;
      ctx->players[i].envPhase = ENV_OFF;
      ctx->players[i].noiseLfsr = 0x7FFFF8 + i; /* unique per player */
      ctx->players[i].baseNote = -1;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void smn_destroy_player(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SMNContext *ctx = (SMNContext *)ctxPtr;
  SMNPlayer *p = &ctx->players[handle];
  if (p->ins.pcmData) { free(p->ins.pcmData); p->ins.pcmData = NULL; }
  memset(p, 0, sizeof(SMNPlayer));
}

EMSCRIPTEN_KEEPALIVE
int smn_load_instrument(void *ctxPtr, int handle, const uint8_t *data, int len) {
  if (!ctxPtr || !data || len < 1) return -1;
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;

  SMNContext *ctx = (SMNContext *)ctxPtr;
  SMNPlayer *p = &ctx->players[handle];

  if (p->ins.pcmData) { free(p->ins.pcmData); p->ins.pcmData = NULL; }
  memset(&p->ins, 0, sizeof(SMNInstrument));

  p->ins.type = data[0];

  if (p->ins.type == 0) {
    /* Synth instrument */
    if (len < 22) return -2;

    p->ins.waveform      = data[1] & 0x3;
    p->ins.pulseWidth    = data[2];
    p->ins.attack        = data[3] & 0xF;
    p->ins.decay         = data[4] & 0xF;
    p->ins.sustain       = data[5] & 0xF;
    p->ins.release       = data[6] & 0xF;
    p->ins.arpSpeed      = data[7] & 0xF;
    for (int i = 0; i < SMN_ARP_SIZE; i++) {
      p->ins.arpTable[i] = (int8_t)data[8 + i];
    }
    p->ins.vibDelay      = data[16];
    p->ins.vibSpeed      = data[17] & 0x3F;
    p->ins.vibDepth      = data[18] & 0x3F;
    p->ins.filterCutoff  = data[19];
    p->ins.filterResonance = data[20] & 0xF;
    p->ins.filterMode    = data[21] & 0x3;

  } else {
    /* PCM instrument */
    if (len < 30) return -2;

    p->ins.attack    = data[1] & 0xF;
    p->ins.decay     = data[2] & 0xF;
    p->ins.sustain   = data[3] & 0xF;
    p->ins.release   = data[4] & 0xF;
    p->ins.arpSpeed  = data[5] & 0xF;
    for (int i = 0; i < SMN_ARP_SIZE; i++) {
      p->ins.arpTable[i] = (int8_t)data[6 + i];
    }
    p->ins.vibDelay  = data[14];
    p->ins.vibSpeed  = data[15] & 0x3F;
    p->ins.vibDepth  = data[16] & 0x3F;
    p->ins.finetune  = (int8_t)data[17];

    uint32_t pcmLen   = (uint32_t)data[18] | ((uint32_t)data[19] << 8)
                      | ((uint32_t)data[20] << 16) | ((uint32_t)data[21] << 24);
    uint32_t loopStart = (uint32_t)data[22] | ((uint32_t)data[23] << 8)
                       | ((uint32_t)data[24] << 16) | ((uint32_t)data[25] << 24);
    uint32_t loopLen   = (uint32_t)data[26] | ((uint32_t)data[27] << 8)
                       | ((uint32_t)data[28] << 16) | ((uint32_t)data[29] << 24);

    if (pcmLen > 0 && len >= (int)(30 + pcmLen)) {
      p->ins.pcmData   = (int8_t *)malloc(pcmLen);
      if (!p->ins.pcmData) return -4;
      memcpy(p->ins.pcmData, data + 30, pcmLen);
      p->ins.pcmLen    = (int)pcmLen;
      p->ins.loopStart = (int)loopStart;
      p->ins.loopLen   = (int)loopLen;
    }
  }

  /* Precompute ADSR increments based on current sample rate */
  smn_recompute_adsr(&p->ins, p->sampleRate);
  return 0;
}

EMSCRIPTEN_KEEPALIVE
void smn_note_on(void *ctxPtr, int handle, int note, int velocity) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SMNContext *ctx = (SMNContext *)ctxPtr;
  SMNPlayer *p = &ctx->players[handle];

  p->baseNote   = note;
  p->playing    = 1;
  p->phase      = 0.0f;
  p->envPhase   = ENV_ATTACK;
  p->envVol     = 0.0f;

  /* Vibrato setup */
  p->vibDelayCtr  = p->ins.vibDelay * p->samplesPerTick;
  p->vibPhase     = 0.0f;
  p->vibTickCtr   = 0;
  p->vibTickSamples = (p->ins.vibSpeed > 0)
    ? (p->samplesPerTick * p->ins.vibSpeed)
    : p->samplesPerTick;

  /* Arpeggio */
  p->arpIdx     = 0;
  p->arpTickCtr = 0;
  p->tickCtr    = 0;

  /* Filter state */
  p->filterBuf0 = 0.0f;
  p->filterBuf1 = 0.0f;

  /* Compute phase increment for synth waveform */
  float freq = midiNoteToFreq(note);
  /* For PCM: finetune shifts freq by finetune/8 semitones */
  if (p->ins.type == 1 && p->ins.finetune != 0) {
    freq *= powf(2.0f, p->ins.finetune / (8.0f * 12.0f));
  }
  p->phaseInc = freq / (float)p->sampleRate;

  (void)velocity; /* velocity unused for now */
}

EMSCRIPTEN_KEEPALIVE
void smn_note_off(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SMNContext *ctx = (SMNContext *)ctxPtr;
  SMNPlayer *p = &ctx->players[handle];
  if (p->playing && p->envPhase != ENV_OFF && p->envPhase != ENV_RELEASE) {
    p->envPhase = ENV_RELEASE;
  }
}

EMSCRIPTEN_KEEPALIVE
int smn_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
  if (!ctxPtr || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) return 0;
  SMNContext *ctx = (SMNContext *)ctxPtr;
  SMNPlayer *p = &ctx->players[handle];

  memset(outL, 0, numSamples * sizeof(float));
  memset(outR, 0, numSamples * sizeof(float));

  if (!p->playing) return numSamples;

  for (int i = 0; i < numSamples; i++) {
    if (!p->playing) break;

    /* ── Tick counter for arpeggio ── */
    p->tickCtr++;
    if (p->tickCtr >= p->samplesPerTick) {
      p->tickCtr = 0;
      /* Arpeggio advance */
      int hasArp = 0;
      for (int a = 0; a < SMN_ARP_SIZE; a++) {
        if (p->ins.arpTable[a] != 0) { hasArp = 1; break; }
      }
      if (hasArp && p->ins.arpSpeed > 0) {
        p->arpTickCtr++;
        if (p->arpTickCtr >= p->ins.arpSpeed) {
          p->arpTickCtr = 0;
          p->arpIdx = (p->arpIdx + 1) % SMN_ARP_SIZE;
        }
      }
    }

    /* ── Vibrato LFO ── */
    float vibSemitones = 0.0f;
    if (p->ins.vibDepth > 0) {
      if (p->vibDelayCtr > 0) {
        p->vibDelayCtr--;
      } else {
        p->vibTickCtr++;
        if (p->vibTickCtr >= p->vibTickSamples) {
          p->vibTickCtr = 0;
          p->vibPhase += 1.0f;
          if (p->vibPhase >= 64.0f) p->vibPhase -= 64.0f;
        }
        vibSemitones = sineLFO(p->vibPhase) * (p->ins.vibDepth / 32.0f);
      }
    }

    /* ── Phase increment with arpeggio + vibrato ── */
    float arpSemitones = (float)p->ins.arpTable[p->arpIdx];
    float freq = midiNoteToFreq(p->baseNote + arpSemitones + vibSemitones);
    if (p->ins.type == 1 && p->ins.finetune != 0) {
      freq *= powf(2.0f, p->ins.finetune / (8.0f * 12.0f));
    }
    float phaseInc = freq / (float)p->sampleRate;

    /* ── Generate sample ── */
    float raw = 0.0f;

    if (p->ins.type == 0) {
      /* Synth waveform */
      float ph = p->phase - floorf(p->phase); /* [0,1) */
      switch (p->ins.waveform) {
        case 0: raw = triWave(ph);  break;
        case 1: raw = sawWave(ph);  break;
        case 2: raw = pulseWave(ph, p->ins.pulseWidth); break;
        case 3: {
          /* LFSR noise */
          p->noiseLfsr ^= (p->noiseLfsr >> 1);
          p->noiseLfsr ^= (p->noiseLfsr << 2);
          raw = ((p->noiseLfsr & 0xFF) - 128.0f) / 128.0f;
          break;
        }
        default: raw = sawWave(ph); break;
      }
      p->phase += phaseInc;
      if (p->phase >= 1.0f) p->phase -= (float)(int)p->phase;
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
        raw = (float)p->ins.pcmData[idx] / 128.0f;
      }
      p->phase += phaseInc * (float)p->ins.pcmLen;
    }

    /* ── ADSR envelope ── */
    switch (p->envPhase) {
      case ENV_ATTACK:
        p->envVol += p->ins.attackInc;
        if (p->envVol >= 1.0f) {
          p->envVol = 1.0f;
          p->envPhase = ENV_DECAY;
        }
        break;
      case ENV_DECAY:
        p->envVol -= p->ins.decayInc;
        if (p->envVol <= p->ins.sustainLevel) {
          p->envVol = p->ins.sustainLevel;
          p->envPhase = ENV_SUSTAIN;
        }
        break;
      case ENV_SUSTAIN:
        p->envVol = p->ins.sustainLevel;
        break;
      case ENV_RELEASE:
        p->envVol -= p->ins.releaseInc;
        if (p->envVol <= 0.0f) {
          p->envVol = 0.0f;
          p->envPhase = ENV_OFF;
          p->playing = 0;
        }
        break;
      case ENV_OFF:
        p->envVol = 0.0f;
        p->playing = 0;
        break;
    }

    float out = raw * p->envVol;

    /* ── Simple 1-pole IIR filter (LP/HP/BP) ── */
    if (p->ins.type == 0 && p->ins.filterCutoff < 250) {
      float cutoff = (float)p->ins.filterCutoff / 255.0f;
      cutoff = cutoff * cutoff; /* square for perceptual response */
      float resQ = 1.0f - (float)p->ins.filterResonance / 20.0f;
      if (resQ < 0.01f) resQ = 0.01f;

      float f = cutoff * 2.0f;
      if (f > 1.0f) f = 1.0f;

      float hp = out - p->filterBuf0;
      float bp = p->filterBuf0 - p->filterBuf1;
      p->filterBuf0 += f * hp * resQ;
      p->filterBuf1 += f * bp;

      switch (p->ins.filterMode) {
        case 0: out = p->filterBuf1; break; /* LP */
        case 1: out = hp;            break; /* HP */
        case 2: out = bp;            break; /* BP */
        default: break;
      }
    }

    outL[i] = out;
    outR[i] = out;
  }

  return numSamples;
}

EMSCRIPTEN_KEEPALIVE
void smn_set_param(void *ctxPtr, int handle, int paramId, float value) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SMNContext *ctx = (SMNContext *)ctxPtr;
  SMNPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 5: /* VIB_SPEED */
      p->ins.vibSpeed = (uint8_t)(value * 63.0f);
      break;
    case 6: /* VIB_DEPTH */
      p->ins.vibDepth = (uint8_t)(value * 63.0f);
      break;
    case 7: /* VIB_DELAY */
      p->ins.vibDelay = (uint8_t)(value * 255.0f);
      break;
    case 8: /* ARP_SPEED */
      p->ins.arpSpeed = (uint8_t)(value * 15.0f);
      break;
    case 16: /* FILTER_CUTOFF (format base) */
      p->ins.filterCutoff = (uint8_t)(value * 255.0f);
      break;
    case 17: /* FILTER_RESONANCE */
      p->ins.filterResonance = (uint8_t)(value * 15.0f);
      break;
    default:
      break;
  }
}

EMSCRIPTEN_KEEPALIVE
float smn_get_param(void *ctxPtr, int handle, int paramId) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return -1.0f;
  SMNContext *ctx = (SMNContext *)ctxPtr;
  SMNPlayer *p = &ctx->players[handle];
  switch (paramId) {
    case 5: return p->ins.vibSpeed / 63.0f;
    case 6: return p->ins.vibDepth / 63.0f;
    case 7: return p->ins.vibDelay / 255.0f;
    case 8: return p->ins.arpSpeed / 15.0f;
    case 16: return p->ins.filterCutoff / 255.0f;
    case 17: return p->ins.filterResonance / 15.0f;
    default: return -1.0f;
  }
}
