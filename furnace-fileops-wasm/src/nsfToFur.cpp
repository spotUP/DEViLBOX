/**
 * nsfToFur.cpp - NSF to editable Furnace song (NSF import, Phase 2).
 *
 * Runs the NSF in game-music-emu's Nsf_Emu (compiled into this module as the
 * static library gme_nsf), records the per-PLAY-call voice state with the
 * shared Nsf_Trace (game-music-emu-wasm/src/nsf_trace.h), and turns it into a
 * DivSong: one channel per voice (2A03 + DPCM, then VRC6, VRC7, FDS, MMC5,
 * N163, S5B when the NSF header names them). Compaction (Phase 3): the song
 * speed S is the largest frames-per-row that divides >= 85% of the gaps
 * between note onsets in each channel (see the row grid comment); each note's per-frame volume/arpeggio/fine pitch/duty becomes
 * instrument macros (shared by content), off-grid onsets get EDxx, identical
 * pattern blocks share an index. fur_save then writes it, so the import goes
 * through the one .fur load path.
 *
 * Conversion logic (when a voice counts as playing, which register change
 * starts a note, period to pitch per chip, DPCM sample capture) follows
 * FamiStudio NsfFile.cs Load/UpdateChannel (MIT, BleuBleu). Pitch is written
 * as the nearest note plus a pitch macro (linear pitch: 1/128 semitone).
 */

#include "engine.h"
#include "Nsf_Emu.h"
#include "nsf_trace.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
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
      if (!hzToNote(kCpu / (16.0 * (period + 1)), v.note, v.fine)) break;
      v.on = true; v.vol = vol;
      insOut = pulseIns(b, ch.kind == K_SQ ? "2A03" : "MMC5", DIV_INS_NES); v.duty = s[0] >> 6;
      break;
    }
    case K_TRI: {
      const uint16_t* s = o + T_TRI;
      if (!s[6] || !s[4] || !s[5] || s[7] < 2) break;
      if (!hzToNote(kCpu / (32.0 * (s[7] + 1)), v.note, v.fine)) break;
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
  sub->patLen = patLen;

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

  // Row grid. Channels often sit at different phases of one tempo, so the row length comes from
  // the gaps between onsets inside each channel: S is the largest frames-per-row (2..20) that
  // divides >= 85% of those gaps. A smaller divisor of S that also puts >= 90% of all onsets on
  // one phase wins (fewer EDxx delays); else the dominant phase of S is used. No fit: S = 1.
  std::vector<int> gaps;
  for (int ci = 0; ci < nCh; ci++) {
    int last = -1;
    for (int f = 0; f < n; f++) if (onset[ci][f]) { if (last >= 0) gaps.push_back(f - last); last = f; }
  }
  auto phaseFit = [&](int s, int& bp) {
    std::vector<int> h(s, 0);
    for (int f: allOn) h[f % s]++;
    bp = 0;
    for (int p = 1; p < s; p++) if (h[p] > h[bp]) bp = p;
    return (int)(1000LL * h[bp] / (long long)allOn.size());
  };
  int S = 1, phase = 0, fitPm = 1000;
  if (!gaps.empty()) {
    for (int s = 20; s >= 2 && S == 1; s--) {
      int hit = 0;
      for (int g: gaps) hit += g % s == 0;
      if (1000LL * hit < 850LL * (long long)gaps.size()) continue;
      S = s; fitPm = phaseFit(s, phase);
      for (int d = s / 2; d >= 2; d--) {
        int bp;
        const int pm = s % d ? 0 : phaseFit(d, bp);
        if (pm >= 900) { S = d; phase = bp; fitPm = pm; break; }
      }
    }
  }
  // Pad < S frames of silence in front so the dominant phase falls on row starts.
  const int pad = (S - phase) % S;
  const int R = (n + pad + S - 1) / S;
  sub->speeds.val[0] = S; sub->speeds.len = 1;
  sub->ordersLen = (R + patLen - 1) / patLen;

  struct Cell { short note = -1, ins = -1, fx = -1, fxv = -1; };
  std::vector<std::vector<Cell>> cells(nCh, std::vector<Cell>(R));
  auto place = [&](Cell& cl, int vf) { if (vf % S) { cl.fx = 0xED; cl.fxv = (short)(vf % S); } };

  // Segments: one note per row start; frames until the next start fold into macros.
  struct Seg { int ci, tmpl, len; std::vector<int> vol, arp, pit, duty; Cell* cell; };
  std::vector<Seg> segs;
  int dpcmHits = 0, dpcmTrigs = 0;
  std::map<int, int> dpcmIns; // template -> song instrument
  for (int ci = 0; ci < nCh; ci++) {
    if (chans[ci].idx < 0) continue;
    const Kind k = chans[ci].kind;
    const std::vector<Fr>& a = fr[ci];
    if (k == K_DPCM) {
      int lastRow = -1;
      for (int f = 0; f < n; f++) {
        if (!a[f].trig) continue;
        dpcmTrigs++;
        const int vf = f + pad, row = vf / S;
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
    for (int f = 0; f < n; f++)
      if (onset[ci][f] && (starts.empty() || (f + pad) / S != (starts.back() + pad) / S)) starts.push_back(f);
    for (size_t si = 0; si < starts.size(); si++) {
      const int s = starts[si], e = si + 1 < starts.size() ? starts[si + 1] : n;
      int lastOn = s;
      for (int f = s; f < e; f++) if (a[f].on) lastOn = f;
      int end = lastOn + 1; // macro covers [s, end)
      const int row = (s + pad) / S;
      if (end < e) {
        const int offRow = (end + pad) / S;
        const bool free = offRow != row && (si + 1 >= starts.size() || offRow != (e + pad) / S);
        if (free) { Cell& off = cells[ci][offRow]; off.note = DIV_NOTE_OFF; place(off, end + pad); }
        else if (k != K_VRC7) end = e; // gap becomes volume 0 in the macro
      }
      Seg g; g.ci = ci; g.tmpl = a[s].tmpl; g.len = end - s;
      Cell& cl = cells[ci][row];
      cl.note = (short)a[s].note; place(cl, s + pad);
      g.cell = &cl;
      int ar = 0, pi = a[s].fine, du = a[s].duty;
      for (int f = s; f < end; f++) {
        if (a[f].on) { ar = a[f].note - a[s].note; pi = a[f].fine; if (a[f].duty >= 0) du = a[f].duty; }
        g.vol.push_back(a[f].on ? a[f].vol : 0); g.arp.push_back(ar); g.pit.push_back(pi); g.duty.push_back(du);
      }
      segs.push_back(std::move(g));
    }
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
  std::map<int, std::vector<int>> byTmpl;
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

  // Patterns: patLen-row blocks per channel, identical blocks share one pattern index.
  int chanPats = 0;
  for (int ci = 0; ci < nCh; ci++) {
    sub->pat[ci].effectCols = 1;
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
          row[DIV_PAT_FX(0)] = cl.fx; row[DIV_PAT_FXVAL(0)] = cl.fxv;
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
    int ins = -1, base = 0, t0 = 0;
    for (int vf = 0; vf < R * S; vf++) {
      const int row = vf / S;
      {
        DivPattern* p = sub->pat[ci].getPattern(sub->orders.ord[ci][row / patLen], false);
        const short* cl = p->newData[row % patLen];
        const int d = cl[DIV_PAT_FX(0)] == 0xED ? cl[DIV_PAT_FXVAL(0)] : 0;
        if (vf % S == d) {
          if (cl[DIV_PAT_NOTE] == DIV_NOTE_OFF) playing = false;
          else if (cl[DIV_PAT_NOTE] >= 0) {
            playing = true; base = cl[DIV_PAT_NOTE]; t0 = vf;
            if (cl[DIV_PAT_INS] >= 0) ins = cl[DIV_PAT_INS];
          }
        }
      }
      const int f = vf - pad;
      if (f < 0 || f >= n) continue;
      const Fr& tr = fr[ci][f];
      bool mOn = false;
      int mVol = 0, mP = 0, mDuty = -1;
      if (playing && ins >= 0) {
        const DivInstrumentSTD& m = song.ins[ins]->std;
        const int t = vf - t0;
        mVol = macroAt(m.volMacro, t);
        mP = (base + macroAt(m.arpMacro, t)) * 128 + macroAt(m.pitchMacro, t);
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
  st[8] = chanPats; st[9] = sub->ordersLen; st[10] = (int)song.ins.size();
  song.insLen = (int)song.ins.size();
  song.waveLen = (int)song.wave.size();
  song.sampleLen = (int)song.sample.size();
  return true;
}

extern "C" int nsf_get_stat(int i) { return i >= 0 && i < 16 ? g_nsfStats[i] : 0; }
