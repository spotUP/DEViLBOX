// tfm_wasm.cpp - TFM Music Maker (.tfe) for DEViLBOX.
//
// ZXTune's TFM Music Maker player (tfm_player.cpp, GPL-3.0) feeds two YM2203
// (ymfm by Aaron Giles, BSD-3-Clause, from third-party/furnace-master) at
// 3.5 MHz, the TurboFM clock ZXTune uses. Channels 0-2 are chip 0, 3-5 chip 1;
// the chips are summed and halved and played mono, as ZXTune's
// devices/fm/tfm.cpp does. The FM engine runs at its native rate
// (clock / 72 = 48611 Hz) and is resampled linearly to the output rate.
//
// Register writes are spaced one per FM sample (~20 us), as the Spectrum's
// Z80 OUT sequence spaces them on the real bus. ymfm samples the key state
// once per FM sample, so ZXTune's key-off + key-on pair for a new note,
// applied at one instant, never retriggered the envelope: every channel held
// its first note and decayed to silence after half a second.
#include <emscripten.h>

#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>

#include "tfm_player.h"
#include "ymfm_opn.h"
// The fm_engine template bodies; ymfm_opn.cpp only emits what it inlines.
#include "ymfm_fm.ipp"

namespace {

const uint32_t CLOCK = 3500000;
const double FRAME_RATE = 50.0;

class Chip : public ymfm::ym2203 {
 public:
  explicit Chip(ymfm::ymfm_interface& intf) : ymfm::ym2203(intf) {}
  // One FM sample of the channels in `mask` (bit 0..2), 14-bit through the DAC.
  int32_t Clock(uint32_t mask) {
    m_fm.clock(fm_engine::ALL_CHANNELS);
    ymfm::ymfm_output<1> out;
    m_fm.output(out.clear(), 0, 32767, mask);
    out.roundtrip_fp();
    return out.data[0];
  }
  uint32_t FmRate(uint32_t clock) const { return m_fm.sample_rate(clock); }
};

struct State {
  ymfm::ymfm_interface intf0, intf1;
  std::unique_ptr<Chip> chips[2];
  tfm::Module module;
  std::unique_ptr<tfm::Player> player;
  tfm::Registers regs;
  size_t regsNext = 0;   // next pending write of this frame
  double outRate = 48000.0;
  double fmRate = 48611.0;
  double fmStep = 1.0;    // FM samples per output sample
  double fmPhase = 1.0;   // position between prev and cur FM sample
  double prev = 0.0, cur = 0.0;
  double frameSamples = 960.0;
  double untilFrame = 0.0;
  uint32_t muteMask = 0x3f;  // bit N set = channel N audible
  bool playing = false;
};

State* g = nullptr;

void ResetChips() {
  for (int c = 0; c < 2; ++c) {
    g->chips[c].reset(new Chip(c ? g->intf1 : g->intf0));
    g->chips[c]->reset();
  }
  g->fmRate = g->chips[0]->FmRate(CLOCK);
  g->fmStep = g->fmRate / g->outRate;
  g->fmPhase = 1.0;
  g->prev = g->cur = 0.0;
  g->untilFrame = 0.0;
  g->regs.clear();
  g->regsNext = 0;
}

void ApplyWrite(const tfm::Reg& r) {
  Chip& chip = *g->chips[r.chip];
  chip.write(0, r.idx);
  chip.write(1, r.val);
}

double NextFmSample() {
  if (g->regsNext < g->regs.size()) ApplyWrite(g->regs[g->regsNext++]);
  const int32_t a = g->chips[0]->Clock(g->muteMask & 7);
  const int32_t b = g->chips[1]->Clock((g->muteMask >> 3) & 7);
  return (a + b) / 2 / 32768.0;
}

void RunFrame() {
  // A frame never carries more writes than it has FM samples; if one did,
  // its tail lands now, before the next frame's.
  while (g->regsNext < g->regs.size()) ApplyWrite(g->regs[g->regsNext++]);
  g->regs.clear();
  g->regsNext = 0;
  g->player->Frame(g->regs);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE void tfm_wasm_init(int sampleRate) {
  if (!g) g = new State();
  g->outRate = sampleRate > 0 ? sampleRate : 48000;
  g->frameSamples = g->outRate / FRAME_RATE;
  g->playing = false;
}

/** 0 = playing; -1 = not initialised; -2 = not a TFM Music Maker file. */
EMSCRIPTEN_KEEPALIVE int tfm_wasm_load(const uint8_t* data, int size) {
  if (!g) return -1;
  g->player.reset();
  g->module = tfm::Module();
  if (!tfm::Parse(data, size, g->module)) { g->playing = false; return -2; }
  g->player.reset(new tfm::Player(g->module));
  ResetChips();
  g->playing = true;
  return 0;
}

/** Interleaved stereo float into `out`; returns frames written. */
EMSCRIPTEN_KEEPALIVE int tfm_wasm_render(float* out, int frames) {
  if (!g || !g->playing) {
    std::memset(out, 0, sizeof(float) * 2 * frames);
    return frames;
  }
  for (int i = 0; i < frames; ++i) {
    if (g->untilFrame <= 0.0) {
      RunFrame();
      g->untilFrame += g->frameSamples;
    }
    g->untilFrame -= 1.0;
    while (g->fmPhase >= 1.0) {
      g->prev = g->cur;
      g->cur = NextFmSample();
      g->fmPhase -= 1.0;
    }
    const float v = static_cast<float>(g->prev + (g->cur - g->prev) * g->fmPhase);
    g->fmPhase += g->fmStep;
    out[i * 2] = v;
    out[i * 2 + 1] = v;
  }
  return frames;
}

/** Bit N set = TFM channel N (0-5) audible - the mixer's solo/mute. */
EMSCRIPTEN_KEEPALIVE void tfm_wasm_set_mute_mask(int mask) {
  if (g) g->muteMask = static_cast<uint32_t>(mask) & 0x3f;
}

EMSCRIPTEN_KEEPALIVE void tfm_wasm_stop() {
  if (g) g->playing = false;
}

EMSCRIPTEN_KEEPALIVE int tfm_wasm_get_position() { return g && g->player ? g->player->Position() : -1; }
EMSCRIPTEN_KEEPALIVE int tfm_wasm_get_line() { return g && g->player ? g->player->Line() : -1; }

}  // extern "C"
