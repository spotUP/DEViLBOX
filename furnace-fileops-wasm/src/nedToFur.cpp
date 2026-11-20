/**
 * nedToFur.cpp - NerdTracker II (.ned) to editable Furnace NES song.
 *
 * NerdTracker II is pattern based, so the song maps directly: one 2A03 system
 * (pulse 1, pulse 2, triangle, noise, DPCM), 64-row patterns, the NT2 order
 * list, NT2 instruments as NES instruments with volume/arpeggio/duty macros,
 * and NT2 DPCM instruments as NES instruments with a note map. fur_save then
 * writes the .fur bytes, so the import goes through the one .fur load path.
 *
 * File layout:
 *   .ned wrapper: "NED: <name>" (0x22 bytes), 8 constant bytes, u16 DPCM
 *   instrument count n at 0x2a, u32 sample byte count at 0x2c, 4 zero bytes,
 *   n DPCM instrument blocks of 229 bytes, the sample bytes, then the tracker's
 *   temp.dat song image.
 *   temp.dat: Joe Yerrick's nt2fmt.txt / nt2dump.c (header, 16 instruments of
 *   8 bytes, u32 orders of five 5-bit pattern indexes, u16 pattern pointers per
 *   channel, nibble-packed pattern data).
 * Playback semantics (period table, noise nibble = $400E period, note length,
 * decay, auto arpeggio) follow the NT2 replay routine nt2-22.asm (NED_PlayNED).
 */

#include "engine.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <map>
#include <string>
#include <vector>

namespace {

const double kCpu = 1789773.0;

// NT2 Tone2Period table (nt2-22.asm): tone 1..96. Octave 0 is clamped at $7xx in NT2 itself.
const uint8_t kPerLo[96] = {
  0x5C,0x9C,0xE8,0x3C,0x9C,0x2F,0x72,0xEC,0xFF,0xF2,0x80,0x14, 0xAE,0x4E,0xF4,0x9E,0x4E,0x01,0xB9,0x76,0x35,0xF9,0xC0,0x8A,
  0x57,0x27,0xFA,0xCF,0xA7,0x81,0x5D,0x3B,0x1B,0xFD,0xE0,0xC5, 0xAC,0x94,0x7D,0x68,0x53,0x40,0x2E,0x1D,0x0D,0xFE,0xF0,0xE3,
  0xD6,0xCA,0xBE,0xB4,0xAA,0xA0,0x97,0x8F,0x87,0x7F,0x78,0x71, 0x6B,0x65,0x5F,0x5A,0x55,0x50,0x4C,0x47,0x43,0x40,0x3C,0x39,
  0x35,0x32,0x30,0x2D,0x2A,0x28,0x26,0x24,0x22,0x20,0x1E,0x1C, 0x1B,0x19,0x18,0x16,0x15,0x14,0x13,0x12,0x11,0x10,0x0F,0x0E };
const uint8_t kPerHi[96] = {
  7,7,7,7,7,7,7,7,7,7,7,7, 6,6,5,5,5,5,4,4,4,3,3,3, 3,3,2,2,2,2,2,2,2,1,1,1, 1,1,1,1,1,1,1,1,1,0,0,0 };

int tonePeriod(int tone) { return kPerHi[tone - 1] * 256 + kPerLo[tone - 1]; }

// Furnace NES base period of a note (DivPitchTable init + getBase, period mode, divider 16);
// local copy because pitchTable.cpp pulls the whole engine into this module
int nesBase(int note) {
  int shift = 0;
  while (shift < 14 && std::lround(kCpu / (440.0 * 0.0625 * std::pow(2.0, ((shift - 4) * 12 + 3) / 12.0)) / 16.0) > 0x800) shift++;
  const int nb = note % 12 + (shift - 5) * 12, octave = note / 12 - shift;
  int root = (int)std::lround(kCpu / (440.0 * 0.0625 * std::pow(2.0, (nb + 3) / 12.0)) / 16.0);
  if (octave > 0) { const bool carry = root & (1 << (octave - 1)); root >>= octave; if (carry) root++; }
  return root;
}

// Furnace note (60 = C-0, 105 = A-4 at 440 Hz) for a tone. NT2 writes the same period to the
// triangle as to the pulses; both NES and Furnace play the triangle an octave below, so div is 16.
int toneNote(int tone) {
  const double f = kCpu / (16.0 * (tonePeriod(tone) + 1));
  const int n = (int)std::lround(105.0 + 12.0 * std::log2(f / 440.0));
  return std::max(0, std::min(179, n));
}

struct NtIns { uint8_t b[8]; };

// NT2 vibrato (nt2-22.asm ReadSineTab): VibAndTremTab[phase][depth], indexed through Pos2TabPos.
const uint8_t kVibTab[16][16] = {
  {0,0,0,1,1,1,2,2,3,3,3,4,4,4,5,5},{0,0,1,2,3,3,4,5,6,6,7,8,9,9,10,11},
  {0,1,2,3,4,5,6,8,9,10,11,12,13,15,16,17},{0,1,3,4,6,7,9,10,12,13,15,16,18,19,21,22},
  {0,1,3,5,7,9,11,13,15,16,18,20,22,24,26,28},{0,2,4,6,8,11,13,15,17,19,22,24,26,28,30,33},
  {0,2,5,7,10,12,15,17,20,22,25,27,30,32,35,37},{0,2,5,8,11,14,16,19,22,25,28,30,33,36,39,42},
  {0,3,6,9,12,15,18,21,24,27,30,33,36,40,43,46},{0,3,6,9,13,16,19,23,26,29,33,36,39,43,46,49},
  {0,3,7,10,14,17,21,24,28,31,35,38,42,45,49,52},{0,3,7,11,14,18,22,25,29,33,36,40,44,47,51,55},
  {0,3,7,11,15,19,22,26,30,34,38,41,45,49,53,57},{0,3,7,11,15,19,23,27,31,35,39,42,46,50,54,58},
  {0,3,7,11,15,19,23,27,31,35,39,43,47,51,55,59},{0,3,7,11,15,19,23,27,31,35,39,43,47,51,55,59}};
const uint8_t kPos2Phase[31] = {0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0};

// period delta at vibrato position pos (-32..31): table value halved with the sign kept
int vibDelta(int pos, int depth) {
  if (pos > 0) return kVibTab[kPos2Phase[pos - 1]][depth] >> 1;
  // pos -1 reads Pos2TabPos[255] = VibAndTremTab[224] = 0 in the player (tables are adjacent)
  if (pos < 0) { const int y = ((~pos) & 31) - 1; return -((kVibTab[y < 0 ? 0 : kPos2Phase[y]][depth] + 1) >> 1); }
  return 0;
}

void fill(DivInstrumentMacro& m, const std::vector<int>& a, int loop) {
  m.len = (unsigned char)std::min<size_t>(255, a.size());
  for (int i = 0; i < m.len; i++) m.val[i] = a[i];
  m.loop = loop < 0 ? 255 : (unsigned char)loop;
}

  // auto vibrato b2: speed hi nibble, depth lo nibble. NT2 restarts it at 0 on a new note and steps
  // it only on non-row ticks (pos += speed, wraps at 32 to -32); the row tick keeps the last delta.
  // Absolute pitch macro, value = -delta (period = base - pitch in non-linear mode).
  // shortcut: one 255-tick pass at the speed of the first row, looped to the row start whose vibrato
  // position is closest; Fxx speed changes and 4xy overriding the auto vibrato are not followed.
void addVibrato(DivInstrument* d, uint8_t b2, int speed) {
  {
    const int vs = b2 >> 4, vd = b2 & 0x0F;
    std::vector<int> v, posAt;
    int pos = 0, last = 0;
    for (int t = 0; t <= 255; t++) {
      posAt.push_back(pos);
      if (t % speed) { last = vibDelta(pos, vd); pos += vs; if (pos >= 32) pos -= 64; }
      v.push_back(-last);
    }
    const int end = (255 / speed) * speed; // end on a row boundary
    int loop = 0, bestD = 99;
    for (int t = 0; t < end; t += speed) {
      const int dd = std::abs(((posAt[t] - posAt[end]) % 64 + 96) % 64 - 32);
      if (dd < bestD) { bestD = dd; loop = t; }
    }
    v.resize(end);
    fill(d->std.pitchMacro, v, loop);
  }
}

// NES instrument for one NT2 instrument on one channel kind (0 pulse, 1 triangle, 2 noise).
DivInstrument* makeIns(const NtIns& in, int idx, int kind) {
  const uint8_t* b = in.b;
  DivInstrument* d = new DivInstrument;
  d->type = DIV_INS_NES;
  static const char* kName[3] = {"pulse", "triangle", "noise"};
  char nm[32]; snprintf(nm, sizeof nm, "NT2 %02X %s", idx + 1, kName[kind]);
  d->name = nm;
  // note length in ticks: (b4 & 0x7f) | bit 5 of reg0 as bit 7; bit 7 set holds the note
  const int len = (b[4] & 0x7f) | ((b[0] << 2) & 0x80);
  const bool held = len & 0x80;
  // volume: 6-bit internal (b5 hi nibble << 2), decay b5 lo nibble per tick, b4 bit 7 = up; output >> 2
  std::vector<int> vol;
  if (kind == 1) {
    if (!held) { vol.assign(len + 1, 15); vol.push_back(0); }
  } else {
    int v = (b[5] & 0xF0) >> 2;
    const int rate = b[5] & 0x0F, dir = (b[4] & 0x80) ? 1 : -1;
    for (int t = 0; t < 255; t++) {
      if (!held && t > len) { vol.push_back(0); break; }
      vol.push_back(v >> 2);
      const int nv = std::max(0, std::min(63, v + dir * rate));
      if (nv == v && (held || t >= len)) break; // stays here; the macro holds the last value
      v = nv;
    }
  }
  if (!vol.empty()) fill(d->std.volMacro, vol, -1);
  // auto arpeggio: 0, X, Y, Z per tick, looped unless b6 bit 5; b6 bit 7 = down
  const int ax = b[7] & 0x0F, ay = b[7] >> 4, az = b[6] & 0x0F;
  if (ax | ay | az) {
    int s = (b[6] & 0x80) ? -1 : 1;
    if (kind == 2) s = -s; // NT2 adds to the noise period index; Furnace noise notes run the other way
    fill(d->std.arpMacro, {0, s * ax, s * ay, s * az}, (b[6] & 0x20) ? -1 : 0);
  }
  if (kind == 0) fill(d->std.dutyMacro, {b[0] >> 6}, -1);
  if (kind == 2) fill(d->std.dutyMacro, {(b[6] >> 6) & 1}, -1); // looped (93-bit) noise
  return d;
}

} // namespace

/**
 * Build `song` from a .ned file (or a bare temp.dat image). Returns false and sets err on failure.
 */
bool nedBuildSong(DivSong& song, const uint8_t* data, size_t len, std::string& err) {
  size_t off = 0, smpBase = 0;
  int nDpcm = 0;
  if (len >= 0x34 && !memcmp(data, "NED:", 4)) {
    nDpcm = data[0x2a] | (data[0x2b] << 8);
    const size_t smpBytes = data[0x2c] | (data[0x2d] << 8) | (data[0x2e] << 16) | ((size_t)data[0x2f] << 24);
    smpBase = 0x34 + (size_t)nDpcm * 229;
    off = smpBase + smpBytes;
  }
  if (off + 16 > len || data[off] != 0x20 || data[off + 1] != 0x10) { err = "NED: no NerdTracker II song data"; return false; }
  const uint8_t* t = data + off;
  const size_t tLen = len - off;
  const int speed = t[3], loopPos = t[4], nIns = t[5], songLen = t[7];
  int nPat[5];
  for (int c = 0; c < 5; c++) nPat[c] = t[8 + c];
  size_t p = 16;
  std::vector<NtIns> ins(nIns);
  for (int i = 0; i < nIns; i++, p += 8) {
    if (p + 8 > tLen) { err = "NED: truncated instruments"; return false; }
    memcpy(ins[i].b, t + p, 8);
  }
  if (songLen < 1 || p + (size_t)songLen * 4 > tLen) { err = "NED: bad order list"; return false; }
  std::vector<uint32_t> ord(songLen);
  for (int i = 0; i < songLen; i++, p += 4) ord[i] = t[p] | (t[p + 1] << 8) | (t[p + 2] << 16) | ((uint32_t)t[p + 3] << 24);
  std::vector<int> ptr[5];
  for (int c = 0; c < 5; c++)
    for (int i = 0; i < nPat[c]; i++, p += 2) {
      if (p + 2 > tLen) { err = "NED: truncated pattern table"; return false; }
      ptr[c].push_back(t[p] | (t[p + 1] << 8));
    }

  song.unload();
  song.system[0] = DIV_SYSTEM_NES;
  song.systemChans[0] = 5;
  song.systemVol[0] = 1.0f; song.systemPan[0] = 0.0f; song.systemPanFR[0] = 0.0f;
  song.systemFlags[0].clear();
  song.systemLen = 1;
  song.recalcChans();
  song.compatFlags.linearPitch = 0; // period pitch: E5xx and pitch macros are NES period units
  {
    std::string nm(reinterpret_cast<const char*>(data) + 5, std::min<size_t>(0x1d, len - 5));
    nm = nm.substr(0, nm.find('\0'));
    nm.erase(nm.find_last_not_of(' ') + 1); // NT2 pads the name with spaces or NULs
    if (len >= 0x34 && !memcmp(data, "NED:", 4) && nm != "Noname") song.name = nm;
  }

  // DPCM samples: each instrument has 8 slots (name[12], u32 offset, 0, delta, length L: 16L+1 bytes)
  std::map<std::pair<uint32_t, int>, int> smpIdx;
  std::vector<int> dpcmIns(nDpcm, -1);
  for (int k = 0; k < nDpcm; k++) {
    const uint8_t* blk = data + 0x34 + (size_t)k * 229;
    DivInstrument* d = new DivInstrument;
    d->type = DIV_INS_NES;
    d->name = "NT2 DPCM " + std::to_string(k + 1);
    int slotSmp[8];
    for (int j = 0; j < 8; j++) {
      const uint8_t* e = blk + 61 + j * 21;
      const uint32_t o = e[12] | (e[13] << 8) | (e[14] << 16) | ((uint32_t)e[15] << 24);
      const int bytes = 16 * e[18] + 1;
      slotSmp[j] = -1;
      if (o == 0xffffffffu || smpBase + o + bytes > off) continue;
      auto it = smpIdx.find({o, bytes});
      if (it == smpIdx.end()) {
        DivSample* s = new DivSample;
        std::string sn(reinterpret_cast<const char*>(e), 12);
        sn = sn.substr(0, sn.find('\0'));
        const size_t sl = sn.find_last_of("\\/");
        s->name = sl == std::string::npos ? sn : sn.substr(sl + 1);
        s->depth = DIV_SAMPLE_DEPTH_1BIT_DPCM;
        s->init(bytes * 8);
        memcpy(s->dataDPCM, data + smpBase + o, bytes);
        s->centerRate = 33144;
        song.sample.push_back(s);
        it = smpIdx.emplace(std::make_pair(o, bytes), (int)song.sample.size() - 1).first;
      }
      slotSmp[j] = it->second;
    }
    // note table: 5 octaves of (slot << 4 | rate) from C-0; tone 1 = Furnace note 60
    d->amiga.useNoteMap = true;
    for (int n = 0; n < 60; n++) {
      const int slot = blk[n] >> 4;
      d->amiga.noteMap[60 + n].map = (short)(slot < 8 ? slotSmp[slot] : -1);
      d->amiga.noteMap[60 + n].dpcmFreq = (signed char)(blk[n] & 15);
    }
    for (int j = 0; j < 8; j++) if (slotSmp[j] >= 0) { d->amiga.initSample = (short)slotSmp[j]; break; }
    song.ins.push_back(d);
    dpcmIns[k] = (int)song.ins.size() - 1;
  }

  // NT2 instruments become NES instruments per channel kind, on first use
  std::map<int, int> insMap; // nt2 index * 4 + kind -> song instrument
  auto insFor = [&](int ni, int ch) -> int {
    if (ch == 4) return ni < nDpcm ? dpcmIns[ni] : -1;
    if (ni >= nIns) return -1;
    const int kind = ch < 2 ? 0 : ch == 2 ? 1 : 2;
    auto it = insMap.find(ni * 4 + kind);
    if (it != insMap.end()) return it->second;
    song.ins.push_back(makeIns(ins[ni], ni, kind));
    return insMap[ni * 4 + kind] = (int)song.ins.size() - 1;
  };

  DivSubSong* sub = new DivSubSong;
  song.subsong.push_back(sub);
  sub->hz = 50.0f; // NT2 NSF_Play skips every 6th NTSC frame (nt2-22.asm), so songs tick at 50 Hz
  sub->patLen = 64;
  sub->speeds.val[0] = speed ? speed : 6; sub->speeds.len = 1;
  sub->ordersLen = songLen;
  const bool needLoop = loopPos > 0 && loopPos < songLen;

  int lastArp[5] = {0}, lastVolSlide[5] = {0};
  for (int ch = 0; ch < 5; ch++) {
    sub->pat[ch].effectCols = (ch < 3 ? 2 : 1) + ((ch == 0 && needLoop) ? 1 : 0);
    for (int pi = 0; pi < nPat[ch]; pi++) {
      DivPattern* pat = sub->pat[ch].getPattern(pi, true);
      int q = ptr[ch][pi];
      if (!q || (size_t)q + 2 > tLen) continue; // pointer 0: empty pattern
      const int rows = std::min(64, (int)(signed char)t[q + 1] + 1);
      size_t mask = q + 2, s = mask + 1 + ((int)(signed char)t[q + 1]) / 2;
      int nib = 0;
      auto byteAt = [&](size_t i) -> int { return i < tLen ? t[i] : 0; };
      auto readNib = [&]() { const int v = (byteAt(s) >> nib) & 15; if (nib) s++; nib ^= 4; return v; };
      auto readByte = [&]() { const int v = nib ? ((byteAt(s) & 0xf0) | (byteAt(s + 1) & 0x0f)) : byteAt(s); s++; return v; };
      for (int r = 0; r < rows && s < tLen; r++) {
        int bits = byteAt(mask);
        if (r & 1) { bits >>= 4; mask++; }
        short* cell = pat->newData[r];
        if (bits & 1) {
          if (ch == 3) {
            cell[DIV_PAT_NOTE] = (short)(108 + 15 - readNib()); // nibble = $400E period index
          } else {
            const int tone = readByte();
            if (tone == 97) cell[DIV_PAT_NOTE] = DIV_NOTE_OFF;
            else if (tone >= 1 && tone <= 96) {
              if (ch == 4) { if (tone <= 60) cell[DIV_PAT_NOTE] = (short)(59 + tone); }
              else {
                const int n = toneNote(tone);
                cell[DIV_PAT_NOTE] = (short)n;
                // NT2's table is not equal-tempered: E5xx so the Furnace period (getBase - pitch - 1)
                // equals the NT2 period
                const int fine = std::max(-128, std::min(127, nesBase(n) - 1 - tonePeriod(tone)));
                cell[DIV_PAT_FX(1)] = 0xE5; cell[DIV_PAT_FXVAL(1)] = (short)(0x80 + fine);
              }
            }
          }
        }
        if (bits & 2) {
          const int si = insFor(readNib(), ch);
          if (si >= 0) cell[DIV_PAT_INS] = (short)si;
        }
        if (bits & 4) {
          int fx = readNib();
          // the replay ignores every command on DPCM and volume slides on the triangle
          if (ch == 4 || (ch == 2 && fx == 0xA)) fx = 0;
          const int fv = (bits & 8) ? readByte() : 0;
          int ef = -1, ev = fv;
          switch (fx) {
            case 0x1: ef = 0x01; break;
            case 0x2: ef = 0x02; break;
            case 0x3: ef = 0x03; break;
            case 0x4: ef = 0x04; break;
            case 0x7: ef = 0x07; break;
            case 0x8: ef = 0x00; if (fv) lastArp[ch] = fv; ev = lastArp[ch]; break; // 0 reuses the last
            // NT2 slides the 6-bit volume by x up (priority) or y down per tick; a Furnace 0A step is
            // 1/4 of a 4-bit volume step, the same unit, but Furnace gives y priority. 0 reuses the last.
            case 0xA: if (fv) lastVolSlide[ch] = fv; ev = lastVolSlide[ch];
              ef = 0x0A; if (ev & 0xF0) ev &= 0xF0; break;
            case 0xC: cell[DIV_PAT_VOL] = (short)(std::min(63, fv) >> 2); break;
            case 0xD: ef = 0x0D; break;
            case 0xF: ef = 0x0F; break;
            default: break; // other NT2 effect numbers are not defined by the replay routine
          }
          if (ef >= 0) { cell[DIV_PAT_FX(0)] = (short)ef; cell[DIV_PAT_FXVAL(0)] = (short)ev; }
        }
      }
    }
  }
  for (int o = 0; o < songLen; o++)
    for (int ch = 0; ch < 5; ch++) {
      const int pi = (ord[o] >> (5 * ch)) & 0x1f;
      sub->orders.ord[ch][o] = (unsigned char)(pi < nPat[ch] ? pi : 0);
    }
  // restart position: 0Bxx on the last row of the last order, on a private copy of pulse 1's pattern
  if (needLoop) {
    const int last = songLen - 1, src = sub->orders.ord[0][last], dst = std::max(nPat[0], 1);
    DivPattern* a = sub->pat[0].getPattern(src, true);
    DivPattern* bp = sub->pat[0].getPattern(dst, true);
    memcpy(bp->newData, a->newData, sizeof a->newData);
    bp->newData[63][DIV_PAT_FX(2)] = 0x0B; bp->newData[63][DIV_PAT_FXVAL(2)] = (short)loopPos;
    sub->orders.ord[0][last] = (unsigned char)dst;
  }
  // NT2 clears the effect every row and reloads the instrument volume on every instrument cell.
  // Furnace 0A and the volume column persist, so a slide or Cxx would leave the channel silent:
  // stop the slide on the next row and reset the channel volume on the next instrument cell.
  // shortcut: walks the orders once and ignores D breaks into mid-pattern rows; a stop that finds
  // the effect column taken is skipped.
  for (int ch : {0, 1, 3}) {
    bool sliding = false, dirty = false;
    for (int o = 0; o < songLen; o++) {
      DivPattern* pat = sub->pat[ch].getPattern(sub->orders.ord[ch][o], true);
      for (int r = 0; r < 64; r++) {
        short* c = pat->newData[r];
        if (c[DIV_PAT_INS] >= 0) {
          if (dirty && c[DIV_PAT_VOL] < 0) c[DIV_PAT_VOL] = 15;
          dirty = false;
        }
        if (c[DIV_PAT_VOL] >= 0) dirty = true;
        if (c[DIV_PAT_FX(0)] == 0x0A) { sliding = dirty = true; }
        else if (sliding && c[DIV_PAT_FX(0)] < 0) { c[DIV_PAT_FX(0)] = 0x0A; c[DIV_PAT_FXVAL(0)] = 0; sliding = false; }
        if (c[DIV_PAT_FX(0)] == 0x0D) break;
      }
    }
  }
  // auto vibrato needs the row length; the first row often sets it with Fxx
  int vibSpeed = speed ? speed : 6;
  for (int ch = 0; ch < 4; ch++) {
    const short* c = sub->pat[ch].getPattern(sub->orders.ord[ch][0], true)->newData[0];
    if (c[DIV_PAT_FX(0)] == 0x0F && c[DIV_PAT_FXVAL(0)] > 0) vibSpeed = c[DIV_PAT_FXVAL(0)];
  }
  for (const auto& [key, si] : insMap) {
    const uint8_t b2 = ins[key / 4].b[2];
    if (key % 4 < 2 && (b2 & 0x0F) && (b2 >> 4)) addVibrato(song.ins[si], b2, vibSpeed);
  }
  song.insLen = (int)song.ins.size();
  song.waveLen = 0;
  song.sampleLen = (int)song.sample.size();
  return true;
}
