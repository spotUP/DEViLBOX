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

/* Engine::block renders a whole 16384-frame BLOCK (0.37 s) in one go, so Player would do all
 * that work inside one 128-frame worklet call. This does the same steps as Engine::block (plug-in
 * tempo latched at each BLOCK start, tick-length chunks) but at most PIECE frames at a time, and
 * hands each piece to Player through its buffer so Player::frame still does the output step. */
const int PIECE = 128;
int g_blockPos = BLOCK;  // frames made in the current engine BLOCK

void fill(Open& o) {
  Player& p = *o.player;
  Engine& e = *o.engine;
  while (p.at == p.have && !p.done) {
    if (g_blockPos == BLOCK) {
      e.plugBpm = e.bpm;
      e.plugFbpm = e.fbpm;
      g_blockPos = 0;
    }
    if (e.remain <= 0) {
      if (!e.startTicks()) { p.done = true; break; }
      if (e.remain <= 0) continue;
    }
    int n = int(e.remain < BLOCK - g_blockPos ? e.remain : BLOCK - g_blockPos);
    if (n > PIECE) n = PIECE;
    e.remain -= n;
    e.chunk(p.buf.data(), n);
    g_blockPos += n;
    p.have = n;
    p.at = 0;
  }
}

void pieceSource(void* user, int16_t* frame) {
  Open& o = *static_cast<Open*>(user);
  fill(o);
  o.player->frame(frame);
}
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
  g_blockPos = BLOCK;
  if (rate != RATE) {
    o->rs.reset(new Resampler(RATE, rate, pieceSource, o.get()));
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
    else pieceSource(&o, &g_pcm[2 * got]);
    ++got;
    --o.left;
  }
  for (int i = 0; i < got * 2; i++) out[i] = g_pcm[i] / 32768.0f;
  return got;
}

EMSCRIPTEN_KEEPALIVE void brt_close(void) { g_open.reset(); }

}

/* ---- Editor grid (BeRoTrackerEdit build): load()'s decoded cells as tracker cells, and back. ----
 * Grid cell = 7 int32 (note, instrument, volume, effTyp, eff, effTyp2, eff2), row-major
 * (row * channels + channel). note 1..120 as stored (1 = C-0, DEViLBOX's own numbering), key off
 * 255 and note cut 254 shown as 97 (note off). volume 0x10 + vol only where the engine reads it
 * (volcmd 1, vol <= 64, rowWork). effTyp/eff = fx/param as stored (16 bit). effTyp2/eff2 = 0:
 * the cell's pan byte is never read by the engine and filter stays as stored (pokes skip it). */
namespace {
std::unique_ptr<Song> g_grid;
std::vector<int32_t> g_gridOut;
uint8_t g_cellOut[sizeof(Cell)];

int32_t* gridPattern(const Song* song, int p) {
  g_gridOut.clear();
  if (!song || p < 0 || p >= 240 || !song->pat[p].present) { g_gridOut.resize(7); return g_gridOut.data(); }
  const Pattern& pt = song->pat[p];
  const int ch = song->channels;
  g_gridOut.assign(size_t(pt.rows) * size_t(ch) * 7 + 7, 0);
  for (int c = 0; c < ch; ++c)
    for (int r = 0; r < pt.rows; ++r) {
      const Cell& x = pt.cells[size_t(c) * size_t(pt.rows) + size_t(r)];
      int32_t* o = g_gridOut.data() + (size_t(r) * size_t(ch) + size_t(c)) * 7;
      o[0] = (x.note == 254 || x.note == 255) ? 97 : (x.note <= 120 ? x.note : 0);
      o[1] = x.ins;
      o[2] = (x.volcmd == 1 && x.vol <= 64) ? 0x10 + x.vol : 0;
      o[3] = x.fx;
      o[4] = x.param;
    }
  return g_gridOut.data();
}
}  // namespace

extern "C" {
EMSCRIPTEN_KEEPALIVE int brt_grid_open(const uint8_t* data, int size) {
  g_grid.reset(new Song());
  g_error.clear();
  if (size <= 0 || (size_t)size > MAX_FILE) { g_error = "the file is too big for a BeRoTracker song"; return 0; }
  g_error = load(std::vector<uint8_t>(data, data + size), *g_grid);
  return g_error.empty() ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE int brt_grid_channels(void) { return g_grid ? g_grid->channels : 0; }
EMSCRIPTEN_KEEPALIVE int brt_grid_speed(void) { return g_grid ? (g_grid->speed < 1 ? 1 : g_grid->speed) : 6; }
EMSCRIPTEN_KEEPALIVE int brt_grid_bpm(void) { return g_grid ? (g_grid->bpm < 1 ? 1 : g_grid->bpm > 255 ? 255 : g_grid->bpm) : 125; }
/* Order positions up to the 255 end mark (advanceRow stops there). */
EMSCRIPTEN_KEEPALIVE int brt_grid_order_length(void) {
  if (!g_grid) return 0;
  int k = 0;
  while (k <= g_grid->orderCount && k < 257 && g_grid->order[k] != 255) ++k;
  return k;
}
/* A skip marker (240..254) shows the pattern advanceRow moves on to, so order index = curOrder. */
EMSCRIPTEN_KEEPALIVE int brt_grid_order(int k) {
  if (!g_grid || k < 0 || k >= 257) return 0;
  for (int i = k; i < 257; ++i) {
    const int p = g_grid->order[i];
    if (p == 255) break;
    if (p < 240) return p;
  }
  return 0;
}
EMSCRIPTEN_KEEPALIVE int brt_grid_pattern_rows(int p) {
  return g_grid && p >= 0 && p < 240 && g_grid->pat[p].present ? g_grid->pat[p].rows : 0;
}
EMSCRIPTEN_KEEPALIVE const int32_t* brt_grid_pattern(int p) { return gridPattern(g_grid.get(), p); }
EMSCRIPTEN_KEEPALIVE void brt_grid_close(void) { g_grid.reset(); }

/* The playing song's cells (pokes included) and the pattern the sequencer is in, for tests. */
EMSCRIPTEN_KEEPALIVE const int32_t* brt_play_pattern(int p) { return gridPattern(g_open ? g_open->song.get() : nullptr, p); }
EMSCRIPTEN_KEEPALIVE int brt_play_pattern_index(void) { return g_open ? g_open->engine->curPat : -1; }

/* One tracker cell back to the stored Cell bytes (struct order note, ins, volcmd, vol, pan, filter,
 * fx u16, param u16); the inverse of gridPattern, note off stored as 255 (key off). Callers poke
 * bytes 0..3 and 6..9 only, so the stored pan/filter bytes stay. */
EMSCRIPTEN_KEEPALIVE const uint8_t* brt_encode_cell(int note, int ins, int volume, int effTyp, int eff) {
  Cell c;
  c.note = uint8_t(note == 97 ? 255 : (note >= 1 && note <= 120 ? note : 0));
  c.ins = uint8_t(ins >= 0 && ins <= 255 ? ins : 0);
  if (volume >= 0x10 && volume <= 0x50) c.volcmd = 1, c.vol = uint8_t(volume - 0x10);
  c.fx = uint16_t(effTyp);
  c.param = uint16_t(eff);
  std::memcpy(g_cellOut, &c, sizeof(Cell));
  return g_cellOut;
}
}  // extern "C"
