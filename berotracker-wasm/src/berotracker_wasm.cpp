/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for bbmp-berotracker.cpp (BeRoTracker .brt replayer, clean-room by creep).
 * bbmp-berotracker.cpp and resample.h are kept byte-identical to the bbmp source; the program is
 * included here with its main renamed, so the play position and live edits can reach the decoded
 * pattern cells the sequencer reads (Engine::cellAt reads Song::pat[p].cells every row).
 *
 * Not bit-exact here: the engine is exact only on x86 (x87 extended steps, FSIN/FCOS/F2XM1/
 * FYL2X/FSCALE/FRNDINT by inline asm). In WASM long double is a software binary128, so the engine
 * takes its portable path (BRT_X87 0, C library maths): "sounds the same, differences far below
 * hearing", not bit-identical to the references. */
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#define main brt_cli_main
#include "bbmp-berotracker.cpp"
#undef main

#include <emscripten.h>

namespace {
// One open song: the Song must outlive the Engine (it keeps a reference) and the Resampler.
struct Open {
  std::unique_ptr<Song> song{new Song()};  // large (240 patterns, 256 samples/instruments)
  long long total = 0;                     // frames at 44100 Hz by the export's length rule
  std::unique_ptr<Engine> engine;
  std::unique_ptr<Player> player;
  std::unique_ptr<Resampler> rs;           // null when the context runs at the engine's 44100 Hz
  long long left = 0;                      // output frames still to come
};
std::unique_ptr<Open> g_open;
std::string g_error;
std::vector<int16_t> g_pcm;
bool g_constants = false;
}  // namespace

extern "C" {

/* 1 when the song is ready to play at <rate> Hz (44100 native, other rates through resample.h). */
EMSCRIPTEN_KEEPALIVE int brt_open(const uint8_t* data, int size, int rate) {
  g_open.reset();
  g_error.clear();
  if (size <= 0 || (size_t)size > MAX_FILE) { g_error = "the file is too big for a BeRoTracker song"; return 0; }
  if (!g_constants) { constants(); makeFir(); g_constants = true; }
  std::unique_ptr<Open> o(new Open);
  std::vector<uint8_t> file(data, data + size);
  g_error = load(file, *o->song);
  if (g_error.empty()) g_error = prepare(*o->song);
  if (!g_error.empty()) return 0;
  o->total = measure(*o->song);
  if (o->total == -2) { g_error = "the song has more than two million ticks (impossibly short ones)"; return 0; }
  if (o->total < 0) { g_error = "the song does not end within 30 minutes"; return 0; }
  o->engine.reset(new Engine(*o->song, false));
  o->player.reset(new Player{o->engine.get()});
  o->left = o->total;
  if (rate != RATE) {
    o->rs.reset(new Resampler(RATE, rate, source, o->player.get()));
    o->left = (long long)((unsigned long long)o->total * (unsigned long long)rate / RATE);
  }
  g_open = std::move(o);
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* brt_error(void) { return g_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int brt_duration_ms(void) { return g_open ? (int)(g_open->total * 1000 / RATE) : 0; }
EMSCRIPTEN_KEEPALIVE int brt_channels(void) { return g_open ? g_open->song->channels : 0; }

/* Where the sequencer is: order position << 16 | row (patterns have up to 65535 rows). */
EMSCRIPTEN_KEEPALIVE int brt_position(void) {
  if (!g_open) return 0;
  const Engine& e = *g_open->engine;
  return (e.curOrder << 16) | (e.curRow & 0xFFFF);
}

/* Live edit: write bytes at an offset into one pattern's decoded cells (Pattern::cells, channel
 * by channel: cell index = channel * rows + row; sizeof(Cell) bytes a cell in struct order note,
 * ins, volcmd, vol, pan, filter, fx u16, param u16). Heard when that row is next played. */
EMSCRIPTEN_KEEPALIVE int brt_cell_size(void) { return (int)sizeof(Cell); }
EMSCRIPTEN_KEEPALIVE int brt_pattern_rows(int pattern) {
  if (!g_open || pattern < 0 || pattern >= 240 || !g_open->song->pat[pattern].present) return 0;
  return g_open->song->pat[pattern].rows;
}
EMSCRIPTEN_KEEPALIVE int brt_poke(int pattern, int offset, const uint8_t* bytes, int count) {
  if (!g_open || pattern < 0 || pattern >= 240 || offset < 0 || count < 0) return 0;
  std::vector<Cell>& cells = g_open->song->pat[pattern].cells;
  if ((size_t)offset + (size_t)count > cells.size() * sizeof(Cell)) return 0;
  std::memcpy(reinterpret_cast<uint8_t*>(cells.data()) + offset, bytes, (size_t)count);
  return 1;
}

/* Stereo float frames in -1..1; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int brt_render(float* out, int frames) {
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

EMSCRIPTEN_KEEPALIVE void brt_close(void) { g_open.reset(); }

}
