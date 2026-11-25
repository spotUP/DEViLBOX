/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * WebAssembly front for bbmp-synder.cpp (Synder SNG-Player replayer, clean-room by creep).
 * bbmp-synder.cpp and resample.h are kept byte-identical to the bbmp source; the program is
 * included here (its main renamed, its Synth state opened) so the frame position and live
 * edits can reach the unpacked frame data the synthesizer reads. */
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <numeric>
#include <string>
#include <vector>

#define main synder_cli_main
#define private public
#include "bbmp-synder.cpp"
#undef private
#undef main

#include <emscripten.h>

namespace {
// One open song: the Song must outlive the Synth (it keeps a reference) and the Resampler.
struct Player {
  Song song;
  std::unique_ptr<Synth> synth;
  std::unique_ptr<Resampler> rs;   // null when the context runs at the synthesizer's 48000 Hz
  long long left = 0;              // output frames still to come when resampling
};
std::unique_ptr<Player> g_player;
std::string g_error;
std::vector<int16_t> g_pcm;
bool g_tables = false;
}  // namespace

extern "C" {

/* 1 when the song is ready to play at <rate> Hz (48000 native, other rates through resample.h). */
EMSCRIPTEN_KEEPALIVE int synder_open(const uint8_t* data, int size, int rate) {
  g_player.reset();
  g_error.clear();
  if (size <= 0 || (size_t)size > MAX_FILE) { g_error = "the file is too big for a Synder SNG file"; return 0; }
  std::unique_ptr<Player> p(new Player);
  std::vector<uint8_t> file(data, data + size);
  g_error = load(file, p->song);
  if (!g_error.empty()) return 0;
  if (!g_tables) { makeTables(); g_tables = true; }
  p->synth.reset(new Synth(p->song, false));   // the original's sound, fault of section 8a included
  if (rate != SYNTH_RATE) {
    p->rs.reset(new Resampler(SYNTH_RATE, rate, source, p->synth.get()));
    p->left = (long long)(p->synth->total() * (unsigned long long)rate / SYNTH_RATE);
  }
  g_player = std::move(p);
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* synder_error(void) { return g_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int synder_duration_ms(void) {
  return g_player ? (int)(g_player->synth->total() * 1000 / SYNTH_RATE) : 0;
}
EMSCRIPTEN_KEEPALIVE int synder_voices(void) { return g_player ? g_player->song.voices : 0; }
EMSCRIPTEN_KEEPALIVE int synder_frames(void) { return g_player ? (int)g_player->song.frames : 0; }
EMSCRIPTEN_KEEPALIVE int synder_frame_rate(void) { return g_player ? g_player->song.rate : 0; }

/* The frame taken up last (0..T-1). */
EMSCRIPTEN_KEEPALIVE int synder_position(void) {
  if (!g_player) return 0;
  const Synth& s = *g_player->synth;
  return s.n_ == 0 ? 0 : (int)((s.n_ - 1) / s.spf_);
}

/* Live edit: write bytes at an offset into the UNPACKED frame data (planar, section 4: plane k,
 * voice v, frame f at k*T*V + v*T + f). Heard when that frame is next taken up; no reopen. */
EMSCRIPTEN_KEEPALIVE int synder_poke(int offset, const uint8_t* bytes, int count) {
  if (!g_player || offset < 0 || count < 0 || (size_t)offset + (size_t)count > g_player->song.data.size()) return 0;
  std::memcpy(g_player->song.data.data() + offset, bytes, (size_t)count);
  return 1;
}

/* Stereo float frames in -1..1; returns how many were written, fewer than asked at the end. */
EMSCRIPTEN_KEEPALIVE int synder_render(float* out, int frames) {
  if (!g_player || frames <= 0) return 0;
  Player& p = *g_player;
  if ((int)g_pcm.size() < frames * 2) g_pcm.resize(frames * 2);
  int got = 0;
  if (!p.rs) {
    while (got < frames && !p.synth->done()) p.synth->sample(&g_pcm[2 * got++]);
  } else {
    while (got < frames && p.left > 0) { p.rs->frame(&g_pcm[2 * got++]); --p.left; }
  }
  for (int i = 0; i < got * 2; i++) out[i] = g_pcm[i] / 32768.0f;
  return got;
}

EMSCRIPTEN_KEEPALIVE void synder_close(void) { g_player.reset(); }

}
