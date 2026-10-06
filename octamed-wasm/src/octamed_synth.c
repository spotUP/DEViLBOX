/**
 * octamed_synth.c — OctaMED synthetic-instrument voice (keyboard preview)
 *
 * Plays one OctaMED SynthInstr the way the original player does, as measured
 * against UADE's own OctaMED eagleplayer on hand-built modules (see
 * src/engine/__tests__/keyboardPreviewGroupB.test.ts and medSynthFixture.ts):
 *
 *   - Paula playback: the current waveform (L bytes, signed) loops at
 *     3546895 / period samples per second, so its pitch is 3546895 / (period * L).
 *     The old model treated the 256-byte slot as one cycle at the sample rate
 *     (eight octaves high for a 64-byte wave padded with zeros) and used the
 *     NTSC clock.
 *   - Note to period: MED raw note n sounds ProTracker period
 *     PT12[(n-1) % 12] * 4 >> ((n-1) / 12) (raw 25 = 856, raw 49 = 214); the old
 *     table (36 entries, key - 24) clamped and sat three octaves off.
 *   - Level: Paula volume = volume-table value * instrument volume / 64, mixed
 *     by UADE as sample * volume / 32768, a full-scale voice being 0.25.
 *   - Tables: one 50 Hz tick at a time. A table runs a step at note start and
 *     then every `speed` ticks (the counter reloads from the speed in force
 *     before the step runs, so a speed command applies one step late).
 *     A step reads entries until it reaches a value:
 *       volume table: 00-40 volume | F0 n speed | F1 n wait n steps |
 *                     F2 n slide down n per tick | F3 n slide up n per tick |
 *                     FE n jump | FF end (hold)
 *       waveform table: 00-.. waveform | F0 n speed | F1 n wait |
 *                     F2 n period + n per tick | F3 n period - n per tick |
 *                     F4 n vibrato depth | F5 n vibrato speed |
 *                     FC .. FD arpeggio (semitones, one per tick) |
 *                     FE n jump | FF end (hold)
 *     Slides run every tick before the step. A waveform the table selects
 *     reaches the output at the end of the current loop of the old one, as
 *     Paula reloads its pointer then.
 *   - Vibrato: period + (sine * depth >> 8), the sine advancing `speed` of 256
 *     per tick (the measured excursion of depth 8 / speed 4 is +3 at tick 16).
 *   - F4/FA of the volume table (envelope, wave-synchronised jump) and F7 of
 *     the waveform table are not modelled: their effect on the real player
 *     was not decoded.
 *
 * Binary blob for octamed_player_set_instrument (little-endian), version 2:
 *   [0]     u8  version = 2
 *   [1]     u8  numWaveforms (1-10)
 *   [2]     u8  instrument volume (0-64)
 *   [3]     u8  vibrato speed (initial)
 *   [4]     u8  voltbl speed
 *   [5]     u8  wftbl speed
 *   [6-7]   reserved
 *   [8]     128 bytes volume table
 *   [136]   128 bytes waveform table
 *   [264]   numWaveforms x u16 waveform length in bytes (2..256)
 *   [264 + 2*numWaveforms]  waveform data, signed bytes, back to back
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define KEEPALIVE EMSCRIPTEN_KEEPALIVE
#else
#define KEEPALIVE
#endif

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define PAULA_CLOCK     3546895.0f
#define TICKS_PER_SEC   50
#define MAX_WAVES       10
#define MAX_WAVE_BYTES  256
#define MAX_PLAYERS     16
/* UADE audio.c mixes int8 * volume (0..64) and the float output is that / 32768:
 * normalised sample * volume gives 0.25 at full scale. */
#define PAULA_VOICE_SCALE 0.25f

static const uint16_t PT12[12] = { 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453 };

/* Sine for the vibrato, -127..127 over 256 steps. */
static int8_t SINE_TABLE[256];
static int    g_sine_inited = 0;

static void init_sine_table(void) {
  if (g_sine_inited) return;
  for (int i = 0; i < 256; i++) SINE_TABLE[i] = (int8_t)(127.0 * sin(2.0 * 3.14159265358979323846 * i / 256.0));
  g_sine_inited = 1;
}

/* Period of a MED raw note on a synth instrument (raw 25 = 856). */
static int raw_note_period(int raw) {
  if (raw < 1) raw = 1;
  if (raw > 96) raw = 96;
  int i = (raw - 1) % 12, oct = (raw - 1) / 12;
  return ((int)PT12[i] << 2) >> oct;
}

typedef struct {
  int pos;      /* table position */
  int cnt;      /* ticks until the next step */
  int speed;    /* ticks per step (>= 1) */
  int wait;     /* steps still to skip (F1) */
} Seq;

typedef struct {
  /* Instrument */
  int8_t   waves[MAX_WAVES][MAX_WAVE_BYTES];
  int      waveLen[MAX_WAVES];
  uint8_t  voltbl[128];
  uint8_t  wftbl[128];
  int      numWaves;
  int      instVolume;
  int      volSpeed0, wfSpeed0, vibSpeed0;

  /* Voice */
  Seq      vol, wf;
  int      wave;         /* waveform Paula is looping */
  int      waveNext;     /* waveform the table last selected: Paula takes it at the next loop end */
  int      volume;       /* table volume 0..64 */
  int      volSlide;     /* per tick, signed */
  int      period;       /* base period of the note */
  int      periodOff;    /* F2/F3 accumulated period offset */
  int      pitchSlide;   /* per tick, signed (+ = period grows = pitch falls) */
  int      vibDepth, vibSpeed, vibPhase;
  int      arp[32], arpLen, arpIdx;
  float    phase;        /* position in the current waveform, bytes */
  int      active, allocated;
  int      sampleRate, tickCtr, samplesPerTick;
} Player;

static Player g_players[MAX_PLAYERS];

static int cmd_arg(const uint8_t *tbl, int pos) { return pos + 1 < 128 ? tbl[pos + 1] : 0; }

/* One volume-table step: run entries until a value (or END). */
static void vol_step(Player *p) {
  Seq *s = &p->vol;
  if (s->wait > 0) { s->wait--; return; }
  for (int guard = 0; guard < 64; guard++) {
    if (s->pos < 0 || s->pos >= 128) { s->pos = 127; return; }
    uint8_t c = p->voltbl[s->pos];
    if (c <= 0x40) { p->volume = c; s->pos++; return; }
    int a = cmd_arg(p->voltbl, s->pos);
    switch (c) {
      case 0xF0: s->speed = a < 1 ? 1 : a; s->pos += 2; break;
      case 0xF1: s->wait = a > 1 ? a - 1 : 0; s->pos += 2; return;
      case 0xF2: p->volSlide = -a; s->pos += 2; break;
      case 0xF3: p->volSlide = a; s->pos += 2; break;
      case 0xFE: s->pos = a; break;
      case 0xFF: return; /* END: hold */
      default: s->pos += 2; break; /* F4, FA, ...: not modelled */
    }
  }
}

/* One waveform-table step. */
static void wf_step(Player *p) {
  Seq *s = &p->wf;
  if (s->wait > 0) { s->wait--; return; }
  for (int guard = 0; guard < 64; guard++) {
    if (s->pos < 0 || s->pos >= 128) { s->pos = 127; return; }
    uint8_t c = p->wftbl[s->pos];
    if (c < 0x80) {
      p->waveNext = c < p->numWaves ? c : p->numWaves - 1;
      s->pos++;
      return;
    }
    int a = cmd_arg(p->wftbl, s->pos);
    switch (c) {
      case 0xF0: s->speed = a < 1 ? 1 : a; s->pos += 2; break;
      case 0xF1: s->wait = a > 1 ? a - 1 : 0; s->pos += 2; return;
      case 0xF2: p->pitchSlide = a; s->pos += 2; break;
      case 0xF3: p->pitchSlide = -a; s->pos += 2; break;
      case 0xF4: p->vibDepth = a; s->pos += 2; break;
      case 0xF5: p->vibSpeed = a; s->pos += 2; break;
      case 0xFC: { /* arpeggio list up to FD */
        int n = 0, q = s->pos + 1;
        while (q < 128 && p->wftbl[q] != 0xFD && n < 32) p->arp[n++] = (int8_t)p->wftbl[q++];
        p->arpLen = n; p->arpIdx = 0;
        s->pos = q < 128 ? q + 1 : 127;
        break;
      }
      case 0xFE: s->pos = a; break;
      case 0xFF: return; /* END: hold */
      default: s->pos += 2; break; /* F7, FA, ...: not modelled */
    }
  }
}

static void run_seq(Player *p, Seq *s, void (*step)(Player *)) {
  if (--s->cnt > 0) return;
  s->cnt = s->speed; /* reload from the speed in force before the step */
  step(p);
}

/* One 50 Hz tick of the voice. */
static void player_tick(Player *p) {
  p->volume += p->volSlide;
  if (p->volume < 0) p->volume = 0;
  if (p->volume > 64) p->volume = 64;
  p->periodOff += p->pitchSlide;
  run_seq(p, &p->vol, vol_step);
  run_seq(p, &p->wf, wf_step);
  p->vibPhase = (p->vibPhase + p->vibSpeed) & 0xFF;
  if (p->arpLen > 0) p->arpIdx = (p->arpIdx + 1) % p->arpLen;
}

static float current_period(const Player *p) {
  float period = (float)(p->period + p->periodOff);
  if (p->vibDepth > 0) period += (float)((SINE_TABLE[p->vibPhase & 0xFF] * p->vibDepth) >> 8);
  if (p->arpLen > 0) period *= powf(2.0f, -(float)p->arp[p->arpIdx] / 12.0f);
  if (period < 113.0f) period = 113.0f;
  return period;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

KEEPALIVE void octamed_init(int sample_rate) {
  (void)sample_rate;
  init_sine_table();
  memset(g_players, 0, sizeof(g_players));
}

KEEPALIVE int octamed_create_player(int sample_rate) {
  init_sine_table();
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!g_players[i].allocated) {
      memset(&g_players[i], 0, sizeof(Player));
      g_players[i].allocated = 1;
      g_players[i].sampleRate = sample_rate;
      g_players[i].samplesPerTick = sample_rate / TICKS_PER_SEC;
      g_players[i].numWaves = 1;
      g_players[i].waveLen[0] = MAX_WAVE_BYTES;
      g_players[i].instVolume = 64;
      memset(g_players[i].voltbl, 0xFF, 128);
      memset(g_players[i].wftbl, 0xFF, 128);
      return i;
    }
  }
  return -1;
}

KEEPALIVE void octamed_destroy_player(int handle) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  g_players[handle].allocated = 0;
  g_players[handle].active = 0;
}

/* Returns 1 on success, 0 on error. */
KEEPALIVE int octamed_player_set_instrument(int handle, const uint8_t *data, int len) {
  if (handle < 0 || handle >= MAX_PLAYERS) return 0;
  Player *p = &g_players[handle];
  if (!p->allocated || !data || len < 264) return 0;
  if (data[0] != 2) return 0;

  int nw = data[1];
  if (nw < 1) nw = 1;
  if (nw > MAX_WAVES) nw = MAX_WAVES;
  p->numWaves = nw;
  p->instVolume = data[2] > 64 ? 64 : data[2];
  p->vibSpeed0 = data[3];
  p->volSpeed0 = data[4];
  p->wfSpeed0 = data[5];
  memcpy(p->voltbl, data + 8, 128);
  memcpy(p->wftbl, data + 136, 128);

  int lenOff = 264, dataOff = 264 + 2 * nw;
  for (int w = 0; w < nw; w++) {
    int wl = lenOff + 2 * w + 1 < len ? data[lenOff + 2 * w] | (data[lenOff + 2 * w + 1] << 8) : 0;
    if (wl < 2) wl = 2;
    if (wl > MAX_WAVE_BYTES) wl = MAX_WAVE_BYTES;
    memset(p->waves[w], 0, MAX_WAVE_BYTES);
    if (dataOff + wl <= len) memcpy(p->waves[w], data + dataOff, wl);
    p->waveLen[w] = wl;
    dataOff += wl;
  }
  return 1;
}

KEEPALIVE void octamed_player_set_instrument_param(int handle, const char *param, float value) {
  if (handle < 0 || handle >= MAX_PLAYERS || !param) return;
  Player *p = &g_players[handle];
  if (!p->allocated) return;
  if (strcmp(param, "volume") == 0) {
    int v = (int)value;
    p->instVolume = v < 0 ? 0 : (v > 64 ? 64 : v);
  } else if (strcmp(param, "voltblSpeed") == 0) {
    p->volSpeed0 = (int)value;
  } else if (strcmp(param, "wfSpeed") == 0) {
    p->wfSpeed0 = (int)value;
  } else if (strcmp(param, "vibratoSpeed") == 0) {
    p->vibSpeed0 = (int)value;
  }
}

/* midi_note is the keyboard key: grid note n = key - 11 (xmConversions
 * noteToMidi), and MED raw note = grid note - 24 (MEDParser's MMD0-2 base). */
KEEPALIVE void octamed_player_note_on(int handle, int midi_note, int velocity) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  Player *p = &g_players[handle];
  if (!p->allocated) return;
  (void)velocity; /* Paula volume comes from the tables and the instrument */

  p->period = raw_note_period(midi_note - 11 - 24);
  p->periodOff = 0; p->pitchSlide = 0; p->volSlide = 0;
  p->volume = 0;
  p->wave = p->waveNext = 0;
  p->vibDepth = 0; p->vibSpeed = p->vibSpeed0; p->vibPhase = 0;
  p->arpLen = 0; p->arpIdx = 0;
  p->vol.pos = 0; p->vol.wait = 0; p->vol.speed = p->volSpeed0 < 1 ? 1 : p->volSpeed0;
  p->wf.pos = 0; p->wf.wait = 0; p->wf.speed = p->wfSpeed0 < 1 ? 1 : p->wfSpeed0;
  p->phase = 0.0f;
  p->tickCtr = 0;
  p->active = 1;
  /* The note-start step, then the counters as the player leaves them. */
  vol_step(p); p->vol.cnt = p->vol.speed;
  wf_step(p);  p->wf.cnt = p->wf.speed;
  p->wave = p->waveNext; /* the note starts on the table's first waveform */
}

KEEPALIVE void octamed_player_note_off(int handle) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  g_players[handle].active = 0;
}

KEEPALIVE int octamed_player_render(int handle, float *outL, float *outR, int numSamples) {
  if (handle < 0 || handle >= MAX_PLAYERS) return 0;
  Player *p = &g_players[handle];
  if (!p->allocated || !p->active) return 0;

  for (int i = 0; i < numSamples; i++) {
    if (++p->tickCtr >= p->samplesPerTick) { p->tickCtr = 0; player_tick(p); }

    int wi = p->wave;
    int wl = p->waveLen[wi];
    int pos = (int)p->phase;
    if (pos >= wl) pos %= wl;
    float vol = (float)p->volume * (float)p->instVolume / 64.0f; /* Paula volume 0..64 */
    float sample = (float)p->waves[wi][pos] * vol * PAULA_VOICE_SCALE / (128.0f * 64.0f);
    outL[i] = sample;
    outR[i] = sample;

    p->phase += (PAULA_CLOCK / current_period(p)) / (float)p->sampleRate;
    if (p->phase >= (float)wl) {
      p->phase -= (float)wl;
      p->wave = p->waveNext; /* Paula reloads AUDxLC when the loop ends */
      if (p->phase >= (float)p->waveLen[p->wave]) p->phase = 0.0f;
    }
  }
  return numSamples;
}
