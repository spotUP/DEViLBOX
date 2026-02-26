/**
 * sidmon1_synth.c — SidMon 1.0 real-time synthesis WASM module
 *
 * Implements the format_synth_api for SidMon 1.0 (.sid1/.smn) format.
 * Exported symbols use the "sm1_" prefix.
 *
 * Synthesis model (ported from FlodJS S1Player.js by Christian Corti, Neoart):
 *   - Amiga period-based frequency (freq = 3546895 / period)
 *   - ADSR envelope: attack → decay → sustain countdown → release → done
 *   - 16-step arpeggio table cycled each tick
 *   - Finetune: uint16 pre-multiplied by 67 (values 0-1005)
 *   - Phase shift (period LFO): phaseWave[31] cycled by phaseSpeed
 *   - Pitch fall: signed byte accumulated each tick
 *   - 32-byte wavetable oscillator (mainWave[32])
 *
 * Binary blob layout for sm1_load_instrument():
 *   [0]       version byte (0)
 *   [1]       attackSpeed (uint8)
 *   [2]       attackMax   (uint8, 0-64)
 *   [3]       decaySpeed  (uint8)
 *   [4]       decayMin    (uint8, 0-64)
 *   [5]       sustain     (uint8, countdown ticks)
 *   [6]       releaseSpeed (uint8)
 *   [7]       releaseMin  (uint8, 0-64)
 *   [8]       phaseShift  (uint8, 0 = disabled)
 *   [9]       phaseSpeed  (uint8, ticks per phase advance)
 *   [10..11]  finetune    (uint16 LE, 0-1005)
 *   [12]      pitchFall   (int8 as uint8)
 *   [13..28]  arpeggio[16] (16 uint8 values)
 *   [29..60]  mainWave[32] (32 int8 values as uint8)
 *   [61..92]  phaseWave[32] (32 int8 values as uint8)
 *   Total: 93 bytes
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
#define TICKS_PER_SEC    50     /* Amiga 50 Hz timer */

/* Amiga PAL clock */
#define AMIGA_CLOCK      3546895.0f

/* ── SidMon 1.0 period table (791 entries, verbatim from S1Player.js) ──────── */
/* Index 0 = 0 (sentinel/silence), entries 1..790 are real periods. */
/* Accessed as PERIODS[1 + finetune + arpeggio[step] + note]       */

static const uint16_t PERIODS[791] = {
  0,
  /* rows 1..12: low octave group A */
  5760,5424,5120,4832,4560,4304,4064,3840,3616,3424,3232,3048,
  /* rows 13..24 */
  2880,2712,2560,2416,2280,2152,2032,1920,1808,1712,1616,1524,
  /* rows 25..36 */
  1440,1356,1280,1208,1140,1076,1016, 960, 904, 856, 808, 762,
  /* rows 37..48 */
   720, 678, 640, 604, 570, 538, 508, 480, 452, 428, 404, 381,
  /* rows 49..60 */
   360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190,
  /* rows 61..66 */
   180, 170, 160, 151, 143, 135, 127,
  /* rows 68..74: sentinel zeros */
   0,0,0,0,0,0,0,
  /* rows 75..86: second finetune row */
  4028,3806,3584,3394,3204,3013,2855,2696,2538,2395,2268,2141,
  /* rows 87..98 */
  2014,1903,1792,1697,1602,1507,1428,1348,1269,1198,1134,1071,
  /* rows 99..110 */
  1007, 952, 896, 849, 801, 754, 714, 674, 635, 599, 567, 536,
  /* rows 111..122 */
   504, 476, 448, 425, 401, 377, 357, 337, 310, 300, 284, 268,
  /* rows 123..134 */
   252, 238, 224, 213, 201, 189, 179, 169, 159, 150, 142, 134,
  /* rows 135..141: sentinel zeros */
   0,0,0,0,0,0,0,
  /* rows 142..153: third finetune row */
  3993,3773,3552,3364,3175,2987,2830,2672,2515,2374,2248,2122,
  /* rows 154..165 */
  1997,1887,1776,1682,1588,1494,1415,1336,1258,1187,1124,1061,
  /* rows 166..177 */
   999, 944, 888, 841, 794, 747, 708, 668, 629, 594, 562, 531,
  /* rows 178..189 */
   500, 472, 444, 421, 397, 374, 354, 334, 315, 297, 281, 266,
  /* rows 190..201 */
   250, 236, 222, 211, 199, 187, 177, 167, 158, 149, 141, 133,
  /* rows 202..208: sentinel zeros */
   0,0,0,0,0,0,0,
  /* rows 209..220: fourth finetune row */
  3957,3739,3521,3334,3147,2960,2804,2648,2493,2353,2228,2103,
  /* rows 221..232 */
  1979,1870,1761,1667,1574,1480,1402,1324,1247,1177,1114,1052,
  /* rows 233..244 */
   990, 935, 881, 834, 787, 740, 701, 662, 624, 589, 557, 526,
  /* rows 245..256 */
   495, 468, 441, 417, 394, 370, 351, 331, 312, 295, 279, 263,
  /* rows 257..268 */
   248, 234, 221, 209, 197, 185, 176, 166, 156, 148, 140, 132,
  /* rows 269..275: sentinel zeros */
   0,0,0,0,0,0,0,
  /* rows 276..287: fifth finetune row */
  3921,3705,3489,3304,3119,2933,2779,2625,2470,2331,2208,2084,
  /* rows 288..299 */
  1961,1853,1745,1652,1560,1467,1390,1313,1235,1166,1104,1042,
  /* rows 300..311 */
   981, 927, 873, 826, 780, 734, 695, 657, 618, 583, 552, 521,
  /* rows 312..323 */
   491, 464, 437, 413, 390, 367, 348, 329, 309, 292, 276, 261,
  /* rows 324..335 */
   246, 232, 219, 207, 195, 184, 174, 165, 155, 146, 138, 131,
  /* rows 336..342: sentinel zeros */
   0,0,0,0,0,0,0,
  /* rows 343..354: sixth finetune row */
  3886,3671,3457,3274,3090,2907,2754,2601,2448,2310,2188,2065,
  /* rows 355..366 */
  1943,1836,1729,1637,1545,1454,1377,1301,1224,1155,1094,1033,
  /* rows 367..378 */
   972, 918, 865, 819, 773, 727, 689, 651, 612, 578, 547, 517,
  /* rows 379..390 */
   486, 459, 433, 410, 387, 364, 345, 326, 306, 289, 274, 259,
  /* rows 391..402 */
   243, 230, 217, 205, 194, 182, 173, 163, 153, 145, 137, 130,
  /* rows 403..409: sentinel zeros */
   0,0,0,0,0,0,0,
  /* rows 410..421: seventh finetune row */
  3851,3638,3426,3244,3062,2880,2729,2577,2426,2289,2168,2047,
  /* rows 422..433 */
  1926,1819,1713,1622,1531,1440,1365,1289,1213,1145,1084,1024,
  /* rows 434..445 */
   963, 910, 857, 811, 766, 720, 683, 645, 607, 573, 542, 512,
  /* rows 446..457 */
   482, 455, 429, 406, 383, 360, 342, 323, 304, 287, 271, 256,
  /* rows 458..469 */
   241, 228, 215, 203, 192, 180, 171, 162, 152, 144, 136, 128,
  /* rows 470..481: high-octave tail (from S1Player end of table) */
  6848,6464,6096,5760,5424,5120,4832,4560,4304,4064,3840,3616,
  /* rows 482..493 */
  3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1808,
  /* rows 494..505 */
  1712,1616,1524,1440,1356,1280,1208,1140,1076,1016, 960, 904,
  /* rows 506..517 */
   856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 452,
  /* rows 518..529 */
   428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  /* rows 530..541 */
   214, 202, 190, 180, 170, 160, 151, 143, 135, 127,
  /* pad remaining entries to 791 with zeros */
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
   0,0,0
};

/* ── Envelope states ────────────────────────────────────────────────────────── */
#define ENV_ATTACK   0
#define ENV_DECAY    2
#define ENV_SUSTAIN  4
#define ENV_RELEASE  6
#define ENV_DONE     8

/* ── Instrument ─────────────────────────────────────────────────────────────── */

typedef struct {
  uint8_t  attackSpeed;
  uint8_t  attackMax;
  uint8_t  decaySpeed;
  uint8_t  decayMin;
  uint8_t  sustain;       /* sustain countdown ticks */
  uint8_t  releaseSpeed;
  uint8_t  releaseMin;
  uint8_t  phaseShift;    /* 0 = disabled; >0 = phaseWave index (*32 already resolved, data embedded) */
  uint8_t  phaseSpeed;    /* initial phaseSpeed counter value */
  uint16_t finetune;      /* 0-1005 (already pre-multiplied by 67) */
  int8_t   pitchFall;     /* signed pitch fall per tick */
  uint8_t  arpeggio[16];  /* arpeggio table */
  int8_t   mainWave[32];  /* 32-byte wavetable */
  int8_t   phaseWave[32]; /* 32-byte phase LFO wave */
} SM1Instrument;

/* ── Player state ─────────────────────────────────────────────────────────── */

typedef struct {
  int          alive;
  int          sampleRate;
  int          samplesPerTick;

  SM1Instrument ins;

  /* Playback state */
  int          playing;
  int          baseNote;      /* S1Player note index (sm1Note = midiNote - 24) */

  /* Tick sub-sample counter */
  int          sampleCtr;

  /* Wavetable oscillator */
  float        wavePhase;     /* fractional position in 32-byte wavetable */
  float        waveStep;      /* step per sample */

  /* ADSR */
  int          envelopeCtr;   /* 0=attack, 2=decay, 4=sustain, 6=release, 8=done */
  int          volume;        /* current volume 0-64 */
  int          sustainCtr;    /* countdown for sustain stage */

  /* Arpeggio */
  int          arpeggioCtr;   /* current arpeggio index (0-15); reset to -1 on note_on */

  /* Phase shift (period LFO) */
  int          phaseTimer;    /* cycles 0-31 */
  int          phaseSpeedCtr; /* countdown; when 0, advance phaseTimer */

  /* Pitch fall */
  int          pitchFallCtr;  /* accumulated pitch fall */

  /* Period */
  int          currentPeriod;
} SM1Player;

/* ── Context ────────────────────────────────────────────────────────────────── */

typedef struct {
  int        sampleRate;
  SM1Player  players[MAX_PLAYERS];
} SM1Context;

/* ── Helpers ────────────────────────────────────────────────────────────────── */

/**
 * Compute wavetable step (32 samples per cycle, period-based frequency).
 * waveStep = 32 * AMIGA_CLOCK / (sampleRate * period)
 */
static float computeWaveStep(int period, int sampleRate) {
  if (period <= 0) return 0.0f;
  return 32.0f * AMIGA_CLOCK / ((float)sampleRate * (float)period);
}

/**
 * Look up period from the SM1 table.
 * index = 1 + finetune + arpeggio[step] + note
 * Clamped to [1, 790]. Returns 0 for silence.
 */
static int sm1LookupPeriod(int index) {
  if (index < 1 || index > 790) return 0;
  return (int)PERIODS[index];
}

/* ── Tick-level update ─────────────────────────────────────────────────────── */

static void sm1_player_tick(SM1Player *p) {
  if (!p->playing) return;

  SM1Instrument *ins = &p->ins;

  /* ── ADSR envelope ─── */
  switch (p->envelopeCtr) {
    case ENV_ATTACK:
      p->volume += (int)ins->attackSpeed;
      if (p->volume > (int)ins->attackMax) {
        p->volume = (int)ins->attackMax;
        p->envelopeCtr = ENV_DECAY;
      }
      break;

    case ENV_DECAY:
      p->volume -= (int)ins->decaySpeed;
      if (p->volume <= (int)ins->decayMin || p->volume < -256) {
        p->volume = (int)ins->decayMin;
        p->envelopeCtr = ENV_SUSTAIN;
        p->sustainCtr = (int)ins->sustain;
      }
      break;

    case ENV_SUSTAIN:
      p->sustainCtr--;
      /* S1Player: advance when sustainCtr == 0 OR sustainCtr == -256 */
      if (p->sustainCtr == 0 || p->sustainCtr == -256) {
        p->envelopeCtr = ENV_RELEASE;
      }
      break;

    case ENV_RELEASE:
      p->volume -= (int)ins->releaseSpeed;
      if (p->volume <= (int)ins->releaseMin || p->volume < -256) {
        p->volume = (int)ins->releaseMin;
        p->envelopeCtr = ENV_DONE;
      }
      break;

    case ENV_DONE:
    default:
      break;
  }

  /* ── Arpeggio cycling (pre-increment, wraps 0-15) ─── */
  p->arpeggioCtr = (p->arpeggioCtr + 1) & 15;
  int index = (int)ins->finetune + (int)ins->arpeggio[p->arpeggioCtr] + p->baseNote;
  int period = sm1LookupPeriod(index);

  /* ── Phase shift (period LFO) ─── */
  if (ins->phaseShift > 0) {
    if (p->phaseSpeedCtr > 0) {
      p->phaseSpeedCtr--;
    } else {
      p->phaseSpeedCtr = (int)ins->phaseSpeed;
      p->phaseTimer = (p->phaseTimer + 1) & 31;
    }
    /* Apply phaseWave modulation: memory[index] >> 2 in S1Player */
    period += (int)ins->phaseWave[p->phaseTimer] >> 2;
  }

  /* ── Pitch fall ─── */
  p->pitchFallCtr -= (int)ins->pitchFall;
  if (p->pitchFallCtr < -256) p->pitchFallCtr += 256;
  period += p->pitchFallCtr;

  /* Clamp period */
  if (period < 113) period = 113;
  if (period > 6848) period = 6848;

  p->currentPeriod = period;

  /* Update wavetable step */
  p->waveStep = computeWaveStep(period, p->sampleRate);
}

/* ── WASM exports ─────────────────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void *sm1_init(int sampleRate) {
  SM1Context *ctx = (SM1Context *)calloc(1, sizeof(SM1Context));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void sm1_dispose(void *ctxPtr) {
  if (!ctxPtr) return;
  free(ctxPtr);
}

EMSCRIPTEN_KEEPALIVE
int sm1_create_player(void *ctxPtr) {
  if (!ctxPtr) return -1;
  SM1Context *ctx = (SM1Context *)ctxPtr;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].alive) {
      memset(&ctx->players[i], 0, sizeof(SM1Player));
      ctx->players[i].alive        = 1;
      ctx->players[i].sampleRate   = ctx->sampleRate;
      ctx->players[i].samplesPerTick = ctx->sampleRate / TICKS_PER_SEC;
      ctx->players[i].arpeggioCtr  = -1;
      ctx->players[i].baseNote     = -1;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void sm1_destroy_player(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SM1Context *ctx = (SM1Context *)ctxPtr;
  memset(&ctx->players[handle], 0, sizeof(SM1Player));
}

EMSCRIPTEN_KEEPALIVE
int sm1_load_instrument(void *ctxPtr, int handle, const uint8_t *data, int len) {
  if (!ctxPtr || !data || len < 93) return -1;
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;

  SM1Context *ctx = (SM1Context *)ctxPtr;
  SM1Player *p = &ctx->players[handle];

  memset(&p->ins, 0, sizeof(SM1Instrument));

  /* [0]  version (unused) */
  /* [1]  attackSpeed */
  p->ins.attackSpeed  = data[1];
  /* [2]  attackMax */
  p->ins.attackMax    = data[2];
  if (p->ins.attackMax > 64) p->ins.attackMax = 64;
  /* [3]  decaySpeed */
  p->ins.decaySpeed   = data[3];
  /* [4]  decayMin */
  p->ins.decayMin     = data[4];
  if (p->ins.decayMin > 64) p->ins.decayMin = 64;
  /* [5]  sustain countdown */
  p->ins.sustain      = data[5];
  /* [6]  releaseSpeed */
  p->ins.releaseSpeed = data[6];
  /* [7]  releaseMin */
  p->ins.releaseMin   = data[7];
  if (p->ins.releaseMin > 64) p->ins.releaseMin = 64;
  /* [8]  phaseShift (0 = disabled) */
  p->ins.phaseShift   = data[8];
  /* [9]  phaseSpeed */
  p->ins.phaseSpeed   = data[9];
  /* [10..11] finetune (uint16 LE) */
  p->ins.finetune     = (uint16_t)(data[10] | ((uint16_t)data[11] << 8));
  /* [12] pitchFall (signed) */
  p->ins.pitchFall    = (int8_t)data[12];
  /* [13..28] arpeggio[16] */
  memcpy(p->ins.arpeggio, data + 13, 16);
  /* [29..60] mainWave[32] */
  memcpy(p->ins.mainWave, data + 29, 32);
  /* [61..92] phaseWave[32] */
  memcpy(p->ins.phaseWave, data + 61, 32);

  return 0;
}

EMSCRIPTEN_KEEPALIVE
void sm1_note_on(void *ctxPtr, int handle, int note, int velocity) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SM1Context *ctx = (SM1Context *)ctxPtr;
  SM1Player *p = &ctx->players[handle];
  (void)velocity; /* velocity not used in SidMon 1 — volume is ADSR-driven */

  /* Map MIDI note to SidMon 1 note index.
   * MIDI 60 = C-4. In S1Player, note values ~0-60 drive the period lookup.
   * We map MIDI 60 → sm1Note 36 (C-3 range is around index 36 in the table).
   * sm1Note = midiNote - 24, clamped to [0, 83].
   */
  int sm1Note = note - 24;
  if (sm1Note < 0)  sm1Note = 0;
  if (sm1Note > 83) sm1Note = 83;

  p->baseNote      = sm1Note;
  p->playing       = 1;
  p->wavePhase     = 0.0f;
  p->sampleCtr     = 0;

  /* Reset ADSR */
  p->envelopeCtr   = ENV_ATTACK;
  p->volume        = 0;
  p->sustainCtr    = 0;

  /* Reset arpeggio: S1Player pre-increments, so we set to -1 to start at 0 */
  p->arpeggioCtr   = -1;

  /* Reset phase LFO */
  p->phaseTimer    = 0;
  p->phaseSpeedCtr = (int)p->ins.phaseSpeed;

  /* Reset pitch fall */
  p->pitchFallCtr  = 0;

  /* Compute initial period and step */
  int index = (int)p->ins.finetune + (int)p->ins.arpeggio[0] + sm1Note;
  int period = sm1LookupPeriod(index);
  if (period <= 0) period = 428; /* default to A-3 if invalid */
  if (period < 113) period = 113;
  if (period > 6848) period = 6848;

  p->currentPeriod = period;
  p->waveStep = computeWaveStep(period, p->sampleRate);
}

EMSCRIPTEN_KEEPALIVE
void sm1_note_off(void *ctxPtr, int handle) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SM1Context *ctx = (SM1Context *)ctxPtr;
  SM1Player *p = &ctx->players[handle];
  /* In SidMon 1, note-off just stops playback immediately.
   * The envelope is ADSR-driven and self-terminates.
   * We could force into release phase here, but stopping is simpler. */
  p->playing = 0;
}

EMSCRIPTEN_KEEPALIVE
int sm1_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
  if (!ctxPtr || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) return 0;
  SM1Context *ctx = (SM1Context *)ctxPtr;
  SM1Player *p = &ctx->players[handle];

  memset(outL, 0, numSamples * sizeof(float));
  memset(outR, 0, numSamples * sizeof(float));

  if (!p->playing) return numSamples;

  /* Volume normalisation: max volume=64, wavetable amplitude scaled to ±1.0.
   * wavetable values are int8 (−128..127). Normalise by (64 * 127) for full scale. */
  const float volNorm = 1.0f / (64.0f * 127.0f);
  const int spTick = p->samplesPerTick > 0 ? p->samplesPerTick : (p->sampleRate / TICKS_PER_SEC);

  for (int i = 0; i < numSamples; i++) {
    if (!p->playing) break;

    /* Tick update at Amiga 50Hz */
    p->sampleCtr++;
    if (p->sampleCtr >= spTick) {
      p->sampleCtr = 0;
      sm1_player_tick(p);
      if (!p->playing) break;
    }

    /* Period 0 = silence */
    if (p->currentPeriod == 0 || p->waveStep <= 0.0f) {
      outL[i] = 0.0f;
      outR[i] = 0.0f;
      continue;
    }

    /* Wavetable oscillator: loop 32-byte mainWave */
    int waveIdx = (int)p->wavePhase & 31;
    float sample = (float)p->ins.mainWave[waveIdx];

    /* Advance wavetable phase */
    p->wavePhase += p->waveStep;
    while (p->wavePhase >= 32.0f) p->wavePhase -= 32.0f;

    /* Apply ADSR volume */
    int vol = p->volume;
    if (vol < 0) vol = 0;
    if (vol > 64) vol = 64;

    float out = sample * (float)vol * volNorm;

    outL[i] = out;
    outR[i] = out;
  }

  return numSamples;
}

EMSCRIPTEN_KEEPALIVE
void sm1_set_param(void *ctxPtr, int handle, int paramId, float value) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return;
  SM1Context *ctx = (SM1Context *)ctxPtr;
  SM1Player *p = &ctx->players[handle];

  switch (paramId) {
    case 0: /* volume override (0-1 → 0-64) */
      p->volume = (int)(value * 64.0f);
      if (p->volume < 0)  p->volume = 0;
      if (p->volume > 64) p->volume = 64;
      break;
    case 1: /* attackMax (0-1 → 0-64) */
      p->ins.attackMax = (uint8_t)(value * 64.0f);
      break;
    case 2: /* decayMin / sustain level (0-1 → 0-64) */
      p->ins.decayMin = (uint8_t)(value * 64.0f);
      break;
    case 3: /* releaseMin (0-1 → 0-64) */
      p->ins.releaseMin = (uint8_t)(value * 64.0f);
      break;
  }
}

EMSCRIPTEN_KEEPALIVE
float sm1_get_param(void *ctxPtr, int handle, int paramId) {
  if (!ctxPtr || handle < 0 || handle >= MAX_PLAYERS) return -1.0f;
  SM1Context *ctx = (SM1Context *)ctxPtr;
  SM1Player *p = &ctx->players[handle];

  switch (paramId) {
    case 0: return (float)p->volume / 64.0f;
    case 1: return (float)p->ins.attackMax / 64.0f;
    case 2: return (float)p->ins.decayMin / 64.0f;
    case 3: return (float)p->ins.releaseMin / 64.0f;
  }
  return -1.0f;
}
