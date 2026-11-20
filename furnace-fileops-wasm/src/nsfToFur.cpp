/**
 * nsfToFur.cpp - NSF to editable Furnace song (NSF import, Phase 2).
 *
 * Runs the NSF (or NSFe) in game-music-emu's Nsf_Emu (compiled into this module as the
 * static library gme_nsf), records the per-PLAY-call voice state with the
 * shared Nsf_Trace (game-music-emu-wasm/src/nsf_trace.h), and turns it into a
 * DivSong: one channel per voice (2A03 + DPCM, then VRC6, VRC7, FDS, MMC5,
 * N163, S5B when the NSF header names them). Compaction (Phase 3): the song
 * speed S is the largest frames-per-row that divides >= 85% of the gaps
 * between note onsets in the median channel (see the row grid comment); each note's per-frame volume/arpeggio/fine pitch/duty becomes
 * instrument macros (shared by content), off-grid onsets get EDxx, identical
 * pattern blocks share an index. fur_save then writes it, so the import goes
 * through the one .fur load path.
 *
 * Conversion logic (when a voice counts as playing, which register change
 * starts a note, period to pitch per chip, DPCM sample capture) follows
 * FamiStudio NsfFile.cs Load/UpdateChannel (MIT, BleuBleu). Pitch is written
 * as the nearest note plus a pitch macro (linear pitch: 1/128 semitone).
 */

#include <memory>
#include "engine.h"
#include "Nsfe_Emu.h"
#include "nsf_trace.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <map>
#include <numeric>
#include <string>
#include <vector>

namespace {

const double kCpu = 1789773.0;

struct Ctx {
  std::vector<uint16_t> w;               // trace records, kTraceWords each
  std::vector<int> dpcmTrig;             // per record: sample index started, or -1
  std::vector<std::vector<uint8_t>> pcm; // distinct DPCM sample bytes
  std::vector<bool> pcmLoop;
  int prevLeft = 0, prevPlay = 0;
};

void hook(Nsf_Emu* e, void* data) {
  Ctx& c = *static_cast<Ctx*>(data);
  Nsf_Trace::snap(e, &c.w);
  const uint16_t* o = &c.w[c.w.size() - kTraceWords];
  const int left = o[T_DMC + 4], play = o[T_DMC + 7];
  int trig = -1;
  if (play && (!c.prevPlay || left > c.prevLeft)) {
    // $4012/$4013 give start and length; read through the current bank mapping
    const int start = 0xC000 + o[T_DMC + 2] * 64, len = o[T_DMC + 3] * 16 + 1;
    std::vector<uint8_t> bytes;
    for (int i = 0; i < len; i++) bytes.push_back((uint8_t)Nsf_Trace::read(e, (start + i) & 0xFFFF | 0x8000));
    const bool loop = (o[T_DMC] & 0x40) != 0;
    for (size_t k = 0; k < c.pcm.size() && trig < 0; k++)
      if (c.pcm[k] == bytes && c.pcmLoop[k] == loop) trig = (int)k;
    if (trig < 0) { trig = (int)c.pcm.size(); c.pcm.push_back(bytes); c.pcmLoop.push_back(loop); }
  }
  c.dpcmTrig.push_back(trig);
  c.prevLeft = left; c.prevPlay = play;
}

// Furnace note value (60 = C-0, 105 = A-4 at 440 Hz under calcBaseFreq) and fine pitch.
bool hzToNote(double f, int& note, int& fine) {
  if (!(f > 8.0) || f > 20000.0) return false;
  const double n = 105.0 + 12.0 * std::log2(f / 440.0);
  note = (int)std::lround(n);
  fine = (int)std::lround((n - note) * 128.0);
  if (note < 0 || note > 179) return false;
  return true;
}

// Furnace's 2A03/MMC5 period for a linear-pitch offset (note*128+fine): DivPitchTable
// (engine/pitchTable.cpp, tuning 440, clock COLOR_NTSC/2, divider 16, max 0x800) then
// freq-- (platform/nes.cpp). Furnace interpolates the period linearly inside a semitone
// from rounded per-semitone roots, so a continuous log2 fine misses by one step.
struct FurPeriodTable {
  int pitch[13], diff[12], shift = 0;
  FurPeriodTable() {
    const double clock = 315000000.0 / 88.0 / 2.0, tun = 440.0 * 0.0625;
    auto bf = [&](int nbase) { return (int)std::lround((clock / (tun * std::pow(2.0, (double)(float)(nbase + 3) / 12.0))) / 16.0); };
    while (shift < 14 && bf((shift - 4) * 12) > 0x800) shift++;
    for (int i = 0; i <= 12; i++) pitch[i] = bf(i + (shift - 5) * 12);
    for (int i = 0; i < 12; i++) diff[i] = pitch[i + 1] - pitch[i];
  }
  static int shr(int v, int o) { const bool c = v & (1 << (o - 1)); v >>= o; return c ? v + 1 : v; }
  int reg(int off) const {
    const int coarse = std::max(0, off >> 7), fine = off & 127, oct = coarse / 12 - shift;
    if (oct < 0) return 0x7ff;
    int root = pitch[coarse % 12], d = diff[coarse % 12];
    if (oct > 0) { root = shr(root, oct); d = shr(d, oct); }
    return std::clamp(root + ((d * fine) >> 7) - 1, 0, 0x7ff);
  }
};

// Note and fine whose Furnace 2A03/MMC5 period register equals p (nearest to the log2 estimate).
bool periodToNote(int p, int& note, int& fine) {
  static const FurPeriodTable t;
  if (!hzToNote(kCpu / (16.0 * (p + 1)), note, fine)) return false;
  const int est = note * 128 + fine;
  int best = est, bestD = 1 << 30;
  for (int off = std::max(0, est - 256); off <= est + 256; off++)
    if (t.reg(off) == p && std::abs(off - est) < bestD) { bestD = std::abs(off - est); best = off; }
  note = (best + 64) >> 7; fine = best - note * 128;
  return note >= 0 && note <= 179;
}

enum Kind { K_SQ, K_TRI, K_NOISE, K_DPCM, K_VRC6_SQ, K_VRC6_SAW, K_VRC7, K_FDS, K_MMC5_SQ, K_N163, K_S5B };

struct Chan { Kind kind; int idx; };

// One voice in one frame.
struct V { bool on = false; int note = 0, fine = 0, vol = -1, duty = -1; bool trig = false; };

struct Builder {
  DivSong& song;
  std::map<std::string, int> insByKey, waveByKey;
  std::vector<DivInstrument*> tmpl; // per-voice timbre templates; song instruments are copies with macros
  int n163Chans = 1;
  explicit Builder(DivSong& s): song(s) {}

  int wave(const std::vector<int>& data, int max) {
    std::string k(reinterpret_cast<const char*>(data.data()), data.size() * sizeof(int));
    k += (char)max;
    auto it = waveByKey.find(k);
    if (it != waveByKey.end()) return it->second;
    DivWavetable* w = new DivWavetable;
    w->len = (int)data.size(); w->max = max;
    for (size_t i = 0; i < data.size(); i++) w->data[i] = data[i];
    song.wave.push_back(w);
    return waveByKey[k] = (int)song.wave.size() - 1;
  }

  // Template for a content key; make() fills a new one. Returns the template index.
  template<class F> int ins(const std::string& key, F make) {
    auto it = insByKey.find(key);
    if (it != insByKey.end()) return it->second;
    DivInstrument* i = new DivInstrument;
    make(*i);
    tmpl.push_back(i);
    return insByKey[key] = (int)tmpl.size() - 1;
  }
  ~Builder() { for (DivInstrument* i: tmpl) delete i; }
};

void macro1(DivInstrumentMacro& m, int v) { m.len = 1; m.val[0] = v; }

// Macro value at tick t after note on: loops from m.loop when set, else holds the last value.
int macroAt(const DivInstrumentMacro& m, int t) {
  if (!m.len) return 0;
  if (t < m.len) return m.val[t];
  if (m.loop < m.len) return m.val[m.loop + (t - m.len) % (m.len - m.loop)];
  return m.val[m.len - 1];
}

int g_nsfStats[16]; // last nsfBuildSong: see nsf_get_stat

int pulseIns(Builder& b, const char* chip, DivInstrumentType t) {
  return b.ins(std::string(chip) + " pulse", [&](DivInstrument& i) { i.type = t; i.name = std::string(chip) + " pulse"; });
}

// Voice state for channel ch in record o; insOut gets the timbre template index.
V voice(Builder& b, const Chan& ch, const uint16_t* o, const uint16_t* prev, int dpcmTrig, int& insOut, const Ctx& c) {
  V v;
  insOut = -1;
  switch (ch.kind) {
    case K_SQ: case K_MMC5_SQ: {
      const uint16_t* s = o + (ch.kind == K_SQ ? (ch.idx ? T_SQ2 : T_SQ1) : T_MMC5 + ch.idx * 8);
      const int period = s[7], vol = s[5];
      if (!s[6] || !vol || period < 8) break;
      if (!periodToNote(period, v.note, v.fine)) break;
      v.on = true; v.vol = vol;
      insOut = pulseIns(b, ch.kind == K_SQ ? "2A03" : "MMC5", DIV_INS_NES); v.duty = s[0] >> 6;
      break;
    }
    case K_TRI: {
      const uint16_t* s = o + T_TRI;
      if (!s[6] || !s[4] || !s[5] || s[7] < 2) break;
      if (!periodToNote(s[7], v.note, v.fine)) break; // Furnace writes the same table to $400A/B
      v.on = true; v.vol = 15; // triangle: on/off only
      insOut = b.ins("2A03 triangle", [](DivInstrument& i) { i.type = DIV_INS_NES; i.name = "2A03 triangle"; });
      break;
    }
    case K_NOISE: {
      const uint16_t* s = o + T_NOISE;
      if (!s[6] || !s[5]) break;
      // properNoiseLayout: period index = 15 - (note-60 & 15)
      v.note = 108 + 15 - (s[2] & 15); v.fine = 0; v.on = true; v.vol = s[5];
      const int mode = s[2] >> 7;
      v.duty = mode;
      insOut = b.ins("2A03 noise", [&](DivInstrument& i) { i.type = DIV_INS_NES; i.name = "2A03 noise"; });
      break;
    }
    case K_DPCM: {
      if (dpcmTrig < 0) { v.on = prev != nullptr; v.note = -1; break; } // hold; DPCM ends by itself
      v.on = true; v.trig = true; v.note = 60 + (o[T_DMC] & 15); v.fine = 0;
      const int smp = dpcmTrig;
      insOut = b.ins("DPCM " + std::to_string(smp), [&](DivInstrument& i) {
        i.type = DIV_INS_NES; i.name = "DPCM " + std::to_string(smp + 1); i.amiga.initSample = smp;
      });
      break;
    }
    case K_VRC6_SQ: case K_VRC6_SAW: {
      const uint16_t* s = o + T_VRC6 + ch.idx * 4;
      const bool saw = ch.kind == K_VRC6_SAW;
      const int vol = saw ? (s[0] & 63) : (s[0] & 15);
      if (!(s[2] & 0x80) || !vol || s[3] < 2) break;
      if (!hzToNote(kCpu / ((saw ? 14.0 : 16.0) * s[3]), v.note, v.fine)) break;
      v.on = true; v.vol = vol;
      if (saw) insOut = b.ins("VRC6 saw", [](DivInstrument& i) { i.type = DIV_INS_VRC6_SAW; i.name = "VRC6 saw"; });
      else { insOut = pulseIns(b, "VRC6", DIV_INS_VRC6); v.duty = (s[0] >> 4) & 7; }
      break;
    }
    case K_FDS: {
      const uint16_t* r = o + T_FDS;
      const int freq = r[0x42] | ((r[0x43] & 15) << 8), gain = o[T_FDS + 0x93];
      if ((r[0x43] & 0x80) || !freq || !gain) break;
      if (!hzToNote(kCpu * freq / 4194304.0, v.note, v.fine)) break;
      v.on = true; v.vol = gain > 32 ? 32 : gain;
      std::vector<int> wv(64);
      for (int i = 0; i < 64; i++) wv[i] = r[i] & 63;
      const int wi = b.wave(wv, 63);
      const bool modOn = !(r[0x47] & 0x80);
      const int modSpeed = modOn ? (r[0x46] | ((r[0x47] & 15) << 8)) : 0, modDepth = modOn ? (o[T_FDS + 0x94] & 63) : 0;
      signed char mt[32];
      for (int i = 0; i < 32; i++) mt[i] = (signed char)(r[0x53 + i * 2] & 7); // two mod entries per $4088 write
      std::string key = "FDS " + std::to_string(wi) + " " + std::to_string(modSpeed) + " " + std::to_string(modDepth) + " ";
      key.append(reinterpret_cast<const char*>(mt), 32);
      insOut = b.ins(key, [&](DivInstrument& i) {
        i.type = DIV_INS_FDS; i.name = "FDS " + std::to_string(b.tmpl.size() + 1);
        macro1(i.std.waveMacro, wi);
        memcpy(i.fds.modTable, mt, 32); i.fds.modSpeed = modSpeed; i.fds.modDepth = modDepth;
        i.fds.initModTableWithFirstWave = false;
      });
      break;
    }
    case K_N163: {
      const uint16_t* ram = o + T_N163;
      const int numCh = ((ram[0x7F] >> 4) & 7) + 1;
      if (ch.idx >= numCh) break;
      const int base = 0x78 - 8 * ch.idx;
      const int freq = ram[base] | (ram[base + 2] << 8) | ((ram[base + 4] & 3) << 16);
      const int len = 256 - (ram[base + 4] & 0xFC), addr = ram[base + 6], vol = ram[base + 7] & 15;
      if (!freq || !vol) break;
      if (!hzToNote(freq * kCpu / (15.0 * 65536.0 * numCh * len), v.note, v.fine)) break;
      v.on = true; v.vol = vol;
      std::vector<int> wv(len);
      for (int j = 0; j < len; j++) {
        const int nib = (addr + j) & 0xFF, byte = ram[nib >> 1];
        wv[j] = (nib & 1) ? (byte >> 4) : (byte & 15);
      }
      const int wi = b.wave(wv, 15);
      insOut = b.ins("N163 " + std::to_string(wi) + " " + std::to_string(addr) + " " + std::to_string(len), [&](DivInstrument& i) {
        i.type = DIV_INS_N163; i.name = "N163 " + std::to_string(b.tmpl.size() + 1);
        i.n163.wave = wi; i.n163.wavePos = addr; i.n163.waveLen = len; i.n163.waveMode = 1; // load wave on note on
        macro1(i.std.waveMacro, wi);
      });
      break;
    }
    case K_VRC7: {
      const uint16_t* r = o + T_VRC7 + 8 + ch.idx * 3;
      const int key = (r[1] >> 4) & 1;
      if (!key) break;
      const int fnum = r[0] | ((r[1] & 1) << 8), block = (r[1] >> 1) & 7;
      if (!fnum || !hzToNote(49716.0 * fnum / std::ldexp(1.0, 19 - block), v.note, v.fine)) break;
      v.on = true; v.vol = 15 - (r[2] & 15);
      v.trig = prev && !((prev[T_VRC7 + 8 + ch.idx * 3 + 1] >> 4) & 1);
      const int patch = r[2] >> 4;
      std::string key2 = "VRC7 " + std::to_string(patch);
      if (!patch) for (int i = 0; i < 8; i++) key2 += (char)o[T_VRC7 + i];
      const uint16_t* p = o + T_VRC7;
      insOut = b.ins(key2, [&](DivInstrument& i) {
        i.type = DIV_INS_OPLL; i.name = "VRC7 " + std::to_string(b.tmpl.size() + 1);
        i.fm.opllPreset = patch; i.fm.ops = 2;
        if (!patch) {
          for (int k = 0; k < 2; k++) {
            DivInstrumentFM::Operator& op = i.fm.op[k];
            op.am = (p[k] >> 7) & 1; op.vib = (p[k] >> 6) & 1; op.ssgEnv = ((p[k] >> 5) & 1) << 3;
            op.ksr = (p[k] >> 4) & 1; op.mult = p[k] & 15;
            op.ar = p[4 + k] >> 4; op.dr = p[4 + k] & 15; op.sl = p[6 + k] >> 4; op.rr = p[6 + k] & 15;
          }
          i.fm.op[0].ksl = p[2] >> 6; i.fm.op[0].tl = p[2] & 63;
          i.fm.op[1].ksl = p[3] >> 6;
          i.fm.fms = (p[3] >> 4) & 1; i.fm.ams = (p[3] >> 3) & 1; i.fm.fb = p[3] & 7;
        }
      });
      break;
    }
    case K_S5B: {
      const uint16_t* r = o + T_S5B;
      const int c2 = ch.idx;
      const bool tone = !((r[7] >> c2) & 1), noise = !((r[7] >> (c2 + 3)) & 1), env = (r[8 + c2] & 16) != 0;
      const int vol = r[8 + c2] & 15, period = r[c2 * 2] | ((r[c2 * 2 + 1] & 15) << 8);
      if (!(tone || noise) || !(vol || env) || !period) break;
      if (!hzToNote(1789772.5 / (16.0 * period), v.note, v.fine)) break;
      v.on = true; v.vol = env ? 15 : vol;
      const int mix = (tone ? 1 : 0) | (noise ? 2 : 0) | (env ? 4 : 0);
      insOut = b.ins("S5B " + std::to_string(mix), [&](DivInstrument& i) {
        i.type = DIV_INS_AY; i.name = "S5B " + std::string(tone ? "tone" : "") + (noise ? " noise" : "") + (env ? " envelope" : "");
        macro1(i.std.waveMacro, mix);
      });
      break;
    }
  }
  (void)c;
  return v;
}

} // namespace

/**
 * Build song from NSF bytes: `track` 0-based, or -1 for every track (one subsong each, sharing
 * instruments, samples and waves). `frames` = PLAY calls to trace per track at least (twice the
 * NSFe `time` chunk when that is longer); the song loop or end found in the trace sets the length.
 * `prefLen` = preferred rows per pattern; the grid picks one that fits the loop. Returns false and
 * sets err on failure.
 */
bool nsfBuildSong(DivSong& song, const uint8_t* data, size_t len, int track, int frames, int prefLen, std::string& err) {
  if (prefLen < 1 || prefLen > DIV_MAX_ROWS) prefLen = 64;
  const int kMaxFrames = 64 * DIV_MAX_PATTERNS;
  if (frames < 1) frames = 1;
  if (frames > kMaxFrames) frames = kMaxFrames;
  // NSFe is a chunked NSF; after load both run the same Nsf_Emu core.
  const bool nsfe = len >= 4 && !memcmp(data, "NSFE", 4);
  std::unique_ptr<Nsf_Emu> emuOwn(nsfe ? new Nsfe_Emu : new Nsf_Emu);
  Nsf_Emu& emu = *emuOwn;
  Ctx c;
  // the trace reads registers, not audio: a low output rate only cuts synthesis time
  if (emu.set_sample_rate(11025)) { err = "NSF: sample rate"; return false; }
  if (const char* e = emu.load_mem(data, (long)len)) { err = std::string("NSF: ") + e; return false; }
  emu.clear_playlist(); // NSFe plst: track stays the raw song index
  emu.ignore_silence(true);
  Nsf_Trace::arm(&emu, hook, &c);
  // shortcut: at most 255 subsongs (the .fur count is one byte); NSF files stay far below
  const int nTracks = std::min(255, std::max(1, emu.track_count()));
  const int first = track < 0 ? 0 : track, last = track < 0 ? nTracks : track + 1;
  song.unload();
  Builder b(song);
  std::map<int, int> dpcmIns;                // template -> song instrument (all tracks)
  std::map<int, std::vector<int>> byTmpl;    // template -> song instruments (all tracks)
  std::vector<Chan> chans;
  int chips = 0, n163Sys = -1, n163Max = 1;
  double hz = 60.0;
  for (int tr = first; tr < last; tr++) {
  c.w.clear(); c.dpcmTrig.clear(); c.prevLeft = c.prevPlay = 0; // DPCM samples stay shared
  if (const char* e = emu.start_track(tr)) { err = std::string("NSF track: ") + e; return false; }
  hz = Nsf_Trace::play_hz(&emu);
  track_info_t ti; // NSFe keeps names in its auth/tlbl chunks and lengths in time, not the header
  const bool info = !emu.track_info(&ti, tr);
  // The NSFe time chunk is a playlist length, not the song structure: trace past it (twice its
  // length, so a loop inside it repeats once) and find the real loop or end below.
  int timeF = 0;
  if (info && ti.length > 0) timeF = std::max(1, (int)(ti.length * (hz > 1.0 ? hz : 60.0) / 1000.0));
  const int want = std::max(1, std::min(std::max(frames, 2 * timeF), kMaxFrames));
  short pcm[4096];
  while ((int)(c.w.size() / kTraceWords) < want && !emu.track_ended())
    if (emu.play(4096, pcm)) break;
  int n = (int)(c.w.size() / kTraceWords);
  if (n > want) n = want;
  if (n < 1) { err = "NSF: no frames"; return false; }

  if (song.subsong.empty()) {
  chips = Nsf_Trace::chips(&emu);
  // Song skeleton: systems in this order, channels follow it.
  int sysN = 0;
  auto addSys = [&](DivSystem s, int nCh) {
    song.system[sysN] = s;
    song.systemChans[sysN] = nCh;
    song.systemVol[sysN] = 1.0f; song.systemPan[sysN] = 0.0f; song.systemPanFR[sysN] = 0.0f;
    song.systemFlags[sysN].clear();
    sysN++;
  };
  addSys(DIV_SYSTEM_NES, 5);
  chans.push_back({K_SQ, 0}); chans.push_back({K_SQ, 1}); chans.push_back({K_TRI, 0});
  chans.push_back({K_NOISE, 0}); chans.push_back({K_DPCM, 0});
  if (chips & 1) { addSys(DIV_SYSTEM_VRC6, 3); for (int i = 0; i < 2; i++) chans.push_back({K_VRC6_SQ, i}); chans.push_back({K_VRC6_SAW, 2}); }
  if (chips & 2) { addSys(DIV_SYSTEM_VRC7, 6); for (int i = 0; i < 6; i++) chans.push_back({K_VRC7, i}); }
  if (chips & 4) { addSys(DIV_SYSTEM_FDS, 1); chans.push_back({K_FDS, 0}); }
  if (chips & 8) { addSys(DIV_SYSTEM_MMC5, 3); for (int i = 0; i < 2; i++) chans.push_back({K_MMC5_SQ, i}); chans.push_back({K_MMC5_SQ, -1}); }
  if (chips & 16) {
    addSys(DIV_SYSTEM_N163, 8);
    n163Sys = sysN - 1;
    for (int i = 0; i < 8; i++) chans.push_back({K_N163, i});
  }
  if (chips & 32) {
    addSys(DIV_SYSTEM_AY8910, 3);
    song.systemFlags[sysN - 1].set("chipType", 2); // Sunsoft 5B
    for (int i = 0; i < 3; i++) chans.push_back({K_S5B, i});
  }
  song.systemLen = sysN;
  song.recalcChans();
  if (info) { song.name = ti.game; song.author = ti.author; }
  }
  if (chips & 16)
    for (int f = 0; f < n; f++) n163Max = std::max(n163Max, ((c.w[(size_t)f * kTraceWords + T_N163 + 0x7F] >> 4) & 7) + 1);

  DivSubSong* sub = new DivSubSong;
  song.subsong.push_back(sub);
  sub->name = info && ti.song[0] ? ti.song : "Track " + std::to_string(tr + 1);
  sub->hz = hz > 1.0 ? (float)hz : 60.0f;

  // DPCM samples new in this track (c.pcm is shared, so indexes hold across tracks)
  for (size_t k = song.sample.size(); k < c.pcm.size(); k++) {
    DivSample* s = new DivSample;
    s->name = "DPCM " + std::to_string(k + 1);
    s->depth = DIV_SAMPLE_DEPTH_1BIT_DPCM;
    s->init((int)c.pcm[k].size() * 8);
    memcpy(s->dataDPCM, c.pcm[k].data(), c.pcm[k].size());
    s->centerRate = 33144; // DPCM rate 15
    s->loop = c.pcmLoop[k];
    s->loopStart = s->loop ? 0 : -1;
    s->loopEnd = s->loop ? (int)c.pcm[k].size() * 8 : -1;
    song.sample.push_back(s);
  }

  const int nCh = (int)chans.size();
  // Per-frame voice state per channel; templates are created as voices appear.
  struct Fr { bool on, trig; int note, fine, vol, duty, tmpl; };
  std::vector<std::vector<Fr>> fr(nCh, std::vector<Fr>(n));
  for (int ci = 0; ci < nCh; ci++) {
    if (chans[ci].idx < 0) continue; // MMC5 PCM: not traced as notes
    for (int f = 0; f < n; f++) {
      const uint16_t* o = &c.w[(size_t)f * kTraceWords];
      int t = -1;
      V v = voice(b, chans[ci], o, f ? o - kTraceWords : nullptr, c.dpcmTrig[f], t, c);
      fr[ci][f] = {v.on, v.trig, v.note, v.fine, v.vol, v.duty, t};
    }
  }

  // Note onsets: start from silence, retrigger, timbre change, volume jump, or a held pitch change.
  std::vector<std::vector<char>> onset(nCh, std::vector<char>(n, 0));
  std::vector<int> allOn;
  for (int ci = 0; ci < nCh; ci++) {
    if (chans[ci].idx < 0) continue;
    const Kind k = chans[ci].kind;
    const std::vector<Fr>& a = fr[ci];
    auto P = [&](int f) { return a[f].note * 128 + a[f].fine; };
    for (int f = 0; f < n; f++) {
      bool o = false;
      if (k == K_DPCM) o = a[f].trig;
      else if (a[f].on) {
        if (!f || !a[f - 1].on || a[f].trig || a[f].tmpl != a[f - 1].tmpl) o = true;
        else if (k != K_VRC7 && k != K_TRI && a[f].vol - a[f - 1].vol >= 3) o = true;
        else if (f >= 3 && f + 2 < n && std::abs(P(f) - P(f - 1)) >= 96) {
          bool held = true;
          for (int j = 1; j <= 2; j++)
            held = held && a[f + j].on && a[f - 1 - j].on && std::abs(P(f + j) - P(f)) <= 32 && std::abs(P(f - 1 - j) - P(f - 1)) <= 32;
          o = held;
        }
      }
      if (o) { onset[ci][f] = 1; allOn.push_back(f); }
    }
  }

  // Song end, from the trace itself. Looping songs: from frame loopF on, every voice state repeats
  // loopL frames later, up to the trace end (the shortest such period, after at least one full repeat
  // and kMinRun frames, over a loop that sounds). Songs that stop: silence from lastSound + 1 to the
  // trace end. Neither (a period the trace cannot show twice, or a loop that never repeats exactly):
  // the time chunk length, else the whole trace.
  auto isOn = [&](int ci, int f) { return chans[ci].kind == K_DPCM ? fr[ci][f].trig : fr[ci][f].on; };
  std::vector<uint64_t> fh(n);
  std::vector<int> sndSum(n + 1, 0);
  int lastSound = -1;
  for (int f = 0; f < n; f++) {
    uint64_t h = 1469598103934665603ULL;
    bool snd = false;
    auto mix = [&](int v) { h = (h ^ (uint64_t)(uint32_t)v) * 1099511628211ULL; };
    for (int ci = 0; ci < nCh; ci++) {
      if (chans[ci].idx < 0) continue;
      const Fr& x = fr[ci][f];
      mix(x.on | (x.trig << 1));
      if (x.on) { mix(x.note); mix(x.fine); mix(x.vol); mix(x.duty); mix(x.tmpl); }
      snd = snd || isOn(ci, f);
    }
    fh[f] = h;
    sndSum[f + 1] = sndSum[f] + snd;
    if (snd) lastSound = f;
  }
  const int kMinLoop = 64, kMinRun = 600, kSilentEnd = 120;
  int loopF = -1, loopL = 0;
  for (int L = kMinLoop; 2 * L <= n && loopF < 0; L++) {
    int s = n - L;
    while (s > 0 && fh[s - 1] == fh[s - 1 + L]) s--;
    if (n - L - s < std::max(L, kMinRun) || sndSum[s + L] == sndSum[s]) continue;
    loopF = s; loopL = L;
  }
  int endF = n;   // frames the song keeps when it does not loop
  bool stops = false;
  if (loopF < 0) {
    if (lastSound + 1 + kSilentEnd <= n) { endF = std::max(1, lastSound + 1); stops = true; }
    else if (timeF) endF = std::min(n, timeF);
  }

  // Row grid. Channels often sit at different phases of one tempo, so the row length comes from
  // the gaps between onsets inside each channel: S is the largest frames-per-row (2..20) that
  // divides >= 85% of the gaps in the median voice (and >= 70% of all gaps), so one voice's
  // triplets or drum flams cannot veto the row the other voices follow. Only when S puts < 90% of
  // all onsets, and of the median voice's onsets, on one phase does a smaller divisor that does win (fewer EDxx delays); a divisor of
  // an S that already fits would just double the rows. Else the dominant phase of S. No fit: S = 1.
  std::vector<std::vector<int>> gaps(nCh);
  size_t nGaps = 0;
  for (int ci = 0; ci < nCh; ci++) {
    int last = -1;
    for (int f = 0; f < n; f++) if (onset[ci][f]) { if (last >= 0) gaps[ci].push_back(f - last); last = f; }
    nGaps += gaps[ci].size();
  }
  auto gapFit = [&](int s) {
    std::vector<int> pm;
    long long hit = 0;
    for (const auto& g: gaps) {
      int h = 0;
      for (int x: g) h += x % s == 0;
      hit += h;
      if (g.size() >= 4) pm.push_back((int)(1000LL * h / (long long)g.size()));
    }
    if (1000LL * hit < 700LL * (long long)nGaps) return false;
    if (pm.empty()) return 1000LL * hit >= 850LL * (long long)nGaps;
    std::sort(pm.begin(), pm.end());
    const size_t m = pm.size();
    return (m % 2 ? pm[m / 2] : (pm[m / 2 - 1] + pm[m / 2]) / 2) >= 850;
  };
  auto phaseFit = [&](int s, int& bp) {
    std::vector<int> h(s, 0);
    for (int f: allOn) h[f % s]++;
    bp = 0;
    for (int p = 1; p < s; p++) if (h[p] > h[bp]) bp = p;
    return (int)(1000LL * h[bp] / (long long)allOn.size());
  };
  // median over voices of the share of onsets on phase bp: sub-row drum hits in one voice do not count against S
  auto medPhase = [&](int s, int bp) {
    std::vector<int> pm;
    for (int ci = 0; ci < nCh; ci++) {
      int on = 0, hit = 0;
      for (int f = 0; f < n; f++) if (onset[ci][f]) { on++; hit += f % s == bp; }
      if (on >= 4) pm.push_back((int)(1000LL * hit / on));
    }
    if (pm.empty()) return 0;
    std::sort(pm.begin(), pm.end());
    const size_t m = pm.size();
    return m % 2 ? pm[m / 2] : (pm[m / 2 - 1] + pm[m / 2]) / 2;
  };
  int S = 1, phase = 0, fitPm = 1000;
  if (nGaps) {
    for (int s = 20; s >= 2 && S == 1; s--) {
      if (!gapFit(s)) continue;
      S = s; fitPm = phaseFit(s, phase);
      if (fitPm >= 900 || medPhase(s, phase) >= 900) break;
      for (int d = s / 2; d >= 2; d--) {
        int bp;
        const int pm = s % d ? 0 : phaseFit(d, bp);
        if (pm >= 900) { S = d; phase = bp; fitPm = pm; break; }
      }
    }
  }
  // Rows as a repeating speed pattern (the .fur speeds array, up to 16 entries); integer S is {S}.
  // Tempo-accumulator drivers step rows every P/k frames, a non-integer row length, so the onsets fit
  // no integer >= 4 and the search above falls to 1..3 (fast rows, notes many rows apart). Then a
  // k-row pattern over P frames - row starts floor(i*P/k), or any two-row swing - that puts
  // >= kPatFit of all onsets on row starts wins, longest mean row first.
  const int kPatFit = 900;
  std::vector<int> sp(1, S);
  if (S < 4 && allOn.size() >= 16) {
    struct Cand { int P, k, a; }; // a > 0: two-row swing {0, a}
    std::vector<Cand> cands;
    for (int k = 2; k <= 16; k++)
      for (int P = std::max(4 * k, S * k + 1); P <= 20 * k; P++)
        if (std::gcd(P, k) == 1) cands.push_back({P, k, 0});
    for (int P = std::max(8, 2 * S + 1); P <= 40; P++)
      for (int a = 2; 2 * a < P; a++) if (P - a <= 20) cands.push_back({P, 2, a});
    std::stable_sort(cands.begin(), cands.end(), [](const Cand& x, const Cand& y) { return x.P * y.k > y.P * x.k; });
    std::vector<int> h;
    for (const Cand& cd: cands) {
      std::vector<int> st0;
      if (cd.a) st0 = {0, cd.a};
      else for (int i = 0; i < cd.k; i++) st0.push_back(i * cd.P / cd.k);
      h.assign(cd.P, 0);
      for (int f: allOn) h[f % cd.P]++;
      int best = -1, bp = 0;
      for (int p = 0; p < cd.P; p++) {
        int hit = 0;
        for (int x: st0) hit += h[(x + p) % cd.P];
        if (hit > best) { best = hit; bp = p; }
      }
      const int pm = (int)(1000LL * best / (long long)allOn.size());
      if (pm < kPatFit) continue;
      sp.clear();
      for (int i = 0; i < cd.k; i++) sp.push_back((i + 1 < cd.k ? st0[i + 1] : cd.P) - st0[i]);
      S = sp[0]; phase = bp; fitPm = pm;
      break;
    }
  }
  const int K = (int)sp.size();
  std::vector<int> cum(K + 1, 0);
  for (int i = 0; i < K; i++) cum[i + 1] = cum[i] + sp[i];
  const int P = cum[K];
  // Driver loop stall: a loop of L = Lr * S + rem frames (integer speed) repeats with every onset
  // rem frames later each pass (Metroid: the R&D1 driver spends one frame restarting the song), so
  // a fixed grid drifts off the music one frame per loop. Rows longRow + k * longLr are rem frames
  // longer (0Fxx on that row, back to S on the next); the loop is then exactly Lr whole rows.
  int longRow = -1, longLr = 1, longRem = 0;
  auto rowStart = [&](int r) {
    int x = r / K * P + cum[r % K];
    if (longRow >= 0 && r > longRow) x += ((r - longRow - 1) / longLr + 1) * longRem;
    return x;
  };
  auto rowOf = [&](int vf) {
    int r = vf / P * K;
    while (r > 0 && rowStart(r) > vf) r--;
    while (rowStart(r + 1) <= vf) r++;
    return r;
  };
  if (K == 1 && loopF >= 0 && loopL % P && !allOn.empty()) {
    // the stall row and phase that put the most onsets on row starts, over the whole trace
    longRem = loopL % P; longLr = loopL / P;
    int best = -1, bx = -1, bp = 0;
    for (int p = 0; p < P; p++) {
      const int pd = (P - p) % P, x0 = (loopF + pd) / P;
      for (int x = x0; x < x0 + longLr; x++) {
        longRow = x;
        int hit = 0;
        for (int f: allOn) { const int v = f + pd; hit += rowStart(rowOf(v)) == v; }
        if (hit > best) { best = hit; bx = x; bp = p; }
      }
    }
    longRow = bx; phase = bp; fitPm = (int)(1000LL * best / (long long)allOn.size());
  }
  // Pad < P frames of silence in front so the dominant phase falls on row starts.
  const int pad = (P - phase) % P;
  for (int i = 0; i < K; i++) sub->speeds.val[i] = (unsigned short)sp[i];
  sub->speeds.len = (unsigned char)K;

  // Pattern grid from the song: the loop start sits on an order start and the last row jumps
  // there (0Bxx); a song that stops ends with FF00 on its last musical row. Pattern length: one
  // that divides the loop (so the loop ends on a pattern end), a multiple of 16, near prefLen. The
  // loop start moves forward to the next pattern start (the trace repeats, so any later frame of
  // the loop is a loop start too).
  auto frameOfRow = [&](int r) { return rowStart(r) - pad; };
  const int maxRows = rowOf(n - 1 + pad) + 1;
  int patLen = prefLen, R = 0, endFx = 0x0B, endFxv = 0;
  if (loopF >= 0) {
    int Ls = 0;
    while (frameOfRow(Ls) < loopF) Ls++;
    // shortcut: a loop that is not a whole number of speed cycles rounds to the nearest row (the
    // repeat drifts by under a row each pass); upgrade to a per-loop speed change if a song shows it
    const int Lr = loopL % P == 0 || longRow >= 0 ? loopL / P * K : std::max(1, (int)std::lround((double)loopL * K / P));
    int best = -1;
    double bestScore = 1e9;
    for (int pl = 16; pl <= DIV_MAX_ROWS; pl++) {
      const int Ls2 = (Ls + pl - 1) / pl * pl;
      if (Ls2 + Lr > maxRows || (Ls2 + Lr + pl - 1) / pl > DIV_MAX_PATTERNS) continue;
      const double score = (Lr % pl ? 100.0 : 0.0) + (pl % 16 ? 10.0 : 0.0) + std::fabs(std::log2((double)pl / prefLen));
      if (score < bestScore) { bestScore = score; best = pl; }
    }
    if (best > 0) {
      patLen = best;
      const int Ls2 = (Ls + patLen - 1) / patLen * patLen;
      R = Ls2 + Lr; endFxv = Ls2 / patLen;
    } else { loopF = -1; endF = timeF ? std::min(n, timeF) : n; } // no grid fits the trace: time chunk
  }
  if (loopF < 0) {
    R = std::min(rowOf(endF - 1 + pad) + 1, patLen * DIV_MAX_PATTERNS);
    if (stops) endFx = 0xFF;
  }
  const int nUse = std::min(n, frameOfRow(R)); // frames inside rows [0, R)
  sub->patLen = patLen;
  sub->ordersLen = (R + patLen - 1) / patLen;

  // effect columns: 0 EDxx delay, 1 pitch (E5xx), 2 pitch slide (01xx/02xx), 3 vibrato (04xy),
  // 4 song end (ch0), 5 loop-stall speed (ch0)
  enum { kFxCols = 6 };
  struct Cell { short note = -1, ins = -1, fx[kFxCols] = {-1, -1, -1, -1, -1, -1}, fxv[kFxCols] = {-1, -1, -1, -1, -1, -1}; };
  std::vector<std::vector<Cell>> cells(nCh, std::vector<Cell>(R));
  auto place = [&](Cell& cl, int vf) { const int o = vf - rowStart(rowOf(vf)); if (o) { cl.fx[0] = 0xED; cl.fxv[0] = (short)o; } };

  // Segments: one note per row start; frames until the next start fold into macros.
  struct Seg { int ci, tmpl, len; std::vector<int> vol, arp, pit, duty; Cell* cell; bool pfx = false, atLoop = false; int sl = 0, vib = 0; };
  std::vector<Seg> segs;
  int dpcmHits = 0, dpcmTrigs = 0;
  // E5xx state per channel follows row order; the loop target row's first note sets it again so the
  // second pass does not inherit the song end's value
  const int loopRow = loopF >= 0 ? endFxv * patLen : -1;
  // Furnace vibrato offset (playback.cpp 04xy, vibratoFine 15) in 1/128 semitone at table position pos
  auto vibOff = [](int depth, int pos) {
    return ((depth * (int)(short)(127 * std::sin(pos / 64.0 * (2 * M_PI))) * 15) >> 4) / 15;
  };
  for (int ci = 0; ci < nCh; ci++) {
    if (chans[ci].idx < 0) continue;
    const Kind k = chans[ci].kind;
    const std::vector<Fr>& a = fr[ci];
    int curE5 = 0;
    bool loopSet = loopRow < 0;
    // 01/02/04 only where the Furnace pitch is register-exact (2A03/MMC5 period table); expansion chips keep macros
    const bool pitchFx = k == K_SQ || k == K_MMC5_SQ || k == K_TRI;
    if (k == K_DPCM) {
      int lastRow = -1;
      for (int f = 0; f < nUse; f++) {
        if (!a[f].trig) continue;
        dpcmTrigs++;
        const int vf = f + pad, row = rowOf(vf);
        // shortcut: a second trigger in one row is dropped (a cell holds one note); upgrade with 0Cxx retrigger if a song needs it
        if (row == lastRow) continue;
        lastRow = row; dpcmHits++;
        auto it = dpcmIns.find(a[f].tmpl);
        if (it == dpcmIns.end()) {
          DivInstrument* d = new DivInstrument;
          *d = *b.tmpl[a[f].tmpl];
          song.ins.push_back(d);
          it = dpcmIns.emplace(a[f].tmpl, (int)song.ins.size() - 1).first;
        }
        Cell& cl = cells[ci][row];
        cl.note = (short)a[f].note; cl.ins = (short)it->second; place(cl, vf);
      }
      continue;
    }
    std::vector<int> starts;
    for (int f = 0; f < nUse; f++)
      if (onset[ci][f] && (starts.empty() || rowOf(f + pad) != rowOf(starts.back() + pad))) starts.push_back(f);
    for (size_t si = 0; si < starts.size(); si++) {
      const int s = starts[si], e = si + 1 < starts.size() ? starts[si + 1] : n;
      int lastOn = s;
      for (int f = s; f < e; f++) if (a[f].on) lastOn = f;
      int end = lastOn + 1; // macro covers [s, end)
      const int row = rowOf(s + pad);
      if (end < e) {
        const int offRow = rowOf(end + pad);
        const bool free = offRow < R && offRow != row && (si + 1 >= starts.size() || offRow != rowOf(e + pad));
        if (free) { Cell& off = cells[ci][offRow]; off.note = DIV_NOTE_OFF; place(off, end + pad); }
        else if (k != K_VRC7) end = e; // gap becomes volume 0 in the macro
      }
      Seg g; g.ci = ci; g.tmpl = a[s].tmpl; g.len = end - s;
      Cell& cl = cells[ci][row];
      cl.note = (short)a[s].note; place(cl, s + pad);
      g.cell = &cl;
      // The note's own fine goes to E5xx (pitch, persists per channel); the macros hold the change from the
      // note start (semitones in arpeggio, fine in pitch), so a held note shares one flat instrument.
      const int f0 = a[s].fine;
      const bool atLoop = !loopSet && row >= loopRow;
      if (k != K_NOISE && (f0 != curE5 || atLoop)) {
        cl.fx[1] = 0xE5; cl.fxv[1] = (short)(f0 + 0x80); curE5 = f0;
      }
      if (row >= loopRow) loopSet = true;
      int ar = 0, pi = 0, du = a[s].duty;
      for (int f = s; f < end; f++) {
        if (a[f].on) { ar = a[f].note - a[s].note; pi = a[f].fine - f0; if (a[f].duty >= 0) du = a[f].duty; }
        g.vol.push_back(a[f].on ? a[f].vol : 0); g.arp.push_back(ar); g.pit.push_back(pi); g.duty.push_back(du);
      }
      g.pfx = pitchFx; g.atLoop = atLoop;
      segs.push_back(std::move(g));
    }
  }

  // Pitch effects: a linear slide (01xx up / 02xx down, xx * pitchSlideSpeed 4 per tick) or a vibrato (04xy)
  // that halves the pitch error over the sounding frames. Both step on the note's own tick (t + 1); the
  // residual (NES slides are linear in period, not in pitch) stays in the pitch macro, arpeggio flat.
  // Decided longest note first; a note whose arp/pitch curve is a prefix of an already decided same-template
  // note takes that decision, so twins keep sharing one instrument (exact-prefix match below).
  {
    std::vector<int> order;
    for (int i = 0; i < (int)segs.size(); i++) if (segs[i].pfx) order.push_back(i);
    std::stable_sort(order.begin(), order.end(), [&](int x, int y) { return segs[x].len > segs[y].len; });
    for (size_t oi = 0; oi < order.size(); oi++) {
      Seg& g = segs[order[oi]];
      bool reused = false;
      for (size_t oj = 0; oj < oi && !reused; oj++) {
        const Seg& h = segs[order[oj]];
        if (h.tmpl != g.tmpl) continue;
        reused = std::equal(g.arp.begin(), g.arp.end(), h.arp.begin()) && std::equal(g.pit.begin(), g.pit.end(), h.pit.begin());
        if (reused) { g.sl = h.sl; g.vib = h.vib; }
      }
      if (reused) continue;
      std::vector<int> D(g.len);
      for (int t = 0; t < g.len; t++) D[t] = g.arp[t] * 128 + g.pit[t];
      auto err = [&](auto model) {
        long e = 0;
        for (int t = 0; t < g.len; t++) if (g.vol[t] > 0) e += std::abs(D[t] - model(t));
        return e;
      };
      const long e0 = err([](int) { return 0; });
      long best = e0;
      if (e0 > 0 && g.len >= 3) {
        double num = 0, den = 0;
        for (int t = 0; t < g.len; t++) { num += D[t] * (t + 1.0); den += (t + 1.0) * (t + 1.0); }
        const int x0 = (int)std::lround(num / den / 4);
        for (int x = x0 - 1; x <= x0 + 1; x++) {
          if (!x || std::abs(x) > 255) continue;
          const long e = err([&](int t) { return (t + 1) * 4 * x; });
          if (2 * e <= e0 && e < best) { best = e; g.sl = x; }
        }
        for (int r = 1; r < 16; r++)
          for (int d = 1; d < 16; d++) {
            const long e = err([&](int t) { return vibOff(d, r * (t + 1) & 63); });
            if (2 * e <= e0 && e < best) { best = e; g.sl = 0; g.vib = r << 4 | d; }
          }
      }
    }
    // cells in row order per channel: 01/02 and 04 persist, so write only on change; the loop target's first
    // note forces a set, dropped again when the song end carries the same value into the second pass
    int ci = -1, curSl = 0, curVib = 0, loopSl = 0, loopVib = 0;
    Cell* loopCell = nullptr;
    bool loopSlChg = false, loopVibChg = false;
    auto closeLoop = [&]() {
      if (!loopCell) return;
      if (!loopSlChg && curSl == loopSl) loopCell->fx[2] = loopCell->fxv[2] = -1;
      if (!loopVibChg && curVib == loopVib) loopCell->fx[3] = loopCell->fxv[3] = -1;
      loopCell = nullptr;
    };
    for (Seg& g: segs) {
      if (!g.pfx) continue;
      if (g.ci != ci) { closeLoop(); ci = g.ci; curSl = curVib = 0; }
      Cell& cl = *g.cell;
      const int sl = g.sl, vib = g.vib;
      if (g.atLoop) { loopCell = &cl; loopSl = sl; loopVib = vib; loopSlChg = sl != curSl; loopVibChg = vib != curVib; }
      if (sl != curSl || g.atLoop) { cl.fx[2] = (short)(sl < 0 ? 0x02 : 0x01); cl.fxv[2] = (short)std::abs(sl); curSl = sl; }
      if (vib != curVib || g.atLoop) { cl.fx[3] = 0x04; cl.fxv[3] = (short)vib; curVib = vib; }
      if (sl || vib) {
        for (int t = 0; t < g.len; t++) {
          g.pit[t] = g.arp[t] * 128 + g.pit[t] - (sl ? (t + 1) * 4 * sl : vibOff(vib & 15, (vib >> 4) * (t + 1) & 63));
          g.arp[t] = 0;
        }
      }
    }
    closeLoop();
  }

  // Instruments: copy the template, fold the segment into vol/arp/pitch/duty macros, share by content.
  auto hasDuty = [&](int ci) { const Kind k = chans[ci].kind; return k == K_SQ || k == K_MMC5_SQ || k == K_NOISE || k == K_VRC6_SQ; };
  auto encode = [](DivInstrumentMacro& m, const std::vector<int>& a) {
    int L = (int)a.size();
    while (L > 1 && a[L - 1] == a[L - 2]) L--; // macros hold the last value
    m.loop = 255;
    if (L > 255) {
      bool done = false;
      for (int P = 1; P <= 64 && !done; P++) {
        int j = (int)a.size() - 1;
        while (j >= P && a[j] == a[j - P]) j--;
        if (j + 1 <= 255) { L = j + 1; m.loop = (unsigned char)(j + 1 - P); done = true; }
      }
      if (!done) L = 255; // shortcut: truncated, holds value 255 onward; parity counts the loss
    }
    m.len = (unsigned char)(L < 1 ? 1 : L);
    for (int i = 0; i < m.len; i++) m.val[i] = i < (int)a.size() ? a[i] : 0;
  };
  std::stable_sort(segs.begin(), segs.end(), [](const Seg& x, const Seg& y) { return x.len > y.len; });
  for (Seg& g: segs) {
    const bool du = hasDuty(g.ci);
    int found = -1;
    for (int ii: byTmpl[g.tmpl]) {
      const DivInstrumentSTD& m = song.ins[ii]->std;
      bool ok = true;
      for (int t = 0; t < g.len && ok; t++)
        ok = macroAt(m.volMacro, t) == g.vol[t] && macroAt(m.arpMacro, t) == g.arp[t] && macroAt(m.pitchMacro, t) == g.pit[t] &&
             (!du || macroAt(m.dutyMacro, t) == g.duty[t]);
      if (ok) { found = ii; break; }
    }
    // .fur instrument column is one byte: past 256, the note takes the same-template instrument whose macros
    // are closest (squared error over the segment). Longest segments got exact instruments first (sort above).
    if (found < 0 && song.ins.size() >= 256 && !byTmpl[g.tmpl].empty()) {
      long best = -1;
      for (int ii: byTmpl[g.tmpl]) {
        const DivInstrumentSTD& m = song.ins[ii]->std;
        long e = 0;
        for (int t = 0; t < g.len; t++) {
          const long dv = macroAt(m.volMacro, t) - g.vol[t], da = macroAt(m.arpMacro, t) - g.arp[t], dp = macroAt(m.pitchMacro, t) - g.pit[t];
          const long dd = du ? macroAt(m.dutyMacro, t) - g.duty[t] : 0;
          e += dv * dv * 16 + da * da * 4 + dp * dp + dd * dd * 4;
        }
        if (best < 0 || e < best) { best = e; found = ii; }
      }
    }
    if (found < 0) {
      DivInstrument* d = new DivInstrument;
      *d = *b.tmpl[g.tmpl];
      d->name = b.tmpl[g.tmpl]->name + " " + std::to_string(byTmpl[g.tmpl].size() + 1);
      encode(d->std.volMacro, g.vol); encode(d->std.arpMacro, g.arp); encode(d->std.pitchMacro, g.pit);
      if (du) encode(d->std.dutyMacro, g.duty);
      song.ins.push_back(d);
      found = (int)song.ins.size() - 1;
      byTmpl[g.tmpl].push_back(found);
    }
    g.cell->ins = (short)found;
  }

  cells[0][R - 1].fx[4] = (short)endFx; cells[0][R - 1].fxv[4] = (short)endFxv;
  for (int r = longRow; longRow >= 0 && r < R; r += longLr) {
    cells[0][r].fx[5] = 0x0F; cells[0][r].fxv[5] = (short)(S + longRem);
    const int back = r + 1 < R ? r + 1 : loopF >= 0 ? endFxv * patLen : -1; // the loop target row restores S
    if (back >= 0) { cells[0][back].fx[5] = 0x0F; cells[0][back].fxv[5] = (short)S; }
  }

  // Patterns: patLen-row blocks per channel, identical blocks share one pattern index.
  int chanPats = 0;
  for (int ci = 0; ci < nCh; ci++) {
    // channel 1 carries the song end (0Bxx / FF00) and loop-stall speeds; columns stay in Cell order, up to the last used
    int cols = 1;
    for (const Cell& cl: cells[ci]) for (int x = cols; x < kFxCols; x++) if (cl.fx[x] >= 0) cols = x + 1;
    sub->pat[ci].effectCols = cols;
    std::map<std::string, int> seen;
    for (int blk = 0; blk < sub->ordersLen; blk++) {
      std::string key;
      for (int r = 0; r < patLen; r++) {
        const int row = blk * patLen + r;
        const Cell cl = row < R ? cells[ci][row] : Cell();
        key.append(reinterpret_cast<const char*>(&cl), sizeof cl);
      }
      auto it = seen.find(key);
      if (it == seen.end()) {
        const int idx = (int)seen.size();
        it = seen.emplace(key, idx).first;
        DivPattern* p = sub->pat[ci].getPattern(idx, true);
        for (int r = 0; r < patLen && blk * patLen + r < R; r++) {
          const Cell& cl = cells[ci][blk * patLen + r];
          short* row = p->newData[r];
          row[DIV_PAT_NOTE] = cl.note; row[DIV_PAT_INS] = cl.ins;
          for (int x = 0; x < kFxCols; x++) { row[DIV_PAT_FX(x)] = cl.fx[x]; row[DIV_PAT_FXVAL(x)] = cl.fxv[x]; }
        }
      }
      sub->orders.ord[ci][blk] = it->second;
    }
    chanPats += (int)seen.size();
  }

  // Parity: replay the written rows and macros per frame (model of Furnace row/ED/macro timing)
  // against the traced voice state. Counted over frames where either side sounds.
  long long match = 0, active = 0;
  for (int ci = 0; ci < nCh; ci++) {
    const Kind k = chans[ci].kind;
    if (chans[ci].idx < 0 || k == K_DPCM) continue;
    bool playing = false;
    int ins = -1, base = 0, t0 = 0, e5 = 0, sl = 0, slAcc = 0, vr = 0, vd = 0, vPos = 0;
    for (int vf = 0, row = 0; vf < rowStart(R); vf++) {
      if (vf >= rowStart(row + 1)) row++;
      {
        DivPattern* p = sub->pat[ci].getPattern(sub->orders.ord[ci][row / patLen], false);
        const short* cl = p->newData[row % patLen];
        const int d = cl[DIV_PAT_FX(0)] == 0xED ? cl[DIV_PAT_FXVAL(0)] : 0;
        if (vf - rowStart(row) == d) {
          if (cl[DIV_PAT_FX(1)] == 0xE5) e5 = cl[DIV_PAT_FXVAL(1)] - 0x80;
          if (cl[DIV_PAT_FX(2)] == 0x01 || cl[DIV_PAT_FX(2)] == 0x02) sl = (cl[DIV_PAT_FX(2)] == 0x01 ? 4 : -4) * cl[DIV_PAT_FXVAL(2)];
          if (cl[DIV_PAT_FX(3)] == 0x04) { vr = cl[DIV_PAT_FXVAL(3)] >> 4; vd = cl[DIV_PAT_FXVAL(3)] & 15; }
          if (cl[DIV_PAT_NOTE] == DIV_NOTE_OFF) playing = false;
          else if (cl[DIV_PAT_NOTE] >= 0) {
            playing = true; base = cl[DIV_PAT_NOTE]; t0 = vf; slAcc = 0; vPos = 0;
            if (cl[DIV_PAT_INS] >= 0) ins = cl[DIV_PAT_INS];
          }
        }
      }
      slAcc += sl; // slides and vibrato step every tick, the note's own included
      if (vd) vPos = (vPos + vr) & 63;
      const int f = vf - pad;
      if (f < 0 || f >= n) continue;
      const Fr& tr = fr[ci][f];
      bool mOn = false;
      int mVol = 0, mP = 0, mDuty = -1;
      if (playing && ins >= 0) {
        const DivInstrumentSTD& m = song.ins[ins]->std;
        const int t = vf - t0;
        mVol = macroAt(m.volMacro, t);
        mP = (base + macroAt(m.arpMacro, t)) * 128 + e5 + slAcc + (vd ? vibOff(vd, vPos) : 0) + macroAt(m.pitchMacro, t);
        mDuty = m.dutyMacro.len ? macroAt(m.dutyMacro, t) : -1;
        mOn = k == K_VRC7 || mVol > 0;
      }
      if (!tr.on && !mOn) continue;
      active++;
      if (tr.on && mOn && mP == tr.note * 128 + tr.fine && (k == K_TRI || mVol == tr.vol) && (tr.duty < 0 || mDuty == tr.duty)) match++;
    }
  }

  int* st = g_nsfStats;
  st[0] = S; st[1] = phase; st[2] = fitPm; st[3] = active ? (int)(1000 * match / active) : 1000;
  st[4] = (int)match; st[5] = (int)active; st[6] = dpcmHits; st[7] = dpcmTrigs;
  st[8] = chanPats; st[9] = sub->ordersLen; st[10] = (int)song.ins.size(); st[12] = K; st[13] = P;
  st[14] = patLen; st[15] = loopF >= 0 ? endFxv : (stops ? -2 : -1); // loop order, -2 stops, -1 time/trace end
  } // tracks
  if (n163Sys >= 0) song.systemFlags[n163Sys].set("channels", n163Max - 1);
  // instrument column is one byte in .fur; more than 256 cannot be saved
  if (song.ins.size() > 256) { err = "NSF: more than 256 instruments across tracks"; return false; }
  g_nsfStats[11] = (int)song.subsong.size();
  song.insLen = (int)song.ins.size();
  song.waveLen = (int)song.wave.size();
  song.sampleLen = (int)song.sample.size();
  return true;
}

extern "C" int nsf_get_stat(int i) { return i >= 0 && i < 16 ? g_nsfStats[i] : 0; }
