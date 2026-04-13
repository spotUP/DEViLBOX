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
