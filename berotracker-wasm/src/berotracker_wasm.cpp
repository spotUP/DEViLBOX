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

/* The order list as the grid shows it: positions up to the 255 end mark (advanceRow stops there);
 * a skip marker (240..254) shows the pattern advanceRow moves on to, so order index = curOrder. */
std::vector<uint8_t> orderView(const Song& s) {
  std::vector<uint8_t> v;
  for (int k = 0; k <= s.orderCount && k < 257 && s.order[k] != 255; ++k) {
    uint8_t p = 0;
    for (int i = k; i < 257 && s.order[i] != 255; ++i)
      if (s.order[i] < 240) { p = s.order[i]; break; }
    v.push_back(p);
  }
  return v;
}

void gridCell(const Cell& x, int32_t* o) {
  o[0] = (x.note == 254 || x.note == 255) ? 97 : (x.note <= 120 ? x.note : 0);
  o[1] = x.ins;
  o[2] = (x.volcmd == 1 && x.vol <= 64) ? 0x10 + x.vol : 0;
  o[3] = x.fx;
  o[4] = x.param;
}

int32_t* gridPattern(const Song* song, int p) {
  g_gridOut.clear();
  if (!song || p < 0 || p >= 240 || !song->pat[p].present) { g_gridOut.resize(7); return g_gridOut.data(); }
  const Pattern& pt = song->pat[p];
  const int ch = song->channels;
  g_gridOut.assign(size_t(pt.rows) * size_t(ch) * 7 + 7, 0);
  for (int c = 0; c < ch; ++c)
    for (int r = 0; r < pt.rows; ++r) {
      const Cell& x = pt.cells[size_t(c) * size_t(pt.rows) + size_t(r)];
      gridCell(x, g_gridOut.data() + (size_t(r) * size_t(ch) + size_t(c)) * 7);
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
EMSCRIPTEN_KEEPALIVE int brt_grid_order_length(void) { return g_grid ? int(orderView(*g_grid).size()) : 0; }
EMSCRIPTEN_KEEPALIVE int brt_grid_order(int k) {
  if (!g_grid || k < 0) return 0;
  const std::vector<uint8_t> v = orderView(*g_grid);
  return size_t(k) < v.size() ? v[size_t(k)] : 0;
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

namespace {
/* ---- export: the song file with the grid's edits. Every chunk is carried byte for byte (an
 * unedited song exports byte-identical) except: a pattern whose cells changed gets its last PATT
 * chunk (and that chunk's PAEX) written again with the loader's codes, set-form field masks and
 * repeat counts; a changed order list gets a new PORD. Packed songs (flags 0x8000) get an aPLib
 * stream of literals only: it decodes to the same bytes, larger than BeRoTracker's own packer.
 * A changed pattern the file does not hold (a listed one load() filled with 64 empty rows) is
 * appended as a new PATT chunk.
 * shortcut: a changed order list is written as plain pattern numbers, so skip markers (240..254)
 * are dropped; pattern row counts are the file's (cells past them are ignored). */
std::vector<uint8_t> g_expSrc, g_expOut;
std::unique_ptr<Song> g_exp;     // the file as loaded
std::vector<Cell> g_expCells[240];  // its cells with the edits
std::vector<uint8_t> g_expOrder;

bool sameCell(const Cell& a, const Cell& b) { return !std::memcmp(&a, &b, sizeof(Cell)); }
void put32(std::vector<uint8_t>& o, uint32_t v) { for (int k = 0; k < 4; ++k) o.push_back(uint8_t(v >> (8 * k))); }
void putChunk(std::vector<uint8_t>& o, const char* tag, const std::vector<uint8_t>& body) {
  o.insert(o.end(), tag, tag + 4);
  put32(o, uint32_t(body.size()));
  o.insert(o.end(), body.begin(), body.end());
}

// The pattern data as the file stores it: raw, or (packed songs) u32 size + aPLib literals.
std::vector<uint8_t> store(const std::vector<uint8_t>& raw) {
  if (!(g_exp->flags & 0x8000)) return raw;
  std::vector<uint8_t> o;
  put32(o, uint32_t(raw.size()));
  for (size_t i = 0; i < raw.size(); ++i) {
    if (i > 0 && (i - 1) % 8 == 0) o.push_back(0);  // tag byte: eight 0 bits = eight literals
    o.push_back(raw[i]);
  }
  return o;
}

// readPattern's RLE (PATT, param low byte) or readPaex's (PAEX, param high byte; empty when all 0).
std::vector<uint8_t> packCells(const std::vector<Cell>& cells, bool high) {
  std::vector<uint8_t> o;
  if (high) {
    bool any = false;
    for (const Cell& x : cells) any |= (x.param >> 8) != 0;
    if (!any) return o;
  }
  auto key = [high](const Cell& x) {
    Cell k = x;
    if (high) k = Cell(), k.param = uint16_t(x.param >> 8);
    else k.param &= 0xFF;
    return k;
  };
  Cell run;  // the loader's carried cell
  if (high) run = Cell(), run.param = 0;
  size_t at = 0;
  while (at < cells.size()) {
    const Cell x = key(cells[at]);
    size_t count = 1;
    while (at + count < cells.size() && count < 255 && sameCell(key(cells[at + count]), x)) ++count;
    uint8_t b = 0;
    std::vector<uint8_t> f;
    if (high) {
      if (x.param != run.param) b |= 1, f.push_back(uint8_t(x.param));
    } else {
      if (x.note != run.note) b |= 1, f.push_back(x.note);
      if (x.ins != run.ins) b |= 2, f.push_back(x.ins);
      if (x.volcmd != run.volcmd || x.vol != run.vol) b |= 4, f.push_back(x.volcmd), f.push_back(x.vol);
      if (x.pan != run.pan || x.filter != run.filter) b |= 8, f.push_back(x.pan), f.push_back(x.filter);
      if (x.fx != run.fx) b |= 16, f.push_back(uint8_t(x.fx)), f.push_back(uint8_t(x.fx >> 8));
      if (x.param != run.param) b |= 32, f.push_back(uint8_t(x.param));
    }
    if (count > 1) b |= 0x80;
    o.push_back(b);
    o.insert(o.end(), f.begin(), f.end());
    if (count > 1) o.push_back(uint8_t(count));
    run = x;
    at += count;
  }
  return o;
}

bool patternChanged(int p) {
  const std::vector<Cell>& a = g_exp->pat[p].cells;
  const std::vector<Cell>& b = g_expCells[p];
  for (size_t i = 0; i < a.size(); ++i) if (!sameCell(a[i], b[i])) return true;
  return false;
}

// New PATT (+ PAEX) chunks for pattern p; `head` = the old chunk's num/name/rows (empty: none).
void writePattern(std::vector<uint8_t>& o, int p, const uint8_t* head, size_t headLen) {
  std::vector<uint8_t> body;
  if (headLen) body.assign(head, head + headLen);
  else body = {uint8_t(p), 0, uint8_t(g_exp->pat[p].rows), uint8_t(g_exp->pat[p].rows >> 8)};
  const std::vector<uint8_t> data = store(packCells(g_expCells[p], false));
  put32(body, uint32_t(data.size()));
  body.insert(body.end(), data.begin(), data.end());
  putChunk(o, "PATT", body);
  const std::vector<uint8_t> high = packCells(g_expCells[p], true);
  if (high.empty()) return;
  const std::vector<uint8_t> hd = store(high);
  body = {uint8_t(p)};
  put32(body, uint32_t(hd.size()));
  body.insert(body.end(), hd.begin(), hd.end());
  putChunk(o, "PAEX", body);
}

// PORD: count, the positions, then the 255 end mark.
void writeOrder(std::vector<uint8_t>& o) {
  std::vector<uint8_t> b = {uint8_t(g_expOrder.size()), uint8_t(g_expOrder.size() >> 8)};
  b.insert(b.end(), g_expOrder.begin(), g_expOrder.end());
  b.push_back(255);
  putChunk(o, "PORD", b);
}

uint32_t tagAt(const std::vector<uint8_t>& d, size_t pos) {
  return uint32_t(d[pos]) | uint32_t(d[pos + 1]) << 8 | uint32_t(d[pos + 2]) << 16 | uint32_t(d[pos + 3]) << 24;
}
}  // namespace

extern "C" {
EMSCRIPTEN_KEEPALIVE int brt_export_open(const uint8_t* data, int size) {
  g_exp.reset(new Song());
  g_error.clear();
  if (size <= 0 || (size_t)size > MAX_FILE) { g_error = "the file is too big for a BeRoTracker song"; g_exp.reset(); return 0; }
  g_expSrc.assign(data, data + size);
  g_error = load(g_expSrc, *g_exp);
  if (!g_error.empty()) { g_exp.reset(); return 0; }
  for (int p = 0; p < 240; ++p) g_expCells[p] = g_exp->pat[p].cells;
  g_expOrder = orderView(*g_exp);
  return 1;
}

/* One grid cell (tracker numbers, as brt_grid_pattern gives them). A cell that reads the same as
 * the stored one keeps its stored bytes (254 note cuts, other volume commands stay); an edited one
 * keeps the stored pan/filter. 0 when out of range. */
EMSCRIPTEN_KEEPALIVE int brt_export_cell(int p, int r, int c, int note, int ins, int volume, int effTyp, int eff) {
  if (!g_exp || p < 0 || p >= 240 || !g_exp->pat[p].present || r < 0 || r >= g_exp->pat[p].rows || c < 0 || c >= g_exp->channels) return 0;
  const size_t i = size_t(c) * size_t(g_exp->pat[p].rows) + size_t(r);
  const Cell& old = g_exp->pat[p].cells[i];
  int32_t o[7] = {};
  gridCell(old, o);
  if (o[0] == note && o[1] == ins && o[2] == volume && o[3] == effTyp && o[4] == eff) {
    g_expCells[p][i] = old;
  } else {
    Cell x;
    std::memcpy(&x, brt_encode_cell(note, ins, volume, effTyp, eff), sizeof(Cell));
    x.pan = old.pan;
    x.filter = old.filter;
    g_expCells[p][i] = x;
  }
  return 1;
}

/* The order list (pattern numbers 0..239), 1..256 positions; 0 when out of range. */
EMSCRIPTEN_KEEPALIVE int brt_export_order(const uint8_t* order, int length) {
  if (!g_exp || length < 1 || length > 256) return 0;
  for (int k = 0; k < length; ++k) if (order[k] >= 240) return 0;
  g_expOrder.assign(order, order + length);
  return 1;
}

/* Builds the file; returns its bytes (brt_export_size long), null when nothing is open. */
EMSCRIPTEN_KEEPALIVE const uint8_t* brt_export_build(void) {
  g_expOut.clear();
  if (!g_exp) return nullptr;
  const std::vector<uint8_t>& d = g_expSrc;
  bool changed[240];
  for (int p = 0; p < 240; ++p) changed[p] = g_exp->pat[p].present && patternChanged(p);
  const bool orderChanged = g_expOrder != orderView(*g_exp);
  // The last PATT chunk of each pattern number is the one load() keeps.
  size_t last[240] = {};
  for (size_t pos = 8; pos + 8 <= d.size();) {
    uint32_t n;
    std::memcpy(&n, &d[pos + 4], 4);
    if (tagAt(d, pos) == tag4("PATT") && n >= 1 && d[pos + 8] < 240) last[d[pos + 8]] = pos;
    pos += 8 + n;
  }
  g_expOut.assign(d.begin(), d.begin() + 8);
  bool wrote[240] = {}, dropPaex = false, wroteOrder = false;
  size_t pos = 8;
  while (pos + 8 <= d.size()) {
    const uint32_t tag = tagAt(d, pos);
    uint32_t n;
    std::memcpy(&n, &d[pos + 4], 4);
    const uint8_t* body = &d[pos + 8];
    if (tag == tag4("PATT")) dropPaex = false;
    if (tag == tag4("PATT") && n >= 1 && body[0] < 240 && changed[body[0]] && last[body[0]] == pos) {
      const int p = body[0];
      Reader r(body, n);  // num, name, rows: the head the new chunk keeps
      r.u8(); r.str8(); r.u16();
      writePattern(g_expOut, p, body, r.pos);
      wrote[p] = true;
      dropPaex = true;  // this chunk's PAEX was written with it
    } else if (tag == tag4("PAEX") && dropPaex) {
      // dropped: written with its pattern
    } else if (tag == tag4("PORD") && orderChanged) {
      writeOrder(g_expOut);
      wroteOrder = true;
    } else {
      g_expOut.insert(g_expOut.end(), d.begin() + long(pos), d.begin() + long(pos + 8 + n));
    }
    pos += 8 + n;
  }
  g_expOut.insert(g_expOut.end(), d.begin() + long(pos), d.end());  // bytes after the last chunk
  for (int p = 0; p < 240; ++p) if (changed[p] && !wrote[p]) writePattern(g_expOut, p, nullptr, 0);
  if (orderChanged && !wroteOrder) {
    writeOrder(g_expOut);
  }
  return g_expOut.data();
}
EMSCRIPTEN_KEEPALIVE int brt_export_size(void) { return int(g_expOut.size()); }
EMSCRIPTEN_KEEPALIVE void brt_export_close(void) {
  g_exp.reset(); g_expSrc.clear(); g_expOut.clear(); g_expOrder.clear();
  for (auto& c : g_expCells) c.clear();
}
}  // extern "C"
