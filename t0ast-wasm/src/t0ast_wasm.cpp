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

/* Engine::block renders a whole 2048-frame BLOCK in one go, so Player would do all that work in
 * one 128-frame worklet call out of 16. This runs the same loop as Engine::block (tickStep when
 * the tick runs out, then samples) at most PIECE frames at a time into Player's buffer, ahead of
 * the frame Player::frame reads next, so Player::frame still does the output step unchanged. */
const int PIECE = 128;
int g_made = 0;  // frames of the current BLOCK already in Player::buf

void fill(Player& p) {
  if (p.at == BLOCK) {  // what Player::frame does at a BLOCK edge, minus the whole-block render
    p.at = 0;
    g_made = 0;
    if (p.left <= 0) { std::fill(p.buf.begin(), p.buf.end(), 0.0f); g_made = BLOCK; }
    p.left -= BLOCK;
  }
  if (p.at < g_made) return;
  Engine& e = *p.engine;
  TowardZero tz;
  const int end = g_made + PIECE < BLOCK ? g_made + PIECE : BLOCK;
  while (g_made < end) {
    if (e.left_ == 0) e.tickStep();
    const int n = e.left_ < end - g_made ? e.left_ : end - g_made;
    for (int k = 0; k < n; ++k) e.sample(p.buf.data() + 2 * (g_made + k));
    e.left_ -= n;
    g_made += n;
  }
}

void pieceSource(void* user, int16_t* frame) {
  Player& p = *static_cast<Player*>(user);
  fill(p);
  p.frame(frame);
}
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
  g_made = 0;
  if (rate != RATE) {
    o->rs.reset(new Resampler(RATE, rate, pieceSource, o->player.get()));
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

}  // extern "C"

namespace {
/* ---- grid: the cells as tracker cells, decoded here so TypeScript only copies numbers out.
 * Seven int32 a cell (note, instrument, volume, effTyp, eff, effTyp2, eff2), 64 rows x 16
 * channels a pattern, row-major. Note: tracker note value (1 = C-0, 96 = B-7), 97 for a key off
 * (stored 254, 255 or 129). The value is measured from the engine pitch: setPitch plays stored n at
 * 440 * 2^((n - 1 - 45) / 12) Hz (F0 = 440 / 44100), so stored 46 sounds 440 Hz = A-4 = value 58,
 * value = stored + 12. Stored notes above 84 clamp to B-7 (96); export keeps their bytes unedited. Volume: 0x10 + vol (0..64), 0 when the cell keeps it (0xFF).
 * Effects: T0AST's own numbers as stored (playRow, rowEffect). Instrument 0: a T0AST cell has
 * none, each channel plays its own instrument. */
Song g_grid;
int32_t g_gridOut[64 * 16 * 7];
uint8_t g_cellOut[6];

// stored note n plays 440 * 2^((n - 46) / 12) Hz; tracker value 58 is A-4 (440 Hz): see the grid comment
constexpr int kStoredToValue = 58 - 46;

void gridCell(const Cell& x, int32_t* o) {
  o[0] = (x.note == 254 || x.note == 255 || x.note == 129) ? 97
       : (x.note >= 1 && x.note <= 127) ? std::min(96, x.note + kStoredToValue) : 0;
  o[2] = x.vol <= 64 ? 0x10 + x.vol : 0;
  o[3] = x.fx[0]; o[4] = x.par[0]; o[5] = x.fx[1]; o[6] = x.par[1];
}

const int32_t* gridPattern(const Song& song, int p) {
  std::memset(g_gridOut, 0, sizeof g_gridOut);
  if (p < 0 || p > 255 || song.cells.empty()) return g_gridOut;
  for (int r = 0; r < 64; ++r)
    for (int c = 0; c < 16; ++c) {
      gridCell(song.cells[(size_t(p) * 64 + size_t(r)) * 16 + size_t(c)], g_gridOut + (r * 16 + c) * 7);
    }
  return g_gridOut;
}
}  // namespace

extern "C" {
EMSCRIPTEN_KEEPALIVE int t0ast_grid_open(const uint8_t* data, int size) {
  g_grid = Song();
  g_error.clear();
  if (size <= 0 || (size_t)size > MAX_FILE) { g_error = "the file is too big for a T0AST song"; return 0; }
  g_error = load(std::vector<uint8_t>(data, data + size), g_grid);
  return g_error.empty() ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE int t0ast_grid_channels(void) { return g_grid.channels; }
EMSCRIPTEN_KEEPALIVE int t0ast_grid_order_length(void) { return g_grid.orderLength; }
EMSCRIPTEN_KEEPALIVE int t0ast_grid_order(int k) { return k >= 0 && k < 256 ? g_grid.order[k] : 0xFF; }
EMSCRIPTEN_KEEPALIVE const int32_t* t0ast_grid_pattern(int p) { return gridPattern(g_grid, p); }
EMSCRIPTEN_KEEPALIVE void t0ast_grid_close(void) { g_grid = Song(); }

/* The playing song's cells (pokes included) and the pattern the sequencer is in, for tests. */
EMSCRIPTEN_KEEPALIVE const int32_t* t0ast_play_pattern(int p) {
  static const Song none{};
  return gridPattern(g_open ? g_open->song : none, p);
}
EMSCRIPTEN_KEEPALIVE int t0ast_play_pattern_index(void) {
  if (!g_open) return -1;
  return g_open->song.order[g_open->player->engine->curOrder_ & 255];
}

/* One tracker cell back to the six stored bytes (poke order note, vol, fx[0], fx[1], par[0],
 * par[1]); the inverse of gridPattern, key off stored as 255. */
EMSCRIPTEN_KEEPALIVE const uint8_t* t0ast_encode_cell(int note, int volume, int effTyp, int eff, int effTyp2, int eff2) {
  // tracker value back to the stored note; values below C-1 (stored 1) clamp to stored 1
  g_cellOut[0] = uint8_t(note == 97 ? 255
                         : (note >= 1 && note <= 96) ? std::max(1, note - kStoredToValue)
                         : (note < 0 ? 1 : 0));
  g_cellOut[1] = uint8_t(volume >= 0x10 && volume <= 0x50 ? volume - 0x10 : 0xFF);
  g_cellOut[2] = uint8_t(effTyp); g_cellOut[3] = uint8_t(effTyp2);
  g_cellOut[4] = uint8_t(eff); g_cellOut[5] = uint8_t(eff2);
  return g_cellOut;
}
}  // extern "C"

namespace {
/* ---- export: the song file with the grid's edits. Every pattern whose cells did not change is
 * carried byte for byte (an unedited song exports byte-identical); a changed pattern is packed
 * again with the loader's own codes (empty cell, field mask, mask + repeat count; no back-copy),
 * so it decodes to the same cells but is not the bytes T0AST's own packer would write. The order
 * list is written from the grid's; header, instruments, restart and texts are carried. */
std::vector<uint8_t> g_expSrc, g_expOut;
Song g_exp;                  // the file as loaded
std::vector<Cell> g_expCells;  // its cells with the edits
bool g_expDirty[256];
std::vector<uint8_t> g_expOrder;

bool sameCell(const Cell& a, const Cell& b) { return !std::memcmp(&a, &b, sizeof(Cell)); }

// Offset of the order-length field (the loader's header walk; the file already loaded).
size_t orderPos(const std::vector<uint8_t>& d, const Song& s) {
  size_t pos = 8 + 560 + (s.old ? 0 : 272) + 4;
  const int ch = d[pos++];
  for (int c = 0; c < ch; ++c) if (d[pos++]) pos += 3;
  for (int c = 0; c < ch; ++c) if (d[pos++]) pos += 25;
  return pos;
}

// End of one packed pattern starting at pos (the loader's control-byte walk, nothing stored).
size_t skipPattern(const std::vector<uint8_t>& d, size_t pos, int channels) {
  for (int ch = 0; ch < channels; ++ch) {
    int j = 0;
    while (j < 64) {
      const uint8_t b = d[pos++];
      if (b & 0x80) {
        const int n = b & 0x7F;
        if (n == 0) ++j;
        else { ++pos; j = std::min(64, j + n); }
      } else {
        for (int k = 0; k < 6; ++k) pos += (b >> k) & 1;
        if (b & 0x40) j = std::min(64, j + d[pos++]);
        else ++j;
      }
    }
  }
  return pos;
}

void packPattern(int p, int channels, std::vector<uint8_t>& out) {
  auto at = [p](int r, int c) -> const Cell& { return g_expCells[(size_t(p) * 64 + size_t(r)) * 16 + size_t(c)]; };
  for (int ch = 0; ch < channels; ++ch) {
    Cell c;  // the loader's carried cell, reset per channel
    int j = 0;
    while (j < 64) {
      const Cell& x = at(j, ch);
      if (sameCell(x, Cell())) { out.push_back(0x80); c = Cell(); ++j; continue; }
      const uint8_t xb[6] = {x.note, x.vol, x.fx[0], x.par[0], x.fx[1], x.par[1]};
      const uint8_t cb[6] = {c.note, c.vol, c.fx[0], c.par[0], c.fx[1], c.par[1]};
      uint8_t mask = 0;
      for (int k = 0; k < 6; ++k) if (xb[k] != cb[k]) mask |= uint8_t(1 << k);
      int run = 1;
      while (j + run < 64 && sameCell(at(j + run, ch), x)) ++run;
      out.push_back(uint8_t(mask | (run > 1 ? 0x40 : 0)));
      for (int k = 0; k < 6; ++k) if (mask & (1 << k)) out.push_back(xb[k]);
      if (run > 1) out.push_back(uint8_t(run));
      c = x;
      j += run;
    }
  }
}
}  // namespace

extern "C" {
EMSCRIPTEN_KEEPALIVE int t0ast_export_open(const uint8_t* data, int size) {
  g_exp = Song();
  g_error.clear();
  if (size <= 0 || (size_t)size > MAX_FILE) { g_error = "the file is too big for a T0AST song"; return 0; }
  g_expSrc.assign(data, data + size);
  g_error = load(g_expSrc, g_exp);
  if (!g_error.empty()) return 0;
  g_expCells = g_exp.cells;
  std::memset(g_expDirty, 0, sizeof g_expDirty);
  g_expOrder.assign(g_exp.order, g_exp.order + g_exp.orderLength);
  return 1;
}

/* One grid cell (tracker numbers, as t0ast_grid_pattern gives them). A cell that reads the same as
 * the stored one keeps its stored bytes (254/129 key offs stay); 0 when out of range. */
EMSCRIPTEN_KEEPALIVE int t0ast_export_cell(int p, int r, int c, int note, int volume, int effTyp, int eff, int effTyp2, int eff2) {
  if (g_exp.cells.empty() || p < 0 || p > 255 || r < 0 || r > 63 || c < 0 || c >= g_exp.channels) return 0;
  const size_t i = (size_t(p) * 64 + size_t(r)) * 16 + size_t(c);
  int32_t o[7] = {};
  gridCell(g_exp.cells[i], o);
  if (o[0] == note && o[2] == volume && o[3] == effTyp && o[4] == eff && o[5] == effTyp2 && o[6] == eff2) {
    g_expCells[i] = g_exp.cells[i];
  } else {
    const uint8_t* b = t0ast_encode_cell(note, volume, effTyp, eff, effTyp2, eff2);
    Cell& x = g_expCells[i];
    x.note = b[0]; x.vol = b[1]; x.fx[0] = b[2]; x.fx[1] = b[3]; x.par[0] = b[4]; x.par[1] = b[5];
  }
  g_expDirty[p] = true;  // settled in t0ast_export_build: repacked only if a cell differs
  return 1;
}

/* The order list (pattern numbers), 1..256 positions; 0 when out of range. */
EMSCRIPTEN_KEEPALIVE int t0ast_export_order(const uint8_t* order, int length) {
  if (g_exp.cells.empty() || length < 1 || length > 256) return 0;
  g_expOrder.assign(order, order + length);
  return 1;
}

/* Builds the file; returns its bytes (t0ast_export_size long), null when nothing is open. */
EMSCRIPTEN_KEEPALIVE const uint8_t* t0ast_export_build(void) {
  g_expOut.clear();
  if (g_exp.cells.empty()) return nullptr;
  const std::vector<uint8_t>& d = g_expSrc;
  const size_t op = orderPos(d, g_exp);
  g_expOut.assign(d.begin(), d.begin() + long(op));
  g_expOut.push_back(uint8_t(g_expOrder.size() & 0xFF));
  g_expOut.push_back(uint8_t(g_expOrder.size() >> 8));
  g_expOut.insert(g_expOut.end(), g_expOrder.begin(), g_expOrder.end());
  size_t pos = op + 2 + size_t(g_exp.orderLength);
  for (int p = 0; p < 256; ++p) {
    const bool present = d[pos++] != 0;
    const size_t start = pos;
    if (present) pos = skipPattern(d, pos, g_exp.channels);
    bool changed = false;
    if (g_expDirty[p])
      for (size_t i = size_t(p) * 64 * 16; i < size_t(p + 1) * 64 * 16 && !changed; ++i)
        changed = !sameCell(g_expCells[i], g_exp.cells[i]);
    g_expOut.push_back(present || changed ? 1 : 0);
    if (changed) packPattern(p, g_exp.channels, g_expOut);
    else g_expOut.insert(g_expOut.end(), d.begin() + long(start), d.begin() + long(pos));
  }
  g_expOut.insert(g_expOut.end(), d.begin() + long(pos), d.end());  // restart byte and texts
  return g_expOut.data();
}
EMSCRIPTEN_KEEPALIVE int t0ast_export_size(void) { return int(g_expOut.size()); }
EMSCRIPTEN_KEEPALIVE void t0ast_export_close(void) { g_exp = Song(); g_expSrc.clear(); g_expOut.clear(); g_expCells.clear(); }
}  // extern "C"

extern "C" {
/* Stereo float frames in -1..1; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int t0ast_render(float* out, int frames) {
  if (!g_open || frames <= 0) return 0;
  Open& o = *g_open;
  if ((int)g_pcm.size() < frames * 2) g_pcm.resize(frames * 2);
  int got = 0;
  while (got < frames && o.left > 0) {
    if (o.rs) o.rs->frame(&g_pcm[2 * got]);
    else pieceSource(o.player.get(), &g_pcm[2 * got]);
    ++got;
    --o.left;
  }
  for (int i = 0; i < got * 2; i++) out[i] = g_pcm[i] / 32768.0f;
  return got;
}

EMSCRIPTEN_KEEPALIVE void t0ast_close(void) { g_open.reset(); }

}
