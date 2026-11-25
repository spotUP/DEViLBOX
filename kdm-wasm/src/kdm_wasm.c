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

/* Live edit: write `count` bytes of the song file at `offset` straight into the engine's
 * copy, so an edit is heard without reopening. The note tables (track, pitch, volumes,
 * effects) are stored in the engine in file order, one block of 7 x notes, so a file offset
 * maps onto it directly. Track waves land in track_wave; the editor-only track bytes have
 * nothing to change. Returns 0 (nothing written) for note times, which decide the song
 * length and the play order, and for values the open check would refuse (track >= tracks,
 * effect > 16): the caller reopens the song for those. */
EMSCRIPTEN_KEEPALIVE int kdm_poke(int offset, const uint8_t* bytes, int count) {
  long long t, m, notes_at, i;
  if (!g_open || offset < 0 || count < 0) return 0;
  t = g.tracks; m = g.notes;
  notes_at = 12 + 4 * t + 4 * m;
  if (offset >= 12 && offset + count <= 12 + t) {
    for (i = 0; i < count; ++i) g.track_wave[offset - 12 + i] = bytes[i];
    return 1;
  }
  if (offset >= 12 + t && offset + count <= 12 + 4 * t) return 1;
  if (offset < notes_at || offset + count > notes_at + 7 * m) return 0;
  for (i = 0; i < count; ++i) {
    const long long table = (offset - notes_at + i) / m;
    if (table == 0 && bytes[i] >= t) return 0;
    if (table >= 4 && bytes[i] > 16) return 0;
  }
  memcpy(g.track + (offset - notes_at), bytes, (size_t)count);
  return 1;
}

/* Stereo float frames; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int kdm_render(float* out, int frames) {
  return g_open ? synthw_kdm_render(out, frames) : 0;
}

EMSCRIPTEN_KEEPALIVE void kdm_close(void) {
  synthw_kdm_close();
  g_open = 0;
}
