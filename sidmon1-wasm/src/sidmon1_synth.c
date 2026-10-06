/**
 * sidmon1_synth.c - SidMon 1.0 keyboard preview voice.
 *
 * One voice of the song replayer (sidmon1/sidmon1.c voice_process): a typed
 * key runs the replayer's row start for a row "note, this instrument, no
 * effect" and then its per-tick voice code (envelope, arpeggio, period table,
 * phase LFO, pitch fall, wave list), into a Paula channel that latches and
 * loops its buffer as the chip (and tools/asm68k-to-c/runtime/paula_soft.c)
 * does. Output is the replayer's: sample/128 * volume/64, halved as one side
 * of the stereo mix. Key release cuts the voice (sm1r_note_off): SidMon 1
 * has no release event.
 *
 * Binary blob layout for sm1_load_instrument():
 *   [0]        version = 2
 *   [1..4]     waveform (u32 LE): wave list index (<= 15) or PCM sample (> 15)
 *   [5..20]    arpeggio[16]
 *   [21..29]   attackSpeed, attackMax, decaySpeed, decayMin, sustain,
 *              releaseSpeed, releaseMin, phaseShift, phaseSpeed
 *   [30..31]   finetune (u16 LE, already x67)
 *   [32]       pitchFall (i8)
 *   [33..48]   wave list: 8 x (wave number, ticks); 0xff = jump to (next byte & 254)
 *   [49]       number of waves W
 *   W x        wave number (1) + 32 signed bytes
 *   then       PCM: length u32, loop offset u32, repeat u32, data (length 0 = none)
 *   then       two wave mixes (the song's Mix1/Mix2): speed, destination wave, source 1, source 2
 *
 * The voice code is copied from the replayer; keep them in step.
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#define MAX_PLAYERS      32
#define TICKS_PER_SEC    50
#define PAULA_CLOCK      3546895.0f
#define WAVE_SLOTS       256
#define PCM_BASE         (WAVE_SLOTS * 32)
#define MAX_PCM          (512 * 1024)

/* SidMon 1.0 period table (verbatim from the replayer, S1Player.js). */
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

typedef struct {
  uint32_t waveform;
  uint8_t  arpeggio[16];
  uint8_t  attackSpeed, attackMax, decaySpeed, decayMin, sustain;
  uint8_t  releaseSpeed, releaseMin, phaseShift, phaseSpeed;
  uint16_t finetune;
  int8_t   pitchFall;
  uint8_t  waveList[16];
  uint32_t pcmLen, pcmLoop, pcmRepeat;
  uint8_t  mix[2][4];        /* speed, dest, src1, src2 */
} Sample;

/* A Paula channel, as paula_soft.c: registers latch into the playing buffer
 * when DMA turns on and each time the buffer ends. */
typedef struct {
  const int8_t *regSample;  uint32_t regLen;  float step, vol;
  const int8_t *sample;     uint32_t len;     float pos;
  int dma;
} Chan;

typedef struct {
  int alive, playing;
  int sampleRate;
  float tickAcc;
  Sample s;
  int8_t *mem;               /* waves at wave*32, PCM at PCM_BASE */
  int memSize;
  Chan ch;

  /* the replayer's voice */
  int note, period, volume, bendTo, bendSpeed, arpeggioCtr, envelopeCtr;
  int pitchCtr, pitchFallCtr, sustainCtr, phaseTimer, phaseSpeed;
  int wavePos, waveList, waveTimer, waitCtr, samplePtr, sampleLen;
  int audPtr, audLen, audPer, audVol;
  int mixCtr[2], mixPos[2];
} Player;

typedef struct { int sampleRate; Player players[MAX_PLAYERS]; } Ctx;

static void chan_dma_on(Chan *c) {
  if (c->dma) return;
  c->sample = c->regSample; c->len = c->regLen; c->pos = 0.0f; c->dma = 1;
}

static float chan_sample(Chan *c) {
  if (!c->dma || c->step <= 0.0f || !c->sample || c->len == 0) return 0.0f;
  if ((uint32_t)c->pos >= c->len) {
    c->pos -= (float)c->len;
    c->sample = c->regSample; c->len = c->regLen;
    if (!c->sample || c->len == 0) { c->dma = 0; return 0.0f; }
    if ((uint32_t)c->pos >= c->len) c->pos = 0.0f;
  }
  float v = (float)c->sample[(uint32_t)c->pos] / 128.0f;
  c->pos += c->step;
  return v * c->vol;
}

/* Row start for a row "note, instrument 1, effect 0" (replayer voice_process, tick 0). */
static void row_start(Player *v, int note) {
  Sample *s = &v->s;
  v->audPtr = -1; v->audLen = 0; v->audPer = 0; v->audVol = 0;
  v->waitCtr = 0; v->samplePtr = -1; v->sampleLen = 0;
  if (s->waveform > 15) {
    v->audPtr = PCM_BASE;
    v->audLen = (int)s->pcmLen;
    v->samplePtr = (s->pcmRepeat >= 6 && s->pcmLoop != 0) ? (int)(PCM_BASE + s->pcmLoop) : 0;
    v->sampleLen = (int)s->pcmRepeat;
    v->waitCtr = 1;
  } else {
    v->wavePos = 0;
    v->waveList = (int)s->waveform;
    v->audPtr = (int)s->waveList[0] << 5;
    v->audLen = 32;
    v->waveTimer = s->waveList[1];
  }
  v->note = note;
  int pidx = 1 + (int)s->finetune + note;
  if (pidx < 0) pidx = 0;
  if (pidx > 790) pidx = 790;
  v->period = PERIODS[pidx];
  v->audPer = v->period;
  v->phaseSpeed = s->phaseSpeed;
  v->bendSpeed = 0;
  v->volume = 0;
  v->envelopeCtr = 0;
  v->pitchCtr = 0;
  v->pitchFallCtr = 0;
}

static int wave_at(Player *v, int off, int8_t *out) {
  if (off < 0 || off + 32 > v->memSize) return 0;
  memcpy(out, v->mem + off, 32);
  return 1;
}

static void apply_mix(Player *v, int m);

/* The rest of voice_process (tick 1 and on, and the tail of tick 0). */
static void voice_tick(Player *v, int first) {
  Sample *s = &v->s;
  if (!first) { v->audPtr = -1; v->audLen = 0; v->audPer = 0; v->audVol = 0; }

  v->audVol = v->volume;
  switch (v->envelopeCtr) {
    case 8: break;
    case 0:
      v->audVol += s->attackSpeed;
      if (v->audVol > s->attackMax) { v->audVol = s->attackMax; v->envelopeCtr += 2; }
      break;
    case 2:
      v->audVol -= s->decaySpeed;
      if (v->audVol <= s->decayMin || v->audVol < -256) { v->audVol = s->decayMin; v->envelopeCtr += 2; v->sustainCtr = s->sustain; }
      break;
    case 4:
      v->sustainCtr--;
      if (v->sustainCtr == 0 || v->sustainCtr == -256) v->envelopeCtr += 2;
      break;
    case 6:
      v->audVol -= s->releaseSpeed;
      if (v->audVol <= s->releaseMin || v->audVol < -256) { v->audVol = s->releaseMin; v->envelopeCtr = 8; }
      break;
  }
  v->volume = v->audVol;

  v->arpeggioCtr = (v->arpeggioCtr + 1) & 15;
  int pidx = (int)s->finetune + (int)s->arpeggio[v->arpeggioCtr] + v->note;
  if (pidx < 0) pidx = 0;
  if (pidx > 790) pidx = 790;
  v->period = PERIODS[pidx];
  v->audPer = v->period;

  if (s->phaseShift) {
    if (v->phaseSpeed) v->phaseSpeed--;
    else {
      v->phaseTimer = (v->phaseTimer + 1) & 31;
      int idx = ((int)s->phaseShift << 5) + v->phaseTimer;
      if (idx >= 0 && idx < v->memSize) v->period += (int)v->mem[idx] >> 2;
    }
  }

  v->pitchFallCtr -= s->pitchFall;
  if (v->pitchFallCtr < -256) v->pitchFallCtr += 256;
  v->period += v->pitchFallCtr;

  if (v->waitCtr == 0) {
    if (v->waveTimer) v->waveTimer--;
    else if (v->wavePos < 16) {
      int idx = v->wavePos;           /* the preview's list is the instrument's own */
      int value = s->waveList[idx];
      if (value == 0xff) v->wavePos = s->waveList[idx + 1] & 254;
      else {
        v->audPtr = value << 5;
        v->waveTimer = s->waveList[idx + 1];
        v->wavePos += 2;
      }
    }
  }

  if (v->audPtr > -1) {
    int off = v->audPtr;
    if (off < 0 || off >= v->memSize) off = 0;
    v->ch.regSample = v->mem + off;
  }
  if (v->audPer != 0) {
    int p = v->period;
    if (p < 113) p = 113;
    if (p > 6848) p = 6848;
    v->ch.step = PAULA_CLOCK / ((float)p * (float)v->sampleRate);
  }
  if (v->audLen != 0) {
    int w = v->audLen / 2;
    if (w < 1) w = 1;
    if (w > 32768) w = 32768;
    v->ch.regLen = (uint32_t)w * 2;
  }
  int vol = v->audVol >> 2;
  if (vol < 0) vol = 0;
  if (vol > 64) vol = 64;
  v->ch.vol = (float)vol / 64.0f;
  chan_dma_on(&v->ch);

  apply_mix(v, 0);
  apply_mix(v, 1);

  /* sm1r_tick: DMA retrigger with loop pointer */
  if (v->waitCtr == 1) v->waitCtr++;
  else if (v->waitCtr == 2) {
    v->waitCtr++;
    int off = v->samplePtr;
    if (off >= 0 && off < v->memSize) v->ch.regSample = v->mem + off;
    int w = v->sampleLen / 2;
    if (w < 1) w = 1;
    if (w > 32768) w = 32768;
    v->ch.regLen = (uint32_t)w * 2;
  }
}

/* The song's wave blending (replayer apply_mix): dest = (src1 + rotating src2) / 2, every `speed` ticks. */
static void apply_mix(Player *v, int m) {
  int speed = v->s.mix[m][0];
  if (!speed) return;
  if (v->mixCtr[m] == 0) {
    v->mixCtr[m] = speed;
    v->mixPos[m] = (v->mixPos[m] + 1) & 31;
    int index = v->mixPos[m];
    int dst = ((int)v->s.mix[m][1] << 5) + 31;
    int src1 = ((int)v->s.mix[m][2] << 5) + 31;
    int src2 = ((int)v->s.mix[m][3] << 5);
    for (int i = 31; i > -1; i--) {
      if (dst >= 0 && dst < v->memSize && src1 >= 0 && src1 < v->memSize && (src2 + index) >= 0 && (src2 + index) < v->memSize) {
        int v1 = v->mem[src1], v2 = v->mem[src2 + index];
        v->mem[dst] = (int8_t)((v1 + v2) >> 1);
      }
      dst--; src1--;
      index = (index - 1) & 31;
    }
  }
  v->mixCtr[m]--;
}

static void free_player(Player *p) {
  free(p->mem);
  int rate = p->sampleRate;
  memset(p, 0, sizeof(*p));
  p->sampleRate = rate;
}

EMSCRIPTEN_KEEPALIVE
void *sm1_init(int sampleRate) {
  Ctx *ctx = (Ctx *)calloc(1, sizeof(Ctx));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void sm1_dispose(void *ctxPtr) {
  Ctx *ctx = (Ctx *)ctxPtr;
  if (!ctx) return;
  for (int i = 0; i < MAX_PLAYERS; i++) free(ctx->players[i].mem);
  free(ctx);
}

EMSCRIPTEN_KEEPALIVE
int sm1_create_player(void *ctxPtr) {
  Ctx *ctx = (Ctx *)ctxPtr;
  if (!ctx) return -1;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!ctx->players[i].alive) {
      memset(&ctx->players[i], 0, sizeof(Player));
      ctx->players[i].alive = 1;
      ctx->players[i].sampleRate = ctx->sampleRate;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void sm1_destroy_player(void *ctxPtr, int handle) {
  Ctx *ctx = (Ctx *)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  free_player(&ctx->players[handle]);
}

EMSCRIPTEN_KEEPALIVE
int sm1_load_instrument(void *ctxPtr, int handle, const uint8_t *d, int n) {
  Ctx *ctx = (Ctx *)ctxPtr;
  if (!ctx || !d || n < 50 || d[0] != 2) return -1;
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;
  Player *p = &ctx->players[handle];
  free(p->mem);
  p->mem = NULL;
  Sample *s = &p->s;
  memset(s, 0, sizeof(*s));
  s->waveform = d[1] | (d[2] << 8) | (d[3] << 16) | ((uint32_t)d[4] << 24);
  memcpy(s->arpeggio, d + 5, 16);
  s->attackSpeed = d[21]; s->attackMax = d[22]; s->decaySpeed = d[23]; s->decayMin = d[24];
  s->sustain = d[25]; s->releaseSpeed = d[26]; s->releaseMin = d[27];
  s->phaseShift = d[28]; s->phaseSpeed = d[29];
  s->finetune = (uint16_t)(d[30] | (d[31] << 8));
  s->pitchFall = (int8_t)d[32];
  memcpy(s->waveList, d + 33, 16);

  int at = 49;
  int waves = d[at++];
  p->memSize = PCM_BASE;
  p->mem = (int8_t *)calloc(PCM_BASE + MAX_PCM, 1);
  if (!p->mem) return -4;
  for (int i = 0; i < waves; i++) {
    if (at + 33 > n) return -3;
    memcpy(p->mem + d[at] * 32, d + at + 1, 32);
    at += 33;
  }
  if (at + 12 <= n) {
    uint32_t len = d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | ((uint32_t)d[at + 3] << 24);
    s->pcmLoop = d[at + 4] | (d[at + 5] << 8) | (d[at + 6] << 16) | ((uint32_t)d[at + 7] << 24);
    s->pcmRepeat = d[at + 8] | (d[at + 9] << 8) | (d[at + 10] << 16) | ((uint32_t)d[at + 11] << 24);
    at += 12;
    if (len > MAX_PCM) len = MAX_PCM;
    if (at + (int)len > n) len = (uint32_t)(n - at);
    memcpy(p->mem + PCM_BASE, d + at, len);
    s->pcmLen = len;
    p->memSize = PCM_BASE + (int)len;
    at += (int)len;
  }
  if (at + 8 <= n) memcpy(s->mix, d + at, 8);
  return 0;
}

/* Grid note x (XM numbering, key = x + 11) names period index x - 3: the grid shows SM1 notes
 * 24 semitones above their ProTracker names (SM1_DISPLAY_SHIFT) and index 34 is period 856. */
static int key_to_index(int key) {
  int k = key - 14;
  if (k < 1) k = 1;
  if (k > 66) k = 66;
  return k;
}

EMSCRIPTEN_KEEPALIVE
void sm1_note_on(void *ctxPtr, int handle, int key, int velocity) {
  Ctx *ctx = (Ctx *)ctxPtr;
  (void)velocity;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  Player *p = &ctx->players[handle];
  if (!p->mem) return;
  memset(&p->ch, 0, sizeof(Chan));
  p->mixCtr[0] = p->mixCtr[1] = 0; p->mixPos[0] = p->mixPos[1] = 0;
  p->arpeggioCtr = 0; p->phaseTimer = 0; p->sustainCtr = 0; p->wavePos = 0; p->waveTimer = 0;
  p->tickAcc = 0.0f;
  p->playing = 1;
  row_start(p, key_to_index(key));
  voice_tick(p, 1);
}

EMSCRIPTEN_KEEPALIVE
void sm1_note_off(void *ctxPtr, int handle) {
  Ctx *ctx = (Ctx *)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  ctx->players[handle].playing = 0;
}

EMSCRIPTEN_KEEPALIVE
int sm1_render(void *ctxPtr, int handle, float *outL, float *outR, int numSamples) {
  Ctx *ctx = (Ctx *)ctxPtr;
  if (!ctx || !outL || !outR || handle < 0 || handle >= MAX_PLAYERS) return 0;
  Player *p = &ctx->players[handle];
  const float tickLen = (float)ctx->sampleRate / (float)TICKS_PER_SEC;
  for (int i = 0; i < numSamples; i++) {
    float o = 0.0f;
    if (p->playing) {
      p->tickAcc += 1.0f;
      if (p->tickAcc >= tickLen) { p->tickAcc -= tickLen; voice_tick(p, 0); }
      o = chan_sample(&p->ch) * 0.5f;
    }
    outL[i] = outR[i] = o;
  }
  return numSamples;
}

EMSCRIPTEN_KEEPALIVE
void sm1_set_param(void *ctxPtr, int handle, int paramId, float value) {
  Ctx *ctx = (Ctx *)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  Sample *s = &ctx->players[handle].s;
  /* live editing of the running instrument */
  switch (paramId) {
    case 1: s->attackMax = (uint8_t)(value * 64.0f); break;
    case 2: s->decayMin = (uint8_t)(value * 64.0f); break;
    case 3: s->attackSpeed = (uint8_t)(value * 255.0f); break;
    case 4: s->decaySpeed = (uint8_t)(value * 255.0f); break;
    case 5: s->releaseSpeed = (uint8_t)(value * 255.0f); break;
    case 6: s->releaseMin = (uint8_t)(value * 64.0f); break;
    case 7: s->sustain = (uint8_t)(value * 255.0f); break;
    case 8: s->phaseShift = (uint8_t)(value * 255.0f); break;
    case 9: s->phaseSpeed = (uint8_t)(value * 255.0f); break;
  }
}

EMSCRIPTEN_KEEPALIVE
float sm1_get_param(void *ctxPtr, int handle, int paramId) {
  (void)ctxPtr; (void)handle; (void)paramId;
  return -1.0f;
}
