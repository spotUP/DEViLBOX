// TFM Music Maker (.tfe) parser + frame player.
//
// Extracted from ZXTune (GPL-3.0, vitamin.caig@gmail.com,
// https://github.com/vitamin-caig/zxtune, master 2026-10-05):
//   src/formats/chiptune/fm/tfmmusicmaker.cpp   - layouts, RLE, cell decoding
//   src/module/players/tfm/tfmmusicmaker.cpp    - effects, tempo/loop cursor
//   src/module/players/tfm/tfm_base_track.cpp   - YM2203 register builder
// The ZXTune framework types (Binary, PatternsBuilder, OrderList, Time...)
// are replaced by plain structs; the logic is kept line for line.
#pragma once
#include <array>
#include <cstdint>
#include <memory>
#include <vector>

namespace tfm {

const unsigned CHANNELS = 6;
const unsigned OPERATORS = 4;

struct Reg { uint8_t chip, idx, val; };
using Registers = std::vector<Reg>;

struct Instrument {
  struct Operator {
    unsigned Multiple = 0; int Detune = 0; unsigned TotalLevel = 0; unsigned RateScaling = 0;
    unsigned Attack = 0, Decay = 0, Sustain = 0, Release = 0, SustainLevel = 0, EnvelopeType = 0;
  };
  unsigned Algorithm = 0, Feedback = 0;
  std::array<Operator, 4> Operators;
};

struct Command { unsigned Type = 0; int Param1 = 0, Param2 = 0; };

struct Cell {
  bool HasEnabled = false, Enabled = false;
  bool HasNote = false; unsigned Note = 0;
  bool HasVolume = false; unsigned Volume = 0;
  bool HasSample = false; unsigned Sample = 0;
  std::vector<Command> Commands;
  bool HasData() const { return HasEnabled || HasNote || HasVolume || HasSample || !Commands.empty(); }
};

struct Line {
  std::array<Cell, CHANNELS> Channels;
  bool HasData() const { for (const auto& c : Channels) if (c.HasData()) return true; return false; }
};

struct Pattern {
  unsigned Size = 0;
  std::vector<Line> Lines;  // Size entries; a line without data plays nothing
  const Line* GetLine(unsigned row) const { return row < Lines.size() && Lines[row].HasData() ? &Lines[row] : nullptr; }
};

struct Module {
  unsigned EvenInitialTempo = 0, OddInitialTempo = 0, InitialTempoInterleave = 0;
  std::vector<unsigned> Positions;
  unsigned LoopPosition = 0;
  std::vector<std::unique_ptr<Pattern>> Patterns;   // 256; null = never used
  std::array<Instrument, 256> Instruments;          // index 1..255
  const Pattern* GetPattern(unsigned idx) const { return idx < Patterns.size() ? Patterns[idx].get() : nullptr; }
};

/** Parse a whole .tfe; false when it is not a TFM Music Maker file ZXTune would accept. */
bool Parse(const uint8_t* data, size_t size, Module& out);

/** 50 Hz player: each Frame() returns the YM2203 writes of that frame (chip 0 = channels 0-2). */
class Player {
 public:
  explicit Player(const Module& m);
  ~Player();
  void Frame(Registers& regs);
  unsigned Position() const;
  unsigned Line() const;
 private:
  struct Impl;
  std::unique_ptr<Impl> P;
};

}  // namespace tfm
