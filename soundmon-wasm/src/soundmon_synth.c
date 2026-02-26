/**
 * soundmon_synth.c — SoundMon II real-time wavetable synthesis WASM module
 *
 * Implements the format_synth_api.h interface for SoundMon II (.bp, .bp3) formats.
 * Exported symbols use the "sm_" prefix.
 *
 * Instrument model:
 *   - 64-sample wavetable oscillator (custom waveform from file, or 16 built-in shapes)
 *   - ADSR volume envelope (tick-driven at ~50Hz)
 *   - Vibrato LFO (delayed sine LFO applied to phase increment)
 *   - Arpeggio (semitone offset table, stepped per tick)
 *
 * Binary blob layout for sm_load_instrument():
 *   [0]       type: 0=synth, 1=pcm
 *   --- SYNTH (type=0) ---
 *   [1]       waveType (0-15, used when no custom wave data)
 *   [2]       waveSpeed (reserved, future use)
 *   [3]       arpSpeed  (0-15 ticks per arp step)
 *   [4]       attackVol (0-64)
 *   [5]       decayVol  (0-64)
 *   [6]       sustainVol (0-64)
 *   [7]       releaseVol (0-64)
 *   [8]       attackSpeed (0-63 ticks per volume step)
 *   [9]       decaySpeed  (0-63)
 *   [10]      sustainLen  (0-255 ticks to hold sustain)
 *   [11]      releaseSpeed (0-63)
 *   [12]      vibratoDelay (0-255 ticks)
 *   [13]      vibratoSpeed (0-63 ticks per LFO step)
 *   [14]      vibratoDepth (0-63, 1/64th semitone units)
 *   [15]      portamentoSpeed (0-63, 0=off)
 *   [16..31]  arpTable[16] (signed bytes: semitone offsets)
 *   [32..35]  waveDataLen (uint32 LE, 0 = use built-in waveform from waveType)
 *   [36..]    waveData (waveDataLen bytes of signed int8 PCM, one cycle)
 *   --- PCM (type=1) ---
 *   [1]       volume (0-64)
 *   [2]       finetune (signed int8, -8..+7)
 *   [3]       transpose (signed int8, -12..+12)
 *   [4..7]    pcmLen  (uint32 LE)
 *   [8..11]   loopStart (uint32 LE)
 *   [12..15]  loopLen   (uint32 LE, 0 = no loop)
 *   [16..]    pcmData   (pcmLen bytes of signed int8 PCM)
 *
 * Note: All volumes are 0-64 (Amiga standard). The output is normalised to [-1,+1]
 * by dividing by (64 * 128) — 64 max volume * 128 max waveform amplitude.
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <emscripten.h>

/* ── Constants ─────────────────────────────────────────────────────────────── */

#define SM_WAVE_SIZE     64
#define SM_ARP_SIZE      16
#define MAX_PLAYERS       8
#define TICKS_PER_SEC    50     /* Amiga music runs at 50Hz */

/* ── Built-in waveforms (16 shapes, 64 samples each) ───────────────────────── */

static const int8_t BUILTIN_WAVES[16][SM_WAVE_SIZE] = {
  /* 0: Sawtooth (ramp down, classic Amiga) */
  { 127,123,119,115,111,107,103,99,95,91,87,83,79,75,71,67,
    63,59,55,51,47,43,39,35,31,27,23,19,15,11,7,3,
    -1,-5,-9,-13,-17,-21,-25,-29,-33,-37,-41,-45,-49,-53,-57,-61,
    -65,-69,-73,-77,-81,-85,-89,-93,-97,-101,-105,-109,-113,-117,-121,-125 },
  /* 1: Square (50% duty cycle) */
  { 127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128 },
  /* 2: Triangle */
  { 0,8,16,24,32,40,48,56,64,72,80,88,96,104,112,120,
    127,120,112,104,96,88,80,72,64,56,48,40,32,24,16,8,
    0,-8,-16,-24,-32,-40,-48,-56,-64,-72,-80,-88,-96,-104,-112,-120,
    -128,-120,-112,-104,-96,-88,-80,-72,-64,-56,-48,-40,-32,-24,-16,-8 },
  /* 3: Sine (approximated) */
  { 0,12,25,37,49,60,71,81,90,98,106,112,117,122,125,127,
    127,125,122,117,112,106,98,90,81,71,60,49,37,25,12,0,
    -12,-25,-37,-49,-60,-71,-81,-90,-98,-106,-112,-117,-122,-125,-127,-127,
    -127,-125,-122,-117,-112,-106,-98,-90,-81,-71,-60,-49,-37,-25,-12,-1 },
  /* 4: Noise (pseudo-random, fixed pattern so it's reproducible) */
  { 45,-67,23,112,-89,34,-12,78,-56,91,-23,67,-44,99,-78,55,
    -33,88,-11,102,-44,77,-22,66,-88,33,-77,22,-99,44,-55,88,
    -66,11,-102,44,-77,22,-66,88,-33,77,-22,99,-44,55,-88,33,
    66,-11,102,-44,77,-22,66,-88,33,-77,22,-99,44,-55,88,-66 },
  /* 5: Pulse 25% */
  { 127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128 },
  /* 6: Pulse 75% */
  { 127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,127,
    -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128 },
  /* 7: Ramp up (reverse sawtooth) */
  { -128,-124,-120,-116,-112,-108,-104,-100,-96,-92,-88,-84,-80,-76,-72,-68,
    -64,-60,-56,-52,-48,-44,-40,-36,-32,-28,-24,-20,-16,-12,-8,-4,
    0,4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,
    64,68,72,76,80,84,88,92,96,100,104,108,112,116,120,124 },
  /* 8: Soft sine (filtered, rounded) */
  { 0,6,12,19,25,31,37,43,48,53,58,63,67,71,74,77,
    79,80,80,79,77,74,71,67,63,58,53,48,43,37,31,25,
    19,12,6,0,-6,-12,-19,-25,-31,-37,-43,-48,-53,-58,-63,-67,
    -71,-74,-77,-79,-80,-80,-79,-77,-74,-71,-67,-63,-58,-53,-48,-43 },
  /* 9: Double saw */
  { 127,115,103,91,79,67,55,43,31,19,7,-5,-17,-29,-41,-53,
    -65,-77,-89,-101,-113,-125,-125,-113,-101,-89,-77,-65,-53,-41,-29,-17,
    -5,7,19,31,43,55,67,79,91,103,115,127,115,103,91,79,
    67,55,43,31,19,7,-5,-17,-29,-41,-53,-65,-77,-89,-101,-113 },
  /* 10: Organ (PWM + harmonics approximation) */
  { 0,20,38,54,67,76,81,82,79,72,62,49,33,16,-1,-18,
    -35,-50,-62,-71,-77,-79,-77,-71,-62,-50,-35,-18,-1,16,33,49,
    62,72,79,82,81,76,67,54,38,20,0,-20,-38,-54,-67,-76,
    -81,-82,-79,-72,-62,-49,-33,-16,1,18,35,50,62,71,77,79 },
  /* 11: Clavinet (sharp attack transient shape) */
  { 127,90,63,44,31,22,15,11,7,5,3,2,1,1,0,0,
    0,-1,-1,-2,-3,-5,-7,-11,-15,-22,-31,-44,-63,-90,-127,-90,
    -63,-44,-31,-22,-15,-11,-7,-5,-3,-2,-1,-1,0,0,0,1,
    1,2,3,5,7,11,15,22,31,44,63,90,127,90,63,44 },
  /* 12: Wobble (saw + sub) */
  { 64,68,72,76,80,84,88,92,96,100,104,108,112,116,120,124,
    -128,-114,-100,-86,-72,-58,-44,-30,-16,-2,12,26,40,54,68,82,
    96,82,68,54,40,26,12,-2,-16,-30,-44,-58,-72,-86,-100,-114,
    -128,124,120,116,112,108,104,100,96,92,88,84,80,76,72,68 },
  /* 13: Buzzy (odd harmonics) */
  { 0,48,80,96,80,48,0,-48,-80,-96,-80,-48,0,48,80,96,
    80,48,0,-48,-80,-96,-80,-48,0,48,80,96,80,48,0,-48,
    -80,-96,-80,-48,0,48,80,96,80,48,0,-48,-80,-96,-80,-48,
    0,48,80,96,80,48,0,-48,-80,-96,-80,-48,0,48,80,96 },
  /* 14: Reed (clarinet-like, odd-heavy) */
  { 0,25,49,70,86,96,99,94,82,63,38,10,-20,-49,-73,-90,
    -99,-99,-90,-73,-49,-20,10,38,63,82,94,99,96,86,70,49,
    25,0,-25,-49,-70,-86,-96,-99,-94,-82,-63,-38,-10,20,49,73,
    90,99,99,90,73,49,20,-10,-38,-63,-82,-94,-99,-96,-86,-70 },
  /* 15: Pluck (sharp onset, fast decay shape) */
  { 127,108,91,76,64,53,44,36,29,23,18,14,10,7,5,3,
    1,0,-2,-3,-5,-7,-10,-14,-18,-23,-29,-36,-44,-53,-64,-76,
    -91,-76,-64,-53,-44,-36,-29,-23,-18,-14,-10,-7,-5,-3,-1,0,
    2,3,5,7,10,14,18,23,29,36,44,53,64,76,91,108 },
};

/* ── Instrument structure ───────────────────────────────────────────────────── */

typedef struct {
  int      type;              /* 0=synth, 1=pcm */

  /* Synth waveform */
  int8_t   wave[SM_WAVE_SIZE];
  int      waveSize;          /* actual wave size (default 64) */

  /* ADSR (volumes are 0-64) */
  uint8_t  attackVol;
  uint8_t  decayVol;
  uint8_t  sustainVol;
  uint8_t  releaseVol;
  uint8_t  attackSpeed;       /* ticks per step toward attackVol */
  uint8_t  decaySpeed;        /* ticks per step toward decayVol */
  uint8_t  sustainLen;        /* ticks to hold sustain */
  uint8_t  releaseSpeed;      /* ticks per step toward releaseVol */

  /* Vibrato */
  uint8_t  vibDelay;
  uint8_t  vibSpeed;
  uint8_t  vibDepth;

  /* Arpeggio */
  int8_t   arpTable[SM_ARP_SIZE];
  uint8_t  arpSpeed;

  /* Portamento */
  uint8_t  portSpeed;

  /* PCM fields */
  int8_t  *pcmData;
  int      pcmLen;
  int      loopStart;
  int      loopLen;
  uint8_t  pcmVolume;
  int8_t   finetune;
  int8_t   transpose;
} SMInstrument;

/* ── Player state ──────────────────────────────────────────────────────────── */

typedef enum { ENV_ATTACK, ENV_DECAY, ENV_SUSTAIN, ENV_RELEASE, ENV_OFF } EnvPhase;

typedef struct {
  int          alive;
  int          sampleRate;
  int          samplesPerTick;  /* sampleRate / TICKS_PER_SEC */

  SMInstrument ins;

  /* Oscillator */
  float        phase;         /* [0, waveSize) */
  float        phaseInc;      /* per-sample step at base note */
  float        vibPhaseInc;   /* current phase inc with vibrato + arpeggio applied */
  int          baseNote;      /* MIDI note (0-127) */
  int          playing;

  /* Tick sub-sample counter */
  int          sampleCtr;     /* counts up to samplesPerTick */

  /* Envelope */
  EnvPhase     envPhase;
  float        envVol;        /* current volume [0.0, 64.0] */
  int          envTickCtr;    /* ticks elapsed in current phase */
  int          sustainTickCtr;

  /* Vibrato */
  int          vibDelayCtr;   /* ticks remaining until vibrato starts */
  float        vibPhase;      /* LFO phase [0, 64) */
  int          vibTickCtr;

  /* Arpeggio */
  int          arpIdx;
  int          arpTickCtr;
} SMPlayer;

/* ── Context ──────────────────────────────────────────────────────────────── */

typedef struct {
  int       sampleRate;
  SMPlayer  players[MAX_PLAYERS];
} SMContext;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

static float midiNoteToFreq(int note) {
  /* Standard equal temperament: A4 (note 69) = 440Hz */
  return 440.0f * powf(2.0f, (note - 69) / 12.0f);
}

static float computePhaseInc(float freq, int waveSize, int sampleRate) {
  return freq * (float)waveSize / (float)sampleRate;
}

/* Sine table for vibrato LFO (64 entries, amplitude = 1.0) */
static float vibSine(float phase) {
  return sinf(phase * 6.283185307f / 64.0f);
}

/* ── Player tick: update envelope, vibrato, arpeggio ─────────────────────── */

static void sm_player_tick(SMPlayer *p) {
  if (!p->playing) return;

  /* Envelope */
  switch (p->envPhase) {
    case ENV_ATTACK:
      p->envTickCtr++;
      if (p->ins.attackSpeed > 0) {
        p->envVol = p->ins.attackVol * ((float)p->envTickCtr / ((float)p->ins.attackSpeed * 4.0f + 1.0f));
        if (p->envVol >= p->ins.attackVol) {
          p->envVol = p->ins.attackVol;
          p->envPhase = ENV_DECAY;
          p->envTickCtr = 0;
        }
      } else {
        p->envVol = p->ins.attackVol;
        p->envPhase = ENV_DECAY;
        p->envTickCtr = 0;
      }
      break;

    case ENV_DECAY:
      p->envTickCtr++;
      if (p->ins.decaySpeed > 0) {
        float t = (float)p->envTickCtr / ((float)p->ins.decaySpeed * 4.0f + 1.0f);
        p->envVol = p->ins.attackVol + (p->ins.decayVol - p->ins.attackVol) * t;
        if (t >= 1.0f) {
          p->envVol = p->ins.decayVol;
          p->envPhase = ENV_SUSTAIN;
          p->sustainTickCtr = 0;
          p->envTickCtr = 0;
        }
      } else {
        p->envVol = p->ins.decayVol;
        p->envPhase = ENV_SUSTAIN;
        p->sustainTickCtr = 0;
        p->envTickCtr = 0;
      }
      break;

    case ENV_SUSTAIN:
      p->envVol = p->ins.sustainVol;
      if (p->ins.sustainLen > 0) {
        p->sustainTickCtr++;
        if (p->sustainTickCtr >= p->ins.sustainLen) {
          /* Auto-release after sustainLen ticks */
          p->envPhase = ENV_RELEASE;
          p->envTickCtr = 0;
        }
      }
      break;

    case ENV_RELEASE:
      p->envTickCtr++;
      if (p->ins.releaseSpeed > 0) {
        float t = (float)p->envTickCtr / ((float)p->ins.releaseSpeed * 4.0f + 1.0f);
        p->envVol = p->ins.sustainVol * (1.0f - t);
        if (t >= 1.0f || p->envVol <= 0.0f) {
          p->envVol = 0.0f;
          p->envPhase = ENV_OFF;
          p->playing = 0;
        }
      } else {
        p->envVol = 0.0f;
        p->envPhase = ENV_OFF;
        p->playing = 0;
      }
      break;

    case ENV_OFF:
      break;
  }

  /* Vibrato */
  float vibSemitones = 0.0f;
  if (p->ins.vibDepth > 0) {
    if (p->vibDelayCtr > 0) {
      p->vibDelayCtr--;
    } else {
      p->vibTickCtr++;
      if (p->ins.vibSpeed > 0 && p->vibTickCtr >= p->ins.vibSpeed) {
        p->vibTickCtr = 0;
        p->vibPhase += 1.0f;
        if (p->vibPhase >= 64.0f) p->vibPhase -= 64.0f;
      }
      vibSemitones = vibSine(p->vibPhase) * (p->ins.vibDepth / 32.0f);
    }
  }

  /* Arpeggio */
  float arpSemitones = 0.0f;
  {
    /* Check if arp table has any non-zero entries */
    int hasArp = 0;
    for (int i = 0; i < SM_ARP_SIZE; i++) {
      if (p->ins.arpTable[i] != 0) { hasArp = 1; break; }
    }
    if (hasArp) {
      p->arpTickCtr++;
      int speed = p->ins.arpSpeed > 0 ? p->ins.arpSpeed : 1;
      if (p->arpTickCtr >= speed) {
        p->arpTickCtr = 0;
        p->arpIdx = (p->arpIdx + 1) % SM_ARP_SIZE;
      }
      arpSemitones = (float)p->ins.arpTable[p->arpIdx];
    }
  }

  /* Recompute phase increment with vibrato and arpeggio applied */
  if (p->baseNote >= 0) {
    float freq = midiNoteToFreq(p->baseNote + arpSemitones + vibSemitones);
    int ws = p->ins.waveSize > 0 ? p->ins.waveSize : SM_WAVE_SIZE;
    p->vibPhaseInc = computePhaseInc(freq, ws, p->sampleRate);
  }
}

/* ── WASM exports ─────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void *sm_init(int sampleRate) {
  SMContext *ctx = (SMContext *)calloc(1, sizeof(SMContext));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void sm_dispose(void *ctxPtr) {
  if (!ctxPtr) return;
  SMContext *ctx = (SMContext *)ctxPtr;
  /* Free PCM data for any loaded instruments */
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (ctx->players[i].ins.pcmData) {
      free(ctx->players[i].ins.pcmData);
      ctx->players[i].ins.pcmData = NULL;
    }
  }
  free(ctx);
}

/**
 * Create a new synth instance. Returns handle (0..MAX_PLAYERS-1) or -1.
 * Callers must create a player before calling sm_load_instrument / sm_note_on.
 */
EMSCRIPTEN_KEEPALIVE
int sm_create_player(void *ctxPtr) {
  if (!ctxPtr) return -1;
  SMContext *ctx = (SMContext *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].alive) {
      memset(&ctx->players[i], 0, sizeof(SMPlayer));
      ctx->players[i].alive = 1;
      ctx->players[i].sampleRate = ctx->sampleRate;
      ctx->players[i].samplesPerTick = ctx->sampleRate / TICKS_PER_SEC;
      ctx->players[i].envPhase = ENV_OFF;
      ctx->players[i].vibPhase = 0.0f;
      ctx->players[i].baseNote = -1;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void sm_destroy_player(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SMContext *ctx = (SMContext *)ctxPtr;
  SMPlayer *p = &ctx->players[handle];
  if (p->ins.pcmData) {
    free(p->ins.pcmData);
    p->ins.pcmData = NULL;
  }
  memset(p, 0, sizeof(SMPlayer));
}

EMSCRIPTEN_KEEPALIVE
int sm_load_instrument(void *ctxPtr, int handle, const uint8_t *data, int len) {
  if (!ctxPtr || !data || len < 1) return -1;
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;

  SMContext *ctx = (SMContext *)ctxPtr;
  SMPlayer *p = &ctx->players[handle];

  /* Free any previous PCM data */
  if (p->ins.pcmData) { free(p->ins.pcmData); p->ins.pcmData = NULL; }
  memset(&p->ins, 0, sizeof(SMInstrument));

  p->ins.type = data[0];

  if (p->ins.type == 0) {
    /* Synth instrument */
    if (len < 36) return -2;

    int waveType   = data[1] & 0x0F;
    p->ins.arpSpeed    = data[3];
    p->ins.attackVol   = data[4];
    p->ins.decayVol    = data[5];
    p->ins.sustainVol  = data[6];
    p->ins.releaseVol  = data[7];
    p->ins.attackSpeed = data[8];
    p->ins.decaySpeed  = data[9];
    p->ins.sustainLen  = data[10];
    p->ins.releaseSpeed = data[11];
    p->ins.vibDelay    = data[12];
    p->ins.vibSpeed    = data[13];
    p->ins.vibDepth    = data[14];
    p->ins.portSpeed   = data[15];

    for (int i = 0; i < SM_ARP_SIZE; i++) {
      p->ins.arpTable[i] = (int8_t)data[16 + i];
    }

    /* Read optional custom waveform */
    uint32_t waveDataLen = (uint32_t)data[32] | ((uint32_t)data[33] << 8)
                         | ((uint32_t)data[34] << 16) | ((uint32_t)data[35] << 24);

    if (waveDataLen > 0 && len >= (int)(36 + waveDataLen)) {
      int ws = (int)waveDataLen;
      if (ws > SM_WAVE_SIZE) ws = SM_WAVE_SIZE;
      memcpy(p->ins.wave, data + 36, ws);
      p->ins.waveSize = ws;
    } else {
      /* Use built-in waveform */
      memcpy(p->ins.wave, BUILTIN_WAVES[waveType], SM_WAVE_SIZE);
      p->ins.waveSize = SM_WAVE_SIZE;
    }

  } else {
    /* PCM instrument */
    if (len < 16) return -2;

    p->ins.pcmVolume  = data[1];
    p->ins.finetune   = (int8_t)data[2];
    p->ins.transpose  = (int8_t)data[3];

    uint32_t pcmLen   = (uint32_t)data[4]  | ((uint32_t)data[5]  << 8)
                      | ((uint32_t)data[6]  << 16) | ((uint32_t)data[7]  << 24);
    uint32_t loopStart = (uint32_t)data[8]  | ((uint32_t)data[9]  << 8)
                       | ((uint32_t)data[10] << 16) | ((uint32_t)data[11] << 24);
    uint32_t loopLen   = (uint32_t)data[12] | ((uint32_t)data[13] << 8)
                       | ((uint32_t)data[14] << 16) | ((uint32_t)data[15] << 24);

    if (pcmLen > 0 && len >= (int)(16 + pcmLen)) {
      p->ins.pcmData   = (int8_t *)malloc(pcmLen);
      if (!p->ins.pcmData) return -4;
      memcpy(p->ins.pcmData, data + 16, pcmLen);
      p->ins.pcmLen    = (int)pcmLen;
      p->ins.loopStart = (int)loopStart;
      p->ins.loopLen   = (int)loopLen;
    }

    /* For PCM use sustain = 255 (hold indefinitely until note-off) */
    p->ins.sustainLen  = 0; /* 0 = hold forever until note-off */
    p->ins.sustainVol  = p->ins.pcmVolume;
    p->ins.attackVol   = p->ins.pcmVolume;
    p->ins.decayVol    = p->ins.pcmVolume;
    p->ins.attackSpeed = 0;
    p->ins.decaySpeed  = 0;
    p->ins.releaseSpeed = 4;
  }

  return 0;
}

EMSCRIPTEN_KEEPALIVE
void sm_note_on(void *ctxPtr, int handle, int note, int velocity) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SMContext *ctx = (SMContext *)ctxPtr;
  SMPlayer *p = &ctx->players[handle];

  /* Apply transpose for PCM instruments */
  int actualNote = note;
  if (p->ins.type == 1) {
    actualNote = note + p->ins.transpose;
    if (actualNote < 0) actualNote = 0;
    if (actualNote > 127) actualNote = 127;
  }

  p->baseNote     = actualNote;
  p->playing      = 1;
  p->phase        = 0.0f;
  p->sampleCtr    = 0;
  p->envPhase     = ENV_ATTACK;
  p->envTickCtr   = 0;
  p->sustainTickCtr = 0;
  p->vibDelayCtr  = p->ins.vibDelay;
  p->vibPhase     = 0.0f;
  p->vibTickCtr   = 0;
  p->arpIdx       = 0;
  p->arpTickCtr   = 0;

  /* Initial volume: velocity scales from 64 (at vel=127) down to 0 */
  float velScale = (float)(velocity > 0 ? velocity : 64) / 127.0f;
  p->envVol = p->ins.attackSpeed == 0 ? (float)p->ins.attackVol * velScale : 0.0f;

  /* Compute base phase increment */
  float freq = midiNoteToFreq(actualNote);
  int ws = p->ins.waveSize > 0 ? p->ins.waveSize : SM_WAVE_SIZE;
  p->phaseInc     = computePhaseInc(freq, ws, p->sampleRate);
  p->vibPhaseInc  = p->phaseInc;
}

EMSCRIPTEN_KEEPALIVE
void sm_note_off(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SMContext *ctx = (SMContext *)ctxPtr;
  SMPlayer *p = &ctx->players[handle];

  if (p->playing && p->envPhase != ENV_OFF && p->envPhase != ENV_RELEASE) {
    p->envPhase   = ENV_RELEASE;
    p->envTickCtr = 0;
  }
}

EMSCRIPTEN_KEEPALIVE
int sm_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
  if (!ctxPtr || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) return 0;
  SMContext *ctx = (SMContext *)ctxPtr;
  SMPlayer *p = &ctx->players[handle];

  memset(outL, 0, numSamples * sizeof(float));
  memset(outR, 0, numSamples * sizeof(float));

  if (!p->playing) return numSamples;

  const float volNorm = 1.0f / (64.0f * 128.0f);
  const int spTick = p->samplesPerTick > 0 ? p->samplesPerTick : (p->sampleRate / 50);

  for (int i = 0; i < numSamples; i++) {
    if (!p->playing) break;

    /* Tick update at Amiga 50Hz rate */
    p->sampleCtr++;
    if (p->sampleCtr >= spTick) {
      p->sampleCtr = 0;
      sm_player_tick(p);
      if (!p->playing) break;
    }

    /* Volume gain */
    float vol = p->envVol * volNorm;

    float sample = 0.0f;

    if (p->ins.type == 0) {
      /* Wavetable oscillator */
      int ws = p->ins.waveSize > 0 ? p->ins.waveSize : SM_WAVE_SIZE;
      int idx = (int)p->phase & (ws - 1);
      if (idx < 0) idx = 0;
      if (idx >= ws) idx = ws - 1;
      sample = (float)p->ins.wave[idx] * vol;

      p->phase += p->vibPhaseInc;
      if (p->phase >= (float)ws) p->phase -= (float)ws;
      if (p->phase < 0.0f) p->phase = 0.0f;

    } else if (p->ins.type == 1 && p->ins.pcmData) {
      /* PCM playback */
      int idx = (int)p->phase;
      if (idx >= p->ins.pcmLen) {
        /* End of sample */
        if (p->ins.loopLen > 2) {
          /* Loop */
          while (idx >= p->ins.loopStart + p->ins.loopLen) {
            idx -= p->ins.loopLen;
          }
          p->phase = (float)idx;
        } else {
          /* One-shot: note off */
          p->playing = 0;
          break;
        }
      }
      if (idx < p->ins.pcmLen) {
        sample = (float)p->ins.pcmData[idx] * vol;
      }

      /* PCM step: standard Amiga period → frequency via note */
      float baseFreq = midiNoteToFreq(p->baseNote);
      /* Finetune: each unit = 1/8 semitone */
      float finetuneSemitones = p->ins.finetune / 8.0f;
      float freq = baseFreq * powf(2.0f, finetuneSemitones / 12.0f);
      p->phase += freq / (float)p->sampleRate;
    }

    outL[i] = sample;
    outR[i] = sample; /* mono; panning handled upstream */
  }

  return numSamples;
}

EMSCRIPTEN_KEEPALIVE
void sm_set_param(void *ctxPtr, int handle, int paramId, float value) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SMContext *ctx = (SMContext *)ctxPtr;
  SMPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 0: /* FSYNTH_PARAM_VOLUME */
      /* Scale volume fields proportionally */
      {
        float scale = value; /* 0-1 maps to 0-64 */
        p->ins.attackVol  = (uint8_t)(scale * 64.0f);
        p->ins.sustainVol = (uint8_t)(scale * 64.0f);
        p->ins.decayVol   = (uint8_t)(scale * 64.0f * 0.5f);
      }
      break;
    case 5: /* FSYNTH_PARAM_VIB_SPEED */
      p->ins.vibSpeed = (uint8_t)(value * 63.0f);
      break;
    case 6: /* FSYNTH_PARAM_VIB_DEPTH */
      p->ins.vibDepth = (uint8_t)(value * 63.0f);
      break;
    case 7: /* FSYNTH_PARAM_VIB_DELAY */
      p->ins.vibDelay = (uint8_t)(value * 255.0f);
      break;
    case 8: /* FSYNTH_PARAM_ARP_SPEED */
      p->ins.arpSpeed = (uint8_t)(value * 15.0f);
      break;
    case 9: /* FSYNTH_PARAM_PORTAMENTO */
      p->ins.portSpeed = (uint8_t)(value * 63.0f);
      break;
  }
}

EMSCRIPTEN_KEEPALIVE
float sm_get_param(void *ctxPtr, int handle, int paramId) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return -1.0f;
  SMContext *ctx = (SMContext *)ctxPtr;
  SMPlayer *p = &ctx->players[handle];

  switch (paramId) {
    case 0: return p->ins.attackVol / 64.0f;
    case 5: return p->ins.vibSpeed / 63.0f;
    case 6: return p->ins.vibDepth / 63.0f;
    case 7: return p->ins.vibDelay / 255.0f;
    case 8: return p->ins.arpSpeed / 15.0f;
    case 9: return p->ins.portSpeed / 63.0f;
  }
  return -1.0f;
}
