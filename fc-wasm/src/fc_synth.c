/**
 * fc_synth.c - Future Composer keyboard preview voice.
 *
 * One voice of the song replayer (futurecomposer-wasm/src/futurecomposer.c):
 * the instrument is the pair of macros the replayer reads (64-byte volume
 * macro, 64-byte frequency macros) and the wave bank they reference. A typed
 * key starts the replayer's NewNote voice set-up and then runs the
 * replayer's Effect (frequency macro, volume macro, vibrato, pitch bend,
 * period) once per 50 Hz tick; the mixer is the replayer's own (Paula period
 * step, sample * volume / 64, 0.5 voice scale). Key release cuts the voice as
 * the next note does (ch_mute): the player has no release of its own.
 *
 * Blob layout for fc_load_instrument():
 *   [0]          2
 *   [1..64]      volume macro: speed, freq macro index, vibSpeed, vibDepth, vibDelay, values[59]
 *   [65]         entry frequency macro index
 *   [66]         number of frequency macros M
 *   M x          index(1) + 64 bytes
 *   [..]         number of waves W (1)
 *   W x          index(1) + length bytes(2 LE) + loopStart(2 LE) + loopLength(2 LE) + signed PCM
 *                index 0-9 = sample slots, 10-89 = wave tables (the replayer's samp_info numbering)
 *
 * The voice logic below is copied from the replayer; keep them in step.
 */

#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <emscripten.h>

#define MAX_PLAYERS      8
#define MAX_MACROS       256
#define SILENT_LEN       8
#define FRQ_LEN          (SILENT_LEN + MAX_MACROS * 64 + 1)
#define NUM_WAVES        90
#define AMIGA_CLOCK      3546895.0
#define VOICE_SCALE      0.5f

static const uint16_t fc_periods[132] = {
    1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,
    3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1812,
    1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
     856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
     428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
     214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
     113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113
};
static const uint8_t fc_silent[8] = { 0x01, 0, 0, 0, 0, 0, 0, 0xe1 };

typedef struct {
  int8_t  *data;
  uint32_t length;
  uint32_t loopStart;
  uint32_t loopLength;
} Wave;

typedef struct {
  int8_t  *data;
  uint32_t length;        /* end of the current play range */
  uint32_t loopStart;
  uint32_t loopLength;
  uint16_t period;
  uint16_t volume;
  uint64_t pos;           /* 16.16 */
  int      active;
} Chan;

typedef struct {
  int       loaded;
  int       playing;
  uint8_t   volMacro[64];
  uint8_t  *frq;          /* SILENT_LEN + macros */
  Wave      waves[NUM_WAVES];
  uint8_t   entryMacro;

  /* replayer voice (FcVoiceInfo) */
  int8_t    pitchBendSpeed;
  uint8_t   pitchBendTime;
  int8_t    curNote;
  const uint8_t *volumeSeq;
  uint8_t   volumeBendSpeed, volumeBendTime;
  uint16_t  volumeSeqPos;
  uint8_t   volumeCounter, volumeSpeed, volSusCounter, susCounter;
  int8_t    vibSpeed, vibDepth, vibValue, vibDelay;
  int       volBendFlag, portFlag, pitchBendFlag;
  int8_t    pattTranspose, transpose;
  int8_t    volume;
  uint8_t   vibFlag;
  uint8_t   portamento;
  uint16_t  frqStart, frqPos;
  uint16_t  pitch;
  int       audTemp;

  Chan      ch;
  double    tickAcc;
} Player;

typedef struct {
  Player players[MAX_PLAYERS];
  int sampleRate;
} Ctx;

static void free_player(Player *p) {
  for (int i = 0; i < NUM_WAVES; i++) { free(p->waves[i].data); p->waves[i].data = NULL; }
  free(p->frq); p->frq = NULL;
  p->loaded = 0; p->playing = 0; p->ch.active = 0;
}

static void ch_play_sample(Chan *c, const Wave *w) {
  c->data = w->data; c->length = w->length; c->loopStart = 0; c->loopLength = 0;
  c->pos = 0; c->active = 1;
}
static void ch_set_loop(Chan *c, uint32_t start, uint32_t len) { c->loopStart = start; c->loopLength = len; }

static void do_vol_bend(Player *v) {
  v->volBendFlag = !v->volBendFlag;
  if (v->volBendFlag) {
    v->volumeBendTime--;
    v->volume += (int8_t)v->volumeBendSpeed;
    if (v->volume > 64) { v->volume = 64; v->volumeBendTime = 0; }
    else if (v->volume < 0) { v->volume = 0; v->volumeBendTime = 0; }
  }
}

/* NewNote: the part of the replayer's fc_new_note that starts a note. */
static void new_note(Player *v, int note) {
  v->pitch = 0;
  v->portamento = 0;
  v->curNote = (int8_t)note;
  v->ch.active = 0; v->ch.pos = 0;
  v->audTemp = 0;

  v->volumeSeq = v->volMacro + 5;
  v->volumeSeqPos = 0;
  v->volumeCounter = v->volMacro[0];
  v->volumeSpeed = v->volMacro[0];
  v->volSusCounter = 0;
  v->vibSpeed = (int8_t)v->volMacro[2];
  v->vibFlag = 0x40;
  v->vibDepth = (int8_t)v->volMacro[3];
  v->vibValue = (int8_t)v->volMacro[3];
  v->vibDelay = (int8_t)v->volMacro[4];

  v->frqStart = (uint16_t)(SILENT_LEN + v->entryMacro * 64);
  v->frqPos = 0;
  v->susCounter = 0;
  v->volume = 0;
  v->pattTranspose = 0;
  v->transpose = 0;
  v->volBendFlag = v->portFlag = v->pitchBendFlag = 0;
  v->pitchBendTime = 0; v->pitchBendSpeed = 0;
  v->volumeBendTime = 0; v->volumeBendSpeed = 0;
}

/* Effect: copied from the replayer's fc_effect (multi-sample command left out). */
static void effect(Player *v) {
  int oneMore;
  do {
    oneMore = 0;
    if (v->susCounter != 0) { v->susCounter--; break; }

    uint16_t poi = (uint16_t)(v->frqStart + v->frqPos);
    if (poi >= FRQ_LEN) break;

    int parse;
    do {
      uint8_t dat;
      parse = 0;
      uint8_t cmd = v->frq[poi++];
      if (cmd == 0xe1) break;
      if (cmd == 0xe0) {
        dat = (uint8_t)(v->frq[poi] & 0x3f);
        v->frqPos = dat;
        poi = (uint16_t)(v->frqStart + dat);
        cmd = v->frq[poi++];
      }
      switch (cmd) {
        case 0xe2:
          dat = v->frq[poi++];
          if (dat < NUM_WAVES && v->waves[dat].data) {
            const Wave *w = &v->waves[dat];
            ch_play_sample(&v->ch, w);
            if (w->loopLength > 2) {
              if (w->loopStart + w->loopLength > w->length) ch_set_loop(&v->ch, w->loopStart, w->length - w->loopStart);
              else ch_set_loop(&v->ch, w->loopStart, w->loopLength);
            }
          }
          v->volumeSeqPos = 0; v->volumeCounter = 1; v->frqPos += 2; v->audTemp = 1;
          break;
        case 0xe4:
          if (v->audTemp) {
            dat = v->frq[poi++];
            if (dat < NUM_WAVES && v->waves[dat].data) {
              const Wave *w = &v->waves[dat];
              v->ch.data = w->data;
              v->ch.length = w->loopStart + w->loopLength;
              ch_set_loop(&v->ch, w->loopStart, w->loopLength);
            }
            v->frqPos += 2;
          }
          break;
        case 0xe9:
          v->audTemp = 1;
          v->frqPos += 3;
          break;
        case 0xe7:
          parse = 1;
          dat = v->frq[poi];
          poi = (uint16_t)(SILENT_LEN + dat * 64);
          if (poi >= FRQ_LEN) poi = 0;
          v->frqStart = poi; v->frqPos = 0;
          break;
        case 0xea:
          v->pitchBendSpeed = (int8_t)v->frq[poi++];
          v->pitchBendTime = v->frq[poi++];
          v->frqPos += 3;
          break;
        case 0xe8:
          v->susCounter = v->frq[poi++];
          v->frqPos += 2;
          oneMore = 1;
          break;
        case 0xe3:
          v->vibSpeed = (int8_t)v->frq[poi++];
          v->vibDepth = (int8_t)v->frq[poi++];
          v->frqPos += 3;
          break;
      }
      if (!parse && !oneMore) {
        poi = (uint16_t)(v->frqStart + v->frqPos);
        v->pattTranspose = (int8_t)v->frq[poi];
        v->frqPos++;
      }
    } while (parse);
  } while (oneMore);

  if (v->volSusCounter != 0) v->volSusCounter--;
  else if (v->volumeBendTime != 0) do_vol_bend(v);
  else {
    v->volumeCounter--;
    if (v->volumeCounter == 0) {
      v->volumeCounter = v->volumeSpeed;
      int parse;
      do {
        parse = 0;
        if (v->volumeSeqPos >= 59 || v->volumeSeq[v->volumeSeqPos] == 0xe1) break;
        switch (v->volumeSeq[v->volumeSeqPos]) {
          case 0xea:
            v->volumeBendSpeed = v->volumeSeq[v->volumeSeqPos + 1];
            v->volumeBendTime = v->volumeSeq[v->volumeSeqPos + 2];
            v->volumeSeqPos += 3;
            do_vol_bend(v);
            break;
          case 0xe8:
            v->volSusCounter = v->volumeSeq[v->volumeSeqPos + 1];
            v->volumeSeqPos += 2;
            break;
          case 0xe0:
            v->volumeSeqPos = (uint16_t)((v->volumeSeq[v->volumeSeqPos + 1] & 0x3f) - 5);
            parse = 1;
            break;
          default:
            v->volume = (int8_t)(v->volumeSeq[v->volumeSeqPos] & 0x7f);
            v->volumeSeqPos++;
            break;
        }
      } while (parse);
    }
  }

  int8_t note = v->pattTranspose;
  if (note >= 0) note += (int8_t)(v->curNote + v->transpose);
  note &= 0x7f;

  uint16_t period = (uint8_t)note < 132 ? fc_periods[(uint8_t)note] : 0;
  uint8_t vibFlag = v->vibFlag;

  if (v->vibDelay != 0) v->vibDelay--;
  else {
    uint16_t vibBase = (uint16_t)(note * 2);
    int8_t vibDep = (int8_t)(v->vibDepth * 2);
    int8_t vibVal = v->vibValue;
    if (((vibFlag & 0x80) == 0) || ((vibFlag & 0x01) == 0)) {
      if ((vibFlag & 0x20) != 0) {
        vibVal += v->vibSpeed;
        if (vibVal >= vibDep) { vibFlag &= 0xdf; vibVal = vibDep; }
      } else {
        vibVal -= v->vibSpeed;
        if (vibVal < 0) { vibFlag |= 0x20; vibVal = 0; }
      }
      v->vibValue = vibVal;
    }
    vibDep /= 2;
    vibVal -= vibDep;
    vibBase += 160;
    while (vibBase < 256) { vibVal *= 2; vibBase += 24; }
    period += (uint16_t)(int16_t)vibVal;
  }
  v->vibFlag = (uint8_t)(vibFlag ^ 0x01);

  v->portFlag = !v->portFlag;
  if (v->portFlag && v->portamento != 0) {
    if (v->portamento <= 31) v->pitch -= v->portamento;
    else v->pitch += (uint16_t)(v->portamento & 0x1f);
  }
  v->pitchBendFlag = !v->pitchBendFlag;
  if (v->pitchBendFlag && v->pitchBendTime != 0) {
    v->pitchBendTime--;
    v->pitch -= (uint16_t)v->pitchBendSpeed;
  }
  period += v->pitch;
  if (period < 113) period = 113;
  else if (period > 3424) period = 3424;

  if (v->volume < 0) v->volume = 0;
  else if (v->volume > 64) v->volume = 64;

  v->ch.period = period;
  v->ch.volume = (uint16_t)v->volume;
}

/* Keyboard key (MIDI) -> FC period table index. The grid names note x (XM numbering)
 * with the period the parser read from the player: index = x - 13, and the
 * table's lowest octave (index 60-71) stands for x = 1-12. Key = x + 11. */
static int key_to_index(int key) {
  int x = key - 11;
  if (x < 1) x = 1;
  if (x >= 13) return x - 13 > 71 ? 71 : x - 13;
  return x + 59;
}

EMSCRIPTEN_KEEPALIVE
void* fc_init(int sampleRate) {
  Ctx *ctx = (Ctx*)calloc(1, sizeof(Ctx));
  if (!ctx) return NULL;
  ctx->sampleRate = sampleRate;
  return ctx;
}

EMSCRIPTEN_KEEPALIVE
void fc_dispose(void* ctxPtr) {
  Ctx *ctx = (Ctx*)ctxPtr;
  if (!ctx) return;
  for (int i = 0; i < MAX_PLAYERS; i++) free_player(&ctx->players[i]);
  free(ctx);
}

static int slot_busy[MAX_PLAYERS];

EMSCRIPTEN_KEEPALIVE
int fc_create_player(void* ctxPtr) {
  Ctx *ctx = (Ctx*)ctxPtr;
  if (!ctx) return -1;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!slot_busy[i]) { slot_busy[i] = 1; free_player(&ctx->players[i]); return i; }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void fc_destroy_player(void* ctxPtr, int handle) {
  Ctx *ctx = (Ctx*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  free_player(&ctx->players[handle]);
  slot_busy[handle] = 0;
}

EMSCRIPTEN_KEEPALIVE
int fc_load_instrument(void* ctxPtr, int handle, const uint8_t* d, int n) {
  Ctx *ctx = (Ctx*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return -1;
  if (!d || n < 67 || d[0] != 2) return -2;
  Player *p = &ctx->players[handle];
  free_player(p);

  memcpy(p->volMacro, d + 1, 64);
  p->entryMacro = d[65];
  int macros = d[66];
  int at = 67;
  p->frq = (uint8_t*)malloc(FRQ_LEN);
  if (!p->frq) return -4;
  memcpy(p->frq, fc_silent, SILENT_LEN);
  memset(p->frq + SILENT_LEN, 0xe1, FRQ_LEN - SILENT_LEN);
  for (int i = 0; i < macros; i++) {
    if (at + 65 > n) return -3;
    memcpy(p->frq + SILENT_LEN + d[at] * 64, d + at + 1, 64);
    at += 65;
  }
  if (at >= n) return -3;
  int waves = d[at++];
  for (int i = 0; i < waves; i++) {
    if (at + 7 > n) return -3;
    int idx = d[at];
    uint32_t len = d[at + 1] | (d[at + 2] << 8);
    uint32_t ls = d[at + 3] | (d[at + 4] << 8);
    uint32_t ll = d[at + 5] | (d[at + 6] << 8);
    at += 7;
    if (at + (int)len > n) return -3;
    if (idx < NUM_WAVES && len > 0) {
      Wave *w = &p->waves[idx];
      w->data = (int8_t*)malloc(len);
      if (!w->data) return -4;
      memcpy(w->data, d + at, len);
      w->length = len; w->loopStart = ls; w->loopLength = ll;
    }
    at += len;
  }
  p->loaded = 1;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
void fc_note_on(void* ctxPtr, int handle, int midiNote, int velocity) {
  Ctx *ctx = (Ctx*)ctxPtr;
  (void)velocity;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  Player *p = &ctx->players[handle];
  if (!p->loaded) return;
  new_note(p, key_to_index(midiNote));
  p->playing = 1;
  p->tickAcc = 0;
  effect(p);               /* the replayer runs Effect in the tick that starts the note */
}

EMSCRIPTEN_KEEPALIVE
void fc_note_off(void* ctxPtr, int handle) {
  Ctx *ctx = (Ctx*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  Player *p = &ctx->players[handle];
  p->playing = 0; p->ch.active = 0; p->ch.pos = 0;
}

EMSCRIPTEN_KEEPALIVE
void fc_render(void* ctxPtr, int handle, float* outL, float* outR, int numSamples) {
  Ctx *ctx = (Ctx*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS || !outL || !outR) return;
  Player *p = &ctx->players[handle];
  Chan *c = &p->ch;
  const double tickLen = (double)ctx->sampleRate / 50.0;

  for (int i = 0; i < numSamples; i++) {
    if (p->playing) {
      p->tickAcc += 1.0;
      if (p->tickAcc >= tickLen) { p->tickAcc -= tickLen; effect(p); }
    }
    float s = 0.0f;
    if (p->playing && c->active && c->period != 0 && c->data) {
      double step = AMIGA_CLOCK / ((double)c->period * (double)ctx->sampleRate);
      uint32_t pos = (uint32_t)(c->pos >> 16);
      if (pos < c->length) s = (float)c->data[pos] / 128.0f;
      s *= (float)c->volume / 64.0f;
      c->pos += (uint64_t)(step * 65536.0);
      uint32_t np = (uint32_t)(c->pos >> 16);
      if (np >= c->length) {
        if (c->loopLength > 0) {
          while (np >= c->length) {
            uint32_t over = np - c->length;
            np = c->loopStart + over;
            c->length = c->loopStart + c->loopLength;
            if (np >= c->length && c->loopLength > 0) { np = c->loopStart + (np - c->loopStart) % c->loopLength; break; }
          }
          c->pos = (uint64_t)np << 16;
        } else c->active = 0;
      }
    }
    outL[i] = outR[i] = s * VOICE_SCALE;
  }
}

EMSCRIPTEN_KEEPALIVE
void fc_set_param(void* ctxPtr, int handle, int paramId, float value) {
  Ctx *ctx = (Ctx*)ctxPtr;
  if (!ctx || handle < 0 || handle >= MAX_PLAYERS) return;
  Player *p = &ctx->players[handle];
  /* vibrato depth / speed of the running note (volume macro bytes 3 and 2) */
  if (paramId == 1) p->vibDepth = (int8_t)(value * 63.0f);
  else if (paramId == 2) p->vibSpeed = (int8_t)(value * 63.0f);
}

EMSCRIPTEN_KEEPALIVE
float fc_get_param(void* ctxPtr, int handle, int paramId) {
  (void)ctxPtr; (void)handle; (void)paramId;
  return 0.0f;
}
