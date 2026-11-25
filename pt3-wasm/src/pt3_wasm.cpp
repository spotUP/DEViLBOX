// PT3 editor module (build.sh -> public/pt3/Pt3Edit.js): grid decode (pt3_decode), note mapping from the
// period the S.V. Bulba player sets, and the .ay wrapper that plays the untouched module in the aylet engine
// (real Z80 player, public/zx/pt3player.asm -DAYFILE). TypeScript only copies numbers in and out.
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <emscripten/emscripten.h>
#include "pt3_decode.h"
#include "pt3_ay_player.h"

namespace {
pt3::Module g_mod;
std::string g_err;
std::vector<int32_t> g_cells;
std::vector<uint8_t> g_ay;
constexpr int kCellInts = 8;  // note, instrument, volume, effTyp, eff, effTyp2, eff2, noteOffset
constexpr double kZxClock = 1773400.0;

// Octave-1 periods by header table (MM-PTxPlay.asm T_PACK/NT_DATA); each further octave halves the period.
// Table 2 of versions 3.0..3.4r (header digit < 4) is the old one. Same values as src/lib/export/zx/pt3Song.ts.
const uint16_t kTables[5][12] = {
  {0xC22, 0xB73, 0xACF, 0xA33, 0x9A1, 0x917, 0x894, 0x819, 0x7A4, 0x737, 0x6CF, 0x66D},
  {0xEF8, 0xE10, 0xD60, 0xC80, 0xBD8, 0xB28, 0xA88, 0x9F0, 0x960, 0x8E0, 0x858, 0x7E0},
  {0xD10, 0xC55, 0xBA4, 0xAFC, 0xA5F, 0x9CA, 0x93D, 0x8B8, 0x83B, 0x7C5, 0x755, 0x6EC},
  {0xCDA, 0xC22, 0xB73, 0xACF, 0xA33, 0x9A1, 0x917, 0x894, 0x819, 0x7A4, 0x737, 0x6CF},
  {0xD3E, 0xC80, 0xBCC, 0xB22, 0xA82, 0x9EC, 0x95C, 0x8D6, 0x858, 0x7E0, 0x76E, 0x704},  // old table 2
};
const uint16_t* table() {
  int t = g_mod.noteTable & 3;
  return (t == 2 && g_mod.version < 4) ? kTables[4] : kTables[t];
}
// XM note (C-0 = 1, A-4 = 58) of the frequency the AY plays for PT3 note n.
int xmNote(int n) {
  double period = table()[n % 12] / std::pow(2.0, n / 12);
  double hz = kZxClock / (16.0 * period);
  // Tables 0 and 3 sit 0.51 semitone above a semitone at this clock; the player's +1 period corrections put the
  // played pitch just under the half (measured: nodeus GoTaY, table 0, n = 12 plays period 0x613 = XM 26).
  return (int)std::lround(12.0 * std::log2(hz / 440.0) - 0.02) + 58;
}
void put16(std::vector<uint8_t>& v, size_t at, int x) { v[at] = (uint8_t)(x >> 8); v[at + 1] = (uint8_t)x; }
void rel(std::vector<uint8_t>& v, size_t at, size_t target) { put16(v, at, (int)(target - at)); }
}  // namespace

extern "C" {
EMSCRIPTEN_KEEPALIVE int pt3_grid_open(const uint8_t* p, int n) {
  g_mod = pt3::Module();
  g_err.clear();
  return pt3::decode(p, (size_t)n, g_mod, g_err) ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE const char* pt3_error() { return g_err.c_str(); }
EMSCRIPTEN_KEEPALIVE int pt3_positions() { return (int)g_mod.positions.size(); }
EMSCRIPTEN_KEEPALIVE int pt3_position(int k) { return g_mod.positions[k]; }
EMSCRIPTEN_KEEPALIVE int pt3_loop() { return g_mod.loopPos; }
EMSCRIPTEN_KEEPALIVE int pt3_speed() { return g_mod.speed; }
EMSCRIPTEN_KEEPALIVE int pt3_pattern_count() { return (int)g_mod.patterns.size(); }
EMSCRIPTEN_KEEPALIVE int pt3_pattern_rows(int p) { return g_mod.patterns[p].rows; }
EMSCRIPTEN_KEEPALIVE int pt3_xm_note(int n) { return xmNote(n); }
// rows x 3 channels x kCellInts int32 block for pattern p.
EMSCRIPTEN_KEEPALIVE int32_t* pt3_pattern(int p) {
  const pt3::Pattern& pat = g_mod.patterns[p];
  g_cells.assign((size_t)pat.rows * 3 * kCellInts, 0);
  for (int r = 0; r < pat.rows; r++) for (int ch = 0; ch < 3; ch++) {
    if ((size_t)r >= pat.cell[ch].size()) continue;
    const pt3::Cell& c = pat.cell[ch][r];
    int32_t* o = &g_cells[((size_t)r * 3 + ch) * kCellInts];
    o[0] = c.note == pt3::kNoteRelease ? 97 : c.note >= 0 ? xmNote(c.note) : 0;
    o[1] = c.sample > 0 ? c.sample : 0;
    o[2] = c.volume >= 0 ? 0x10 + (c.volume * 64 + 7) / 15 : 0;
    for (const pt3::Effect& e : c.effects)
      if (e.cmd == 9 && e.nargs >= 1) { o[3] = 0x0F; o[4] = e.args[0]; }  // C_DELAY = speed
    o[7] = c.noteOffset;
  }
  return g_cells.data();
}
// The note byte (0x50 + n) whose played frequency rounds to XM note `xm`, -1 when the table has none.
// Every byte returned ends the line, like the note byte it replaces: 0xC0 = release (XM 97), 0xD0 = no note (XM 0).
EMSCRIPTEN_KEEPALIVE int pt3_encode_note(int xm) {
  if (xm == 97) return 0xC0;
  if (xm == 0) return 0xD0;
  for (int n = 0; n < 96; n++) if (xmNote(n) == xm) return 0x50 + n;
  return -1;
}
EMSCRIPTEN_KEEPALIVE void pt3_grid_close() { g_mod = pt3::Module(); g_cells.clear(); }

// ZXAYEMUL file: one song, the AY build of the Bulba player at kPt3AyLoad, the module at kPt3AyModule.
// aylet calls INIT once and INTERRUPT every 1/50 s.
EMSCRIPTEN_KEEPALIVE uint8_t* pt3_ay_build(const uint8_t* mod, int n) {
  if (n <= 0 || kPt3AyModule + n > 0x10000) return nullptr;
  std::vector<uint8_t>& v = g_ay;
  v.assign(58, 0);
  std::memcpy(&v[0], "ZXAYEMUL", 8);
  const size_t strAt = v.size();
  v.push_back(0);  // empty name / author / misc
  rel(v, 12, strAt); rel(v, 14, strAt);
  rel(v, 18, 20);                      // songs structure
  rel(v, 20, strAt); rel(v, 22, 24);   // song name, song data
  v[24] = 0; v[25] = 1; v[26] = 2; v[27] = 3;
  put16(v, 28, 0);                     // song length 0: aylet plays until stopped
  put16(v, 30, 0);
  rel(v, 34, 38); rel(v, 36, 44);      // points, addresses
  put16(v, 38, 0x7F00); put16(v, 40, kPt3AyStart); put16(v, 42, kPt3AyStart + 5);
  const size_t playerAt = v.size();
  v.insert(v.end(), kPt3AyPlayer, kPt3AyPlayer + sizeof(kPt3AyPlayer));
  const size_t modAt = v.size();
  v.insert(v.end(), mod, mod + n);
  put16(v, 44, kPt3AyLoad); put16(v, 46, (int)sizeof(kPt3AyPlayer)); rel(v, 48, playerAt);
  put16(v, 50, kPt3AyModule); put16(v, 52, n); rel(v, 54, modAt);
  put16(v, 56, 0);
  return v.data();
}
EMSCRIPTEN_KEEPALIVE int pt3_ay_size() { return (int)g_ay.size(); }
// Z80 address of the module's first byte in the .ay build: module file offset k sits at this + k in aylet memory.
EMSCRIPTEN_KEEPALIVE int pt3_ay_module_addr() { return kPt3AyModule; }
}
