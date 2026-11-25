/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for buz_engine.cpp (Buzzic 1 / Buzzic 2 replayer, clean-room by creep).
 * The engine is included so its State is visible: the song row being heard is read from it
 * for the position display. */
#include "buz_engine.cpp"

#include <emscripten.h>

static synth_info g_info;
static int g_open = 0;

extern "C" {

/* 1 when the song is ready to play (the only track is 0). Buzzic 1 computes the whole song here. */
EMSCRIPTEN_KEEPALIVE int buz_open(const uint8_t* data, int size) {
  std::memset(&g_info, 0, sizeof(g_info));
  g_open = synthw_buz_open("/song.buz", data, (size_t)size, 0, &g_info);
  return g_open;
}

EMSCRIPTEN_KEEPALIVE const char* buz_error(void) { return g_info.error; }
EMSCRIPTEN_KEEPALIVE int buz_rate(void) { return g_info.rate; }
EMSCRIPTEN_KEEPALIVE int buz_duration_ms(void) { return (int)g_info.duration_ms; }
/* 1 = Buzzic 1, 2 = Buzzic 2, 0 = nothing open. */
EMSCRIPTEN_KEEPALIVE int buz_kind(void) { return g_open && g ? g->kind : 0; }

/* The song row (counted from block 0; block = row / 16) whose frames were last handed out. */
EMSCRIPTEN_KEEPALIVE int buz_row(void) {
  if (!g_open || !g) return 0;
  if (g->kind == 1) return g->b1.rows_per > 0 ? (int)(g->b1_pos / g->b1.rows_per) : 0;
  const B2& b = g->b2;
  return b.ready > 0 ? b.row - 1 : b.row;
}

/* Stereo float frames in -1..1; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int buz_render(float* out, int frames) {
  return g_open ? synthw_buz_render(out, frames) : 0;
}

EMSCRIPTEN_KEEPALIVE void buz_close(void) {
  synthw_buz_close();
  g_open = 0;
}

}
