/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for bbmp-t0ast.cpp (T0AST replayer, clean-room by creep).
 * bbmp-t0ast.cpp and resample.h are kept byte-identical to the bbmp source; the program is
 * included here (its main renamed, its Engine state opened) so the play position and live
 * edits can reach the decoded pattern cells the sequencer reads.
 *
 * Not bit-exact here: the engine is exact only on x86 (x87 extended, rounding toward zero,
 * FSIN/F2XM1). In WASM long double is a software binary128 and the rounding mode cannot be
 * changed, so the engine takes its portable path (close, not bit-identical; description 1). */
#include <algorithm>  // bbmp-t0ast.cpp uses std::fill without including it
#include <cfenv>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#define main t0ast_cli_main
#define private public
#include "bbmp-t0ast.cpp"
#undef private
#undef main

#include <memory>
#include <emscripten.h>

namespace {
// One open song: the Song must outlive the Engine (it keeps a reference) and the Resampler.
struct Open {
  Song song;
  long long total = 0;            // frames at 44100 Hz by the export's length rule
  std::unique_ptr<Player> player;
  std::unique_ptr<Resampler> rs;  // null when the context runs at the engine's 44100 Hz
  long long left = 0;             // output frames still to come
  ~Open() { if (player) delete player->engine; }
};
std::unique_ptr<Open> g_open;
std::string g_error;
std::vector<int16_t> g_pcm;
bool g_constants = false;
}  // namespace

extern "C" {

/* 1 when the song is ready to play at <rate> Hz (44100 native, other rates through resample.h). */
EMSCRIPTEN_KEEPALIVE int t0ast_open(const uint8_t* data, int size, int rate) {
  g_open.reset();
  g_error.clear();
  if (size <= 0 || (size_t)size > MAX_FILE) { g_error = "the file is too big for a T0AST song"; return 0; }
  if (!g_constants) { constants(); g_constants = true; }
  std::unique_ptr<Open> o(new Open);
  std::vector<uint8_t> file(data, data + size);
  g_error = load(file, o->song);
  if (!g_error.empty()) return 0;
  o->total = measure(o->song);
  if (o->total < 0) { g_error = "the song does not end within 30 minutes"; return 0; }
  o->player.reset(new Player{makeEngine(o->song, true), o->total});
  o->left = o->total;
  if (rate != RATE) {
    o->rs.reset(new Resampler(RATE, rate, source, o->player.get()));
    o->left = (long long)((unsigned long long)o->total * (unsigned long long)rate / RATE);
  }
  g_open = std::move(o);
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* t0ast_error(void) { return g_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int t0ast_duration_ms(void) { return g_open ? (int)(g_open->total * 1000 / RATE) : 0; }
EMSCRIPTEN_KEEPALIVE int t0ast_channels(void) { return g_open ? g_open->song.channels : 0; }

/* Where the sequencer is: order position * 64 + row. */
EMSCRIPTEN_KEEPALIVE int t0ast_position(void) {
  if (!g_open) return 0;
  const Engine& e = *g_open->player->engine;
  return e.curOrder_ * 64 + e.curRow_;
}

/* Live edit: write bytes at an offset into the decoded cells (Song::cells, 256 patterns x 64 rows
 * x 16 channels, 6 bytes a cell in struct order note, vol, fx[0], fx[1], par[0], par[1]: cell
 * offset ((pattern * 64 + row) * 16 + channel) * 6). Heard when that row is next played. */
EMSCRIPTEN_KEEPALIVE int t0ast_poke(int offset, const uint8_t* bytes, int count) {
  static_assert(sizeof(Cell) == 6, "Cell must be six bytes");
  if (!g_open || offset < 0 || count < 0) return 0;
  std::vector<Cell>& cells = g_open->song.cells;
  if ((size_t)offset + (size_t)count > cells.size() * sizeof(Cell)) return 0;
  std::memcpy(reinterpret_cast<uint8_t*>(cells.data()) + offset, bytes, (size_t)count);
  return 1;
}

/* Stereo float frames in -1..1; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int t0ast_render(float* out, int frames) {
  if (!g_open || frames <= 0) return 0;
  Open& o = *g_open;
  if ((int)g_pcm.size() < frames * 2) g_pcm.resize(frames * 2);
  int got = 0;
  while (got < frames && o.left > 0) {
    if (o.rs) o.rs->frame(&g_pcm[2 * got]);
    else o.player->frame(&g_pcm[2 * got]);
    ++got;
    --o.left;
  }
  for (int i = 0; i < got * 2; i++) out[i] = g_pcm[i] / 32768.0f;
  return got;
}

EMSCRIPTEN_KEEPALIVE void t0ast_close(void) { g_open.reset(); }

}
