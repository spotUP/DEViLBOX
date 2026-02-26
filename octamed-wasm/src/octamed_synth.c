/**
 * octamed_synth.c — OctaMED real-time synthesis engine
 *
 * Implements the vol/wf command-table oscillator for OctaMED synth instruments.
 * Parses the DEViLBOX compact binary format and renders audio per sample block.
 *
 * Binary format (compact, not raw SynthInstr layout):
 *   [0]     u8  version = 1
 *   [1]     u8  numWaveforms (1-10)
 *   [2]     u8  defaultVolume (0-64)
 *   [3]     u8  vibratoSpeed
 *   [4]     u8  voltblSpeed (vol-table execute rate; 0=every block)
 *   [5]     u8  wfSpeed    (wf-table execute rate;  0=every block)
 *   [6-7]   u16 reserved
 *   [8]     128 bytes — vol command table (voltbl)
 *   [136]   128 bytes — wf command table (wftbl)
 *   [264]   numWaveforms × 256 bytes — signed waveforms
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

/* ── Period table (Amiga Paula, 3-octave standard set) ────────────────────── */
/* Index 0 = C-1 (period 856), index 35 = B-3 (period 113)                    */
/* MIDI note 36 = C-2 = index 12 in this table                                 */
static const uint16_t AMIGA_PERIODS[36] = {
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,  /* oct 1 */
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,  /* oct 2 */
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,  /* oct 3 */
};

/* Sine table (256 entries, amplitude ±127) for vibrato */
static int8_t SINE_TABLE[256];
static int    g_sine_inited = 0;
static int    g_sample_rate = 44100;

static void init_sine_table(void) {
  if (g_sine_inited) return;
  for (int i = 0; i < 256; i++) {
    SINE_TABLE[i] = (int8_t)(127.0 * sin(2.0 * 3.14159265358979323846 * i / 256.0));
  }
  g_sine_inited = 1;
}

/* Convert MIDI note to Amiga period (clamped to table range) */
static float note_to_period(int midi_note) {
  /* midi 36 = C-2 = index 12 (oct 2 C) */
  int idx = midi_note - 24; /* shift so midi 24 = C-1 = index 0 */
  if (idx < 0) idx = 0;
  if (idx > 35) idx = 35;
  return (float)AMIGA_PERIODS[idx];
}

/* Convert period + semitone offset to frequency */
static float period_to_freq(float period, int semitone_offset) {
  /* Amiga: freq = 7159090 / (2 * period) for PAL */
  /* Apply semitone offset by multiplying period by 2^(-st/12) */
  float p = period;
  if (semitone_offset != 0) {
    p = p * (float)pow(2.0, -semitone_offset / 12.0);
  }
  if (p < 1.0f) p = 1.0f;
  return 7159090.0f / (2.0f * p);
}

/* ── Player state ─────────────────────────────────────────────────────────── */

#define MAX_PLAYERS 16

typedef struct {
  /* Instrument data */
  int8_t   waveforms[10][256];
  uint8_t  voltbl[128];
  uint8_t  wftbl[128];
  uint8_t  numWaveforms;
  uint8_t  defaultVolume;
  uint8_t  voltblSpeed;
  uint8_t  wfSpeed;
  uint8_t  vibratoSpeed;

  /* Runtime oscillator state */
  float    samplePos;       /* position within current 256-byte waveform (0-255) */
  float    phaseInc;        /* waveform samples advanced per output sample */
  int      wfIndex;         /* current waveform index (0-9) */
  int      volume;          /* current volume (0-64) */

  /* Vol table sequencer */
  int      volPos;          /* byte offset into voltbl */
  int      volCounter;      /* samples until next vol table step */
  int      volStepSamples;  /* samples per vol table step (from voltblSpeed) */

  /* Wf table sequencer */
  int      wfPos;           /* byte offset into wftbl */
  int      wfCounter;       /* samples until next wf table step */
  int      wfStepSamples;   /* samples per wf table step (from wfSpeed) */

  /* Arpeggio (from wf table non-command bytes) */
  int      arpSemitone;     /* current arpeggio semitone offset */

  /* Vibrato */
  int      vibratoPhase;    /* 0-255 sawtooth phase */
  int      vibDepth;        /* current vibrato depth (0-63) */
  int      vibSpeed;        /* current vibrato speed (overrides vibratoSpeed) */

  /* Playback state */
  int      baseNote;        /* MIDI note of current key-on */
  float    basePeriod;      /* Amiga period for baseNote */
  int      active;          /* 1 = playing */
  int      allocated;       /* 1 = slot in use */
  int      sampleRate;
} OctaMEDPlayer;

static OctaMEDPlayer g_players[MAX_PLAYERS];

/* ── Step rate calculation ────────────────────────────────────────────────── */
/* OctaMED vol/wf table runs at ~50Hz (PAL frame rate) by default.            */
/* Speed value 0 = execute every block (~50Hz at typical block sizes).         */
/* Here we treat speed as: execute every (speed+1) * (sampleRate/50) samples.  */

static int compute_step_samples(int speed, int sample_rate) {
  /* minimum 1 sample */
  int base = sample_rate / 50; /* ~882 at 44100, ~960 at 48000 */
  if (base < 1) base = 1;
  return base * (speed + 1);
}

/* ── Vol table execution ──────────────────────────────────────────────────── */

static void execute_vol_step(OctaMEDPlayer *p) {
  if (p->volPos < 0 || p->volPos >= 128) { p->volPos = 127; return; }
  uint8_t cmd = p->voltbl[p->volPos];
  int8_t  scmd = (int8_t)cmd;

  if (scmd >= 0) {
    /* Direct volume value 0-64 */
    p->volume = (cmd > 64) ? 64 : (int)cmd;
    p->volPos++;
    if (p->volPos >= 128) p->volPos = 127;
    return;
  }

  /* Command byte — need argument at volPos+1 */
  int argPos = p->volPos + 1;
  uint8_t arg = (argPos < 128) ? p->voltbl[argPos] : 0;

  switch (cmd & 0x0F) {
    case 0x00: /* F0: set vol-table speed */
      p->voltblSpeed = arg;
      p->volStepSamples = compute_step_samples(arg, p->sampleRate);
      p->volPos += 2;
      break;
    case 0x01: /* F1: wait N extra steps (skip) */
      p->volPos += 2;
      break;
    case 0x02: /* F2: slide volume down by arg */
      p->volume -= (int)arg;
      if (p->volume < 0) p->volume = 0;
      p->volPos += 2;
      break;
    case 0x03: /* F3: slide volume up by arg */
      p->volume += (int)arg;
      if (p->volume > 64) p->volume = 64;
      p->volPos += 2;
      break;
    case 0x04: /* F4: set envelope waveform (for vibrato volume shape - ignore for now) */
      p->volPos += 2;
      break;
    case 0x0A: /* FA: JWS - jump if wf table position <= arg */
      p->volPos += 2;
      break;
    case 0x0E: /* FE: JMP to arg */
      p->volPos = (int)arg;
      break;
    case 0x0F: /* FF: END - loop back (stay at current pos - 1) */
      /* Stay at this position to repeat */
      if (p->volPos > 0) p->volPos--;
      break;
    default:
      p->volPos += 2;
      break;
  }

  if (p->volPos >= 128) p->volPos = 127;
}

/* ── Wf table execution ───────────────────────────────────────────────────── */

static void execute_wf_step(OctaMEDPlayer *p) {
  if (p->wfPos < 0 || p->wfPos >= 128) { p->wfPos = 127; return; }
  uint8_t cmd = p->wftbl[p->wfPos];
  int8_t  scmd = (int8_t)cmd;

  if (scmd >= 0) {
    /* Direct waveform index or arpeggio semitone */
    if (cmd < 10) {
      /* Waveform select (0-9) */
      p->wfIndex = (int)cmd;
      if (p->wfIndex >= p->numWaveforms) p->wfIndex = p->numWaveforms - 1;
      p->arpSemitone = 0;
    } else {
      /* Arpeggio semitone offset (values 10+ are treated as semitones relative to root) */
      p->arpSemitone = (int)cmd - 10;
    }
    p->wfPos++;
    if (p->wfPos >= 128) p->wfPos = 127;
    return;
  }

  /* Command byte */
  int argPos = p->wfPos + 1;
  uint8_t arg = (argPos < 128) ? p->wftbl[argPos] : 0;

  switch (cmd & 0x0F) {
    case 0x00: /* F0: set wf-table speed */
      p->wfSpeed = arg;
      p->wfStepSamples = compute_step_samples(arg, p->sampleRate);
      p->wfPos += 2;
      break;
    case 0x01: /* F1: wait */
      p->wfPos += 2;
      break;
    case 0x02: /* F2: slide wf index down */
      p->wfIndex -= (int)arg;
      if (p->wfIndex < 0) p->wfIndex = 0;
      p->wfPos += 2;
      break;
    case 0x03: /* F3: slide wf index up */
      p->wfIndex += (int)arg;
      if (p->wfIndex >= p->numWaveforms) p->wfIndex = p->numWaveforms - 1;
      p->wfPos += 2;
      break;
    case 0x04: /* F4: set vibrato depth */
      p->vibDepth = (int)arg;
      p->wfPos += 2;
      break;
    case 0x05: /* F5: set vibrato speed */
      p->vibSpeed = (int)arg;
      p->wfPos += 2;
      break;
    case 0x07: /* F7: set vibrato waveform (ignore - always sine) */
      p->wfPos += 2;
      break;
    case 0x0A: /* FA: JVS - jump to arg (volume sync) */
      p->wfPos += 2;
      break;
    case 0x0C: /* FC: set arpeggio begin */
      p->wfPos += 2;
      break;
    case 0x0E: /* FE: JMP to arg */
      p->wfPos = (int)arg;
      break;
    case 0x0F: /* FF: END - loop */
      if (p->wfPos > 0) p->wfPos--;
      break;
    default:
      p->wfPos += 2;
      break;
  }

  if (p->wfPos >= 128) p->wfPos = 127;
}

/* ── Public API ───────────────────────────────────────────────────────────── */

KEEPALIVE void octamed_init(int sample_rate) {
  g_sample_rate = sample_rate;
  init_sine_table();
  memset(g_players, 0, sizeof(g_players));
}

KEEPALIVE int octamed_create_player(int sample_rate) {
  init_sine_table();
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!g_players[i].allocated) {
      memset(&g_players[i], 0, sizeof(OctaMEDPlayer));
      g_players[i].allocated   = 1;
      g_players[i].sampleRate  = sample_rate;
      g_players[i].active      = 0;
      g_players[i].volume      = 64;
      g_players[i].wfIndex     = 0;
      g_players[i].numWaveforms = 1;
      g_players[i].voltblSpeed = 0;
      g_players[i].wfSpeed     = 0;
      g_players[i].vibratoSpeed = 0;
      /* Default: single silent waveform, tables end immediately */
      g_players[i].voltbl[0] = 0xFF; /* FF = END */
      g_players[i].wftbl[0]  = 0xFF;
      g_players[i].volStepSamples = compute_step_samples(0, sample_rate);
      g_players[i].wfStepSamples  = compute_step_samples(0, sample_rate);
      return i;
    }
  }
  return -1; /* no free slot */
}

KEEPALIVE void octamed_destroy_player(int handle) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  g_players[handle].allocated = 0;
  g_players[handle].active    = 0;
}

/**
 * Parse compact binary format and load into player.
 * Returns 1 on success, 0 on error.
 */
KEEPALIVE int octamed_player_set_instrument(int handle, const uint8_t *data, int len) {
  if (handle < 0 || handle >= MAX_PLAYERS) return 0;
  if (!g_players[handle].allocated) return 0;
  if (!data || len < 264) return 0; /* need at least header + both tables */

  OctaMEDPlayer *p = &g_players[handle];

  /* Header */
  /* data[0] = version (must be 1) */
  if (data[0] != 1) return 0;
  p->numWaveforms  = data[1];
  if (p->numWaveforms < 1) p->numWaveforms = 1;
  if (p->numWaveforms > 10) p->numWaveforms = 10;
  p->defaultVolume = data[2];
  p->vibratoSpeed  = data[3];
  p->voltblSpeed   = data[4];
  p->wfSpeed       = data[5];

  /* Vol table: 128 bytes at offset 8 */
  memcpy(p->voltbl, data + 8, 128);

  /* Wf table: 128 bytes at offset 136 */
  memcpy(p->wftbl, data + 136, 128);

  /* Waveforms at offset 264, each 256 signed bytes */
  for (int w = 0; w < p->numWaveforms; w++) {
    int off = 264 + w * 256;
    if (off + 256 > len) {
      /* Pad remaining waveforms with silence */
      memset(p->waveforms[w], 0, 256);
    } else {
      memcpy(p->waveforms[w], (const int8_t *)(data + off), 256);
    }
  }

  /* Precompute step samples */
  p->volStepSamples = compute_step_samples(p->voltblSpeed, p->sampleRate);
  p->wfStepSamples  = compute_step_samples(p->wfSpeed,     p->sampleRate);

  return 1;
}

KEEPALIVE void octamed_player_note_on(int handle, int midi_note, int velocity) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  if (!g_players[handle].allocated) return;

  OctaMEDPlayer *p = &g_players[handle];

  p->baseNote    = midi_note;
  p->basePeriod  = note_to_period(midi_note);
  p->samplePos   = 0.0f;
  p->wfIndex     = 0;
  p->volPos      = 0;
  p->wfPos       = 0;
  p->volCounter  = p->volStepSamples;
  p->wfCounter   = p->wfStepSamples;
  p->volume      = (int)p->defaultVolume;
  p->vibratoPhase = 0;
  p->vibDepth    = 0;
  p->vibSpeed    = (int)p->vibratoSpeed;
  p->arpSemitone = 0;
  p->active      = 1;

  /* Compute initial phase increment */
  float freq = period_to_freq(p->basePeriod, 0);
  p->phaseInc = 256.0f * freq / (float)p->sampleRate;

  (void)velocity;
}

KEEPALIVE void octamed_player_note_off(int handle) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  g_players[handle].active = 0;
}

/**
 * Render numSamples into outL and outR (float, stereo).
 * Returns numSamples on success, 0 if player inactive.
 */
KEEPALIVE int octamed_player_render(int handle, float *outL, float *outR, int numSamples) {
  if (handle < 0 || handle >= MAX_PLAYERS) return 0;
  OctaMEDPlayer *p = &g_players[handle];
  if (!p->allocated || !p->active) return 0;

  for (int i = 0; i < numSamples; i++) {
    /* ── Vol table step ──────────────────────────────────────────────── */
    p->volCounter--;
    if (p->volCounter <= 0) {
      execute_vol_step(p);
      p->volCounter = p->volStepSamples;
      if (p->volCounter < 1) p->volCounter = 1;
    }

    /* ── Wf table step ───────────────────────────────────────────────── */
    p->wfCounter--;
    if (p->wfCounter <= 0) {
      execute_wf_step(p);
      p->wfCounter = p->wfStepSamples;
      if (p->wfCounter < 1) p->wfCounter = 1;
    }

    /* ── Vibrato ─────────────────────────────────────────────────────── */
    p->vibratoPhase = (p->vibratoPhase + p->vibSpeed) & 0xFF;
    float vibAdj = 0.0f;
    if (p->vibDepth > 0) {
      int sineVal = (int)SINE_TABLE[p->vibratoPhase]; /* -127..127 */
      /* Vibrato modulates period slightly; depth in 1/256 semitone units */
      float vibSemitones = (float)(sineVal * p->vibDepth) / (128.0f * 64.0f);
      vibAdj = vibSemitones;
    }

    /* ── Compute phase increment ──────────────────────────────────────── */
    {
      float period = p->basePeriod;
      if (p->arpSemitone != 0 || vibAdj != 0.0f) {
        /* Apply arp + vibrato as combined semitone offset */
        float totalSemitones = (float)p->arpSemitone + vibAdj;
        period = period * (float)pow(2.0, -totalSemitones / 12.0);
        if (period < 1.0f) period = 1.0f;
      }
      float freq = 7159090.0f / (2.0f * period);
      p->phaseInc = 256.0f * freq / (float)p->sampleRate;
    }

    /* ── Sample output ───────────────────────────────────────────────── */
    int wi = p->wfIndex;
    if (wi < 0) wi = 0;
    if (wi >= p->numWaveforms) wi = p->numWaveforms - 1;

    int pos = (int)p->samplePos;
    if (pos < 0) pos = 0;
    if (pos > 255) pos = 255;

    float sample = (float)p->waveforms[wi][pos] * (float)p->volume / (64.0f * 128.0f);

    outL[i] = sample;
    outR[i] = sample;

    /* ── Advance phase ───────────────────────────────────────────────── */
    p->samplePos += p->phaseInc;
    while (p->samplePos >= 256.0f) {
      p->samplePos -= 256.0f;
    }
  }

  return numSamples;
}
