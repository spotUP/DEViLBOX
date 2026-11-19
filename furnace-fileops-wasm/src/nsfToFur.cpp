/**
 * nsfToFur.cpp - NSF to editable Furnace song (NSF import, Phase 2).
 *
 * Runs the NSF in game-music-emu's Nsf_Emu (compiled into this module as the
 * static library gme_nsf), records the per-PLAY-call voice state with the
 * shared Nsf_Trace (game-music-emu-wasm/src/nsf_trace.h), and turns it into a
 * DivSong: one channel per voice (2A03 + DPCM, then VRC6, VRC7, FDS, MMC5,
 * N163, S5B when the NSF header names them), one row per PLAY call, speed 1.
 * fur_save then writes it, so the import goes through the one .fur load path.
 *
 * Conversion logic (when a voice counts as playing, which register change
 * starts a note, period to pitch per chip, DPCM sample capture) follows
 * FamiStudio NsfFile.cs Load/UpdateChannel (MIT, BleuBleu). Pitch is written
 * as the nearest note plus an E5xx fine pitch (linear pitch: 1/128 semitone).
 */

#include "engine.h"
#include "Nsf_Emu.h"
#include "nsf_trace.h"
#include <cmath>
#include <cstring>
#include <map>
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

enum Kind { K_SQ, K_TRI, K_NOISE, K_DPCM, K_VRC6_SQ, K_VRC6_SAW, K_VRC7, K_FDS, K_MMC5_SQ, K_N163, K_S5B };

struct Chan { Kind kind; int idx; };

// One voice in one frame.
struct V { bool on = false; int note = 0, fine = 0, vol = -1; std::string key; bool trig = false; };

struct Builder {
  DivSong& song;
  std::map<std::string, int> insByKey, waveByKey;
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

  // Instrument for a content key; make() fills a new one.
  template<class F> int ins(const std::string& key, F make) {
    auto it = insByKey.find(key);
    if (it != insByKey.end()) return it->second;
    DivInstrument* i = new DivInstrument;
    make(*i);
    song.ins.push_back(i);
    return insByKey[key] = (int)song.ins.size() - 1;
  }
};

void macro1(DivInstrumentMacro& m, int v) { m.len = 1; m.val[0] = v; }

int duty2a03Ins(Builder& b, const char* chip, DivInstrumentType t, int duty) {
  return b.ins(std::string(chip) + " duty " + std::to_string(duty), [&](DivInstrument& i) {
    i.type = t; i.name = std::string(chip) + " duty " + std::to_string(duty); macro1(i.std.dutyMacro, duty);
  });
}

// Voice state for channel ch in record o; ins index in v.key form is resolved by the caller.
V voice(Builder& b, const Chan& ch, const uint16_t* o, const uint16_t* prev, int dpcmTrig, int& insOut, const Ctx& c) {
  V v;
  insOut = -1;
  switch (ch.kind) {
    case K_SQ: case K_MMC5_SQ: {
      const uint16_t* s = o + (ch.kind == K_SQ ? (ch.idx ? T_SQ2 : T_SQ1) : T_MMC5 + ch.idx * 8);
      const int period = s[7], vol = s[5];
      if (!s[6] || !vol || period < 8) break;
      if (!hzToNote(kCpu / (16.0 * (period + 1)), v.note, v.fine)) break;
      v.on = true; v.vol = vol;
      insOut = duty2a03Ins(b, ch.kind == K_SQ ? "2A03" : "MMC5", DIV_INS_NES, s[0] >> 6);
      break;
    }
    case K_TRI: {
      const uint16_t* s = o + T_TRI;
      if (!s[6] || !s[4] || !s[5] || s[7] < 2) break;
      if (!hzToNote(kCpu / (32.0 * (s[7] + 1)), v.note, v.fine)) break;
      v.on = true;
      insOut = b.ins("2A03 triangle", [](DivInstrument& i) { i.type = DIV_INS_NES; i.name = "2A03 triangle"; });
      break;
    }
    case K_NOISE: {
      const uint16_t* s = o + T_NOISE;
      if (!s[6] || !s[5]) break;
      // properNoiseLayout: period index = 15 - (note-60 & 15)
      v.note = 108 + 15 - (s[2] & 15); v.fine = 0; v.on = true; v.vol = s[5];
      const int mode = s[2] >> 7;
      insOut = b.ins("2A03 noise " + std::to_string(mode), [&](DivInstrument& i) {
        i.type = DIV_INS_NES; i.name = mode ? "2A03 noise short" : "2A03 noise"; macro1(i.std.dutyMacro, mode);
      });
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
      else insOut = duty2a03Ins(b, "VRC6", DIV_INS_VRC6, (s[0] >> 4) & 7);
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
        i.type = DIV_INS_FDS; i.name = "FDS " + std::to_string(b.song.ins.size() + 1);
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
        i.type = DIV_INS_N163; i.name = "N163 " + std::to_string(b.song.ins.size() + 1);
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
        i.type = DIV_INS_OPLL; i.name = "VRC7 " + std::to_string(b.song.ins.size() + 1);
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
 * Build song from NSF bytes: `track` 0-based, `frames` PLAY calls to record, `patLen` rows per pattern.
 * Returns false and sets err on failure.
 */
bool nsfBuildSong(DivSong& song, const uint8_t* data, size_t len, int track, int frames, int patLen, std::string& err) {
  if (patLen < 1 || patLen > DIV_MAX_ROWS) patLen = 64;
  if (frames < 1) frames = 1;
  if (frames > patLen * DIV_MAX_PATTERNS) frames = patLen * DIV_MAX_PATTERNS;
  Nsf_Emu emu;
  Ctx c;
  if (emu.set_sample_rate(44100)) { err = "NSF: sample rate"; return false; }
  if (const char* e = emu.load_mem(data, (long)len)) { err = std::string("NSF: ") + e; return false; }
  emu.ignore_silence(true);
  Nsf_Trace::arm(&emu, hook, &c);
  if (const char* e = emu.start_track(track)) { err = std::string("NSF track: ") + e; return false; }
  short pcm[4096];
  while ((int)(c.w.size() / kTraceWords) < frames && !emu.track_ended())
    if (emu.play(4096, pcm)) break;
  int n = (int)(c.w.size() / kTraceWords);
  if (n > frames) n = frames;
  if (n < 1) { err = "NSF: no frames"; return false; }
  const int chips = Nsf_Trace::chips(&emu);
  const double hz = Nsf_Trace::play_hz(&emu);

  // Song skeleton: systems in this order, channels follow it.
  song.unload();
  song.subsong.push_back(new DivSubSong);
  std::vector<Chan> chans;
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
    int maxCh = 1;
    for (int f = 0; f < n; f++) {
      const int k = ((c.w[(size_t)f * kTraceWords + T_N163 + 0x7F] >> 4) & 7) + 1;
      if (k > maxCh) maxCh = k;
    }
    addSys(DIV_SYSTEM_N163, 8);
    song.systemFlags[sysN - 1].set("channels", maxCh - 1);
    for (int i = 0; i < 8; i++) chans.push_back({K_N163, i});
  }
  if (chips & 32) {
    addSys(DIV_SYSTEM_AY8910, 3);
    song.systemFlags[sysN - 1].set("chipType", 2); // Sunsoft 5B
    for (int i = 0; i < 3; i++) chans.push_back({K_S5B, i});
  }
  song.systemLen = sysN;
  song.recalcChans();
  song.name = std::string(emu.header().game, strnlen(emu.header().game, 32));
  song.author = std::string(emu.header().author, strnlen(emu.header().author, 32));

  DivSubSong* sub = song.subsong[0];
  sub->hz = hz > 1.0 ? (float)hz : 60.0f;
  sub->speeds.val[0] = 1; sub->speeds.len = 1;
  sub->patLen = patLen;
  const int nPat = (n + patLen - 1) / patLen;
  sub->ordersLen = nPat;

  // DPCM samples
  for (size_t k = 0; k < c.pcm.size(); k++) {
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

  Builder b(song);
  for (size_t ci = 0; ci < chans.size(); ci++) {
    sub->pat[ci].effectCols = 1;
    for (int p = 0; p < nPat; p++) sub->orders.ord[ci][p] = p;
    if (chans[ci].idx < 0) continue; // MMC5 PCM: not traced as notes
    bool on = false;
    int lastNote = -1, lastIns = -1, lastVol = -1, lastFine = 0;
    for (int f = 0; f < n; f++) {
      const uint16_t* o = &c.w[(size_t)f * kTraceWords];
      const uint16_t* prev = f ? o - kTraceWords : nullptr;
      int insIdx = -1;
      V v = voice(b, chans[ci], o, prev, c.dpcmTrig[f], insIdx, c);
      DivPattern* pat = sub->pat[ci].getPattern(f / patLen, true);
      short* row = pat->newData[f % patLen];
      if (chans[ci].kind == K_DPCM) {
        if (v.trig) { row[DIV_PAT_NOTE] = v.note; row[DIV_PAT_INS] = insIdx; }
        continue;
      }
      if (v.on) {
        if (!on || v.trig || v.note != lastNote || insIdx != lastIns) {
          row[DIV_PAT_NOTE] = v.note; row[DIV_PAT_INS] = insIdx;
          lastNote = v.note; lastIns = insIdx; on = true;
        }
        if (v.vol >= 0 && v.vol != lastVol) { row[DIV_PAT_VOL] = v.vol; lastVol = v.vol; }
        if (v.fine != lastFine) { row[DIV_PAT_FX(0)] = 0xE5; row[DIV_PAT_FXVAL(0)] = 0x80 + v.fine; lastFine = v.fine; }
      } else if (on) {
        row[DIV_PAT_NOTE] = DIV_NOTE_OFF;
        on = false; lastNote = -1;
      }
    }
  }
  song.insLen = (int)song.ins.size();
  song.waveLen = (int)song.wave.size();
  song.sampleLen = (int)song.sample.size();
  return true;
}
