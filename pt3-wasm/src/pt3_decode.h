// ProTracker 3 (Vortex Tracker II) module -> editable struct. Opcode map verified against
// third-party/pt3play/MM-PTxPlay.asm (S.V.Bulba PT3 player, PTDECOD / PD_* / SPCCOMS).
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace pt3 {

constexpr int kNoValue = -1;   // field not written on this row
constexpr int kNoteRelease = -2;

struct Effect { uint8_t cmd; uint8_t nargs; uint8_t args[5]; };  // cmd 1..15, args in file order

struct Cell {
  int note = kNoValue;      // 0..95, kNoteRelease (0xC0), kNoValue
  int sample = kNoValue;    // 0..31
  int ornament = kNoValue;  // 0..15
  int volume = kNoValue;    // 0..15
  int envType = kNoValue;   // 0 = envelope off, 1..15 = AY R13 shape
  int envPeriod = kNoValue; // 0..65535 (valid when envType > 0)
  int noise = kNoValue;     // 0..31 (global Ns_Base write)
  int skip = kNoValue;      // B1 rows-per-line (persistent per channel)
  std::vector<Effect> effects;
  int noteOffset = -1;      // file offset of the note byte (0x50+n), -1 when the line has no note
  bool lineStart = false;   // a line was decoded here (distinguishes D0 empty line from no line)
};

struct SampleTick {
  bool envMask, toneOff, noiseOff, accumulateTone, accumulateEnvNoise, ampSlide, ampSlideUp;
  int ampl;        // 0..15
  int noiseEnvAdd; // signed 5-bit (env slide when noiseOff, else noise add); noise value stored unsigned 0..31
  int toneAdd;     // signed 16
};
struct Sample { int loop = 0; std::vector<SampleTick> ticks; bool present = false; };
struct Ornament { int loop = 0; std::vector<int> offsets; bool present = false; };

struct Pattern { int rows = 0; std::vector<Cell> cell[3]; /* cell[ch][row] */ bool channelEndsMatch = true; };

struct Module {
  std::string magic, title, author;
  int version = 6;       // header digit, 6 when unparsable
  int noteTable = 0;     // header byte 99
  int speed = 3;         // byte 100
  int loopPos = 0;       // byte 102
  std::vector<int> positions;  // pattern index per position
  Sample samples[32];
  Ornament ornaments[16];
  std::vector<Pattern> patterns;  // indexed by pattern number 0..max used
  std::vector<std::string> warnings;
};

// Returns false with err set on a structurally invalid file.
bool decode(const uint8_t* d, size_t n, Module& m, std::string& err);

}  // namespace pt3
