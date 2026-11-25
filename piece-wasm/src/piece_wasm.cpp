/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for piece.cpp (Aquaplus P/ECE music driver replayer, clean-room by creep,
 * bbmp-replayers/piece). piece.cpp and piece.h are kept byte-identical to the bbmp source;
 * piece.cpp is included here so the play position and live edits reach Song::d, the command
 * bytes the sequencer reads (step() reads d[p.pos] for every command).
 *
 * Output follows bbmp-piece.cpp (the reference recordings were made with it): 16 kHz mono
 * from render16k, to the context rate by straight lines between samples, rounded to 16 bits,
 * the same sample on both sides; a song that starts over plays to where every part has
 * started over once, then 8 seconds more, fading out. */
#include "piece.cpp"
#include "piece_edit.h"
#include "piece_grid.h"

#include <emscripten.h>

#include <memory>
#include <string>
#include <vector>

namespace {
constexpr double FADE = 8.0;  // bbmp-piece.cpp

struct Open {
  piece::Song* song = nullptr;
  int rate = 48000;
  long long k = 0, end = 0, fadeFrom = 0;  // output frames: done, total, where the fade starts
  double stepIn = 1, pos = 0;              // input samples per output frame; position after in[at]
  std::vector<float> in = std::vector<float>(4096);
  size_t have = 0, at = 0;
  bool ended = false;
  float prev = 0;
  ~Open() { piece::destroy(song); }
};
std::unique_ptr<Open> g_open;
std::string g_error;
}  // namespace

extern "C" {

/* 1 when the song is ready to play at <rate> Hz. */
EMSCRIPTEN_KEEPALIVE int piece_open(const uint8_t* data, int size, int rate) {
  g_open.reset();
  g_error.clear();
  if (size <= 0) { g_error = "empty file"; return 0; }
  if (rate < 8000 || rate > 192000) rate = 48000;
  const std::vector<uint8_t> file(data, data + size);
  std::unique_ptr<Open> o(new Open);
  o->song = piece::load(file, g_error);
  if (!o->song) return 0;
  const piece::Length len = piece::measure(file);
  const double total = len.seconds + (len.loops ? FADE : 0);
  o->end = static_cast<long long>(total * rate);
  o->fadeFrom = len.loops ? static_cast<long long>(len.seconds * rate) : o->end;
  o->stepIn = 16000.0 / rate;
  o->rate = rate;
  g_open = std::move(o);
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* piece_error(void) { return g_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int piece_parts(void) { return g_open ? piece::parts(g_open->song) : 0; }
EMSCRIPTEN_KEEPALIVE int piece_duration_ms(void) {
  if (!g_open) return 0;
  return static_cast<int>(g_open->end * 1000 / g_open->rate);
}

/* Where the sequencer is: driver ticks since the start (24 a quarter note at the song's tempo). */
EMSCRIPTEN_KEEPALIVE int piece_ticks(void) { return g_open ? static_cast<int>(g_open->song->ticks) : 0; }
/* The byte offset part <i> reads its next command from (0 when the part is unused). */
EMSCRIPTEN_KEEPALIVE int piece_part_pos(int i) {
  if (!g_open || i < 0 || i >= piece::PARTS || !g_open->song->part[i].used) return 0;
  return static_cast<int>(g_open->song->part[i].pos);
}

/* Live edit: overwrite <count> bytes of the song file at <offset> (Song::d is the file as loaded,
 * so a file offset is a Song::d offset). Heard when a part next reads those bytes. */
EMSCRIPTEN_KEEPALIVE int piece_poke(int offset, const uint8_t* bytes, int count) {
  if (!g_open || offset < 0 || count < 0) return 0;
  std::vector<uint8_t>& d = g_open->song->d;
  if ((size_t)offset + (size_t)count > d.size()) return 0;
  std::memcpy(d.data() + offset, bytes, (size_t)count);
  return 1;
}

/* Stereo float frames in -1..1; returns how many were written, fewer than asked at the end.
 * The loop of bbmp-piece.cpp main(), made resumable. */
EMSCRIPTEN_KEEPALIVE int piece_render(float* out, int frames) {
  if (!g_open || frames <= 0) return 0;
  Open& o = *g_open;
  int got = 0;
  for (; got < frames && o.k < o.end; o.k++) {
    while (o.pos >= 1.0 || o.at >= o.have) {
      if (o.at < o.have && o.pos >= 1.0) {
        o.prev = o.in[o.at];
        o.at++;
        o.pos -= 1.0;
        continue;
      }
      if (o.ended) break;
      const int n = piece::render16k(o.song, o.in.data(), static_cast<int>(o.in.size()));
      o.have = static_cast<size_t>(n);
      o.at = 0;
      if (n < static_cast<int>(o.in.size())) o.ended = true;
      if (n == 0) break;
    }
    if (o.at >= o.have) { o.end = o.k; break; }  // the song has ended
    double v = o.prev + (o.in[o.at] - o.prev) * o.pos;
    o.pos += o.stepIn;
    if (o.k > o.fadeFrom) v *= 1.0 - double(o.k - o.fadeFrom) / (o.end - o.fadeFrom);
    const long s = std::lround(std::fmax(-1.0, std::fmin(1.0, v)) * 32767.0);
    out[2 * got] = out[2 * got + 1] = s / 32768.0f;
    ++got;
  }
  return got;
}

EMSCRIPTEN_KEEPALIVE void piece_close(void) { g_open.reset(); }

/* The song file as edited (Song::d). */
EMSCRIPTEN_KEEPALIVE const uint8_t* piece_data(void) { return g_open ? g_open->song->d.data() : nullptr; }
EMSCRIPTEN_KEEPALIVE int piece_data_size(void) { return g_open ? static_cast<int>(g_open->song->d.size()) : 0; }

}

namespace {
std::vector<int32_t> g_grid;

/* Take <d> as the song. Same size (byte edits): written into Song::d, heard when a part next
 * reads it. Other size (pointers moved): reopened, then run up to the output frame it was at.
 * shortcut: the run-up renders the song from the start (a dropout on a long song), upgrade to a
 * sequencer-only seek in piece.cpp if size-changing edits during playback must be seamless. */
int take(std::vector<uint8_t>& d) {
  if (!g_open) return 0;
  if (d.size() == g_open->song->d.size()) { g_open->song->d.swap(d); return 1; }
  const long long k = g_open->k;
  const int rate = g_open->rate;
  if (!piece_open(d.data(), static_cast<int>(d.size()), rate)) return 0;
  std::vector<float> tmp(2 * 1024);
  while (g_open->k < k) {
    const int n = static_cast<int>(std::min<long long>(1024, k - g_open->k));
    if (piece_render(tmp.data(), n) < n) break;
  }
  return 1;
}
}  // namespace

extern "C" {

/* The editable grid (piece_grid.h): int32 [rowTicks, ticks, tempo, count, then count x
 * (part, tick, len, note, inst, vol, tempo)]; inst/vol/tempo -1 when not set at that event. */
EMSCRIPTEN_KEEPALIVE const int32_t* piece_grid(void) {
  g_grid.clear();
  if (!g_open) return nullptr;
  const piece::Grid g = piece::buildGrid(g_open->song->d);
  g_grid = {g.rowTicks, g.ticks, g.tempo, static_cast<int32_t>(g.events.size())};
  for (const piece::GridEvent& e : g.events)
    g_grid.insert(g_grid.end(), {e.part, e.tick, e.len, e.note, e.inst, e.vol, e.tempo});
  return g_grid.data();
}

/* Write tracker note <note> (0 / 97 rest, 1..96) into part <part> at grid row <row>; 1 when the
 * song changed (piece_error says why not). */
EMSCRIPTEN_KEEPALIVE int piece_edit_cell(int part, int row, int note) {
  if (!g_open) return 0;
  std::vector<uint8_t> d = g_open->song->d;
  g_error.clear();
  if (!piece::editCell(d, part, row, note, g_error)) return 0;
  return take(d);
}

/* Replace the playing song with an edited copy of it (bytes from piece_data of another instance). */
EMSCRIPTEN_KEEPALIVE int piece_replace(const uint8_t* data, int size) {
  if (size <= 0) return 0;
  std::vector<uint8_t> d(data, data + size);
  return take(d);
}

/* Splice: replace <oldLen> bytes at <off> with <n> bytes and fix every pointer (piece_edit.h). */
EMSCRIPTEN_KEEPALIVE int piece_splice(int off, int oldLen, const uint8_t* bytes, int n) {
  if (!g_open || off < 0 || oldLen < 0 || n < 0) return 0;
  std::vector<uint8_t> d = g_open->song->d;
  g_error.clear();
  if (!piece::splice(d, off, oldLen, bytes, n, g_error)) return 0;
  return take(d);
}

}
