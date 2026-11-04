/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for jxs_engine.cpp (JayTrax replayer, clean-room by creep; DEViLBOX adds
 * per-voice outputs, isolation and a note-start log for the channel meters).
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

/* Voices in the song (1..16). */
EMSCRIPTEN_KEEPALIVE int jxs_voices(void) { return g_open && g ? g->N : 0; }
/* Voice c's mono frames from the last jxs_render call (the first `frames` of them are valid). */
EMSCRIPTEN_KEEPALIVE const float* jxs_voice(int c) { return g_open && g && c >= 0 && c < 16 ? g->vout[c] : nullptr; }
/* Where voice c sits in the stereo field: 0 hard left, 1 hard right (its pan, as the main mix applies it). */
EMSCRIPTEN_KEEPALIVE float jxs_voice_side(int c) { return g_open && g && c >= 0 && c < 16 ? g->vside[c] : 0.5f; }
/* How many notes voice c has started up to the last frame jxs_render returned (for the channel meters). */
EMSCRIPTEN_KEEPALIVE unsigned jxs_note_starts(int c) { return g_open && g && c >= 0 && c < 16 ? g->starts[c] : 0u; }
/* Voices an isolation slot carries (bit c): left out of the main mix. */
EMSCRIPTEN_KEEPALIVE void jxs_set_isolated(unsigned mask) { if (g_open && g) g->isomask = mask; }

EMSCRIPTEN_KEEPALIVE void jxs_close(void) {
  synthw_jxs_close();
  g_open = 0;
}

/* ---- keyboard preview: a second copy of the module that plays single notes on voice 0, apart from the
 * song's own State. The song is frozen (no rows advance); the replayer's own strike, instrument update and
 * effects run, so a key sounds as the song plays that instrument. ---- */
static State* g_pv = nullptr;

/* 1 when the preview copy is ready. Replaces any earlier copy. */
EMSCRIPTEN_KEEPALIVE int jxs_preview_open(const uint8_t* data, int size) {
  delete g_pv;
  g_pv = new (std::nothrow) State();
  if (!g_pv) return 0;
  synth_info info;
  std::memset(&info, 0, sizeof(info));
  if (!open_song(*g_pv, data, (size_t)size, 0, &info)) {
    delete g_pv;
    g_pv = nullptr;
    return 0;
  }
  for (int c = 0; c < 16; ++c) g_pv->ch[c].instr = 0;
  g_pv->frozen = true;
  return 1;
}

/* Play `note` (the grid's note number) of instrument `instrument` (1..I) on voice 0. */
EMSCRIPTEN_KEEPALIVE void jxs_preview_note(int instrument, int note) {
  if (!g_pv || instrument < 1 || instrument > g_pv->song.I) return;
  Channel& h = g_pv->ch[0];
  h.instr = 0;
  h.sample = nullptr;
  strike(*g_pv, h, note, instrument);
}

EMSCRIPTEN_KEEPALIVE void jxs_preview_stop(void) {
  if (g_pv) g_pv->ch[0].instr = 0;
}

/* Stereo float frames of the preview (silence while no note sounds). */
EMSCRIPTEN_KEEPALIVE int jxs_preview_render(float* out, int frames) {
  if (!g_pv) return 0;
  return request(*g_pv, out, frames);
}

EMSCRIPTEN_KEEPALIVE void jxs_preview_close(void) {
  delete g_pv;
  g_pv = nullptr;
}

}
