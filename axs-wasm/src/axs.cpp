/* SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AXS (AXSF IFF song) replayer, written clean-room from the format description
 * (bbmp-replayers/axs-description-only/description.md) and its tables (axs_tables.h).
 * The section numbers in comments are the description's. Engine rate 44100 Hz; build with
 * -fwrapv (32-bit integer arithmetic wraps as the description requires). */
#include "axs_tables.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace axs {

constexpr int RATE = 44100;
constexpr int VOICES = 64;

static inline int32_t P24(int32_t a, int32_t b) { return (int32_t)(((int64_t)a * b) >> 24); }
static inline int32_t P23(int32_t a, int32_t b) { return (int32_t)(((int64_t)a * b) >> 23); }
static inline int32_t P30(int32_t a, int32_t b) { return (int32_t)(((int64_t)a * b) >> 30); }
static inline int32_t P7(int32_t a, int32_t b) { return (int32_t)(((int64_t)a * b) >> 7); }
static inline uint32_t UHI(uint32_t a, uint32_t b) { return (uint32_t)(((uint64_t)a * b) >> 32); }
static inline float FB(uint32_t bits) { float f; std::memcpy(&f, &bits, 4); return f; }
static inline int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }
static inline int32_t clamp24(int32_t v) { return v < -0x800000 ? -0x800000 : v > 0x7FFFFF ? 0x7FFFFF : v; }
static inline int32_t rint32(double r) {
  if (!std::isfinite(r) || r >= 2147483647.5 || r < -2147483648.5) return INT32_MIN;
  return (int32_t)std::nearbyint(r);
}

/* §11.1 exponential envelope */
struct ExpEnv {
  int stage = 0;
  uint32_t x = 0, a = 0, d = 0, r = 0;
  int32_t s = 0, A = 0, SL = 0, DS = 0, RL = 0, level = 0;
  int* linked = nullptr;
  void derive() { SL = P24(s, A); DS = P24(0x1000000 - s, A); }
  void start() { stage = 5; }
  void release() { if (stage > 1) { stage = 1; RL = level; x = 0x42000000u; } }
  void step() {
    switch (stage) {
      case 5: x = 0x2000000u; stage = 4; [[fallthrough]];
      case 4:
        x += UHI(x, a);
        if (x >= 0x42000000u) { stage = 3; x = 0x42000000u; level = A; }
        else level = P30((int32_t)(x - 0x2000000u), A);
        break;
      case 3:
        x = UHI(x, d);
        if (x > 0x2000000u) level = P30((int32_t)(x - 0x2000000u), DS) + SL;
        else if (SL > 0) { stage = 2; level = SL; }
        else { stage = 0; level = 0; }
        break;
      case 2: level = SL; break;
      case 1:
        x = UHI(x, r);
        if ((int32_t)(x - 0x2000000u) < 0x100000) { stage = 0; level = 0; if (linked) --*linked; }
        else level = P30((int32_t)(x - 0x2000000u), RL);
        break;
      default: level = 0; break;
    }
  }
};

/* §11.2 linear (pitch) envelope */
struct LinEnv {
  int stage = 0;
  int32_t level = 0, slope = 0, tA = 0, tD = 0, tR = 0, S = 0, amount = 0, out = 0;
  static int32_t Slope(int32_t range, int32_t t) {
    int32_t n = (int32_t)((uint32_t)(44100 * t) >> 10);
    return n ? range / n : range;
  }
  void endAttack() {
    if (tD != 0) { slope = Slope(0x1000000 - S, tD); level = 0x1000000; } else level = S;
    stage = 3;
  }
  void step() {
    switch (stage) {
      case 5:
        level = 0; stage = 4;
        if (tA == 0) { endAttack(); break; }
        slope = Slope(0x1000000, tA);
        [[fallthrough]];
      case 4: { int32_t n = level + slope; if (n < 0x1000000) level = n; else endAttack(); break; }
      case 3: { int32_t n = level - slope; if (n > S) level = n; else { level = S; stage = 2; } break; }
      case 2: out = P24(S, amount); return;
      case 1: { int32_t n = level - slope; if (n <= 0) { level = 0; stage = 0; } else level = n; break; }
      default: return;
    }
    out = P24(level, amount);
  }
  void release() { if (stage > 1) { slope = Slope(level, tR); if (!slope) slope = 1; stage = 1; } }
  void setTA(int32_t v) { tA = v; if (stage == 4) { slope = tA; if (tA) slope = Slope(0x1000000, tA); } }
  void setTD(int32_t v) { tD = v; if (stage == 3) { slope = tD; if (tD) slope = Slope(0x1000000 - S, tD); } }
  void setTR(int32_t v) { tR = v; if (stage == 1) slope = Slope(level, tR); }
};

struct Osc { uint32_t phase = 0; int32_t inc = 0, w = 0x1000000, y = 0; };

struct Setup {
  int wave[2] = {0, 0}, fine[2] = {0, 0}, coarse[2] = {0, 0}, note[2] = {0, 0};
  int32_t pw[2] = {0x1000000, 0x1000000};
  int32_t mix = 0, ring = 0, drive = 0;
  bool soft = false, andMode = false;
  int32_t cutBase = 0, res = 0; int ftype = 0;
  ExpEnv amp, fenv; LinEnv penv; int penvBits = 0;
  int32_t send = 0; int bus = 0;
  bool keyFollow = false, sync = false, fenvVel = false, volVel = false, glideOn = false;
  int keyAmt = 0; int32_t glideTime = 0;
};

struct Lfo { Osc o; int shape = 0, code = 0; int32_t depth = 0; bool restart = false; };

struct Inst {
  Setup su;
  uint8_t raw[128] = {};
  int vol = 0;
  Lfo lfo[2];
  int32_t L1 = 0, L2 = 0;
  int held = 0, sounding = 0, last = -1;
};

struct Biquad {
  double a1 = 0, a2 = 0, b = 0; int type = 0;
  int32_t x1[2] = {0, 0}, x2[2] = {0, 0}; float y1[2] = {0, 0}, y2[2] = {0, 0};
  void clear() { for (int i = 0; i < 2; i++) { x1[i] = x2[i] = 0; y1[i] = y2[i] = 0; } }
  int32_t stage(int k, int32_t x) {
    double s;
    if (type == 3) s = (double)(x - x2[k]);
    else if (type == 4) s = (double)(x + x2[k]);
    else if (type == 2) s = (double)(x - 2 * x1[k] + x2[k]);
    else s = (double)(x + 2 * x1[k] + x2[k]);
    double r;
    if (type == 4) { x2[k] = x1[k]; r = (s * b - ((double)y1[k] - (double)x1[k]) * a1) - (double)y2[k] * a2; x1[k] = x; }
    else { x2[k] = x1[k]; x1[k] = x; r = (s * b - (double)y1[k] * a1) - (double)y2[k] * a2; }
    y2[k] = y1[k];
    y1[k] = (float)r;
    return rint32(r);
  }
  int32_t run(int32_t x) { int32_t y = stage(0, x); return type == 1 ? stage(1, y) : y; }
};

/* §8.6 coefficients */
static void coeffs(Biquad& f, int type, int32_t cutoff, int32_t res) {
  f.type = type;
  const int F = clampi(cutoff, 60, 21922);
  const double W0 = FB(T_W0_BITS[0]);
  const double w = F * W0;
  if (type <= 2) {
    const int ri = clampi(res, 0, 127);
    const double q = FB(type == 1 ? T_Q24_BITS[ri] : T_Q12_BITS[ri]);
    const double g = FB(type == 1 ? T_GAIN24_BITS[ri] : T_GAIN12_BITS[ri]);
    const double t = type == 2 ? 1.0 / std::tan(w) : std::tan(w);
    const double t2 = t * t, qt = q * t, D = (t2 + qt) + 1;
    f.a2 = (float)(((t2 - qt) + 1) / D);
    f.b = (float)((t2 / D) * g);
    f.a1 = type == 2 ? (float)(((1 - t2) + (1 - t2)) / D) : (float)(((t2 + (-1)) + (t2 + (-1))) / D);
    if (F == 11025 && type == 0 && res == 77) f.a1 = FB(0x34498AA5u);
    if (F == 11025 && type == 1 && res == 70) f.a1 = FB(0x343C648Cu);
  } else if (type == 3) {
    const double c = std::cos(w) * -2, k = 1.0 / std::tan(res * W0), n = 1.0 / (1 + k);
    f.a2 = (float)((k - 1) * n); f.a1 = (float)((k * c) * n); f.b = (float)n;
  } else {
    const double c = std::cos(w) * -2, t = std::tan(res * W0), n = 1.0 / (t + 1);
    f.a2 = (float)((1 - t) * n); f.b = (float)n; f.a1 = (float)(c * n);
  }
}

struct Voice {
  Setup su;
  int inst = 0, note = 0, vel = 0, idx = 0;
  bool pending = false;
  Osc o[2];
  int32_t Vol = 0, step = 0, w[2] = {0, 0}, mixNow = 0;
  uint32_t counter = 0;
  int32_t keytrack = 0;
  int32_t glideCount = 0, glideTotal = 0, glideFrom = 0;
  Biquad flt;
  // drum
  int sample = 0; uint32_t pos = 0; int32_t dinc = 0, dend = 0; bool filtered = false;
  int stage() const { return su.amp.stage; }
};

struct DNote { int pitch = 64, att = 0, dec = 127, send = 5, amp = 64, sample = 0, field = 0, flags = 0x41, cutoff = 127, res = 0; };
struct Samp { std::vector<int16_t> d; int n = 0; int rate = 0; };
struct Cell { uint8_t note = 0, vel = 0, cmd = 0, par = 0; };
struct Block { int T = 0, R = 0; uint8_t trk[16] = {}; std::vector<Cell> cells; int filled = 0;
  Cell& at(int t, int r) { return cells[(size_t)t * 256 + r]; } };

struct Ring { std::vector<int32_t> d = std::vector<int32_t>(8192); int w = 0, r = 0; int32_t last = 0;
  int32_t push(int32_t v) { d[w] = v; w = (w + 1) & 8191; last = d[r]; r = (r + 1) & 8191; return last; } };

struct Song {
  Inst inst[8];
  Voice v[VOICES];
  DNote dn[128];
  std::vector<Samp> samp;
  std::vector<Block> blocks;
  std::vector<uint32_t> order, omask;
  int bpm = 134, tpr = 6, shdrBpm = 134, shdrTpr = 6;
  double t = 0, D = 0;
  uint32_t seed = 0xDEADFEEDu;
  // sequencer
  bool playing = false, brk = false; int jump = -1;
  int p = 0, b = 0, r = 0, k = 0; uint32_t m = 0;
  int nsInst[16] = {}, nsNote[16] = {};
  // delay
  std::vector<int32_t> ring = std::vector<int32_t>(65536), ps = std::vector<int32_t>(65536);
  int dw = 1000, lread = 0, rread = 0, pr = 0, pw = 441;
  int32_t dS = 0, dF = 0; bool dSync = false; int dDiv = 1, dTime = 5;
  // reverb
  int preset = 0; Ring rv[5]; int32_t z = 0, rk = 0, g[3] = {0, 0, 0}, rs = 0;
  bool usesJump = false;
  int blockPos = 0;
};

/* §8.2 waves */
static int32_t Z(uint32_t u, uint32_t w) {
  if (u < w) return (int32_t)((((int64_t)(u >> 8)) << 32) / (int64_t)(w ? w : 1) - 0x800000);
  const uint32_t rw = 0x1000000u - w;
  return (int32_t)((((int64_t)((0x1000000u - u) >> 8)) << 32) / (int64_t)(rw ? rw : 1) - 0x800000);
}

static int32_t wave(Song& s, int shape, Osc& o, int32_t A6) {
  const uint32_t p = o.phase, i = (uint32_t)o.inc, w = (uint32_t)o.w, pn = (p + i) & 0xFFFFFF;
  int32_t y = 0;
  switch (shape) {
    case 0: { int32_t c = (int32_t)((p + 0x400000) & 0xFFFFFF) - 0x800000; if (c > 0) c = -c; y = 2 * c + 0x800000; o.phase = pn; break; }
    case 1: y = (int32_t)(p ^ 0x800000) - 0x800000; o.phase = pn; break;
    case 2: y = ((int32_t)(p - w) < 0) ? 0x7FFFFF : -0x800000; o.phase = pn; break;
    case 3: case 9:
      if ((pn ^ (pn + i)) & 0xFF100000u) { s.seed = s.seed * 0x41C64E6Du + 0x3039u; o.y = (int32_t)(s.seed & 0xFFFFFF) - 0x800000; }
      y = o.y; o.phase = pn; break;
    case 4: y = Z((pn + (w >> 1)) & 0xFFFFFF, w); o.phase = pn; break;
    case 5: case 11: y = T_SINE[(p >> 10) & 16383]; o.phase = pn; break;
    case 6: {
      uint32_t x = (p + 0x400000) & 0xFFFFFF; int32_t sum = A6;
      for (int j = 0; j < 8; j++) { int32_t c = (int32_t)x - 0x800000; if (c > 0) c = -c; sum += 2 * c + 0x800000; x = (x + (i >> 3)) & 0xFFFFFF; }
      y = sum >> 3; o.phase = (x - 0x400000) & 0xFFFFFF; break;
    }
    case 7: {
      const uint32_t a = p ^ 0x800000, bb = pn ^ 0x800000;
      if (a < bb) y = (int32_t)((a + bb) >> 1) - 0x800000;
      else { const uint32_t st = i >> 4; uint32_t sum = a; for (uint32_t j = 1; j <= 15; j++) sum += (a + j * st) & 0xFFFFFF; y = (int32_t)(sum >> 4) - 0x800000; }
      o.phase = pn; break;
    }
    case 8: {
      const uint32_t st = i << 4; uint32_t x = p << 8; int cnt = 0;
      for (int j = 0; j < 16; j++) { if (x < (w << 8)) cnt++; x += st; }
      o.phase = x >> 8; y = (cnt - 8) << 20; break;
    }
    case 10: {
      uint32_t x = p; int32_t sum = 0;
      for (int j = 0; j < 8; j++) { sum += Z((x + (w >> 1)) & 0xFFFFFF, w); x = (x + (i >> 3)) & 0xFFFFFF; }
      o.phase = x; y = sum >> 3; break;
    }
    default: o.phase = pn; break;
  }
  o.y = (shape == 3 || shape == 9) ? o.y : y;
  return y;
}

/* §8.1 */
static int32_t oscInc(int q) {
  if (q < 0) return 0;
  const int hi = q >> 8 > 383 ? 383 : q >> 8;
  const int32_t h = (int32_t)(((int64_t)(int32_t)T_PITCH_COARSE[hi] * (int32_t)T_PITCH_FINE[q & 255]) >> 32);
  return (int32_t)((int64_t)h * 1024 / RATE);
}

static int32_t depthCurve(int code, int v) {
  const int32_t* t = (code == 1) ? T_DEPTH_B : (code == 2) ? T_DEPTH_C : (code == 3 || code == 4 || code == 9) ? T_DEPTH_D : T_DEPTH_A;
  return t[v & 127];
}
static int32_t lfoInc(int v) { uint32_t d = (44100u * (uint32_t)T_LFO_PERIOD[v & 127]) >> 10; return (int32_t)(0x1000000u / (d ? d : 1)); }
static int32_t W28(int shape, int v) { return (shape == 2 || shape == 4) ? (((13 * v) << 20) / 128 + 0x100000) : 0x1000000; }
static int32_t pwFor(int wv, int v) { return wv == 4 ? T_PW_SLOPE[v & 127] : T_PW_PULSE[v & 127]; }

/* §12 delay length */
static void recomputeDelay(Song& s) {
  static const int DIV[6] = {3, 4, 6, 8, 9, 12};
  int Ld;
  if (s.dSync) Ld = (int)(((1.0 / (s.bpm * (1.0 / 60))) * DIV[s.dDiv - 1] * 44100) * (1.0 / 12));
  else Ld = (s.dTime * 44100 * 5) / 1000;
  s.rread = (s.dw - Ld) & 0xFFFF;
  s.lread = (s.dw - P24(2 * s.dS + 0x1000000, Ld)) & 0xFFFF;
}
static void setTempo(Song& s, int bpm) { s.bpm = clampi(bpm, 32, 255); s.D = 60.0 / (s.bpm * 24); recomputeDelay(s); }

static int prime(int n) {
  if (n <= 2) return 2;
  if (n >= 8191) return 8191;
  for (int i = 0; i < 1028; i++) if (T_PRIMES[i] >= n) return T_PRIMES[i];
  return 8191;
}
static void applyPreset(Song& s, int pr) {
  s.preset = clampi(pr, 0, 15);
  for (Ring& q : s.rv) { std::fill(q.d.begin(), q.d.end(), 0); q.w = q.r = 0; q.last = 0; }
  s.z = 0;
  const int32_t* row = &T_REVERB_PRESETS[s.preset * 12];
  if (!row[0]) return;
  const double a = 0.27566444771 / row[11];
  s.rk = (int32_t)(a * 16777216.0 / (1.0 / 44100 + a));
  const int ms[5] = {row[8], row[10], row[2], row[4], row[6]};
  for (int i = 0; i < 5; i++) s.rv[i].r = (s.rv[i].w - prime(ms[i] * 44100 / 1000)) & 8191;
  for (int i = 0; i < 3; i++) {
    double g = std::pow(10.0, (row[2 + 2 * i] * -3.0) / row[1 + 2 * i]);
    if (g > 0.9) g = 0.9;
    s.g[i] = (int32_t)(g * 16777216.0);
  }
}
static int32_t reverb(Song& s, int32_t u) {
  const int32_t* row = &T_REVERB_PRESETS[s.preset * 12];
  if (!row[0]) return 0;
  const int32_t gA = row[7], gB = row[9];
  const int32_t pA = s.rv[0].last - P24(gA, u);
  s.rv[0].push(u + P24(gA, pA));
  const int32_t pB = s.rv[1].last - P24(gB, pA);
  s.z = pB + P24(s.z - pB, s.rk);
  s.rv[1].push(pA + P24(gB, s.z));
  int32_t c[3];
  for (int i = 0; i < 3; i++) c[i] = s.rv[2 + i].push(s.z + P24(s.g[i], s.rv[2 + i].last));
  s.rs = ((c[0] + c[1] + c[2]) >> 5) + (s.rs >> 4) - s.rs;
  return s.rs << 3;
}

/* Recompute the increment of a sounding voice's oscillator <n> with add 0 (controllers 33, 77). */
static void voiceInc(Voice& v, int n) { v.o[n].inc = oscInc(v.su.fine[n] + ((v.su.note[n] + v.su.coarse[n]) << 8)); }

static bool soundingCtl(int c) {
  switch (c) {
    case 8: case 9: case 13: case 17: case 30: case 31: case 33: case 35: case 45: case 50: case 51: case 52:
    case 53: case 54: case 55: case 70: case 71: case 72: case 73: case 74: case 75: case 77: case 78: case 79:
    case 80: case 94: case 90: return true;
    default: return c >= 36 && c <= 43;
  }
}

/* §5.2 one controller on one setup (instrument copy or a sounding voice's copy). */
static void applySetup(Inst& in, Setup& su, Voice* vo, int c, int v) {
  const int vp = v == 127 ? 128 : v;
  switch (c) {
    case 5: su.glideTime = P24(T_GLIDE_TIME[v], 44100); break;
    case 8: su.mix = v << 17; break;
    case 9: su.drive = v << 17; break;
    case 13: su.ring = v << 17; break;
    case 17: su.soft = v >= 1; break;
    case 30: case 31: { const int n = c - 30; su.wave[n] = clampi(v, 0, 11); su.pw[n] = pwFor(su.wave[n], in.raw[78 + n]); break; }
    case 33: su.fine[0] = -(T_DETUNE[v] >> 1); su.fine[1] = T_DETUNE[v] >> 1; if (vo) { voiceInc(*vo, 0); voiceInc(*vo, 1); } break;
    case 34: su.keyFollow = v >= 64; break;
    case 35: su.sync = v >= 64; break;
    case 36: su.amp.d = T_AMP_DECAY[v]; break;
    case 37: su.amp.s = (int32_t)((int64_t)v * 0x1000000 / 128); su.amp.derive(); break;
    case 38: su.fenv.a = T_FENV_ATTACK[v]; break;
    case 39: su.fenv.d = T_FENV_DECAY[v]; break;
    case 40: su.fenv.s = T_SUSTAIN_LEVEL[v]; su.fenv.derive(); break;
    case 41: su.fenv.r = T_FENV_DECAY[v]; break;
    case 42: su.fenvVel = v >= 64;
      if (vo) { const int32_t f = su.fenvVel ? T_VELOCITY_CURVE[vo->vel] : 0x1000000; su.fenv.A = P24(f, in.su.fenv.A); su.fenv.derive(); }
      break;
    case 43:
      if (vo) { const int32_t f = su.fenvVel ? T_VELOCITY_CURVE[vo->vel] : 0x1000000; su.fenv.A = P24(f, T_FENV_AMOUNT[v]); }
      else su.fenv.A = T_FENV_AMOUNT[v];
      su.fenv.derive(); break;
    case 44: su.note[0] = su.note[1] = v; break;
    case 45: su.volVel = v >= 64; break;
    case 50: su.penv.setTA(T_ENV_TIME_MS[v]); break;
    case 51: su.penv.setTD(T_ENV_TIME_MS[v]); break;
    case 52: su.penv.S = vp << 17; break;
    case 53: su.penv.setTR(T_ENV_TIME_MS[v] + 2); break;
    case 54: su.penv.amount = (((vp - 64) * 9 * 1024) / 64) & ~0xFF; break;
    case 55: su.penvBits = clampi(v, 0, 3); break;
    case 65: su.glideOn = v >= 64; break;
    case 70: su.amp.A = T_VELOCITY_CURVE[v]; su.amp.derive(); break;
    case 71: su.res = su.ftype < 3 ? v : T_BANDWIDTH_HZ[v]; break;
    case 72: su.amp.r = T_AMP_DECAY[v]; break;
    case 73: su.amp.a = T_AMP_ATTACK[v]; break;
    case 74: su.cutBase = T_CUTOFF_HZ[v]; break;
    case 75: su.ftype = clampi(v, 0, 4); { const int r71 = in.raw[71]; su.res = su.ftype < 3 ? r71 : T_BANDWIDTH_HZ[r71]; } break;
    case 76: su.keyAmt = clampi(v, 0, 3); break;
    case 77: su.coarse[1] = ((vp - 64) * 24) / 64; if (vo) voiceInc(*vo, 1); break;
    case 78: case 79: su.pw[c - 78] = pwFor(su.wave[c - 78], v); break;
    case 80: su.andMode = v >= 64; break;
    case 90: su.bus = v >= 64 ? 1 : 0; break;
    case 94: su.send = v << 17; break;
    default: break;
  }
}

static void releaseVoiceEnvs(Song& s, Voice& v) {
  v.su.amp.release(); v.su.fenv.release(); v.su.penv.release();
  if (v.inst < 7) s.inst[v.inst].held--;
}

/* §5.1 controller path */
static void control(Song& s, int k, int c, int v) {
  c &= 127; v &= 127;
  Inst& in = s.inst[k];
  in.raw[c] = (uint8_t)v;
  const int vp = v == 127 ? 128 : v;
  switch (c) {  // §5.3 globals
    case 7: in.vol = v; break;
    case 10: s.dS = vp << 16; recomputeDelay(s); break;
    case 11: s.dDiv = clampi(v, 1, 6); recomputeDelay(s); break;
    case 14: s.dF = vp << 16; break;
    case 15: s.dSync = v >= 64; recomputeDelay(s); break;
    case 16: s.dTime = clampi(v, 5, 99); recomputeDelay(s); break;
    case 89: applyPreset(s, v); break;
    default: break;
  }
  if (k == 7) return;
  if (c == 1) c = 74;
  switch (c) {  // instrument-only controllers
    case 12: return;  // mono: read from raw12 at voice find
    case 18: in.lfo[0].restart = v >= 64; return;
    case 19: in.lfo[0].o.inc = lfoInc(v); return;
    case 20: in.lfo[0].shape = v == 0 ? 0 : v == 1 ? 1 : 5; return;
    case 21: { static const int C[8] = {0, 1, 2, 3, 5, 7, 8, 4}; in.lfo[0].code = C[clampi(v, 0, 7)]; in.lfo[0].depth = depthCurve(in.lfo[0].code, in.raw[22]); return; }
    case 22: in.lfo[0].depth = depthCurve(in.lfo[0].code, v); return;
    case 23: in.lfo[0].o.w = 0x1000000; return;
    case 24: in.lfo[1].o.inc = lfoInc(v); return;
    case 25: { static const int S[4] = {2, 3, 4, 5}; in.lfo[1].shape = S[clampi(v, 0, 3)]; in.lfo[1].o.w = W28(in.lfo[1].shape, in.raw[28]); return; }
    case 26: { static const int C[8] = {0, 1, 2, 4, 6, 5, 9, 3}; in.lfo[1].code = C[clampi(v, 0, 7)]; in.lfo[1].depth = depthCurve(in.lfo[1].code, in.raw[27]); return; }
    case 27: in.lfo[1].depth = depthCurve(in.lfo[1].code, v); return;
    case 28: in.lfo[1].o.w = W28(in.lfo[1].shape, v); return;
    case 29: in.lfo[1].restart = v >= 64; return;
    case 44: in.last = v; break;
    case 64:
      if (v < 64)
        for (Voice& vo : s.v)
          if (vo.inst == k && vo.pending && vo.stage() != 0) { releaseVoiceEnvs(s, vo); vo.pending = false; }
      return;
    default: break;
  }
  applySetup(in, in.su, nullptr, c, v);
  if (soundingCtl(c))
    for (Voice& vo : s.v)
      if (vo.inst == k && vo.stage() != 0) applySetup(in, vo.su, &vo, c, v);
}

/* §7.1 + §7.2 */
static void start(Song& s, int i, int note, int vel) {
  Inst& in = s.inst[i];
  int found = -1; bool fresh = false;
  if (in.raw[12] >= 64)
    for (int j = 0; j < VOICES; j++) if (s.v[j].inst == i && s.v[j].stage() >= 2) { found = j; break; }
  if (found < 0)
    for (int j = 0; j < VOICES; j++) if (s.v[j].stage() == 0) { found = j; fresh = true; break; }
  if (found < 0) return;
  Voice& v = s.v[found];
  v.idx = found; v.inst = i; v.note = note & 127; v.pending = false;
  if (i == 7) {  // §10.1
    const DNote& d = s.dn[v.note];
    if (d.sample <= 0 || d.sample >= (int)s.samp.size() || s.samp[d.sample].n <= 0) return;
    const Samp& sm = s.samp[d.sample];
    v.vel = vel; v.sample = d.sample;
    v.dinc = ((int)(sm.rate * FB(T_PITCH_RATIO_BITS[d.pitch & 127])) << 8) / 44100;
    v.pos = 0; v.dend = sm.n + 0x4FFF;
    ExpEnv& e = v.su.amp;
    e = ExpEnv();
    e.a = T_AMP_ATTACK[d.att & 127];
    e.d = T_AMP_DECAY[(d.flags & 0x20) ? ((vel * d.dec) >> 7) & 127 : d.dec & 127];
    e.s = 0; e.r = T_AMP_DECAY[2];
    const int vol7 = s.inst[7].vol;
    const int j = (d.flags & 0x40) ? (vol7 * d.amp * vel) >> 14 : (vol7 * d.amp) >> 7;
    e.A = T_VELOCITY_CURVE[j & 127] << 1;
    e.derive(); e.start();
    v.counter = 0;
    v.su.bus = d.flags & 1; v.su.send = d.send << 17;
    if (d.flags & 0x10) v.pos = (uint32_t)((sm.n - 1) * (127 - vel));
    v.filtered = d.field > 0;
    if (v.filtered) {
      const int type = d.field - 1;
      const int32_t cut = T_CUTOFF_HZ[((d.flags & 0x80) ? (vel * d.cutoff) >> 7 : d.cutoff) & 127];
      const int32_t res = type < 3 ? d.res : T_BANDWIDTH_HZ[d.res & 127];
      coeffs(v.flt, type, cut, res); v.flt.clear();
    }
    return;
  }
  if (fresh) {
    v.su = in.su;
    v.vel = vel;
    v.Vol = in.vol << 17; if (v.su.volVel) v.Vol = P7(v.Vol, vel);
    v.step = 0;
  }
  v.counter = 0;
  v.keytrack = (int32_t)(((T_PITCH_COARSE[v.note] >> 16) * (uint32_t)v.su.keyAmt) / 3);
  const int32_t f = v.su.fenvVel ? T_VELOCITY_CURVE[v.vel] : 0x1000000;
  v.su.fenv.A = P24(v.su.fenv.A, f); v.su.fenv.derive();
  if (v.su.glideOn && in.held > 0 && in.last >= 0) { v.glideFrom = in.last; v.glideCount = v.glideTotal = v.su.glideTime; }
  else v.glideCount = 0;
  if (v.su.keyFollow) { v.su.note[0] = v.su.note[1] = v.note; in.last = v.note; in.raw[44] = (uint8_t)v.note; }
  else v.su.note[0] = v.su.note[1] = in.raw[44];
  if (fresh) {
    in.held++; in.sounding++;
    v.o[0].phase = v.o[1].phase = 0;
    for (Lfo& l : in.lfo) if (l.restart) l.o.phase = 0;
    v.flt.clear();
    v.su.amp.linked = &in.sounding;
    v.su.amp.start(); v.su.fenv.start(); v.su.penv.stage = 5;
  }
}

/* §7.3 */
static void release(Song& s, int i, int n) {
  const bool pedal = i < 7 && s.inst[i].raw[64] >= 64;
  for (Voice& v : s.v) {
    if (v.inst != i || v.note != n || v.stage() < 2 || v.pending) continue;
    if (pedal) { v.pending = true; continue; }
    releaseVoiceEnvs(s, v);
    if (i < 7 && s.inst[i].last == n) s.inst[i].last = -1;
  }
}

/* §6.3 note states */
static void noteOff(Song& s, int t) {
  if (s.nsNote[t] > 0) release(s, s.nsInst[t], s.nsNote[t] - 1);
  s.nsNote[t] = 0;
}
static void play(Song& s, int t, int i, int n, int v) {
  if (s.nsInst[t] == i && s.nsNote[t] == n) { noteOff(s, t); start(s, i, n - 1, v); }
  else { start(s, i, n - 1, v); noteOff(s, t); }
  s.nsInst[t] = i; s.nsNote[t] = n;
}

static void timed(Song& s, int t, int i, const Cell& c, int o) {
  const int d = s.k - o;
  if (c.cmd == 13) { if (c.par == d && c.note > 0) { noteOff(s, t); if (c.note <= 128) play(s, t, i, c.note, c.vel); } }
  else if (c.cmd == 14) { if (c.par > 0 && d % c.par == 0 && c.note > 0) { noteOff(s, t); if (c.note <= 128) play(s, t, i, c.note, c.vel); } }
  else if (c.cmd == 27) {
    if (c.par + o >= s.tpr) { if (s.k == s.tpr - 1) noteOff(s, t); }
    else if (c.par == d) noteOff(s, t);
  }
}

static void noteRule(Song& s, int t, int i, const Cell& c) {
  if (c.note > 0 && !(c.cmd == 13 && c.par != 0)) { if (c.note <= 128) play(s, t, i, c.note, c.vel); else noteOff(s, t); }
}

/* §10 drum commands on voices of instrument 7 playing note n */
static void drumCmd(Song& s, int cmd, int n, int par) {
  const DNote& d = s.dn[n & 127];
  for (Voice& v : s.v) {
    if (v.inst != 7 || v.note != n || v.stage() <= 1) continue;
    const int vel = v.vel;
    switch (cmd) {
      case 7: v.su.amp.A = T_VELOCITY_CURVE[((d.amp * s.inst[7].vol * par) >> 14) & 127] << 1; v.su.amp.derive(); break;
      case 9: if (v.sample < (int)s.samp.size()) v.pos = (uint32_t)((s.samp[v.sample].n - 1) * par); break;
      case 20: v.su.amp.d = T_AMP_DECAY[((d.flags & 0x20) ? (d.dec * vel * par) >> 14 : (d.dec * par) >> 7) & 127]; break;
      case 25: if (v.sample < (int)s.samp.size())
          v.dinc = ((int)((int)(s.samp[v.sample].rate * FB(T_PITCH_RATIO_BITS[d.pitch & 127])) * FB(T_PITCH_RATIO_BITS[par & 127])) << 8) / 44100;
        break;
      case 29: case 26:
        if (d.field > 0) {
          const int type = d.field - 1;
          int32_t cut = T_CUTOFF_HZ[d.cutoff & 127];
          if (cmd == 29) { cut = T_CUTOFF_HZ[((d.flags & 0x80) ? (d.cutoff * vel * par) >> 14 : (d.cutoff * par) >> 7) & 127]; }
          int32_t res = d.field < 4 ? (d.res * par) >> 7 : T_BANDWIDTH_HZ[((d.res * par) >> 7) & 127];
          if (cmd == 29) res = type < 3 ? d.res : T_BANDWIDTH_HZ[d.res & 127];
          coeffs(v.flt, type, cut, res);
          if (cmd == 29) { res = d.field < 4 ? (d.res * par) >> 7 : T_BANDWIDTH_HZ[((d.res * par) >> 7) & 127]; coeffs(v.flt, type, cut, res); }
          v.filtered = true;
        }
        break;
      default: break;
    }
  }
}

/* §6.2 one tick */
static void tick(Song& s) {
  if (!s.playing) return;
  const int L = (int)s.order.size();
  if (s.k >= s.tpr) {
    s.k = 0; s.r++;
    if (s.r >= s.blocks[s.b].R || s.brk) {
      s.r = 0; s.brk = false;
      if (s.jump >= 0) { s.p = s.jump; s.jump = -1; } else s.p++;
      const int oldB = s.b;
      if (s.p >= L) { s.playing = false; s.p = 0; for (int t = 0; t < s.blocks[oldB].T; t++) noteOff(s, t); }
      for (int t = 0; t < s.blocks[oldB].T; t++) if (s.omask[s.p] & (1u << t)) noteOff(s, t);
      s.m = s.omask[s.p]; s.b = (int)s.order[s.p];
    }
  }
  Block& bl = s.blocks[s.b];
  for (int t = 0; t < bl.T; t++) {  // pass 1
    if (s.m & (1u << t)) continue;
    const Cell& c = bl.at(t, s.r);
    const int i = bl.trk[t] & 7, o = (s.r & 1) ? bl.trk[t] >> 4 : 0;
    if (i == 7) {
      if (s.k == o) { noteRule(s, t, 7, c); if (c.cmd == 27 && c.par == 0) noteOff(s, t); }
      else timed(s, t, 7, c, o);
    } else if (s.k == o) {
      static const int MAP[34] = {0, 22, 27, 19, 24, 65, 5, 50, 51, 54, 37, 0, 72, 0, 0, 0, 38, 39, 9, 73, 36, 17, 0, 40, 41, 0, 71, 0, 0, 74, 43, 7, 0, 94};
      if (c.cmd < 34 && MAP[c.cmd]) control(s, i, MAP[c.cmd], c.cmd == 5 ? (c.par ? 64 : 0) : c.par);
    }
  }
  for (int t = 0; t < bl.T; t++) {  // pass 2
    const Cell& c = bl.at(t, s.r);
    const int i = bl.trk[t] & 7, o = (s.r & 1) ? bl.trk[t] >> 4 : 0;
    if (s.k == o && c.cmd == 15) { if (c.par >= 1 && c.par <= 32) s.tpr = c.par; else if (c.par > 32) setTempo(s, c.par); }
    if (s.m & (1u << t)) continue;
    if (s.k == o) {
      if (i != 7) noteRule(s, t, i, c);
      else {
        if ((c.cmd == 7 || c.cmd == 9 || c.cmd == 20 || c.cmd == 25 || c.cmd == 26 || c.cmd == 29) && s.nsNote[t] > 0) drumCmd(s, c.cmd, s.nsNote[t] - 1, c.par);
        if (c.cmd == 31) control(s, 7, 7, c.par);
      }
      if (c.cmd == 11) s.brk = true;
      if (c.cmd == 22 && c.par < bl.T) { noteOff(s, c.par); s.m |= 1u << c.par; }
      if (c.cmd == 28 && c.par < L - 1) { s.jump = c.par; s.brk = true; }
      if (c.cmd == 34) control(s, i, 14, c.par);
      if (c.cmd == 35) control(s, i, 10, c.par);
      if (i != 7 && c.cmd == 27 && c.par == 0) noteOff(s, t);
    } else if (i != 7) timed(s, t, i, c, o);
  }
  s.k++;
}

/* §8.5 */
static void controlUpdate(Song& s, Voice& v) {
  Inst& in = s.inst[v.inst];
  int32_t T = in.vol << 17; if (v.su.volVel) T = P7(T, v.vel);
  v.step = (T - v.Vol) >> 10;
  v.w[0] = v.su.pw[0]; v.w[1] = v.su.pw[1]; v.mixNow = v.su.mix;
  int32_t cut = v.su.fenv.level + v.su.cutBase;
  int32_t add1 = 0, add2 = 0, common = 0;
  const int32_t L1 = in.L1, L2 = in.L2;
  switch (in.lfo[0].code) {
    case 1: cut += P24(cut, 2 * L1); break;
    case 3: add1 = (3 * L1) >> 13; break;
    case 4: add2 = (3 * L1) >> 13; break;
    case 5: v.w[0] += P23(v.su.pw[0], L1 - (L1 >> 4)); break;
    case 7: v.mixNow = clampi(v.su.mix + 2 * L1, 0, 0x1000000); break;
    default: break;
  }
  switch (in.lfo[1].code) {
    case 1: cut += P24(cut, 2 * L2); break;
    case 3: add1 += (3 * L2) >> 13; break;
    case 4: add2 += (3 * L2) >> 13; break;
    case 5: v.w[0] += P23(v.w[0], L2 - (L2 >> 4)); break;
    case 6: v.w[1] += P23(v.w[1], L2 - (L2 >> 4)); break;
    case 9: common = (3 * L2) >> 13; break;
    default: break;
  }
  if (v.glideCount > 0 && v.glideTotal > 0) common += (((v.glideFrom - v.note) * v.glideCount) << 8) / v.glideTotal;
  const int32_t pe = v.su.penv.out;
  v.o[0].inc = oscInc(add1 + common + ((v.su.penvBits & 1) ? pe : 0) + v.su.fine[0] + ((v.su.note[0] + 0) << 8));
  v.o[1].inc = oscInc(add2 + common + ((v.su.penvBits & 2) ? pe : 0) + v.su.fine[1] + ((v.su.note[1] + v.su.coarse[1]) << 8));
  coeffs(v.flt, v.su.ftype, v.keytrack + cut, v.su.res);
}

/* §8.4 */
static int32_t synthSample(Song& s, Voice& v) {
  Inst& in = s.inst[v.inst];
  v.su.amp.step();
  if ((v.counter & 7) == 0) v.su.fenv.step();
  v.su.penv.step();
  int32_t amp = P24(v.Vol, v.su.amp.level);
  v.Vol += v.step;
  if (in.lfo[0].code == 2) amp += P24(amp, 2 * in.L1);
  if (in.lfo[1].code == 2) amp += P24(amp, 2 * in.L2);
  if (v.glideCount > 0) v.glideCount--;
  const uint32_t c = v.counter++;
  if ((c & 15) == 0) controlUpdate(s, v);
  const int32_t A1 = 0x00BAD70C + 444 * v.idx;
  v.o[0].w = v.w[0]; v.o[1].w = v.w[1];
  const uint32_t before = v.o[0].phase;
  const int32_t a = wave(s, v.su.wave[0], v.o[0], A1);
  if (v.su.sync && v.o[0].phase < before) v.o[1].phase = 0;
  const int32_t b = wave(s, v.su.wave[1], v.o[1], A1 + 52);
  const int32_t x = a + P24(b - a, v.mixNow);
  const int32_t y = v.su.andMode ? (a & b) : P23(a, b);
  const int32_t z = x + P24(y - x, v.su.ring);
  const int32_t f = v.flt.run(z);
  int32_t g;
  if (v.su.soft) g = (int32_t)std::nearbyint(std::atan(f / 2516582.5) * 6710886.5);
  else g = clamp24((int32_t)((uint32_t)f << 3));
  const int32_t h = f + P24(g - f, v.su.drive);
  return P24(amp, h);
}

static int32_t drumSample(Song& s, Voice& v) {
  v.su.amp.step();
  const std::vector<int16_t>& S = s.samp[v.sample].d;
  const uint32_t j = v.pos >> 8; const int32_t fr = v.pos & 255;
  int32_t smp = 0;
  if (j + 1 < S.size()) smp = (S[j] << 8) + (S[j + 1] - S[j]) * fr;
  v.pos += (uint32_t)v.dinc;
  if ((int)((v.pos >> 8) - (uint32_t)v.dend) >= 0) v.su.amp.stage = 0;
  return P24(v.su.amp.level, v.filtered ? v.flt.run(smp) : smp);
}

/* §12 one output frame (16-bit range, two ints) */
static void frame(Song& s, int32_t& outL, int32_t& outR) {
  for (int i = 0; i < 7; i++) {  // §9
    Inst& in = s.inst[i];
    if (in.sounding == 0) continue;
    in.L1 = P24(wave(s, in.lfo[0].shape, in.lfo[0].o, 0), in.lfo[0].depth);
    if (in.lfo[0].code == 8) in.lfo[1].o.inc = lfoInc(clampi(in.raw[24] + (in.L1 >> 18), 0, 127));
    in.L2 = P24(wave(s, in.lfo[1].shape, in.lfo[1].o, 0), in.lfo[1].depth);
  }
  int32_t dry = 0, bus[2] = {0, 0};
  for (Voice& v : s.v) {
    if (v.stage() == 0) continue;
    const int32_t o = v.inst == 7 ? drumSample(s, v) : synthSample(s, v);
    dry += o;
    bus[v.su.bus & 1] += P24(o, v.su.send);
  }
  const int32_t X = s.ring[s.lread]; s.lread = (s.lread + 1) & 0xFFFF;
  const int32_t x = bus[0] + P24(2 * X - bus[0], s.dF);
  s.ring[s.dw] = x; s.dw = (s.dw + 1) & 0xFFFF;
  const int32_t R = reverb(s, bus[1]);
  outL = clamp24(R + x + dry) >> 8;
  const int32_t E = s.ps[s.pr]; s.pr = (s.pr + 1) & 0xFFFF;
  s.ps[s.pw] = -dry; s.pw = (s.pw + 1) & 0xFFFF;
  const int32_t X2 = s.ring[s.rread]; s.rread = (s.rread + 1) & 0xFFFF;
  const int32_t x2 = bus[0] + P24(2 * X2 - bus[0], s.dF);
  outR = clamp24(E + R + x2) >> 8;
  s.t += 1.0 / 44100;
  if (s.t > s.D) { s.t -= s.D; tick(s); }
}

static const int INST_CTL[53] = {5, 8, 9, 17, 12, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 80, 36, 37,
                                 38, 39, 40, 41, 42, 43, 44, 45, 50, 51, 52, 53, 54, 55, 65, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 90, 94};

static uint32_t be32(const uint8_t* p) { return (uint32_t)p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]; }
static uint32_t le32(const uint8_t* p) { return (uint32_t)p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }

/* §2 + §3 */
Song* load(const uint8_t* d, size_t n, std::string& err) {
  if (n < 12 || std::memcmp(d, "FORM", 4) || std::memcmp(d + 8, "AXSF", 4)) { err = "not an AXSF file"; return nullptr; }
  Song* s = new Song();
  setTempo(*s, 134);
  applyPreset(*s, 0);
  for (int k = 0; k < 7; k++)
    for (int c : INST_CTL) {
      int v = 0;
      switch (c) {
        case 8: case 19: case 24: case 33: case 34: case 43: case 45: case 54: case 70: case 77: case 78: case 79: v = 64; break;
        case 22: case 27: case 37: case 74: v = 127; break;
        case 25: case 76: v = 3; break;
        case 44: v = 60; break;
        default: break;
      }
      control(*s, k, c, v);
    }
  int state = 1, L = 0, instK = 0;
  size_t o = 12;
  while (o + 8 <= n) {
    const uint8_t* id = d + o; const uint32_t sz = be32(d + o + 4);
    const uint8_t* c = d + o + 8;
    const size_t avail = n - (o + 8);
    const size_t take = sz < avail ? sz : avail;
    auto is = [&](const char* t) { return !std::memcmp(id, t, 4); };
    if (is("SHDR") && state == 1 && take >= 12) {
      s->shdrBpm = c[2]; s->shdrTpr = c[3];
      setTempo(*s, c[2]); s->tpr = c[3];
      control(*s, 0, 15, c[4]); control(*s, 0, 11, c[5]); control(*s, 0, 16, c[6]);
      control(*s, 0, 10, c[7] & 0x7F); control(*s, 0, 14, c[8]); control(*s, 0, 89, c[9]);
      L = c[11]; state = 2;
    } else if (is("SONG") && state == 2 && take >= (size_t)8 * L) {
      for (int i = 0; i < L; i++) { s->order.push_back(le32(c + 8 * i)); s->omask.push_back(le32(c + 8 * i + 4)); }
      for (int k = 0; k < 8; k++) control(*s, k, 7, 127);
      state = 3;
    } else if (state == 3 && is("BLOK") && take >= 24 && s->blocks.size() < 128) {
      Block b; b.T = clampi((int)le32(c), 0, 16); b.R = clampi((int)le32(c + 4), 0, 256);
      std::memcpy(b.trk, c + 8, 16); b.cells.resize(16 * 256);
      s->blocks.push_back(std::move(b));
    } else if (state == 3 && is("TRAK") && !s->blocks.empty()) {
      Block& b = s->blocks.back();
      if (b.filled < b.T)
        for (int r = 0; r < b.R && (size_t)4 * r + 4 <= take; r++) { Cell& x = b.at(b.filled, r); x.note = c[4 * r]; x.vel = c[4 * r + 1]; x.cmd = c[4 * r + 2]; x.par = c[4 * r + 3]; }
      b.filled++;
    } else if (state == 3 && is("INST") && take >= 128 && instK < 8) {
      std::memcpy(s->inst[instK].raw, c, 128);
      for (int cc : INST_CTL) control(*s, instK, cc, c[cc]);
      instK++;
    } else if (state == 3 && is("DNOT") && take >= 40) {
      const uint32_t nn = le32(c);
      if (nn < 128) {
        DNote& x = s->dn[nn]; uint32_t f[9]; for (int i = 0; i < 9; i++) f[i] = le32(c + 4 + 4 * i);
        x.pitch = (int)f[0]; x.att = (int)f[1]; x.dec = (int)f[2]; x.send = (int)f[3]; x.amp = (int)f[4]; x.sample = (int)f[5];
        x.field = clampi((int)(f[6] & 0xFFFF), 0, 5); x.flags = (int)((f[6] >> 16) & 0xF1); x.cutoff = (int)f[7]; x.res = (int)f[8];
      }
    } else if (state == 3 && is("SAMP") && take >= 176) {
      const uint32_t si = le32(c);
      const uint32_t N = le32(c + 4 + 160), rate = le32(c + 4 + 164);
      if (si < 256 && (size_t)176 + 2 * (size_t)N <= take) {
        if (s->samp.size() <= si) s->samp.resize(si + 1);
        Samp& sm = s->samp[si]; sm.n = (int)N; sm.rate = (int)rate; sm.d.assign(N + 20480, 0);
        for (uint32_t i = 0; i < N; i++) sm.d[i] = (int16_t)(c[176 + 2 * i] | c[177 + 2 * i] << 8);
      }
    }
    o += 8 + sz + (sz & 1 ? 0 : 0);
  }
  if (state != 3 || L == 0) { err = "AXSF song has no SONG chunk"; delete s; return nullptr; }
  for (uint32_t& b : s->order) if (b >= s->blocks.size()) b = 0;
  if (s->blocks.empty()) { err = "AXSF song has no blocks"; delete s; return nullptr; }
  for (const Block& b : s->blocks)
    for (int t = 0; t < b.T; t++)
      for (int r = 0; r < b.R; r++) if (b.cells[(size_t)t * 256 + r].cmd == 28) s->usesJump = true;
  // play start
  s->p = 0; s->b = (int)s->order[0]; s->m = s->omask[0]; s->r = 0; s->k = 0; s->t = 0; s->playing = true;
  return s;
}

void destroy(Song* s) { delete s; }

/* Length in ms: trunc(1000·Σ(rows·tpr/24)·(60/BPM)) with the SHDR tempo and ticks per row. */
int lengthMs(const Song* s) {
  double beats = 0;
  for (uint32_t b : s->order) beats += s->blocks[b].R * (double)s->shdrTpr / 24;
  return (int)(1000 * beats * (60.0 / (s->shdrBpm ? s->shdrBpm : 134)));
}

/* Render up to <frames> engine frames (44100 Hz) as int16-range stereo; returns frames made.
 * Output ends after the 576-frame block in which the song stopped. */
int render(Song* s, int32_t* out, int frames, bool& ended) {
  int got = 0;
  while (got < frames) {
    frame(*s, out[2 * got], out[2 * got + 1]);
    got++;
    if (++s->blockPos == 576) { s->blockPos = 0; if (!s->playing) { ended = true; break; } }
  }
  return got;
}

}  // namespace axs
