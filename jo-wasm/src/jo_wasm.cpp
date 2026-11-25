// jo_wasm.cpp - WASM glue for the bbmp Jesper Olsen replayer (src/jo_engine.cpp, kept
// verbatim) driving ScummVM's Paula. Plays LollyPop, Georg Glaxo and Harald Hardtand
// songs; the guldkornsexpressen songs (first word 0x6000) carry their own routine and
// are refused, so they stay on another engine.
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include <emscripten/emscripten.h>

#include "engine.h"
#include "common/scummsys.h"
#include "audio/mixer.h"
#include "audio/mods/paula.h"

// Live edits write into the driver's copy of the song, which the verbatim source keeps
// private; every header it needs is already included above, so only its classes open up.
#define private public
#include "jo_engine.cpp"
#undef private


static EngineEntry* g_engines = nullptr;
EngineEntry::EngineEntry(const char* n, Engine* (*m)()) : name(n), make(m), next(g_engines) { g_engines = this; }
Engine* make_engine(const std::string&) { return nullptr; }
std::string to_utf8(const std::string& text) { return text; }
bool debug_on() { return false; }

static std::unique_ptr<JoEngine> g_engine;
static std::string g_error;
static SongInfo g_info;
static std::vector<int16_t> g_pcm;

extern "C" {

// Opens <len> song bytes at <data> on subsong <track>, rendering at <rate> Hz. 1 on success.
EMSCRIPTEN_KEEPALIVE int jo_open(const uint8_t* data, int len, int track, int rate) {
  g_engine.reset(new JoEngine);
  g_info = SongInfo();
  g_error.clear();
  const std::vector<uint8_t> file(data, data + len);
  if (!g_engine->open("", file, track, rate, g_info, g_error)) { g_engine.reset(); return 0; }
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* jo_error() { return g_error.c_str(); }
EMSCRIPTEN_KEEPALIVE int jo_tracks() { return g_info.tracks; }
// 0 LollyPop, 1 Georg Glaxo, 2 Harald Hardtand (the engine's Kind order); -1 when closed.
EMSCRIPTEN_KEEPALIVE int jo_kind() { return g_engine ? static_cast<int>(g_engine->kind_) : -1; }
// Driver ticks (50 Hz frames) played since open.
EMSCRIPTEN_KEEPALIVE int jo_ticks() { return g_engine ? static_cast<int>(g_engine->ticks_done_) : 0; }

// Writes up to <frames> interleaved stereo float frames; fewer means the song ended.
EMSCRIPTEN_KEEPALIVE int jo_render(float* out, int frames) {
  if (!g_engine || frames <= 0) return 0;
  g_pcm.resize(static_cast<size_t>(frames) * 2);
  const size_t got = g_engine->render(g_pcm.data(), static_cast<size_t>(frames));
  for (size_t i = 0; i < got * 2; ++i) out[i] = g_pcm[i] / 32768.0f;
  return static_cast<int>(got);
}

// Live edit: copies <n> bytes into the playing song at file offset <offset>. The driver
// reads patterns and samples from this copy, so the change is heard on the next read.
EMSCRIPTEN_KEEPALIVE int jo_poke(int offset, const uint8_t* bytes, int n) {
  if (!g_engine || !g_engine->driver_ || offset < 0 || n < 0) return 0;
  Memory& m = g_engine->driver_->memory();
  if (static_cast<int64_t>(offset) + n > static_cast<int64_t>(m.size)) return 0;
  std::memcpy(m.d.data() + offset, bytes, static_cast<size_t>(n));
  return 1;
}

EMSCRIPTEN_KEEPALIVE void jo_close() { g_engine.reset(); }

}  // extern "C"
