/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for kdm_engine.c (Ken's Digital Music replayer, unchanged).
 * The engine finds waves.kwv with fopen() next to the song path, so the bank is
 * written into the in-memory file system first and the song is "opened" there. */
#include "kdm_engine.c"

#include <emscripten.h>

static synth_info g_info;
static int g_open = 0;
static int g_bank_size = 0;

EMSCRIPTEN_KEEPALIVE int kdm_set_bank(const uint8_t* data, int size) {
  FILE* f = fopen("/waves.kwv", "wb");
  if (!f) return 0;
  g_bank_size = fwrite(data, 1, (size_t)size, f) == (size_t)size ? size : 0;
  fclose(f);
  return g_bank_size > 0;
}

/* 1 when the song is ready to play. The bank must be set first. */
EMSCRIPTEN_KEEPALIVE int kdm_open(const uint8_t* data, int size) {
  memset(&g_info, 0, sizeof(g_info));
  g_open = synthw_kdm_open("/song.kdm", data, (size_t)size, 0, &g_info);
  return g_open;
}

EMSCRIPTEN_KEEPALIVE const char* kdm_error(void) { return g_info.error; }
EMSCRIPTEN_KEEPALIVE int kdm_rate(void) { return g_info.rate; }
EMSCRIPTEN_KEEPALIVE int kdm_total_ticks(void) { return g_open ? (int)g.ticks : 0; }
/* The tick the replayer last rendered (0..total_ticks). */
EMSCRIPTEN_KEEPALIVE int kdm_tick(void) { return g_open ? (int)g.tick : 0; }

/* Stereo float frames; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int kdm_render(float* out, int frames) {
  return g_open ? synthw_kdm_render(out, frames) : 0;
}

EMSCRIPTEN_KEEPALIVE void kdm_close(void) {
  synthw_kdm_close();
  g_open = 0;
}
