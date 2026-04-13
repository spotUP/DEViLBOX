/**
 * fmplayer_wasm.c — WASM bridge for 98fmplayer FMP driver
 *
 * Drives the myon98/98fmplayer FMP (PLAY6) format replayer through the
 * libopna YM2608 (OPNA) emulator. The OPNA runs at 55467 Hz internally;
 * we resample to the worklet's sample rate using linear interpolation.
 */

#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "libopna/opna.h"
#include "libopna/opnatimer.h"
#include "fmdriver/fmdriver.h"
#include "fmdriver/fmdriver_fmp.h"
#include "fmdriver/ppz8.h"

/* ── Internal rate of the OPNA chip (7987200 / 144) ────────────────────── */
#define OPNA_RATE 55467

/* ── ADPCM RAM: 256 KiB for OPNA ADPCM channel ──────────────────────── */
#define ADPCM_RAM_SIZE (1 << 18)

/* ── Global state ──────────────────────────────────────────────────────── */
static struct opna        g_opna;
static struct opna_timer  g_timer;
static struct fmdriver_work g_work;
static struct driver_fmp  g_fmp;
static struct ppz8        g_ppz8;
static uint8_t           *g_adpcm_ram = NULL;

/* The file data (copied because fmp_load modifies it in-place) */
static uint8_t *g_file_data = NULL;
static uint32_t g_file_len  = 0;

/* Resampler state (OPNA_RATE → target_rate via linear interp) */
static uint32_t g_target_rate = 48000;
static double   g_resample_pos = 0.0;   /* fractional position in OPNA samples */
static double   g_resample_step = 0.0;  /* OPNA_RATE / target_rate */

/* Previous OPNA output sample for interpolation (stereo) */
static int16_t g_prev_l = 0;
static int16_t g_prev_r = 0;

/* Intermediate buffer: render chunks of OPNA samples, then resample */
#define OPNA_CHUNK 512
static int16_t g_opna_buf[OPNA_CHUNK * 2]; /* stereo interleaved S16 */

static int g_initialized = 0;
static int g_loaded = 0;

/* ── Per-channel mute mask ───────────────────────────────────────────────
 * Mirrors the LIBOPNA_CHAN_* bitmask stored in opna.mask.
 * Channel index → bitmask mapping (matches LIBOPNA_CHAN_* constants):
 *   0-5  : FM 1-6   (bits 0-5)
 *   6-8  : SSG 1-3  (bits 6-8)
 *   9    : ADPCM    (bit 15)
 * A set bit means the channel is MUTED (passed directly to opna_set_mask).
 */
static unsigned g_mute_mask = 0;

/* ── Callbacks connecting fmdriver_work ↔ opna_timer ─────────────────── */

static void opna_writereg_cb(struct fmdriver_work *work, unsigned addr, unsigned data) {
  struct opna_timer *timer = (struct opna_timer *)work->opna;
  opna_timer_writereg(timer, addr, data);
}

static unsigned opna_readreg_cb(struct fmdriver_work *work, unsigned addr) {
  struct opna_timer *timer = (struct opna_timer *)work->opna;
  return opna_readreg(timer->opna, addr);
}

static uint8_t opna_status_cb(struct fmdriver_work *work, bool a1) {
  struct opna_timer *timer = (struct opna_timer *)work->opna;
  uint8_t status = opna_timer_status(timer);
  if (!a1) status &= 0x83;
  return status;
}

static void opna_int_cb(void *userptr) {
  struct fmdriver_work *work = (struct fmdriver_work *)userptr;
  work->driver_opna_interrupt(work);
}

static void opna_mix_cb(void *userptr, int16_t *buf, unsigned samples) {
  struct ppz8 *ppz8 = (struct ppz8 *)userptr;
  ppz8_mix(ppz8, buf, samples);
}

/* ── Exported functions ──────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
int fmplayer_wasm_init(int sample_rate) {
  g_target_rate = (uint32_t)sample_rate;
  g_resample_step = (double)OPNA_RATE / (double)g_target_rate;
  g_resample_pos = 0.0;
  g_prev_l = 0;
  g_prev_r = 0;

  /* Allocate ADPCM RAM once */
  if (!g_adpcm_ram) {
    g_adpcm_ram = (uint8_t *)calloc(ADPCM_RAM_SIZE, 1);
    if (!g_adpcm_ram) return -1;
  }

  /* Reset OPNA chip */
  opna_reset(&g_opna);
  opna_adpcm_set_ram_256k(&g_opna.adpcm, g_adpcm_ram);

  /* Reset timer */
  opna_timer_reset(&g_timer, &g_opna);

  /* Init PPZ8 PCM sampler at OPNA internal rate */
  ppz8_init(&g_ppz8, OPNA_RATE, 0xa000);

  /* Wire up fmdriver_work */
  memset(&g_work, 0, sizeof(g_work));
  g_work.opna_writereg = opna_writereg_cb;
  g_work.opna_readreg  = opna_readreg_cb;
  g_work.opna_status   = opna_status_cb;
  g_work.opna          = &g_timer;
  g_work.ppz8          = &g_ppz8;
  g_work.ppz8_functbl  = &ppz8_functbl;

  /* Connect timer callbacks */
  opna_timer_set_int_callback(&g_timer, opna_int_cb, &g_work);
  opna_timer_set_mix_callback(&g_timer, opna_mix_cb, &g_ppz8);

  /* Note: We don't load drum ROM (ym2608_adpcm_rom.bin) since we don't
   * ship it. Rhythm channel drums will be silent, but FM/SSG/ADPCM/PPZ8
   * will work. The vast majority of FMP music uses FM and SSG primarily. */

  g_initialized = 1;
  g_loaded = 0;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int fmplayer_wasm_load(const uint8_t *data, int len) {
  if (!g_initialized) return -1;
  if (len <= 0 || len > 65535) return -2;

  /* Free previous file data */
  if (g_file_data) { free(g_file_data); g_file_data = NULL; }

  /* Copy file data (fmp_load modifies it in-place during playback) */
  g_file_data = (uint8_t *)malloc(len);
  if (!g_file_data) return -3;
  memcpy(g_file_data, data, len);
  g_file_len = (uint32_t)len;

  /* Reset OPNA and timer for new song */
  opna_reset(&g_opna);
  opna_adpcm_set_ram_256k(&g_opna.adpcm, g_adpcm_ram);
  opna_timer_reset(&g_timer, &g_opna);
  ppz8_init(&g_ppz8, OPNA_RATE, 0xa000);

  /* Re-wire work (memset clears it) */
  memset(&g_work, 0, sizeof(g_work));
  g_work.opna_writereg = opna_writereg_cb;
  g_work.opna_readreg  = opna_readreg_cb;
  g_work.opna_status   = opna_status_cb;
  g_work.opna          = &g_timer;
  g_work.ppz8          = &g_ppz8;
  g_work.ppz8_functbl  = &ppz8_functbl;
  opna_timer_set_int_callback(&g_timer, opna_int_cb, &g_work);
  opna_timer_set_mix_callback(&g_timer, opna_mix_cb, &g_ppz8);

  /* Re-apply mute mask after chip reset */
  if (g_mute_mask) {
    opna_set_mask(&g_opna, g_mute_mask);
  }

  /* Reset resampler state */
  g_resample_pos = 0.0;
  g_prev_l = 0;
  g_prev_r = 0;

  /* Parse FMP data */
  memset(&g_fmp, 0, sizeof(g_fmp));
  if (!fmp_load(&g_fmp, g_file_data, (uint16_t)g_file_len)) {
    return -4;
  }

  /* Initialize driver (sets up timer, parts, tempo) */
  fmp_init(&g_work, &g_fmp);

  g_loaded = 1;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int fmplayer_wasm_render(float *out_buf, int frames) {
  if (!g_initialized || !g_loaded || frames <= 0) return 0;

  int out_written = 0;

  while (out_written < frames) {
    /* How many OPNA samples do we need to generate? */
    /* We need enough so that the resampler can produce at least one output sample */

    /* Render a chunk of OPNA samples */
    int opna_needed = (int)(g_resample_step * (frames - out_written) - g_resample_pos) + 2;
    if (opna_needed < 1) opna_needed = 1;
    if (opna_needed > OPNA_CHUNK) opna_needed = OPNA_CHUNK;

    memset(g_opna_buf, 0, opna_needed * 2 * sizeof(int16_t));
    opna_timer_mix(&g_timer, g_opna_buf, opna_needed);

    /* Resample from OPNA_RATE to target_rate with linear interpolation */
    int opna_idx = 0;
    while (out_written < frames && opna_idx < opna_needed) {
      /* Integer part of current position */
      int pos_int = (int)g_resample_pos;

      while (pos_int >= 1) {
        /* Advance through OPNA samples */
        g_prev_l = g_opna_buf[opna_idx * 2];
        g_prev_r = g_opna_buf[opna_idx * 2 + 1];
        opna_idx++;
        pos_int--;
        g_resample_pos -= 1.0;
        if (opna_idx >= opna_needed) break;
      }

      if (opna_idx >= opna_needed) break;

      /* Fractional interpolation */
      double frac = g_resample_pos;
      int16_t cur_l = g_opna_buf[opna_idx * 2];
      int16_t cur_r = g_opna_buf[opna_idx * 2 + 1];

      float sample_l = (float)((1.0 - frac) * g_prev_l + frac * cur_l) / 32768.0f;
      float sample_r = (float)((1.0 - frac) * g_prev_r + frac * cur_r) / 32768.0f;

      out_buf[out_written * 2]     = sample_l;
      out_buf[out_written * 2 + 1] = sample_r;
      out_written++;

      g_resample_pos += g_resample_step;
    }
  }

  return out_written;
}

EMSCRIPTEN_KEEPALIVE
int fmplayer_wasm_get_loop_count(void) {
  if (!g_loaded) return 0;
  return g_work.loop_cnt;
}

EMSCRIPTEN_KEEPALIVE
void fmplayer_wasm_stop(void) {
  g_loaded = 0;
  /* Reset OPNA to silence */
  if (g_initialized) {
    opna_reset(&g_opna);
    opna_adpcm_set_ram_256k(&g_opna.adpcm, g_adpcm_ram);
    opna_timer_reset(&g_timer, &g_opna);
  }
}

/* ── Per-channel mute control ────────────────────────────────────────── */

/**
 * fmplayer_wasm_set_mute_mask - set the libopna channel mute bitmask.
 *
 * The mask uses the LIBOPNA_CHAN_* constants directly:
 *   ch 0-5  = LIBOPNA_CHAN_FM_1..FM_6  (bits 0-5)
 *   ch 6-8  = LIBOPNA_CHAN_SSG_1..SSG_3 (bits 6-8)
 *   ch 9    = LIBOPNA_CHAN_ADPCM        (bit 15)
 * A set bit means the channel is muted.  Pass 0 to un-mute all channels.
 */
EMSCRIPTEN_KEEPALIVE
void fmplayer_wasm_set_mute_mask(unsigned mask) {
  g_mute_mask = mask;
  if (g_initialized) {
    opna_set_mask(&g_opna, mask);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 *  FM instrument parameter read/write API
 *
 *  FM channels 0-5 (ch 0-2 in port 0, ch 3-5 in port 1).
 *  Each FM channel has 4 operators (slots 0-3).
 *  Parameters per operator: TL, AR, DR, SR, RR, SL, MUL, DET, KS
 *  Parameters per channel: ALG, FB, FNUM, BLK, PAN_L, PAN_R
 * ══════════════════════════════════════════════════════════════════════════ */

/* FM operator (slot) parameter IDs */
enum {
  FMP_SLOT_TL  = 0,   /* Total Level (0-127, lower = louder) */
  FMP_SLOT_AR  = 1,   /* Attack Rate (0-31) */
  FMP_SLOT_DR  = 2,   /* Decay Rate (0-31) */
  FMP_SLOT_SR  = 3,   /* Sustain Rate (0-31) */
  FMP_SLOT_RR  = 4,   /* Release Rate (0-15) */
  FMP_SLOT_SL  = 5,   /* Sustain Level (0-15) */
  FMP_SLOT_MUL = 6,   /* Frequency Multiplier (0-15) */
  FMP_SLOT_DET = 7,   /* Detune (0-7) */
  FMP_SLOT_KS  = 8,   /* Key Scale (0-3) */
  FMP_SLOT_COUNT = 9,
};

/* FM channel parameter IDs */
enum {
  FMP_CH_ALG    = 0,   /* Algorithm (0-7) */
  FMP_CH_FB     = 1,   /* Feedback (0-7) */
  FMP_CH_FNUM   = 2,   /* F-Number (0-2047) */
  FMP_CH_BLK    = 3,   /* Block/Octave (0-7) */
  FMP_CH_PAN_L  = 4,   /* Left output enable (0-1) */
  FMP_CH_PAN_R  = 5,   /* Right output enable (0-1) */
  FMP_CH_COUNT  = 6,
};

/* SSG parameter IDs */
enum {
  FMP_SSG_TONE_L   = 0,  /* Tone period low byte (0-255) */
  FMP_SSG_TONE_H   = 1,  /* Tone period high nibble (0-15) */
  FMP_SSG_VOLUME   = 2,  /* Volume (0-15, or 16=envelope) */
  FMP_SSG_NOISE    = 3,  /* Noise period (0-31) - shared */
  FMP_SSG_TONE_EN  = 4,  /* Tone enable (0-1) */
  FMP_SSG_NOISE_EN = 5,  /* Noise enable (0-1) */
  FMP_SSG_COUNT    = 6,
};

EMSCRIPTEN_KEEPALIVE
int fmplayer_wasm_get_fm_slot_param(int ch, int slot, int param_id) {
  if (!g_initialized || ch < 0 || ch > 5 || slot < 0 || slot > 3) return -1;
  const struct opna_fm_slot *s = &g_opna.fm.channel[ch].slot[slot];
  switch (param_id) {
    case FMP_SLOT_TL:  return s->tl;
    case FMP_SLOT_AR:  return s->ar;
    case FMP_SLOT_DR:  return s->dr;
    case FMP_SLOT_SR:  return s->sr;
    case FMP_SLOT_RR:  return s->rr;
    case FMP_SLOT_SL:  return s->sl;
    case FMP_SLOT_MUL: return s->mul;
    case FMP_SLOT_DET: return s->det;
    case FMP_SLOT_KS:  return s->ks;
    default: return -1;
  }
}

EMSCRIPTEN_KEEPALIVE
void fmplayer_wasm_set_fm_slot_param(int ch, int slot, int param_id, int value) {
  if (!g_initialized || ch < 0 || ch > 5 || slot < 0 || slot > 3) return;
  struct opna_fm_slot *s = &g_opna.fm.channel[ch].slot[slot];
  switch (param_id) {
    case FMP_SLOT_TL:  opna_fm_slot_set_tl(s, value & 0x7f); break;
    case FMP_SLOT_AR:  opna_fm_slot_set_ar(s, value & 0x1f); break;
    case FMP_SLOT_DR:  opna_fm_slot_set_dr(s, value & 0x1f); break;
    case FMP_SLOT_SR:  opna_fm_slot_set_sr(s, value & 0x1f); break;
    case FMP_SLOT_RR:  opna_fm_slot_set_rr(s, value & 0x0f); break;
    case FMP_SLOT_SL:  opna_fm_slot_set_sl(s, value & 0x0f); break;
    case FMP_SLOT_MUL: opna_fm_slot_set_mul(s, value & 0x0f); break;
    case FMP_SLOT_DET: opna_fm_slot_set_det(s, value & 0x07); break;
    case FMP_SLOT_KS:  opna_fm_slot_set_ks(s, value & 0x03); break;
    default: break;
  }
}

EMSCRIPTEN_KEEPALIVE
int fmplayer_wasm_get_fm_ch_param(int ch, int param_id) {
  if (!g_initialized || ch < 0 || ch > 5) return -1;
  const struct opna_fm_channel *c = &g_opna.fm.channel[ch];
  switch (param_id) {
    case FMP_CH_ALG:   return c->alg;
    case FMP_CH_FB:    return c->fb;
    case FMP_CH_FNUM:  return c->fnum;
    case FMP_CH_BLK:   return c->blk;
    case FMP_CH_PAN_L: return g_opna.fm.lselect[ch] ? 1 : 0;
    case FMP_CH_PAN_R: return g_opna.fm.rselect[ch] ? 1 : 0;
    default: return -1;
  }
}

EMSCRIPTEN_KEEPALIVE
void fmplayer_wasm_set_fm_ch_param(int ch, int param_id, int value) {
  if (!g_initialized || ch < 0 || ch > 5) return;
  struct opna_fm_channel *c = &g_opna.fm.channel[ch];
  switch (param_id) {
    case FMP_CH_ALG: opna_fm_chan_set_alg(c, value & 0x07); break;
    case FMP_CH_FB:  opna_fm_chan_set_fb(c, value & 0x07); break;
    case FMP_CH_FNUM: c->fnum = value & 0x7ff; break;
    case FMP_CH_BLK:  c->blk = value & 0x07; break;
    case FMP_CH_PAN_L: g_opna.fm.lselect[ch] = (value != 0); break;
    case FMP_CH_PAN_R: g_opna.fm.rselect[ch] = (value != 0); break;
    default: break;
  }
}

EMSCRIPTEN_KEEPALIVE
int fmplayer_wasm_get_ssg_param(int ch, int param_id) {
  if (!g_initialized || ch < 0 || ch > 2) return -1;
  const struct opna_ssg *ssg = &g_opna.ssg;
  switch (param_id) {
    case FMP_SSG_TONE_L:   return ssg->regs[ch * 2];
    case FMP_SSG_TONE_H:   return ssg->regs[ch * 2 + 1] & 0x0f;
    case FMP_SSG_VOLUME:   return ssg->regs[8 + ch] & 0x1f;
    case FMP_SSG_NOISE:    return ssg->regs[6] & 0x1f;
    case FMP_SSG_TONE_EN:  return (ssg->regs[7] >> ch) & 1 ? 0 : 1;
    case FMP_SSG_NOISE_EN: return (ssg->regs[7] >> (ch + 3)) & 1 ? 0 : 1;
    default: return -1;
  }
}

EMSCRIPTEN_KEEPALIVE
void fmplayer_wasm_set_ssg_param(int ch, int param_id, int value) {
  if (!g_initialized || ch < 0 || ch > 2) return;
  switch (param_id) {
    case FMP_SSG_TONE_L:
      opna_ssg_writereg(&g_opna.ssg, ch * 2, value & 0xff);
      break;
    case FMP_SSG_TONE_H:
      opna_ssg_writereg(&g_opna.ssg, ch * 2 + 1, value & 0x0f);
      break;
    case FMP_SSG_VOLUME:
      opna_ssg_writereg(&g_opna.ssg, 8 + ch, value & 0x1f);
      break;
    case FMP_SSG_NOISE:
      opna_ssg_writereg(&g_opna.ssg, 6, value & 0x1f);
      break;
    case FMP_SSG_TONE_EN: {
      uint8_t mixer = g_opna.ssg.regs[7];
      if (value) mixer &= ~(1 << ch); else mixer |= (1 << ch);
      opna_ssg_writereg(&g_opna.ssg, 7, mixer);
      break;
    }
    case FMP_SSG_NOISE_EN: {
      uint8_t mixer = g_opna.ssg.regs[7];
      if (value) mixer &= ~(1 << (ch + 3)); else mixer |= (1 << (ch + 3));
      opna_ssg_writereg(&g_opna.ssg, 7, mixer);
      break;
    }
    default: break;
  }
}

/**
 * Bulk read all FM channel + slot data for a single channel.
 * Writes 40 ints: [alg, fb, fnum, blk, panL, panR, slot0(tl,ar,dr,sr,rr,sl,mul,det,ks) × 4]
 * = 6 + 4*9 = 42 ints
 */
EMSCRIPTEN_KEEPALIVE
void fmplayer_wasm_get_fm_channel(int ch, int *out) {
  if (!g_initialized || ch < 0 || ch > 5 || !out) return;
  const struct opna_fm_channel *c = &g_opna.fm.channel[ch];
  out[0] = c->alg;
  out[1] = c->fb;
  out[2] = c->fnum;
  out[3] = c->blk;
  out[4] = g_opna.fm.lselect[ch] ? 1 : 0;
  out[5] = g_opna.fm.rselect[ch] ? 1 : 0;
  for (int s = 0; s < 4; s++) {
    int base = 6 + s * 9;
    const struct opna_fm_slot *sl = &c->slot[s];
    out[base + 0] = sl->tl;
    out[base + 1] = sl->ar;
    out[base + 2] = sl->dr;
    out[base + 3] = sl->sr;
    out[base + 4] = sl->rr;
    out[base + 5] = sl->sl;
    out[base + 6] = sl->mul;
    out[base + 7] = sl->det;
    out[base + 8] = sl->ks;
  }
}
