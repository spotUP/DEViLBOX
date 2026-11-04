/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for jxs_engine.cpp (JayTrax replayer, clean-room by creep, unchanged).
 * The engine is included so its State is visible: the bar and step the replayer is on are
 * read from it for the position display. */
#include "jxs_engine.cpp"

#include <emscripten.h>

static synth_info g_info;
static int g_open = 0;

extern "C" {

/* 1 when the song is ready to play. `track` is the subsong. */
EMSCRIPTEN_KEEPALIVE int jxs_open(const uint8_t* data, int size, int track) {
  std::memset(&g_info, 0, sizeof(g_info));
  g_open = synthw_jxs_open("/song.jxs", data, (size_t)size, track, &g_info);
  return g_open;
}

EMSCRIPTEN_KEEPALIVE const char* jxs_error(void) { return g_info.error; }
EMSCRIPTEN_KEEPALIVE int jxs_rate(void) { return g_info.rate; }
EMSCRIPTEN_KEEPALIVE int jxs_tracks(void) { return g_info.tracks; }
EMSCRIPTEN_KEEPALIVE int jxs_duration_ms(void) { return (int)g_info.duration_ms; }
/* The bar and step (0..63) the replayer last entered. */
EMSCRIPTEN_KEEPALIVE int jxs_bar(void) { return g_open && g ? g->gbar : 0; }
EMSCRIPTEN_KEEPALIVE int jxs_step(void) { return g_open && g ? g->gstep : 0; }

/* Stereo float frames; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int jxs_render(float* out, int frames) {
  return g_open ? synthw_jxs_render(out, frames) : 0;
}

EMSCRIPTEN_KEEPALIVE void jxs_close(void) {
  synthw_jxs_close();
  g_open = 0;
}

}
