/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for smx_engine.cpp (SCC-Musixx replayer, clean-room by creep, driving
 * emu2212). smx_engine.cpp is kept byte-identical to the bbmp source; it is included here so
 * its replay state is visible for the position display and live edits. */
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "emu2212.h"
#include "engine.h"

// The engine's Replay / SccMusixx keep their state private; open it up for this one file only.
#define private public
#include "smx_engine.cpp"
#undef private

#include <emscripten.h>

namespace retro {
void register_engine(const char*, EngineMaker) {}
std::string field(const void* p, size_t size) {
  const char* s = static_cast<const char*>(p);
  size_t n = 0;
  while (n < size && s[n]) n++;
  while (n > 0 && s[n - 1] == ' ') n--;
  return std::string(s, n);
}
}  // namespace retro

static std::unique_ptr<SccMusixx> g_engine;
static std::string g_error;
static long long g_duration_ms = 0;
static int g_last_pos = -1;
static std::vector<int16_t> g_pcm;

extern "C" {

/* 1 when the song is ready to play at <rate> Hz (the engine renders at any rate). */
EMSCRIPTEN_KEEPALIVE int smx_open(const uint8_t* data, int size, int rate) {
  g_engine.reset(new SccMusixx);
  g_last_pos = -1;
  SongInfo info;
  g_error.clear();
  std::vector<uint8_t> file(data, data + size);
  if (!g_engine->open(file, "/song.sng", 0, rate, info, g_error)) {
    g_engine.reset();
    return 0;
  }
  g_duration_ms = info.duration_ms;
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* smx_error(void) { return g_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int smx_duration_ms(void) { return g_engine ? (int)g_duration_ms : 0; }

/* The position (order index) whose row was read last: (position << 8) | row-in-pattern. */
EMSCRIPTEN_KEEPALIVE int smx_position(void) {
  if (!g_engine || !g_engine->replay_) return 0;
  const Replay& r = *g_engine->replay_;
  if (r.row_ > 0) { g_last_pos = r.position_; return (r.position_ << 8) | (r.row_ - 1); }
  // row_ 0: the pattern's last row was read and the next position already entered.
  return g_last_pos < 0 ? (r.position_ << 8) : ((g_last_pos << 8) | 63);
}

/* Live edit: write song bytes at a file offset into the image the replayer reads. Exact:
 * a pattern cell is heard the next time its row is read, a wave the next time it is loaded. */
EMSCRIPTEN_KEEPALIVE int smx_poke(int offset, const uint8_t* bytes, int count) {
  if (!g_engine || offset < 0 || count < 0 || offset + count > (int)g_engine->image_.size()) return 0;
  std::memcpy(g_engine->image_.data() + offset, bytes, (size_t)count);
  return 1;
}

/* Stereo float frames in -1..1; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int smx_render(float* out, int frames) {
  if (!g_engine) return 0;
  if ((int)g_pcm.size() < frames * 2) g_pcm.resize(frames * 2);
  const int got = (int)g_engine->render(g_pcm.data(), (size_t)frames);
  for (int i = 0; i < got * 2; i++) out[i] = g_pcm[i] / 32768.0f;
  return got;
}

EMSCRIPTEN_KEEPALIVE void smx_close(void) { g_engine.reset(); }

}
