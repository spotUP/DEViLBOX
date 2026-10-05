// s98_wasm.cpp - S98 register logs (PC-88 / PC-98 / X1 / MSX FM music) for
// DEViLBOX.
//
// An S98 file is a timed log of register writes to up to a few sound chips
// (header: tick = numerator / denominator seconds; device table; command
// stream 00-7F = device*2+port, reg, value; FF = 1 tick; FE = 2 + varint
// ticks; FD = end, loop to the loop offset). The header and command rules
// follow libvgm's player/s98player.cpp. Each device is a ymfm chip (Aaron
// Giles, BSD-3-Clause, used in place from third-party/furnace-master like
// tfm-wasm), run at its native rate and resampled linearly to the output
// rate. The YM2608 rhythm samples are the ADPCM-A ROM image Furnace ships
// (sound/rss.h).
//
// Register writes are spaced one per chip sample, as tfm-wasm does: ymfm
// samples the key state once per sample, so a key-off and key-on logged in
// the same tick would otherwise never retrigger the envelope.
//
// The SN76489 (DCSG, type 16) is not a ymfm chip; a device of that type is
// silent and load reports it.
#include <emscripten.h>

#include <cmath>
#include <cstdint>
#include <cstring>
#include <deque>
#include <memory>
#include <vector>

#include "ymfm_misc.h"
#include "ymfm_opl.h"
#include "ymfm_opm.h"
#include "ymfm_opn.h"
#include "sound/rss.h"

namespace {

enum DevType {
  NONE = 0, PSG_YM = 1, OPN = 2, OPN2 = 3, OPNA = 4, OPM = 5,
  OPLL = 6, OPL = 7, OPL2 = 8, OPL3 = 9, PSG_AY = 15, DCSG = 16,
};

const int MAX_DEVICES = 8;

// YM2608 rhythm (ADPCM-A) reads the internal ROM; ADPCM-B has no RAM here.
class Interface : public ymfm::ymfm_interface {
 public:
  uint8_t ymfm_external_read(ymfm::access_class type, uint32_t address) override {
    if (type == ymfm::ACCESS_ADPCM_A) return YM2608_ADPCM_ROM[address & 0x1fff];
    return 0;
  }
};

struct Write { uint8_t port, reg, val; };

class Device {
 public:
  virtual ~Device() {}
  virtual void Write(uint8_t port, uint8_t reg, uint8_t val) = 0;
  // One native sample, left and right in full scale.
  virtual void Sample(double& l, double& r) = 0;
  uint32_t rate = 0;
  std::deque<::Write> queue;
  double step = 1.0, phase = 1.0;
  double pl = 0, pr = 0, cl = 0, cr = 0;
  Interface intf;
};

const double K = 1.0 / 32768.0;
const double SSG_LEVEL = 0xCD / 256.0;  // libvgm's SSG share beside OPN/OPNA FM

template <class Chip>
class Ymfm : public Device {
 public:
  explicit Ymfm(uint32_t clock, int type) : chip(intf), type(type) {
    chip.reset();
    rate = chip.sample_rate(clock);
  }
  void Write(uint8_t port, uint8_t reg, uint8_t val) override {
    chip.write(port * 2 + 0, reg);
    chip.write(port * 2 + 1, val);
  }
  void Sample(double& l, double& r) override {
    typename Chip::output_data out;
    chip.generate(&out, 1);
    Mix(out, l, r);
  }
  Chip chip;
  int type;

 private:
  void Mix(const typename Chip::output_data& o, double& l, double& r);
};

// ymfm's ym2149 decodes BC2/BC1 from the offset: data goes to offset 2, not 1.
template <> void Ymfm<ymfm::ym2149>::Write(uint8_t, uint8_t reg, uint8_t val) {
  chip.write_address(reg);
  chip.write_data(val);
}

template <> void Ymfm<ymfm::ym2149>::Mix(const ymfm::ym2149::output_data& o, double& l, double& r) {
  l = r = (o.data[0] + o.data[1] + o.data[2]) * K / 3;
}
template <> void Ymfm<ymfm::ym2203>::Mix(const ymfm::ym2203::output_data& o, double& l, double& r) {
  l = r = (o.data[0] + SSG_LEVEL * (o.data[1] + o.data[2] + o.data[3])) * K;
}
template <> void Ymfm<ymfm::ym2608>::Mix(const ymfm::ym2608::output_data& o, double& l, double& r) {
  l = (o.data[0] + SSG_LEVEL * o.data[2]) * K;
  r = (o.data[1] + SSG_LEVEL * o.data[2]) * K;
}
template <> void Ymfm<ymfm::ym2612>::Mix(const ymfm::ym2612::output_data& o, double& l, double& r) {
  l = o.data[0] * K; r = o.data[1] * K;
}
template <> void Ymfm<ymfm::ym2151>::Mix(const ymfm::ym2151::output_data& o, double& l, double& r) {
  l = o.data[0] * K; r = o.data[1] * K;
}
template <> void Ymfm<ymfm::ym2413>::Mix(const ymfm::ym2413::output_data& o, double& l, double& r) {
  l = r = (o.data[0] + o.data[1]) * K;
}
template <> void Ymfm<ymfm::ym3526>::Mix(const ymfm::ym3526::output_data& o, double& l, double& r) {
  l = r = o.data[0] * K;
}
template <> void Ymfm<ymfm::ym3812>::Mix(const ymfm::ym3812::output_data& o, double& l, double& r) {
  l = r = o.data[0] * K;
}
template <> void Ymfm<ymfm::ymf262>::Mix(const ymfm::ymf262::output_data& o, double& l, double& r) {
  l = o.data[0] * K; r = o.data[1] * K;
}

std::unique_ptr<Device> MakeDevice(uint32_t type, uint32_t clock) {
  switch (type) {
    case PSG_YM:
    case PSG_AY: {
      // ymfm's SSG engine advances its tone counters once per clock() and
      // expects to be clocked at the master clock / 8 (ssg_engine's
      // CLOCK_DIVIDER), but ym2149::sample_rate() divides by 8 again: tones
      // came out three octaves low (124 Hz for period 252 at 4 MHz). The
      // S98 clock is halved for both PSG types, as libvgm's s98player does
      // (YM2149 with pin 26 low; AY-3-8910 clock / 2).
      auto* d = new Ymfm<ymfm::ym2149>(clock, type);
      d->rate = clock / 2 / 8;
      return std::unique_ptr<Device>(d);
    }
    case OPN: {
      auto* d = new Ymfm<ymfm::ym2203>(clock, type);
      d->chip.set_fidelity(ymfm::OPN_FIDELITY_MIN);
      d->rate = d->chip.sample_rate(clock);
      return std::unique_ptr<Device>(d);
    }
    case OPNA: {
      auto* d = new Ymfm<ymfm::ym2608>(clock, type);
      d->chip.set_fidelity(ymfm::OPN_FIDELITY_MIN);
      d->rate = d->chip.sample_rate(clock);
      return std::unique_ptr<Device>(d);
    }
    case OPN2: return std::unique_ptr<Device>(new Ymfm<ymfm::ym2612>(clock, type));
    case OPM: return std::unique_ptr<Device>(new Ymfm<ymfm::ym2151>(clock, type));
    case OPLL: return std::unique_ptr<Device>(new Ymfm<ymfm::ym2413>(clock, type));
    case OPL: return std::unique_ptr<Device>(new Ymfm<ymfm::ym3526>(clock, type));
    case OPL2: return std::unique_ptr<Device>(new Ymfm<ymfm::ym3812>(clock, type));
    case OPL3: return std::unique_ptr<Device>(new Ymfm<ymfm::ymf262>(clock, type));
    default: return nullptr;  // DCSG and unknown types: silent
  }
}

uint32_t Le32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

struct State {
  std::vector<uint8_t> file;
  std::vector<uint32_t> types;
  std::vector<std::unique_ptr<Device>> devices;  // null for a silent type
  uint32_t dataOfs = 0, loopOfs = 0, pos = 0;
  double outRate = 48000, samplesPerTick = 480, untilTick = 0;
  uint32_t muteMask = 0xffffffffu;  // bit N set = device N audible
  bool playing = false;
};

State g;

// Run commands until a wait; false when the song ended without a loop.
bool NextTick() {
  const std::vector<uint8_t>& f = g.file;
  for (;;) {
    if (g.pos >= f.size()) return false;
    const uint8_t cmd = f[g.pos++];
    if (cmd == 0xFF) { g.untilTick += g.samplesPerTick; return true; }
    if (cmd == 0xFE) {
      uint32_t n = 0, shift = 0;
      while (g.pos < f.size()) {
        const uint8_t b = f[g.pos++];
        n |= uint32_t(b & 0x7F) << shift;
        shift += 7;
        if (!(b & 0x80) || shift > 28) break;
      }
      g.untilTick += g.samplesPerTick * (2.0 + n);
      return true;
    }
    if (cmd == 0xFD) {
      if (!g.loopOfs || g.loopOfs >= f.size()) return false;
      g.pos = g.loopOfs;
      continue;
    }
    if (g.pos + 2 > f.size()) return false;
    const uint8_t reg = f[g.pos], val = f[g.pos + 1];
    g.pos += 2;
    const size_t dev = cmd >> 1;
    if (dev < g.devices.size() && g.devices[dev]) g.devices[dev]->queue.push_back({uint8_t(cmd & 1), reg, val});
  }
}

void Advance(Device& d) {
  if (!d.queue.empty()) { const ::Write w = d.queue.front(); d.queue.pop_front(); d.Write(w.port, w.reg, w.val); }
  d.pl = d.cl; d.pr = d.cr;
  d.Sample(d.cl, d.cr);
}

// `ch`, when non-null, receives each device's mono signal planar, `stride` floats apart.
int Render(float* out, float* ch, int frames, int stride) {
  if (!g.playing) return 0;
  for (int i = 0; i < frames; ++i) {
    while (g.playing && g.untilTick <= 0.0) {
      if (!NextTick()) g.playing = false;
    }
    if (!g.playing) {
      std::memset(out + i * 2, 0, sizeof(float) * 2 * (frames - i));
      if (ch) for (size_t d = 0; d < g.devices.size(); ++d) std::memset(ch + d * stride + i, 0, sizeof(float) * (frames - i));
      return i;
    }
    g.untilTick -= 1.0;
    double l = 0, r = 0;
    for (size_t n = 0; n < g.devices.size(); ++n) {
      Device* d = g.devices[n].get();
      double dl = 0, dr = 0;
      if (d) {
        while (d->phase >= 1.0) { Advance(*d); d->phase -= 1.0; }
        const double ph = d->phase;
        dl = d->pl + (d->cl - d->pl) * ph;
        dr = d->pr + (d->cr - d->pr) * ph;
        d->phase += d->step;
        if (!((g.muteMask >> n) & 1)) dl = dr = 0;
      }
      l += dl; r += dr;
      if (ch) ch[n * stride + i] = static_cast<float>((dl + dr) * 0.5);
    }
    out[i * 2] = static_cast<float>(l);
    out[i * 2 + 1] = static_cast<float>(r);
  }
  return frames;
}

}  // namespace

extern "C" {

/**
 * Load an S98 file and start it. Returns the number of devices (> 0), or
 * -1 not an S98 file, -2 no device ymfm can play.
 */
EMSCRIPTEN_KEEPALIVE int s98_wasm_load(const uint8_t* data, int len, int sampleRate) {
  g.playing = false;
  g.devices.clear();
  g.types.clear();
  if (!data || len < 0x20 || std::memcmp(data, "S98", 3) != 0) return -1;
  g.file.assign(data, data + len);
  const uint8_t* f = g.file.data();
  const int version = f[3] - '0';
  uint32_t mult = Le32(f + 0x04), div = Le32(f + 0x08);
  if (version == 0) mult = 0;
  if (version <= 1) div = 0;
  if (!mult) mult = 10;
  if (!div) div = 1000;
  g.dataOfs = Le32(f + 0x14);
  g.loopOfs = Le32(f + 0x18);

  std::vector<std::pair<uint32_t, uint32_t>> table;  // type, clock
  if (version == 2) {
    for (uint32_t p = 0x20; p + 16 <= (uint32_t)len && table.size() < MAX_DEVICES; p += 16) {
      if (Le32(f + p) == NONE) break;
      table.push_back({Le32(f + p), Le32(f + p + 4)});
    }
  } else if (version == 3) {
    const uint32_t count = Le32(f + 0x1C);
    for (uint32_t i = 0, p = 0x20; i < count && p + 16 <= (uint32_t)len && table.size() < MAX_DEVICES; ++i, p += 16)
      table.push_back({Le32(f + p), Le32(f + p + 4)});
  }
  if (table.empty()) table.push_back({OPNA, 7987200});

  g.outRate = sampleRate > 0 ? sampleRate : 48000;
  g.samplesPerTick = g.outRate * mult / div;
  bool any = false;
  for (const auto& t : table) {
    g.types.push_back(t.first);
    std::unique_ptr<Device> d = MakeDevice(t.first, t.second);
    if (d) { d->step = d->rate / g.outRate; any = true; }
    g.devices.push_back(std::move(d));
  }
  if (!any) { g.devices.clear(); return -2; }
  g.pos = g.dataOfs;
  g.untilTick = 0;
  g.playing = true;
  return (int)g.devices.size();
}

EMSCRIPTEN_KEEPALIVE int s98_wasm_render(float* out, int frames) { return Render(out, nullptr, frames, 0); }

EMSCRIPTEN_KEEPALIVE int s98_wasm_render_channels(float* out, float* ch, int frames, int stride) {
  return Render(out, ch, frames, stride);
}

/** Bit N set = device N audible - the mixer's solo/mute. */
EMSCRIPTEN_KEEPALIVE void s98_wasm_set_mute_mask(unsigned mask) { g.muteMask = mask; }

EMSCRIPTEN_KEEPALIVE void s98_wasm_free() {
  g.playing = false;
  g.devices.clear();
  g.types.clear();
  g.file.clear();
}

EMSCRIPTEN_KEEPALIVE int s98_wasm_device_count() { return (int)g.devices.size(); }

/** The S98 device type of device `i` (1 YM2149 ... 16 SN76489); 0 out of range. */
EMSCRIPTEN_KEEPALIVE int s98_wasm_device_type(int i) { return i >= 0 && i < (int)g.types.size() ? (int)g.types[i] : 0; }

/** 1 when device `i` sounds (ymfm emulates its type), 0 when silent. */
EMSCRIPTEN_KEEPALIVE int s98_wasm_device_plays(int i) { return i >= 0 && i < (int)g.devices.size() && g.devices[i] ? 1 : 0; }

}  // extern "C"
