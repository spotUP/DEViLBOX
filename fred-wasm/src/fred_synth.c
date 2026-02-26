/**
 * fred_synth.c — Fred Editor PWM real-time synthesis WASM module
 *
 * Implements the per-note synthesis API for Fred Editor type-1 (PWM) instruments.
 * Exported symbols use the "fred_" prefix.
 *
 * Instrument model (type 1 — PWM):
 *   - Square wave with oscillating pulse width (Fred's signature sound)
 *   - ADSR volume envelope (tick-driven at ~50 Hz)
 *   - Vibrato LFO (delayed sine, applied to phase increment)
 *   - Arpeggio table (16 semitone offsets, stepped per tick)
 *
 * PWM oscillator:
 *   - `pulsePos` (0-64) sets the pulse width fraction (0=all low, 64=all high)
 *   - For each sample position i in [0, WAVE_SIZE): output +127 if i < pulsePos*(WAVE_SIZE/64),
 *     else -128
 *   - Every `pulseSpeed` ticks, pulsePos is moved by pulseRatePos or pulseRateNeg,
 *     bouncing at pulsePosL..pulsePosH
 *   - `pulseDelay` ticks must elapse before modulation begins
 *
 * Binary blob layout for fred_load_instrument():
 *   [0]       envelopeVol   (uint8, 0-64)
 *   [1]       attackSpeed   (uint8, ticks per step)
 *   [2]       attackVol     (uint8, 0-64)
 *   [3]       decaySpeed    (uint8, ticks per step)
 *   [4]       decayVol      (uint8, 0-64)
 *   [5]       sustainTime   (uint8, ticks to hold)
 *   [6]       releaseSpeed  (uint8, ticks per step)
 *   [7]       releaseVol    (uint8, 0-64)
 *   [8]       vibratoDelay  (uint8, ticks)
 *   [9]       vibratoSpeed  (uint8, ticks per LFO step)
 *   [10]      vibratoDepth  (uint8, 1/64th semitone units)
 *   [11]      arpeggioLimit (uint8, active entries)
 *   [12]      arpeggioSpeed (uint8, ticks per arp step)
 *   [13]      pulseRateNeg  (int8, decrease rate per step, stored as raw byte)
 *   [14]      pulseRatePos  (uint8, increase rate per step)
 *   [15]      pulseSpeed    (uint8, ticks per modulation step)
 *   [16]      pulsePosL     (uint8, lower bound 0-64)
 *   [17]      pulsePosH     (uint8, upper bound 0-64)
 *   [18]      pulseDelay    (uint8, ticks before modulation)
 *   [19..34]  arpeggio[16]  (int8 array)
 *   [35..36]  relative      (uint16 LE, period multiplier / 1024)
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <emscripten.h>

/* ── Constants ──────────────────────────────────────────────────────────────── */

#define WAVE_SIZE       64        /* samples per oscillator period */
#define ARP_SIZE        16        /* max arpeggio table entries */
#define MAX_PLAYERS      8
#define TICKS_PER_SEC   50        /* Amiga ~50 Hz tick rate */

/* Amiga period table for one octave (C-1 period = 856). We use full range. */
/* MIDI 0 = C-1 in Amiga parlance. period = 8363*428 / freq, but we just
   use the standard 12-TET formula relative to A-4 = MIDI 69 = 440 Hz. */

/* ── ADSR state machine ─────────────────────────────────────────────────────── */

typedef enum {
  ENV_ATTACK,
  ENV_DECAY,
  ENV_SUSTAIN,
  ENV_RELEASE,
  ENV_OFF
} EnvStage;

/* ── Per-player state ───────────────────────────────────────────────────────── */

typedef struct {
  /* --- configuration (set by load_instrument) --- */
  uint8_t  envelopeVol;
  uint8_t  attackSpeed;
  uint8_t  attackVol;
  uint8_t  decaySpeed;
  uint8_t  decayVol;
  uint8_t  sustainTime;
  uint8_t  releaseSpeed;
  uint8_t  releaseVol;
  uint8_t  vibratoDelay;
  uint8_t  vibratoSpeed;
  uint8_t  vibratoDepth;
  uint8_t  arpeggioLimit;
  uint8_t  arpeggioSpeed;
  int8_t   pulseRateNeg;
  uint8_t  pulseRatePos;
  uint8_t  pulseSpeed;
  uint8_t  pulsePosL;
  uint8_t  pulsePosH;
  uint8_t  pulseDelay;
  int8_t   arpTable[ARP_SIZE];
  uint16_t relative;            /* period multiplier / 1024 */

  /* --- playback state --- */
  int      loaded;
  int      active;

  /* Oscillator */
  double   phase;               /* fractional position in [0, WAVE_SIZE) */
  double   phaseInc;            /* samples per WAVE_SIZE step */

  /* ADSR */
  EnvStage envStage;
  float    envVol;              /* current volume 0.0 .. 64.0 */
  int      envTick;             /* ticks remaining in current step */
  int      sustainTick;         /* ticks remaining in sustain */

  /* Vibrato */
  int      vibTick;             /* ticks elapsed since note_on */
  float    vibPhase;            /* LFO phase [0, 2π) */

  /* Arpeggio */
  int      arpStep;             /* current table index */
  int      arpTick;             /* ticks remaining for current step */
  int      arpSemitoneOffset;   /* semitone offset currently applied */

  /* PWM */
  float    pulsePos;            /* current pulse width [0, 64] */
  int      pulseDir;            /* +1 = moving up, -1 = moving down */
  int      pulseTick;           /* ticks remaining for current modulation step */
  int      pulseDelayTick;      /* countdown for initial delay */

  /* Sample rate */
  float    sampleRate;

  /* Samples-per-tick accumulator */
  double   tickAccum;
  double   samplesPerTick;
} FredPlayer;

static FredPlayer g_players[MAX_PLAYERS];
static float      g_sampleRate = 44100.0f;

/* ── Frequency helpers ──────────────────────────────────────────────────────── */

/* Convert MIDI note to frequency in Hz (A4 = 69 = 440 Hz) */
static double midiToFreq(int midi) {
  return 440.0 * pow(2.0, (midi - 69) / 12.0);
}

/* Apply Fred's relative tuning (period multiplier / 1024). */
/* Fred uses Amiga-style periods: lower period = higher pitch.              */
/* relative = 1024 means no change. relative > 1024 lowers pitch.          */
static double applyRelative(double freq, uint16_t relative) {
  if (relative == 0 || relative == 1024) return freq;
  return freq * 1024.0 / (double)relative;
}

/* ── PWM waveform sample ────────────────────────────────────────────────────── */

/* Generate one sample from the PWM oscillator.
   pulsePos is in [0, 64]. The threshold within [0, WAVE_SIZE) is:
     threshold = (int)(pulsePos * WAVE_SIZE / 64)
   Samples [0, threshold) → +127, [threshold, WAVE_SIZE) → -128 */
static float pwmSample(double phase, float pulsePos) {
  int threshold = (int)(pulsePos * WAVE_SIZE / 64.0f);
  if (threshold < 0) threshold = 0;
  if (threshold > WAVE_SIZE) threshold = WAVE_SIZE;
  int iPhase = (int)phase;
  if (iPhase < 0) iPhase = 0;
  if (iPhase >= WAVE_SIZE) iPhase = WAVE_SIZE - 1;
  return (iPhase < threshold) ? 127.0f : -128.0f;
}

/* ── Tick update ────────────────────────────────────────────────────────────── */

/* Called once per 50 Hz tick. Updates ADSR, vibrato, arpeggio, PWM. */
static void fredTick(FredPlayer* p) {
  if (!p->active) return;

  /* --- ADSR --- */
  switch (p->envStage) {
    case ENV_ATTACK:
      p->envTick--;
      if (p->envTick <= 0) {
        p->envVol += 1.0f;
        if (p->envVol >= (float)p->attackVol) {
          p->envVol = (float)p->attackVol;
          p->envStage = ENV_DECAY;
        }
        p->envTick = (p->attackSpeed > 0) ? p->attackSpeed : 1;
      }
      break;
    case ENV_DECAY:
      p->envTick--;
      if (p->envTick <= 0) {
        p->envVol -= 1.0f;
        if (p->envVol <= (float)p->decayVol) {
          p->envVol = (float)p->decayVol;
          p->envStage = ENV_SUSTAIN;
          p->sustainTick = p->sustainTime;
        }
        p->envTick = (p->decaySpeed > 0) ? p->decaySpeed : 1;
      }
      break;
    case ENV_SUSTAIN:
      if (p->sustainTime > 0) {
        p->sustainTick--;
        if (p->sustainTick <= 0) {
          p->envStage = ENV_RELEASE;
          p->envTick = (p->releaseSpeed > 0) ? p->releaseSpeed : 1;
        }
      }
      /* else: sustain until note_off */
      break;
    case ENV_RELEASE:
      p->envTick--;
      if (p->envTick <= 0) {
        p->envVol -= 1.0f;
        if (p->envVol <= (float)p->releaseVol) {
          p->envVol = (float)p->releaseVol;
          p->envStage = ENV_OFF;
          p->active = 0;
        }
        p->envTick = (p->releaseSpeed > 0) ? p->releaseSpeed : 1;
      }
      break;
    case ENV_OFF:
      p->active = 0;
      return;
  }

  /* --- Arpeggio --- */
  if (p->arpeggioLimit > 0) {
    p->arpTick--;
    if (p->arpTick <= 0) {
      p->arpStep = (p->arpStep + 1) % p->arpeggioLimit;
      p->arpSemitoneOffset = (int)p->arpTable[p->arpStep];
      p->arpTick = (p->arpeggioSpeed > 0) ? p->arpeggioSpeed : 1;
    }
  }

  /* --- Vibrato --- */
  p->vibTick++;
  if (p->vibTick > p->vibratoDelay && p->vibratoDepth > 0 && p->vibratoSpeed > 0) {
    p->vibPhase += (float)(2.0 * M_PI / (p->vibratoSpeed * (double)p->samplesPerTick / WAVE_SIZE + 1.0));
    if (p->vibPhase >= (float)(2.0 * M_PI)) p->vibPhase -= (float)(2.0 * M_PI);
  }

  /* --- PWM modulation --- */
  if (p->pulseDelayTick > 0) {
    p->pulseDelayTick--;
  } else {
    p->pulseTick--;
    if (p->pulseTick <= 0) {
      if (p->pulseDir > 0) {
        p->pulsePos += (float)p->pulseRatePos;
        if (p->pulsePos >= (float)p->pulsePosH) {
          p->pulsePos = (float)p->pulsePosH;
          p->pulseDir = -1;
        }
      } else {
        p->pulsePos += (float)p->pulseRateNeg; /* pulseRateNeg is negative */
        if (p->pulsePos <= (float)p->pulsePosL) {
          p->pulsePos = (float)p->pulsePosL;
          p->pulseDir = 1;
        }
      }
      p->pulseTick = (p->pulseSpeed > 0) ? p->pulseSpeed : 1;
    }
  }
}

/* ── Public C API (called from WASM) ────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void fred_init(float sampleRate) {
  g_sampleRate = sampleRate;
  memset(g_players, 0, sizeof(g_players));
}

EMSCRIPTEN_KEEPALIVE
void fred_dispose(void) {
  memset(g_players, 0, sizeof(g_players));
}

EMSCRIPTEN_KEEPALIVE
int fred_create_player(void) {
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!g_players[i].loaded) {
      memset(&g_players[i], 0, sizeof(FredPlayer));
      g_players[i].sampleRate = g_sampleRate;
      g_players[i].samplesPerTick = g_sampleRate / (double)TICKS_PER_SEC;
      g_players[i].loaded = 1;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void fred_destroy_player(int handle) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  memset(&g_players[handle], 0, sizeof(FredPlayer));
}

EMSCRIPTEN_KEEPALIVE
void fred_load_instrument(int handle, const uint8_t* blob, int blobLen) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  if (blobLen < 37) return;

  FredPlayer* p = &g_players[handle];
  p->envelopeVol    = blob[0];
  p->attackSpeed    = blob[1];
  p->attackVol      = blob[2];
  p->decaySpeed     = blob[3];
  p->decayVol       = blob[4];
  p->sustainTime    = blob[5];
  p->releaseSpeed   = blob[6];
  p->releaseVol     = blob[7];
  p->vibratoDelay   = blob[8];
  p->vibratoSpeed   = blob[9];
  p->vibratoDepth   = blob[10];
  p->arpeggioLimit  = blob[11];
  p->arpeggioSpeed  = blob[12];
  p->pulseRateNeg   = (int8_t)blob[13];
  p->pulseRatePos   = blob[14];
  p->pulseSpeed     = blob[15];
  p->pulsePosL      = blob[16];
  p->pulsePosH      = blob[17];
  p->pulseDelay     = blob[18];
  for (int i = 0; i < ARP_SIZE; i++) {
    p->arpTable[i] = (int8_t)blob[19 + i];
  }
  p->relative = (uint16_t)(blob[35] | ((uint16_t)blob[36] << 8));
  p->active   = 0;
  p->loaded   = 1;
}

EMSCRIPTEN_KEEPALIVE
void fred_note_on(int handle, int midiNote, int velocity) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  FredPlayer* p = &g_players[handle];
  if (!p->loaded) return;

  /* Apply arpeggio offset to base note */
  int note = midiNote;
  if (note < 0) note = 0;
  if (note > 127) note = 127;

  double freq = midiToFreq(note);
  freq = applyRelative(freq, p->relative);

  /* Phase increment: how much phase advances per audio sample */
  /* One full wave period = WAVE_SIZE samples at the nominal 50 Hz tick rate */
  p->phaseInc = freq * WAVE_SIZE / g_sampleRate;
  p->phase    = 0.0;

  /* Reset ADSR */
  p->envVol     = (float)p->envelopeVol;
  p->envStage   = ENV_ATTACK;
  p->envTick    = (p->attackSpeed > 0) ? p->attackSpeed : 1;
  p->sustainTick = p->sustainTime;

  /* Reset vibrato */
  p->vibTick  = 0;
  p->vibPhase = 0.0f;

  /* Reset arpeggio */
  p->arpStep           = 0;
  p->arpTick           = (p->arpeggioSpeed > 0) ? p->arpeggioSpeed : 1;
  p->arpSemitoneOffset = 0;

  /* Reset PWM */
  p->pulsePos       = (float)((p->pulsePosL + p->pulsePosH) / 2);
  p->pulseDir       = 1;
  p->pulseTick      = (p->pulseSpeed > 0) ? p->pulseSpeed : 1;
  p->pulseDelayTick = p->pulseDelay;

  p->active = 1;
  (void)velocity;
}

EMSCRIPTEN_KEEPALIVE
void fred_note_off(int handle) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  FredPlayer* p = &g_players[handle];
  if (!p->active) return;
  if (p->envStage == ENV_SUSTAIN || p->envStage == ENV_ATTACK || p->envStage == ENV_DECAY) {
    p->envStage = ENV_RELEASE;
    p->envTick  = (p->releaseSpeed > 0) ? p->releaseSpeed : 1;
  }
}

EMSCRIPTEN_KEEPALIVE
void fred_render(int handle, float* outL, float* outR, int numSamples) {
  if (handle < 0 || handle >= MAX_PLAYERS || !outL || !outR) return;
  FredPlayer* p = &g_players[handle];

  if (!p->active || !p->loaded) {
    memset(outL, 0, (size_t)numSamples * sizeof(float));
    memset(outR, 0, (size_t)numSamples * sizeof(float));
    return;
  }

  for (int i = 0; i < numSamples; i++) {
    /* Advance tick at 50 Hz rate */
    p->tickAccum += 1.0;
    if (p->tickAccum >= p->samplesPerTick) {
      p->tickAccum -= p->samplesPerTick;
      fredTick(p);
      if (!p->active) {
        /* Note has ended — fill remainder with silence */
        for (int j = i; j < numSamples; j++) {
          outL[j] = outR[j] = 0.0f;
        }
        return;
      }
    }

    /* Compute arpeggio-adjusted phase increment */
    double freq = midiToFreq(60 + p->arpSemitoneOffset) / midiToFreq(60);
    double inc  = p->phaseInc * freq;

    /* Vibrato — modulate frequency with delayed sine LFO */
    if (p->vibTick > (int)p->vibratoDelay && p->vibratoDepth > 0) {
      float vibSemitones = sinf(p->vibPhase) * (float)p->vibratoDepth / 64.0f;
      float vibFactor    = powf(2.0f, vibSemitones / 12.0f);
      inc *= (double)vibFactor;
    }

    /* Generate PWM sample */
    float sample = pwmSample(p->phase, p->pulsePos);

    /* Scale by envelope volume (0-64) and normalize to [-1, +1] */
    /* Max amplitude: 127 * 64 / (127 * 64) = 1.0 */
    float vol = p->envVol / 64.0f;
    float out = sample * vol / 128.0f;

    outL[i] = out;
    outR[i] = out;

    /* Advance oscillator phase */
    p->phase += inc;
    if (p->phase >= WAVE_SIZE) p->phase -= WAVE_SIZE;
    if (p->phase < 0.0)        p->phase += WAVE_SIZE;
  }
}

EMSCRIPTEN_KEEPALIVE
void fred_set_param(int handle, int paramId, float value) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  FredPlayer* p = &g_players[handle];
  switch (paramId) {
    case 0: p->envVol = value * 64.0f; break;  /* volume 0-1 → 0-64 */
    default: break;
  }
}

EMSCRIPTEN_KEEPALIVE
float fred_get_param(int handle, int paramId) {
  if (handle < 0 || handle >= MAX_PLAYERS) return 0.0f;
  FredPlayer* p = &g_players[handle];
  switch (paramId) {
    case 0: return p->envVol / 64.0f;
    default: return 0.0f;
  }
}
