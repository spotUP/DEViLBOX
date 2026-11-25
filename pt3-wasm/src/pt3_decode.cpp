#include "pt3_decode.h"
#include <algorithm>

namespace pt3 {
namespace {
struct R {
  const uint8_t* d; size_t n;
  int u8(size_t o) const { return o < n ? d[o] : 0; }
  int u16(size_t o) const { return u8(o) | (u8(o + 1) << 8); }
};

int argCount(int cmd) {  // SPCCOMS: C_GLISS 3, C_PORTM 5, C_SMPOS 1, C_ORPOS 1, C_VIBRT 2, C_ENGLS 3, C_DELAY 1
  switch (cmd) { case 1: return 3; case 2: return 5; case 3: return 1; case 4: return 1; case 5: return 2; case 8: return 3; case 9: return 1; default: return 0; }
}

// Decodes one channel stream; lines expand to rows (a line lasts `skip` rows, set by B1, default 1).
// patRows < 0: channel A, run until the 0x00 terminator and report the row count.
// shortcut: B/C rows are cut/padded to A's length, mismatch only flagged (channelEndsMatch).
int decodeChannel(const R& r, size_t pos, int patRows, std::vector<Cell>& out, std::vector<std::string>& warn, int ch, int patNo) {
  int skip = 1, row = 0;
  size_t guard = 0;
  while (pos < r.n && guard++ < 100000) {
    if (r.u8(pos) == 0 && patRows < 0) break;       // A: pattern terminator
    if (patRows >= 0 && row >= patRows) break;
    Cell c; c.lineStart = true;
    std::vector<int> stack;  // effect opcodes in order; params follow the line, LIFO (handlers are pushed on SP)
    bool done = false;
    while (!done && pos < r.n) {
      int b = r.u8(pos++);
      if (b >= 0xF0) { c.envType = 0; c.ornament = b - 0xF0; c.sample = r.u8(pos++) >> 1; }
      else if (b == 0xD0) done = true;
      else if (b > 0xD0) c.sample = b - 0xD0;
      else if (b == 0xC0) { c.note = kNoteRelease; done = true; }
      else if (b > 0xC0) c.volume = b - 0xC0;
      else if (b == 0xB0) c.envType = 0;
      else if (b == 0xB1) { skip = r.u8(pos++); c.skip = skip; }
      else if (b > 0xB1) { c.envType = b - 0xB1; c.envPeriod = (r.u8(pos) << 8) | r.u8(pos + 1); pos += 2; }  // SETENV: high byte first
      else if (b >= 0x50) { c.note = b - 0x50; c.noteOffset = (int)pos - 1; done = true; }
      else if (b >= 0x40) c.ornament = b - 0x40;
      else if (b >= 0x20) c.noise = b - 0x20;
      else if (b >= 0x10) {
        if (b == 0x10) c.envType = 0; else { c.envType = b - 0x10; c.envPeriod = (r.u8(pos) << 8) | r.u8(pos + 1); pos += 2; }
        c.sample = r.u8(pos++) >> 1;
      } else if (b >= 1) stack.push_back(b);
      else warn.push_back("pattern " + std::to_string(patNo) + " ch " + std::to_string(ch) + ": 0x00 inside a line");
    }
    c.effects.resize(stack.size());
    for (size_t i = stack.size(); i-- > 0;) {   // last pushed effect reads its params first
      Effect& e = c.effects[i]; e.cmd = (uint8_t)stack[i]; e.nargs = (uint8_t)argCount(stack[i]);
      for (int k = 0; k < e.nargs; k++) e.args[k] = (uint8_t)r.u8(pos++);
    }
    if (skip < 1) skip = 256;  // asm: NtSkCn decrement from 0 wraps; PT3 compilers never emit 0
    int rowsHere = skip;
    if (patRows >= 0) { if ((int)out.size() < row + rowsHere) out.resize(row + rowsHere); out[row] = c; }
    else { out.resize(row + rowsHere); out[row] = c; }
    row += rowsHere;
  }
  return row;
}
}  // namespace

bool decode(const uint8_t* d, size_t n, Module& m, std::string& err) {
  if (n < 202) { err = "file too short"; return false; }
  R r{d, n};
  m.magic.assign((const char*)d, 13);
  if (m.magic.compare(0, 13, "ProTracker 3.") != 0 && m.magic.compare(0, 13, "Vortex Tracke") != 0) m.warnings.push_back("magic not ProTracker 3. / Vortex Tracker");
  int v = d[13] - '0'; m.version = (v >= 0 && v < 10) ? v : 6;
  m.title.assign((const char*)d + 30, 32); m.author.assign((const char*)d + 66, 32);
  for (std::string* s : {&m.title, &m.author}) { while (!s->empty() && (s->back() == ' ' || s->back() == 0)) s->pop_back(); }
  m.noteTable = d[99]; m.speed = d[100]; m.loopPos = d[102];
  int patPtr = r.u16(103);
  int maxPat = -1;
  for (size_t i = 201; i < n && d[i] != 0xFF; i++) { m.positions.push_back(d[i] / 3); maxPat = std::max(maxPat, d[i] / 3); }
  if (m.positions.empty()) { err = "empty position list"; return false; }
  if (m.loopPos >= (int)m.positions.size()) m.warnings.push_back("loop position past list end");

  for (int i = 0; i < 32; i++) {
    int p = r.u16(105 + i * 2);
    if (p == 0 || p + 2 > (int)n) continue;
    Sample& s = m.samples[i]; s.present = true; s.loop = d[p]; int len = d[p + 1];
    for (int t = 0; t < len && (size_t)(p + 2 + t * 4 + 3) < n; t++) {
      const uint8_t* q = d + p + 2 + t * 4;
      SampleTick k;
      k.envMask = q[0] & 1; k.ampSlide = q[0] & 0x80; k.ampSlideUp = q[0] & 0x40;
      int f = (q[0] >> 1) & 0x1F;
      k.noiseEnvAdd = (q[1] & 0x80) ? ((f ^ 0x10) - 0x10) : f;  // signed when it is an envelope slide, raw 0..31 for noise
      k.ampl = q[1] & 15; k.toneOff = q[1] & 0x10; k.accumulateEnvNoise = q[1] & 0x20; k.accumulateTone = q[1] & 0x40; k.noiseOff = q[1] & 0x80;
      k.toneAdd = (int16_t)(q[2] | (q[3] << 8));
      s.ticks.push_back(k);
    }
  }
  for (int i = 0; i < 16; i++) {
    int p = r.u16(169 + i * 2);
    if (p == 0 || p + 2 > (int)n) continue;
    Ornament& o = m.ornaments[i]; o.present = true; o.loop = d[p]; int len = d[p + 1];
    for (int t = 0; t < len && (size_t)(p + 2 + t) < n; t++) o.offsets.push_back((int8_t)d[p + 2 + t]);
  }

  m.patterns.resize(maxPat + 1);
  for (int pi = 0; pi <= maxPat; pi++) {
    size_t e = patPtr + 6 * pi;
    if (e + 6 > n) { m.warnings.push_back("pattern table past EOF at pattern " + std::to_string(pi)); continue; }
    Pattern& P = m.patterns[pi];
    P.rows = decodeChannel(r, r.u16(e), -1, P.cell[0], m.warnings, 0, pi);
    for (int ch = 1; ch < 3; ch++) {
      int rows = decodeChannel(r, r.u16(e + 2 * ch), P.rows, P.cell[ch], m.warnings, ch, pi);
      if (rows != P.rows) { P.channelEndsMatch = false; m.warnings.push_back("pattern " + std::to_string(pi) + " ch " + std::to_string(ch) + " row total " + std::to_string(rows) + " != A " + std::to_string(P.rows)); }
      P.cell[ch].resize(P.rows);
    }
  }
  return true;
}
}  // namespace pt3
