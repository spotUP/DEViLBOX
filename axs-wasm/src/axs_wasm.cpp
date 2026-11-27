/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for axs.cpp (AXSF song replayer, clean-room from the format description).
 * The engine runs at 44100 Hz; output goes to the context rate by straight lines between
 * samples. A song that ends stops after the 576-frame block where it ended; a song that jumps
 * back (cmd 28) stops at the length the description reports. */
#include "axs.cpp"

#include <emscripten.h>

#include <memory>
#include <string>
#include <vector>

namespace {
struct Open {
  axs::Song* song = nullptr;
  int rate = 48000;
  long long k = 0, end = 0;  // output frames done; limit (looping songs) or very large
  double stepIn = 1, pos = 0;
  std::vector<int32_t> in = std::vector<int32_t>(2 * 1024);
  std::vector<int16_t> posAt = std::vector<int16_t>(1024), rowAt = std::vector<int16_t>(1024);  // song p / r after each buffered frame
  int have = 0, at = 0;
  bool ended = false;
  float prevL = 0, prevR = 0;
  ~Open() { axs::destroy(song); }
};
std::unique_ptr<Open> g_open;
std::string g_error;
std::vector<int32_t> g_grid;
}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE int axs_open(const uint8_t* data, int size, int rate) {
  g_open.reset();
  g_error.clear();
  if (size <= 0) { g_error = "empty file"; return 0; }
  if (rate < 8000 || rate > 192000) rate = 48000;
  std::unique_ptr<Open> o(new Open);
  o->song = axs::load(data, (size_t)size, g_error);
  if (!o->song) return 0;
  o->rate = rate;
  o->stepIn = 44100.0 / rate;
  o->end = o->song->usesJump ? (long long)axs::lengthMs(o->song) * rate / 1000 : (1LL << 62);
  g_open = std::move(o);
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* axs_error(void) { return g_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int axs_duration_ms(void) { return g_open ? axs::lengthMs(g_open->song) : 0; }
/* Position / row of the last frame handed out, not of the read-ahead buffer end (up to 1024 frames later). */
EMSCRIPTEN_KEEPALIVE int axs_position(void) {
  if (!g_open) return 0;
  const Open& o = *g_open;
  return o.at < o.have ? o.posAt[o.at] : o.song->p;
}
EMSCRIPTEN_KEEPALIVE int axs_row(void) {
  if (!g_open) return 0;
  const Open& o = *g_open;
  return o.at < o.have ? o.rowAt[o.at] : o.song->r;
}
/* Song start tempo for the grid: one tick is 60 / (BPM x 24) s = 2.5 / BPM s, a row is <ticks per row>
 * ticks (tick(), frame()), the tracker's own speed/BPM clock. Ticks per row 0 steps a row every tick. */
EMSCRIPTEN_KEEPALIVE int axs_start_bpm(void) { return g_open ? axs::clampi(g_open->song->shdrBpm, 32, 255) : 125; }
EMSCRIPTEN_KEEPALIVE int axs_start_speed(void) { return g_open ? (g_open->song->shdrTpr > 0 ? g_open->song->shdrTpr : 1) : 6; }

/* Stereo float frames in -1..1; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int axs_render(float* out, int frames) {
  if (!g_open || frames <= 0) return 0;
  Open& o = *g_open;
  int got = 0;
  for (; got < frames && o.k < o.end; o.k++) {
    while (o.pos >= 1.0 || o.at >= o.have) {
      if (o.at < o.have && o.pos >= 1.0) {
        o.prevL = o.in[2 * o.at] / 32768.0f; o.prevR = o.in[2 * o.at + 1] / 32768.0f;
        o.at++; o.pos -= 1.0; continue;
      }
      if (o.ended) break;
      int n = 0;
      for (const int cap = (int)o.in.size() / 2; n < cap && !o.ended; n++) {
        if (!axs::render(o.song, o.in.data() + 2 * n, 1, o.ended)) break;
        o.posAt[n] = (int16_t)o.song->p; o.rowAt[n] = (int16_t)o.song->r;
      }
      o.have = n; o.at = 0;
      if (n == 0) break;
    }
    if (o.at >= o.have) { o.end = o.k; break; }
    const float l = o.in[2 * o.at] / 32768.0f, r = o.in[2 * o.at + 1] / 32768.0f;
    out[2 * got] = o.prevL + (l - o.prevL) * (float)o.pos;
    out[2 * got + 1] = o.prevR + (r - o.prevR) * (float)o.pos;
    o.pos += o.stepIn;
    ++got;
  }
  return got;
}

EMSCRIPTEN_KEEPALIVE void axs_close(void) { g_open.reset(); }

/* The editable grid: int32 [blocks, L, L x order block, then per block: T, R, 16 track bytes
 * (low nibble instrument, high nibble swing), T x R x 4 cell bytes (note, vel, cmd, par), track-major]. */
EMSCRIPTEN_KEEPALIVE const int32_t* axs_grid(void) {
  g_grid.clear();
  if (!g_open) return nullptr;
  const axs::Song& s = *g_open->song;
  g_grid.push_back((int32_t)s.blocks.size());
  g_grid.push_back((int32_t)s.order.size());
  for (uint32_t b : s.order) g_grid.push_back((int32_t)b);
  for (const axs::Block& b : s.blocks) {
    g_grid.push_back(b.T); g_grid.push_back(b.R);
    for (int t = 0; t < 16; t++) g_grid.push_back(b.trk[t]);
    for (int t = 0; t < b.T; t++)
      for (int r = 0; r < b.R; r++) {
        const axs::Cell& c = b.cells[(size_t)t * 256 + r];
        g_grid.insert(g_grid.end(), {c.note, c.vel, c.cmd, c.par});
      }
  }
  return g_grid.data();
}

/* Live edit: set one cell; heard when the sequencer next reads that row. 1 on change. */
EMSCRIPTEN_KEEPALIVE int axs_set_cell(int block, int track, int row, int note, int vel, int cmd, int par) {
  if (!g_open) return 0;
  axs::Song& s = *g_open->song;
  if (block < 0 || block >= (int)s.blocks.size()) return 0;
  axs::Block& b = s.blocks[block];
  if (track < 0 || track >= b.T || row < 0 || row >= b.R) return 0;
  axs::Cell& c = b.at(track, row);
  c.note = (uint8_t)note; c.vel = (uint8_t)vel; c.cmd = (uint8_t)cmd; c.par = (uint8_t)par;
  return 1;
}

/* Live edit in the grid's terms (AxsParser axsCellToTracker read backwards): tracker note 1..96 is
 * stored MIDI + 1 = note + 12, 97 is note off (0xff), 0 empty; volume 0x10..0x4f is velocity / 2;
 * effect type / parameter are the command / parameter as stored. The instrument is the track's
 * (track byte low nibble), so the cell's instrument is not stored. A value that shows the same as
 * the stored one keeps the stored byte (out-of-range notes, odd velocities survive). */
EMSCRIPTEN_KEEPALIVE int axs_set_grid_cell(int block, int track, int row, int note, int instrument, int effTyp, int eff, int volume) {
  (void)instrument;
  if (!g_open) return 0;
  axs::Song& s = *g_open->song;
  if (block < 0 || block >= (int)s.blocks.size()) return 0;
  axs::Block& b = s.blocks[block];
  if (track < 0 || track >= b.T || row < 0 || row >= b.R) return 0;
  const axs::Cell old = b.at(track, row);
  const int oldShown = old.note == 0xff ? 97 : old.note > 0 ? axs::clampi(old.note - 12, 1, 96) : 0;
  int n = old.note;
  if (note != oldShown) n = note == 97 ? 0xff : note >= 1 && note <= 96 ? note + 12 : 0;
  int v = old.vel;
  if (volume >= 0x10 && volume <= 0x4f) { if (volume != 0x10 + (old.vel >> 1)) v = (volume - 0x10) << 1; }
  else if (n > 0 && n != 0xff && old.vel == 0) v = 127;  // a new note without a volume plays full
  return axs_set_cell(block, track, row, n, v, effTyp & 0xff, eff & 0xff);
}

}
