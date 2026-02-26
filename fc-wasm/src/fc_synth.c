/**
 * fc_synth.c — Future Composer 1.3/1.4 real-time synthesis WASM module
 *
 * Implements the format_synth_api.h interface for Future Composer formats.
 * Exported symbols use the "fc_" prefix.
 *
 * Instrument model:
 *   - 47 built-in FC13 wavetables (from FCPlayer.WAVES, same data as FCParser.ts)
 *   - Synth macro step sequencer (up to 16 steps cycling through waveforms)
 *   - ADSR volume envelope (tick-driven at 50Hz)
 *   - Vibrato LFO
 *   - Arpeggio (semitone offset table)
 *
 * Binary blob layout for fc_load_instrument():
 *   [0]          type: 0=FC synth, 1=PCM sample
 *   --- FC SYNTH (type=0) ---
 *   [1]          initialWaveNum (0-46: index into FC13 built-in waveforms)
 *   [2]          synthSpeed (1-15: ticks per synth table step)
 *   [3..50]      synthTable[16][3]: waveNum(1), transpositionSigned(1), effect(1)
 *   [51]         atkLength (0-255 ticks)
 *   [52]         atkVolume (0-64)
 *   [53]         decLength (0-255 ticks)
 *   [54]         decVolume (0-64)
 *   [55]         sustVolume (0-64)
 *   [56]         relLength (0-255 ticks)
 *   [57]         vibDelay (0-255 ticks)
 *   [58]         vibSpeed (0-63)
 *   [59]         vibDepth (0-63)
 *   [60..75]     arpTable[16] (signed bytes: semitone offsets)
 *   --- PCM (type=1) ---
 *   [1]          volume (0-64)
 *   [2]          finetune (signed int8 encoded as uint8: finetune+128)
 *   [3..6]       pcmLen (uint32 LE)
 *   [7..10]      loopStart (uint32 LE)
 *   [11..14]     loopLen (uint32 LE, 0=no loop)
 *   [15..]       pcmData (signed int8 bytes)
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <emscripten.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define MAX_PLAYERS       8
#define TICKS_PER_SEC    50     /* Amiga music runs at 50Hz */
#define MAX_SYNTH_STEPS  16
#define MAX_ARP_STEPS    16
#define MAX_PCM_SIZE     (1024 * 1024)  /* 1 MB max PCM */

/* ── FC13 Built-in Waveform Data ─────────────────────────────────────────── */
/* 47 waveforms, lengths in bytes, matching FCParser.ts FC13_WAVES exactly.
 * Data source: FlodJS FCPlayer.WAVES (public domain FC player reference) */

static const int FC13_WAVE_LENS[47] = {
  32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,  /* 0-15: 32 bytes each */
  32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,32,  /* 16-31: 32 bytes each */
  16,16,16,16,16,16,16,16,                           /* 32-39: 16 bytes each */
  32,16,32,32,16,16,48                               /* 40-46 */
};

static const int8_t FC13_WAVE_DATA[1344] = {
  /* Wave 0 (32 bytes) — XOR triangle variant */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  63,55,47,39,31,23,15,7,-1,7,15,23,31,39,47,55,
  /* Wave 1 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,55,47,39,31,23,15,7,-1,7,15,23,31,39,47,55,
  /* Wave 2 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,47,39,31,23,15,7,-1,7,15,23,31,39,47,55,
  /* Wave 3 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,39,31,23,15,7,-1,7,15,23,31,39,47,55,
  /* Wave 4 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,31,23,15,7,-1,7,15,23,31,39,47,55,
  /* Wave 5 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,23,15,7,-1,7,15,23,31,39,47,55,
  /* Wave 6 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,15,7,-1,7,15,23,31,39,47,55,
  /* Wave 7 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,7,-1,7,15,23,31,39,47,55,
  /* Wave 8 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,-120,-1,7,15,23,31,39,47,55,
  /* Wave 9 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,-120,-128,7,15,23,31,39,47,55,
  /* Wave 10 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,-120,-128,-120,15,23,31,39,47,55,
  /* Wave 11 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,-120,-128,-120,-112,23,31,39,47,55,
  /* Wave 12 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,-120,-128,-120,-112,-104,31,39,47,55,
  /* Wave 13 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,-120,-128,-120,-112,-104,-96,39,47,55,
  /* Wave 14 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,-120,-128,-120,-112,-104,-96,-88,47,55,
  /* Wave 15 */
  -64,-64,-48,-40,-32,-24,-16,-8,0,-8,-16,-24,-32,-40,-48,-56,
  -64,-72,-80,-88,-96,-104,-112,-120,-128,-120,-112,-104,-96,-88,-80,55,
  /* Wave 16 — 50% pulse */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 17 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 18 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 19 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,127,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 20 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 21 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 22 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 23 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,127,127,127,127,127,127,127,127,127,
  /* Wave 24 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127,127,127,127,127,127,127,127,127,
  /* Wave 25 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,127,127,127,127,127,127,127,
  /* Wave 26 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,127,127,127,127,127,127,
  /* Wave 27 */
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,127,127,127,127,127,
  /* Wave 28 */
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,127,127,127,
  /* Wave 29 */
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,127,127,
  /* Wave 30 */
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,127,
  /* Wave 31 */
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,127,
  /* Wave 32 — tiny pulse 50% */
  -128,-128,-128,-128,-128,-128,-128,-128,127,127,127,127,127,127,127,127,
  /* Wave 33 */
  -128,-128,-128,-128,-128,-128,-128,127,127,127,127,127,127,127,127,127,
  /* Wave 34 */
  -128,-128,-128,-128,-128,-128,127,127,127,127,127,127,127,127,127,127,
  /* Wave 35 */
  -128,-128,-128,-128,-128,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 36 */
  -128,-128,-128,-128,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 37 */
  -128,-128,-128,127,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 38 */
  -128,-128,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 39 */
  -128,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
  /* Wave 40 — sawtooth (32 bytes) */
  -128,-128,-112,-104,-96,-88,-80,-72,-64,-56,-48,-40,-32,-24,-16,-8,
  0,8,16,24,32,40,48,56,64,72,80,88,96,104,112,127,
  /* Wave 41 — small sawtooth (16 bytes) */
  -128,-96,-80,-64,-48,-32,-16,0,16,32,48,64,80,96,112,127,
  /* Wave 42 — custom 1 (32 bytes) */
  69,69,121,125,122,119,112,102,97,88,83,77,44,32,24,18,
  4,-37,-45,-51,-58,-68,-75,-82,-88,-93,-99,-103,-109,-114,-117,-118,
  /* Wave 43 — custom 2 (32 bytes) */
  69,69,121,125,122,119,112,102,91,75,67,55,44,32,24,18,
  4,-8,-24,-37,-49,-58,-66,-80,-88,-92,-98,-102,-107,-108,-115,-125,
  /* Wave 44 — tiny triangle (16 bytes) */
  0,0,64,96,127,96,64,32,0,-32,-64,-96,-128,-96,-64,-32,
  /* Wave 45 — tiny triangle variant (16 bytes) */
  0,0,64,96,127,96,64,32,0,-32,-64,-96,-128,-96,-64,-32,
  /* Wave 46 — saw + tiny saw (48 bytes) */
  -128,-128,-112,-104,-96,-88,-80,-72,-64,-56,-48,-40,-32,-24,-16,-8,
  0,8,16,24,32,40,48,56,64,72,80,88,96,104,112,127,
  -128,-96,-80,-64,-48,-32,-16,0,16,32,48,64,80,96,112,127
};

/* Precomputed byte offsets into FC13_WAVE_DATA for each waveform */
static int FC13_WAVE_OFFSETS[47];

static void fc_compute_offsets(void) {
  int off = 0;
  for (int i = 0; i < 47; i++) {
    FC13_WAVE_OFFSETS[i] = off;
    off += FC13_WAVE_LENS[i];
  }
}

/* ── Synth Table Entry ──────────────────────────────────────────────────── */

typedef struct {
  int waveNum;       /* 0-46 */
  int transposition; /* signed semitone offset */
  int effect;        /* 0=none, 1=vol_reset */
} SynthStep;

/* ── Per-Player State ───────────────────────────────────────────────────── */

typedef enum {
  ADSR_OFF = 0,
  ADSR_ATTACK,
  ADSR_DECAY,
  ADSR_SUSTAIN,
  ADSR_RELEASE
} ADSRState;

typedef struct {
  int active;

  /* Instrument type */
  int type; /* 0=synth, 1=pcm */

  /* Synth params */
  int initialWaveNum;
  SynthStep synthTable[MAX_SYNTH_STEPS];
  int synthSpeed;   /* ticks per step */
  int synthStepCount; /* how many valid steps (0 = use initialWaveNum only) */
  int atkLength, atkVolume;
  int decLength, decVolume;
  int sustVolume, relLength;
  int vibDelay, vibSpeed, vibDepth;
  int arpTable[MAX_ARP_STEPS];

  /* PCM params */
  int8_t *pcmData;
  int pcmLen, loopStart, loopLen, pcmVolume;
  float pcmFinetune; /* semitones */

  /* Oscillator state */
  float phaseAcc;
  float phaseInc;
  int currentWaveNum; /* current waveform being played */

  /* PCM oscillator state */
  float pcmPhase;
  float pcmPhaseInc;

  /* ADSR state */
  ADSRState adsrState;
  float volume;        /* 0.0 .. 64.0 */
  float adsrTickCount; /* ticks elapsed in current ADSR phase */

  /* Tick accumulator */
  float tickAcc;

  /* Synth sequencer */
  int synthStep;     /* current synth table step */
  int synthTick;     /* ticks elapsed in current synth step */

  /* Vibrato */
  int vibratoDelay;  /* ticks remaining before vibrato starts */
  float vibratoPhase;
  float vibratoCents; /* current vibrato offset in cents */

  /* Arpeggio */
  int arpStep;
  int note;          /* base MIDI note */
  int velocity;
} FCPlayer;

/* ── Context ────────────────────────────────────────────────────────────── */

typedef struct {
  int sampleRate;
  FCPlayer players[MAX_PLAYERS];
  int initialized;
} FCContext;

/* ── Internal helpers ───────────────────────────────────────────────────── */

static float midi_to_hz(int note) {
  return 440.0f * powf(2.0f, (note - 69) / 12.0f);
}

static float cents_to_ratio(float cents) {
  return powf(2.0f, cents / 1200.0f);
}

static void reset_player(FCPlayer *p) {
  p->active = 0;
  p->type = 0;
  p->initialWaveNum = 0;
  memset(p->synthTable, 0, sizeof(p->synthTable));
  p->synthSpeed = 1;
  p->synthStepCount = 0;
  p->atkLength = 4; p->atkVolume = 64;
  p->decLength = 8; p->decVolume = 32;
  p->sustVolume = 32; p->relLength = 8;
  p->vibDelay = 0; p->vibSpeed = 0; p->vibDepth = 0;
  memset(p->arpTable, 0, sizeof(p->arpTable));
  if (p->pcmData) { free(p->pcmData); p->pcmData = NULL; }
  p->pcmLen = 0; p->loopStart = 0; p->loopLen = 0;
  p->pcmVolume = 64; p->pcmFinetune = 0.0f;
  p->phaseAcc = 0.0f; p->phaseInc = 0.0f;
  p->pcmPhase = 0.0f; p->pcmPhaseInc = 0.0f;
  p->currentWaveNum = 0;
  p->adsrState = ADSR_OFF; p->volume = 0.0f; p->adsrTickCount = 0.0f;
  p->tickAcc = 0.0f;
  p->synthStep = 0; p->synthTick = 0;
  p->vibratoDelay = 0; p->vibratoPhase = 0.0f; p->vibratoCents = 0.0f;
  p->arpStep = 0; p->note = 60; p->velocity = 100;
}

static void update_phase_inc(FCPlayer *p, int sr) {
  if (p->type == 1) return; /* PCM handles separately */
  int waveNum = p->currentWaveNum;
  if (waveNum < 0 || waveNum >= 47) waveNum = 0;
  int waveLen = FC13_WAVE_LENS[waveNum];
  if (waveLen <= 0) return;

  /* Base frequency from MIDI note + arpeggio offset */
  int arpOffset = p->arpTable[p->arpStep % MAX_ARP_STEPS];
  float freqHz = midi_to_hz(p->note + arpOffset) * cents_to_ratio(p->vibratoCents);
  p->phaseInc = freqHz / (float)sr * (float)waveLen;
}

static void update_pcm_phase_inc(FCPlayer *p, int sr) {
  if (p->pcmLen <= 0) return;
  int arpOffset = p->arpTable[p->arpStep % MAX_ARP_STEPS];
  float freqHz = midi_to_hz(p->note + arpOffset) * cents_to_ratio(p->pcmFinetune * 100.0f + p->vibratoCents);
  /* PCM playback rate assumes recorded at C-3 (MIDI 48) = 8287 Hz natural */
  float naturalFreq = midi_to_hz(48);
  p->pcmPhaseInc = freqHz / naturalFreq;
}

/* Run one 50Hz tick update */
static void fc_tick(FCPlayer *p, int sr) {
  if (p->adsrState == ADSR_OFF) return;

  p->adsrTickCount += 1.0f;

  /* ── ADSR state machine ── */
  switch (p->adsrState) {
    case ADSR_ATTACK:
      if (p->atkLength > 0) {
        float rate = (float)p->atkVolume / (float)p->atkLength;
        p->volume += rate;
        if (p->volume >= (float)p->atkVolume || p->adsrTickCount >= p->atkLength) {
          p->volume = (float)p->atkVolume;
          p->adsrState = ADSR_DECAY;
          p->adsrTickCount = 0.0f;
        }
      } else {
        p->volume = (float)p->atkVolume;
        p->adsrState = ADSR_DECAY;
        p->adsrTickCount = 0.0f;
      }
      break;

    case ADSR_DECAY:
      if (p->decLength > 0) {
        float range = (float)(p->atkVolume - p->decVolume);
        float rate  = range / (float)p->decLength;
        p->volume -= rate;
        if (p->volume <= (float)p->decVolume || p->adsrTickCount >= p->decLength) {
          p->volume = (float)p->decVolume;
          p->adsrState = ADSR_SUSTAIN;
          p->adsrTickCount = 0.0f;
        }
      } else {
        p->volume = (float)p->decVolume;
        p->adsrState = ADSR_SUSTAIN;
        p->adsrTickCount = 0.0f;
      }
      break;

    case ADSR_SUSTAIN:
      p->volume = (float)p->sustVolume;
      break;

    case ADSR_RELEASE:
      if (p->relLength > 0) {
        float rate = (float)p->sustVolume / (float)p->relLength;
        p->volume -= rate;
        if (p->volume <= 0.0f || p->adsrTickCount >= p->relLength) {
          p->volume = 0.0f;
          p->adsrState = ADSR_OFF;
          p->active = 0;
        }
      } else {
        p->volume = 0.0f;
        p->adsrState = ADSR_OFF;
        p->active = 0;
      }
      break;

    default:
      break;
  }

  /* ── Vibrato ── */
  if (p->vibSpeed > 0 && p->vibDepth > 0) {
    if (p->vibratoDelay > 0) {
      p->vibratoDelay--;
    } else {
      /* vibSpeed = ticks per half-cycle; period = vibSpeed * 2 ticks */
      float advance = (float)M_PI / (float)(p->vibSpeed > 0 ? p->vibSpeed : 1);
      p->vibratoPhase += advance;
      if (p->vibratoPhase > 2.0f * (float)M_PI) p->vibratoPhase -= 2.0f * (float)M_PI;
      /* vibDepth in cents / 8 → max ±8 cents at depth=64 */
      p->vibratoCents = sinf(p->vibratoPhase) * (float)p->vibDepth * 0.5f;
    }
  }

  /* ── Arpeggio (advance one step per tick) ── */
  p->arpStep = (p->arpStep + 1) % MAX_ARP_STEPS;

  /* ── Synth table sequencer ── */
  if (p->type == 0 && p->synthStepCount > 0) {
    int speed = p->synthSpeed > 0 ? p->synthSpeed : 1;
    p->synthTick++;
    if (p->synthTick >= speed) {
      p->synthTick = 0;
      p->synthStep = (p->synthStep + 1) % p->synthStepCount;
      int newWave = p->synthTable[p->synthStep].waveNum;
      if (newWave >= 0 && newWave < 47) {
        p->currentWaveNum = newWave;
      }
      /* Recalculate phase increment for new waveform */
      int waveLen = FC13_WAVE_LENS[p->currentWaveNum];
      if (waveLen > 0) {
        int arpOff = p->arpTable[p->arpStep % MAX_ARP_STEPS];
        float freqHz = midi_to_hz(p->note + arpOff) * cents_to_ratio(p->vibratoCents);
        p->phaseInc = freqHz / (float)sr * (float)waveLen;
      }
    }
  } else {
    /* No synth table — recalculate for arpeggio/vibrato changes */
    update_phase_inc(p, sr);
  }

  /* PCM: update phase inc for arp/vibrato */
  if (p->type == 1) {
    update_pcm_phase_inc(p, sr);
  }
}

/* ── Exported API ───────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void* fc_init(int sampleRate) {
  fc_compute_offsets();
  FCContext *ctx = (FCContext*)calloc(1, sizeof(FCContext));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  ctx->initialized = 1;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    ctx->players[i].pcmData = NULL;
    reset_player(&ctx->players[i]);
  }
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void fc_dispose(void* ctxPtr) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx) return;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (ctx->players[i].pcmData) {
      free(ctx->players[i].pcmData);
      ctx->players[i].pcmData = NULL;
    }
  }
  free(ctx);
}

EMSCRIPTEN_KEEPALIVE
int fc_create_player(void* ctxPtr) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx) return -1;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].active && ctx->players[i].adsrState == ADSR_OFF) {
      reset_player(&ctx->players[i]);
      return i;
    }
  }
  return -1; /* all slots busy */
}

EMSCRIPTEN_KEEPALIVE
void fc_destroy_player(void* ctxPtr, int handle) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  FCPlayer *p = &ctx->players[handle];
  reset_player(p);
}

EMSCRIPTEN_KEEPALIVE
int fc_load_instrument(void* ctxPtr, int handle, const uint8_t* data, int dataLen) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return -1;
  if (!data || dataLen < 1) return -2;

  FCPlayer *p = &ctx->players[handle];
  if (p->pcmData) { free(p->pcmData); p->pcmData = NULL; }

  p->type = data[0];

  if (p->type == 0) {
    /* FC Synth instrument */
    if (dataLen < 76) return -3;

    p->initialWaveNum = data[1] < 47 ? data[1] : 0;
    p->synthSpeed     = data[2] > 0 ? data[2] : 1;

    /* Parse synth table (16 steps × 3 bytes) */
    p->synthStepCount = 0;
    for (int i = 0; i < MAX_SYNTH_STEPS; i++) {
      int base = 3 + i * 3;
      int wn   = data[base];
      int tr   = (int8_t)data[base + 1];
      int ef   = data[base + 2];
      p->synthTable[i].waveNum       = wn < 47 ? wn : 0;
      p->synthTable[i].transposition = tr;
      p->synthTable[i].effect        = ef;
      if (wn > 0 || i == 0) p->synthStepCount = i + 1;
    }

    p->atkLength  = data[51];
    p->atkVolume  = data[52] > 64 ? 64 : data[52];
    p->decLength  = data[53];
    p->decVolume  = data[54] > 64 ? 64 : data[54];
    p->sustVolume = data[55] > 64 ? 64 : data[55];
    p->relLength  = data[56];
    p->vibDelay   = data[57];
    p->vibSpeed   = data[58];
    p->vibDepth   = data[59];

    for (int i = 0; i < MAX_ARP_STEPS; i++) {
      p->arpTable[i] = (int8_t)data[60 + i];
    }

  } else if (p->type == 1) {
    /* PCM instrument */
    if (dataLen < 15) return -3;

    p->pcmVolume   = data[1] > 64 ? 64 : data[1];
    float finetune = (float)((int8_t)(data[2] - 128)); /* unsigned back to signed */
    p->pcmFinetune = finetune / 8.0f; /* -1..+1 semitones */

    int pcmLen = ((uint32_t)data[3]) | ((uint32_t)data[4] << 8)
               | ((uint32_t)data[5] << 16) | ((uint32_t)data[6] << 24);
    int loopStart = ((uint32_t)data[7])  | ((uint32_t)data[8]  << 8)
                  | ((uint32_t)data[9]  << 16) | ((uint32_t)data[10] << 24);
    int loopLen   = ((uint32_t)data[11]) | ((uint32_t)data[12] << 8)
                  | ((uint32_t)data[13] << 16) | ((uint32_t)data[14] << 24);

    if (pcmLen > 0 && pcmLen <= MAX_PCM_SIZE && dataLen >= 15 + pcmLen) {
      p->pcmData = (int8_t*)malloc(pcmLen);
      if (!p->pcmData) return -4;
      memcpy(p->pcmData, data + 15, pcmLen);
      p->pcmLen    = pcmLen;
      p->loopStart = loopStart < pcmLen ? loopStart : 0;
      p->loopLen   = loopLen;
      if (p->loopStart + p->loopLen > p->pcmLen) {
        p->loopLen = p->pcmLen - p->loopStart;
      }
    }
  }

  return 0;
}

EMSCRIPTEN_KEEPALIVE
void fc_note_on(void* ctxPtr, int handle, int midiNote, int velocity) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  FCPlayer *p = &ctx->players[handle];

  p->note     = midiNote;
  p->velocity = velocity;

  /* Reset oscillator */
  p->phaseAcc  = 0.0f;
  p->pcmPhase  = 0.0f;
  p->tickAcc   = 0.0f;

  /* Start synth sequencer */
  p->synthStep = 0;
  p->synthTick = 0;
  p->arpStep   = 0;

  /* Set initial waveform */
  if (p->type == 0) {
    int wn = (p->synthStepCount > 0) ? p->synthTable[0].waveNum : p->initialWaveNum;
    p->currentWaveNum = (wn >= 0 && wn < 47) ? wn : p->initialWaveNum;
    update_phase_inc(p, ctx->sampleRate);
  } else {
    update_pcm_phase_inc(p, ctx->sampleRate);
  }

  /* Reset vibrato */
  p->vibratoDelay = p->vibDelay;
  p->vibratoPhase = 0.0f;
  p->vibratoCents = 0.0f;

  /* Start ADSR */
  p->volume       = 0.0f;
  p->adsrState    = ADSR_ATTACK;
  p->adsrTickCount = 0.0f;
  p->active       = 1;
}

EMSCRIPTEN_KEEPALIVE
void fc_note_off(void* ctxPtr, int handle) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  FCPlayer *p = &ctx->players[handle];

  if (p->adsrState != ADSR_OFF) {
    p->adsrState     = ADSR_RELEASE;
    p->adsrTickCount = 0.0f;
  }
}

EMSCRIPTEN_KEEPALIVE
void fc_render(void* ctxPtr, int handle, float* outL, float* outR, int numSamples) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS || !outL || !outR) return;
  FCPlayer *p = &ctx->players[handle];

  if (!p->active && p->adsrState == ADSR_OFF) {
    memset(outL, 0, numSamples * sizeof(float));
    memset(outR, 0, numSamples * sizeof(float));
    return;
  }

  const float tickPeriod = 1.0f / (float)TICKS_PER_SEC;
  const float samplePeriod = 1.0f / (float)ctx->sampleRate;

  for (int i = 0; i < numSamples; i++) {
    /* Advance tick accumulator */
    p->tickAcc += samplePeriod;
    if (p->tickAcc >= tickPeriod) {
      p->tickAcc -= tickPeriod;
      fc_tick(p, ctx->sampleRate);
      if (p->adsrState == ADSR_OFF) {
        /* Fill remainder with silence */
        for (int j = i; j < numSamples; j++) {
          outL[j] = 0.0f;
          outR[j] = 0.0f;
        }
        return;
      }
    }

    float sample = 0.0f;
    float volScale = (p->volume / 64.0f) * ((float)p->velocity / 127.0f);

    if (p->type == 0) {
      /* Wavetable synthesis */
      int wn = p->currentWaveNum;
      if (wn < 0 || wn >= 47) wn = 0;
      int waveLen = FC13_WAVE_LENS[wn];
      if (waveLen > 0) {
        int idx = (int)p->phaseAcc % waveLen;
        if (idx < 0) idx = 0;
        int off = FC13_WAVE_OFFSETS[wn] + idx;
        sample = (float)FC13_WAVE_DATA[off] / 128.0f;

        p->phaseAcc += p->phaseInc;
        while (p->phaseAcc >= (float)waveLen) p->phaseAcc -= (float)waveLen;
        if (p->phaseAcc < 0.0f) p->phaseAcc = 0.0f;
      }
    } else {
      /* PCM synthesis */
      if (p->pcmData && p->pcmLen > 0) {
        int idx = (int)p->pcmPhase;
        if (idx >= 0 && idx < p->pcmLen) {
          sample = (float)p->pcmData[idx] / 128.0f;
        }

        p->pcmPhase += p->pcmPhaseInc;

        if (p->loopLen > 1) {
          /* Loop */
          while (p->pcmPhase >= (float)(p->loopStart + p->loopLen)) {
            p->pcmPhase -= (float)p->loopLen;
          }
        } else if (p->pcmPhase >= (float)p->pcmLen) {
          /* One-shot: silence */
          p->adsrState = ADSR_OFF;
          p->active = 0;
          for (int j = i + 1; j < numSamples; j++) {
            outL[j] = 0.0f;
            outR[j] = 0.0f;
          }
          outL[i] = sample * volScale;
          outR[i] = sample * volScale;
          return;
        }
      }
      volScale = ((float)p->pcmVolume / 64.0f) * ((float)p->velocity / 127.0f);
    }

    float out = sample * volScale;
    outL[i] = out;
    outR[i] = out;
  }
}

EMSCRIPTEN_KEEPALIVE
void fc_set_param(void* ctxPtr, int handle, int paramId, float value) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  FCPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 0: /* volume (0-1 normalized) */
      /* volume handled per-note via velocity; gain handled in JS */
      break;
    case 1: /* vibrato depth (0-1) */
      p->vibDepth = (int)(value * 63.0f);
      break;
    case 2: /* vibrato speed (0-1) */
      p->vibSpeed = (int)(value * 63.0f);
      break;
    default:
      break;
  }
}

EMSCRIPTEN_KEEPALIVE
float fc_get_param(void* ctxPtr, int handle, int paramId) {
  FCContext *ctx = (FCContext*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return 0.0f;
  (void)handle; (void)paramId;
  return 0.0f;
}
