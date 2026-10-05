// TFM Music Maker (.tfe) parser + frame player, extracted from ZXTune
// (GPL-3.0). See tfm_player.h for the source files; comments marked ZXTune
// are kept from the original.
#include "tfm_player.h"

#include <algorithm>
#include <cstring>
#include <stdexcept>

namespace tfm {

namespace {

// ---------------------------------------------------------------------------
// Format (src/formats/chiptune/fm/tfmmusicmaker.cpp)
// ---------------------------------------------------------------------------

const size_t MAX_POSITIONS_COUNT = 256;
const size_t MAX_INSTRUMENTS_COUNT = 255;
const size_t MAX_PATTERNS_COUNT = 256;
const size_t MAX_PATTERN_SIZE = 256;
const size_t EFFECTS_COUNT = 4;

enum Effects {
  FX_ARPEGGIO = 0, FX_SLIDEUP = 1, FX_SLIDEDN = 2, FX_PORTAMENTO = 3, FX_VIBRATO = 4,
  FX_PORTAMENTO_VOLSLIDE = 5, FX_VIBRATO_VOLSLIDE = 6, FX_NONE = 7, FX_TLOP0 = 8, FX_TLOP1 = 9,
  FX_VOLSLIDE = 10, FX_SPECMODE = 11, FX_TLOP2 = 12, FX_TLOP3 = 13, FX_EXT = 14, FX_TEMPO = 15
};

enum ExtendedEffects {
  FX_EXT_MULTOP0 = 0, FX_EXT_MULTOP1 = 1, FX_EXT_MULTOP2 = 2, FX_EXT_MULTOP3 = 3, FX_EXT_NONE0 = 4,
  FX_EXT_OPMIXER = 5, FX_EXT_LOOPING = 6, FX_EXT_NONE1 = 7, FX_EXT_PANE = 8, FX_EXT_NOTERETRIG = 9,
  FX_EXT_NONE2 = 10, FX_EXT_NONE3 = 11, FX_EXT_NOTECUT = 12, FX_EXT_NOTEDELAY = 13,
  FX_EXT_DROPEFFECT = 14, FX_EXT_FEEDBACK = 15
};

// Player command types (src/module/players/tfm/tfmmusicmaker.cpp CmdType)
enum CmdType {
  EMPTY, ARPEGGIO, TONESLIDE, PORTAMENTO, VIBRATO, LEVEL, VOLSLIDE, SPECMODE, TONEOFFSET, MULTIPLE,
  MIXING, PANE, NOTERETRIG, NOTECUT, NOTEDELAY, DROPEFFECTS, FEEDBACK, TEMPO_INTERLEAVE, TEMPO_VALUES,
  LOOP_START, LOOP_STOP
};

struct Effect {
  unsigned Code = 0, Parameter = 0;
  Effect() = default;
  Effect(unsigned c, unsigned p) : Code(c), Parameter(p) {}
  unsigned ParamX() const { return Parameter >> 4; }
  unsigned ParamY() const { return Parameter & 15; }
  bool IsEmpty() const {
    return (Code == FX_ARPEGGIO && Parameter == 0) || Code == FX_NONE || (Code == FX_EXT && IsEmptyExtended());
  }
  bool IsEmptyExtended() const {
    switch (ParamX()) {
      case FX_EXT_NOTERETRIG: case FX_EXT_NOTECUT: case FX_EXT_NOTEDELAY: return 0 == ParamY();
      case FX_EXT_NONE0: case FX_EXT_NONE1: case FX_EXT_NONE2: case FX_EXT_NONE3: return true;
      default: return false;
    }
  }
};

const unsigned KEY_OFF = 0xfe;
const unsigned NO_NOTE = 0xff;

struct RawCell {
  unsigned Note = 0, Volume = 0, Instrument = 0;
  std::array<Effect, EFFECTS_COUNT> Effects;
  bool IsEmpty() const {
    return Note == NO_NOTE && Volume == 0 && Effects[0].IsEmpty() && Effects[1].IsEmpty() && Effects[2].IsEmpty()
           && Effects[3].IsEmpty();
  }
  bool IsKeyOff() const { return Note == KEY_OFF; }
  bool HasNote() const { return Note != KEY_OFF && Note != NO_NOTE; }
};

struct Layout {
  bool v13;
  size_t signature, headerSize;
  size_t evenSpeed, oddSpeed, interleave, positionsCount, loopPosition, creationDate, saveDate;
  size_t positions, instruments, patternsSizes, patterns, patternSize, channelSize;
};

// Version05 / Version13 RawHeader offsets (static_asserts in ZXTune: 1981904 / 4341209 bytes).
const Layout V05 = {false, 0, 1981904, 0, 0, 1, 2, 3, 4, 6, 522, 4858, 15568, 15824, 7680, 1280};
const Layout V13 = {true, 8, 4341209, 8, 9, 10, 11, 12, 13, 15, 531, 4867, 15577, 15833, 16896, 2816};

void Require(bool cond) { if (!cond) throw std::runtime_error("tfm"); }

/** RLE stream decoder (ZXTune Decompressor): 0x80 + 7-bit counter repeats the last byte. */
std::vector<uint8_t> Decompress(const uint8_t* data, size_t size, size_t offset, size_t targetSize) {
  std::vector<uint8_t> out;
  out.reserve(targetSize);
  size_t pos = 0;
  auto getByte = [&]() -> unsigned { Require(pos < size); return data[pos++]; };
  for (; offset; --offset) out.push_back(getByte());
  const unsigned MARKER = 0x80;
  int lastByte = -1;
  while (out.size() < targetSize) {
    const unsigned sym = getByte();
    if (sym == MARKER) {
      unsigned counter = 0;
      for (unsigned shift = 0;; shift += 7) {
        Require(shift <= 21);
        const unsigned s = getByte();
        counter |= (s & 0x7f) << shift;
        if (s & 0x80) break;
      }
      if (counter) {
        Require(counter > 1);
        Require(lastByte != -1);
        out.insert(out.end(), counter - 1, static_cast<uint8_t>(lastByte));
        // disable doubled sequences
        lastByte = -1;
      } else {
        out.push_back(MARKER);
      }
    } else {
      out.push_back(static_cast<uint8_t>(lastByte = sym));
    }
  }
  Require(out.size() == targetSize);
  return out;
}

void CheckDate(const uint8_t* d) {
  const unsigned yearMonth = d[0], monthDay = d[1];
  const unsigned year = yearMonth & 127;
  const unsigned month = 1 + (((monthDay & 7) << 1) | (yearMonth >> 7));
  const unsigned day = monthDay >> 3;
  Require(year <= 99 && month >= 1 && month <= 12 && day >= 1 && day <= 31);
}

RawCell GetCell(const Layout& L, const uint8_t* pat, unsigned chan, unsigned line) {
  const uint8_t* ch = pat + chan * L.channelSize;
  RawCell r;
  r.Note = ch[line] ^ 0xff;
  r.Volume = ch[MAX_PATTERN_SIZE + line];
  r.Instrument = ch[2 * MAX_PATTERN_SIZE + line];
  if (!L.v13) {
    const unsigned code = ch[3 * MAX_PATTERN_SIZE + line];
    const unsigned param = ch[4 * MAX_PATTERN_SIZE + line];
    if (FX_SPECMODE == code && param != 0) {
      r.Effects[0] = Effect(FX_SPECMODE, 1);
      r.Effects[1] = Effect(FX_SPECMODE, 16 | (param >> 4));
      r.Effects[2] = Effect(FX_SPECMODE, 32 | (param & 15));
      r.Effects[3] = Effect(FX_SPECMODE, 0x3c);
    } else {
      r.Effects[0] = Effect(code, param);
    }
  } else {
    for (unsigned e = 0; e != EFFECTS_COUNT; ++e) {
      const uint8_t* eff = ch + 3 * MAX_PATTERN_SIZE + e * 2 * MAX_PATTERN_SIZE;
      r.Effects[e] = Effect(eff[line], eff[MAX_PATTERN_SIZE + line]);
    }
  }
  return r;
}

void AddCmd(Cell& c, unsigned type, int p1 = 0, int p2 = 0) { c.Commands.push_back({type, p1, p2}); }

void ParseExtEffect(unsigned paramX, unsigned paramY, Cell& c) {
  switch (paramX) {
    case FX_EXT_MULTOP0: case FX_EXT_MULTOP1: case FX_EXT_MULTOP2: case FX_EXT_MULTOP3:
      AddCmd(c, MULTIPLE, paramX - FX_EXT_MULTOP0, paramY); break;
    case FX_EXT_OPMIXER: AddCmd(c, MIXING, paramY); break;
    case FX_EXT_LOOPING:
      if (paramY == 0) AddCmd(c, LOOP_START); else AddCmd(c, LOOP_STOP, paramY);
      break;
    case FX_EXT_PANE: AddCmd(c, PANE, paramY); break;
    case FX_EXT_NOTERETRIG: AddCmd(c, NOTERETRIG, paramY); break;
    case FX_EXT_NOTECUT: AddCmd(c, NOTECUT, paramY); break;
    case FX_EXT_NOTEDELAY: AddCmd(c, NOTEDELAY, paramY); break;
    case FX_EXT_DROPEFFECT: AddCmd(c, DROPEFFECTS); break;
    case FX_EXT_FEEDBACK: AddCmd(c, FEEDBACK, paramY); break;
  }
}

void ParseEffect(const Effect& eff, Cell& c) {
  switch (eff.Code) {
    case FX_ARPEGGIO: AddCmd(c, ARPEGGIO, eff.ParamX(), eff.ParamY()); break;
    case FX_SLIDEUP: AddCmd(c, TONESLIDE, eff.Parameter); break;
    case FX_SLIDEDN: AddCmd(c, TONESLIDE, -static_cast<int>(eff.Parameter)); break;
    case FX_PORTAMENTO: AddCmd(c, PORTAMENTO, eff.Parameter); break;
    case FX_VIBRATO: AddCmd(c, VIBRATO, eff.ParamX(), eff.ParamY()); break;
    case FX_PORTAMENTO_VOLSLIDE:
      AddCmd(c, PORTAMENTO, 0);
      AddCmd(c, VOLSLIDE, eff.ParamX(), eff.ParamY());
      break;
    case FX_VIBRATO_VOLSLIDE:
      AddCmd(c, VIBRATO, 0, 0);
      AddCmd(c, VOLSLIDE, eff.ParamX(), eff.ParamY());
      break;
    case FX_TLOP0: case FX_TLOP1: AddCmd(c, LEVEL, eff.Code - FX_TLOP0, eff.Parameter & 0x7f); break;
    case FX_VOLSLIDE: AddCmd(c, VOLSLIDE, eff.ParamX(), eff.ParamY()); break;
    case FX_SPECMODE:
      if (const unsigned paramX = eff.ParamX()) AddCmd(c, TONEOFFSET, paramX, eff.ParamY());
      else AddCmd(c, SPECMODE, eff.ParamY() != 0);
      break;
    case FX_TLOP2: case FX_TLOP3: AddCmd(c, LEVEL, eff.Code - FX_TLOP2 + 2, eff.Parameter & 0x7f); break;
    case FX_EXT: ParseExtEffect(eff.ParamX(), eff.ParamY(), c); break;
    case FX_TEMPO:
      if (const unsigned paramX = eff.ParamX()) AddCmd(c, TEMPO_VALUES, paramX, eff.ParamY());
      else AddCmd(c, TEMPO_INTERLEAVE, eff.ParamY());
      break;
  }
}

void ParseChannel(const RawCell& cell, Cell& c, std::vector<bool>& usedInstruments) {
  if (cell.IsKeyOff()) {
    c.HasEnabled = true; c.Enabled = false;
  } else if (cell.HasNote()) {
    Require(cell.Note >= 12);
    c.HasNote = true; c.Note = cell.Note - 12;
    if (cell.Instrument != 0) {
      c.HasSample = true; c.Sample = cell.Instrument;
      usedInstruments[cell.Instrument] = true;
    }
  }
  if (cell.Volume != 0) { c.HasVolume = true; c.Volume = cell.Volume; }
  for (const auto& eff : cell.Effects) if (!eff.IsEmpty()) ParseEffect(eff, c);
}

Instrument ParseInstrument(const Layout& L, const uint8_t* in) {
  Instrument out;
  out.Algorithm = in[0];
  out.Feedback = in[1];
  for (unsigned op = 0; op != 4; ++op) {
    const uint8_t* o = in + 2 + op * 10;
    Instrument::Operator& d = out.Operators[op];
    d.Multiple = o[0];
    d.Detune = static_cast<int8_t>(o[1]);
    d.TotalLevel = o[2] ^ 0x7f;
    d.RateScaling = o[3];
    d.Attack = L.v13 ? o[4] ^ 0x1f : o[4];
    d.Decay = L.v13 ? o[5] ^ 0x1f : o[5];
    d.Sustain = L.v13 ? o[6] ^ 0x1f : o[6];
    d.Release = L.v13 ? o[7] ^ 0x0f : o[7];
    d.SustainLevel = o[8];
    d.EnvelopeType = o[9];
  }
  return out;
}

bool ParseLayout(const Layout& L, const uint8_t* data, size_t size, Module& out) {
  try {
    const std::vector<uint8_t> hdr = Decompress(data, size, L.signature, L.headerSize);
    const uint8_t* h = hdr.data();
    if (L.v13) {
      out.EvenInitialTempo = h[L.evenSpeed];
      out.OddInitialTempo = h[L.oddSpeed];
    } else {
      out.EvenInitialTempo = h[0] >> 4;
      out.OddInitialTempo = h[0] & 15;
    }
    out.InitialTempoInterleave = h[L.interleave];
    CheckDate(h + L.creationDate);
    CheckDate(h + L.saveDate);
    const size_t positionsCount = h[L.positionsCount] ? h[L.positionsCount] : MAX_POSITIONS_COUNT;
    out.LoopPosition = h[L.loopPosition];
    out.Positions.assign(h + L.positions, h + L.positions + positionsCount);
    out.Patterns.clear();
    out.Patterns.resize(MAX_PATTERNS_COUNT);
    std::vector<bool> usedInstruments(256, false);
    usedInstruments[1] = true;
    for (unsigned pos : out.Positions) {
      if (out.Patterns[pos]) continue;
      const unsigned patSize = h[L.patternsSizes + pos];
      if (patSize == 0) continue;  // ZXTune: no lines, no pattern object -> stub
      const uint8_t* pat = h + L.patterns + pos * L.patternSize;
      auto p = std::make_unique<Pattern>();
      p->Size = patSize;
      p->Lines.resize(patSize);
      for (unsigned line = 0; line < patSize; ++line)
        for (unsigned chan = 0; chan != CHANNELS; ++chan) {
          const RawCell cell = GetCell(L, pat, chan, line);
          if (!cell.IsEmpty()) ParseChannel(cell, p->Lines[line].Channels[chan], usedInstruments);
        }
      out.Patterns[pos] = std::move(p);
    }
    for (unsigned i = 1; i <= MAX_INSTRUMENTS_COUNT; ++i)
      if (usedInstruments[i]) out.Instruments[i] = ParseInstrument(L, h + L.instruments + (i - 1) * 42);
    return true;
  } catch (const std::exception&) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Register builder (src/module/players/tfm/tfm_base_track.cpp)
// ---------------------------------------------------------------------------

inline unsigned EncodeDetune(int in) { return in >= 0 ? in : 4 - in; }

class ChannelBuilder {
 public:
  ChannelBuilder(unsigned chan, Registers& data)
      : Chip(chan >= CHANNELS / 2), Channel(Chip ? chan - CHANNELS / 2 : chan), Regs(data) {}
  void SetMode(unsigned mode) { WriteChipRegister(0x27, mode); }
  void KeyOn() { SetKey(0xf); }
  void KeyOff() { SetKey(0); }
  void SetKey(unsigned mask) { WriteChipRegister(0x28, Channel | (mask << 4)); }
  void SetupConnection(unsigned algorithm, unsigned feedback) { WriteChannelRegister(0xb0, algorithm | (feedback << 3)); }
  void SetDetuneMultiple(unsigned op, int detune, unsigned multiple) {
    WriteOperatorRegister(0x30, op, (EncodeDetune(detune) << 4) | multiple);
  }
  void SetRateScalingAttackRate(unsigned op, unsigned rs, unsigned ar) { WriteOperatorRegister(0x50, op, (rs << 6) | ar); }
  void SetDecay(unsigned op, unsigned v) { WriteOperatorRegister(0x60, op, v); }
  void SetSustain(unsigned op, unsigned v) { WriteOperatorRegister(0x70, op, v); }
  void SetSustainLevelReleaseRate(unsigned op, unsigned sl, unsigned rr) { WriteOperatorRegister(0x80, op, (sl << 4) | rr); }
  void SetEnvelopeType(unsigned op, unsigned v) { WriteOperatorRegister(0x90, op, v); }
  void SetTotalLevel(unsigned op, unsigned v) { WriteOperatorRegister(0x40, op, v); }
  void SetTone(unsigned octave, unsigned tone) {
    WriteChannelRegister(0xa4, octave * 8 + (tone >> 8));
    WriteChannelRegister(0xa0, tone & 0xff);
  }
  void SetTone(unsigned op, unsigned octave, unsigned tone) {
    const unsigned valHi = octave * 8 + (tone >> 8), valLo = tone & 0xff;
    switch (op) {
      case 0: WriteChipRegister(0xa4, valHi); WriteChipRegister(0xa0, valLo); break;
      case 1: WriteChipRegister(0xac, valHi); WriteChipRegister(0xa8, valLo); break;
      case 2: WriteChipRegister(0xae, valHi); WriteChipRegister(0xaa, valLo); break;
      case 3: WriteChipRegister(0xad, valHi); WriteChipRegister(0xa9, valLo); break;  // ZXTune: op1 in doc???
    }
  }
  void SetPane(unsigned val) { WriteChannelRegister(0xb4, val); }

 private:
  void WriteOperatorRegister(unsigned base, unsigned op, unsigned val) { WriteChannelRegister(base + 4 * op, val); }
  void WriteChannelRegister(unsigned base, unsigned val) { WriteChipRegister(base + Channel, val); }
  void WriteChipRegister(unsigned idx, unsigned val) {
    Regs.push_back({static_cast<uint8_t>(Chip), static_cast<uint8_t>(idx), static_cast<uint8_t>(val)});
  }
  const unsigned Chip, Channel;
  Registers& Regs;
};

// ---------------------------------------------------------------------------
// Player (src/module/players/tfm/tfmmusicmaker.cpp)
// ---------------------------------------------------------------------------

// Math::FixedPoint<int, 32>: raw value in 1/32 halftone
struct Halftones {
  static const int PRECISION = 32;
  static int Min() { return 0; }
  static int Max() { return 0xbff; }
  static int Stub() { return -1; }
  static int FromFraction(int v) { return v; }
  static int FromInteger(int v) { return v * PRECISION; }
};

// Math::FixedPoint<int, 8>: raw value in 1/8 level step
struct Level {
  static const int PRECISION = 8;
  static int Min() { return 0; }
  static int Max() { return 0xf8; }
  static int FromFraction(int v) { return v; }
  static int FromInteger(int v) { return v * PRECISION; }
};

struct ArpeggioState {
  void Reset() { Position = 0; Addons = {0, 0, 0}; Value = 0; }
  void SetAddons(unsigned add1, unsigned add2) {
    if (add1 == 0xf && add2 == 0xf) { Addons[1] = Addons[2] = 0; }
    else { Addons[1] = add1; Addons[2] = add2; }
  }
  bool Update() {
    const unsigned prev = Value;
    Value = Addons[Position];
    if (++Position >= Addons.size()) Position = 0;
    return Value != prev;
  }
  int GetValue() const { return Halftones::FromInteger(Value); }
  unsigned Position = 0;
  std::array<unsigned, 3> Addons = {0, 0, 0};
  unsigned Value = 0;
};

template <class Category>
struct SlideState {
  void Disable() { Enabled = false; }
  void SetDelta(int delta) {
    Enabled = true;
    if (delta > 0) UpDelta = delta;
    else if (delta < 0) DownDelta = delta;
  }
  bool Update(int& val) const {
    if (!Enabled) return false;
    const int prev = val;
    if (UpDelta) { val += Category::FromFraction(UpDelta); val = std::min(val, Category::Max()); }
    if (DownDelta) { val += Category::FromFraction(DownDelta); val = std::max(val, Category::Min()); }
    return val != prev;
  }
  bool Enabled = false;
  int UpDelta = 0, DownDelta = 0;
};

struct VibratoState {
  void Disable() { Enabled = false; }
  void ResetValue() { Value = 0; }
  void SetParameters(unsigned speed, int depth) {
    Enabled = true;
    if (speed) Speed = speed;
    if (depth) Depth = depth;
    if (speed || depth) Position = Value = 0;
  }
  bool Update() {
    if (!Enabled) {
      if (Value != 0) { Value = 0; Position = 0; return true; }
      return false;
    }
    const int PRECISION = 256;
    static const int TABLE[] = {0, 49,  97,  142,  181,  212,  236,  251,  256,  251,  236,  212,  181,  142,  97,  49,
                                0, -49, -97, -142, -181, -212, -236, -251, -256, -251, -236, -212, -181, -142, -97, -49};
    const int prevVal = Value;
    Value = TABLE[Position / 2] * Depth / PRECISION;
    Position = (Position + Speed) & 0x3f;
    return prevVal != Value;
  }
  int GetValue() const { return Halftones::FromFraction(Value); }
  bool Enabled = false;
  unsigned Position = 0, Speed = 0;
  int Depth = 0, Value = 0;
};

struct PortamentoState {
  void Disable() { Enabled = false; }
  void SetTarget(int tgt) { Enabled = true; Target = tgt; }
  void SetStep(unsigned step) { Enabled = true; if (step) Step = Halftones::FromFraction(step); }
  bool Update(int& note) const {
    if (!Enabled || Target == Halftones::Stub() || Target == note || Step == 0) return false;
    if (Target > note) note = std::min(note + Step, Target);
    else note = std::max(note - Step, Target);
    return true;
  }
  bool Enabled = false;
  int Step = 0;
  int Target = Halftones::Stub();
};

const unsigned NO_VALUE = ~0u;
const unsigned SPECIAL_MODE_CHANNEL = 2;

struct ChannelState {
  const Instrument* CurInstrument = nullptr;
  unsigned Algorithm = NO_VALUE;
  std::array<unsigned, OPERATORS> TotalLevel = {0, 0, 0, 0};
  int Note = Halftones::Stub();
  int Volume = Level::Max();
  bool HasToneChange = false, HasVolumeChange = false;
  ArpeggioState Arpeggio;
  SlideState<Halftones> ToneSlide;
  VibratoState Vibrato;
  SlideState<Level> VolumeSlide;
  PortamentoState Portamento;
  unsigned NoteRetrig = NO_VALUE, NoteCut = NO_VALUE, NoteDelay = NO_VALUE;
};

struct PlayerState {
  bool SpecialMode = false;
  std::array<int, OPERATORS> ToneOffset = {0, 0, 0, 0};
  std::array<ChannelState, CHANNELS> Channels;
};

struct TrackState { unsigned Position = 0, Pattern = 0, Line = 0, Quirk = 0; };

class DataRenderer {
 public:
  explicit DataRenderer(const Module& data) : Data(data) {}

  void SynthesizeData(const TrackState& state, Registers& regs) {
    if (0 == state.Quirk) GetNewLineState(state, regs);
    for (unsigned chan = 0; chan != CHANNELS; ++chan) {
      ChannelBuilder channel(chan, regs);
      SynthesizeChannel(chan, channel);
      ProcessNoteEffects(state.Quirk, chan, channel);
    }
  }

 private:
  void GetNewLineState(const TrackState& state, Registers& regs) {
    ResetOneLineEffects();
    const Pattern* pat = Data.GetPattern(state.Pattern);
    if (const Line* line = pat ? pat->GetLine(state.Line) : nullptr) {
      for (unsigned chan = 0; chan != CHANNELS; ++chan) {
        const Cell& src = line->Channels[chan];
        if (!src.HasData()) continue;
        ChannelBuilder channel(chan, regs);
        GetNewChannelState(src, State.Channels[chan], regs, channel);
      }
    }
  }

  void ResetOneLineEffects() {
    for (auto& dst : State.Channels) {
      // ZXTune: portamento, vibrato, volume and tone slide are applicable only when effect is specified
      dst.ToneSlide.Disable();
      dst.Vibrato.Disable();
      dst.VolumeSlide.Disable();
      dst.Portamento.Disable();
      dst.NoteRetrig = dst.NoteCut = dst.NoteDelay = NO_VALUE;
    }
  }

  void GetNewChannelState(const Cell& src, ChannelState& dst, Registers& regs, ChannelBuilder& channel) {
    const int* multiplies[OPERATORS] = {nullptr, nullptr, nullptr, nullptr};
    bool dropEffects = false, hasPortamento = false, hasOpMixer = false;
    for (const auto& cmd : src.Commands) {
      switch (cmd.Type) {
        case PORTAMENTO: hasPortamento = true; break;
        case SPECMODE: SetSpecialMode(cmd.Param1 != 0, regs); break;
        case TONEOFFSET: State.ToneOffset[cmd.Param1] = cmd.Param2; break;
        case MULTIPLE: multiplies[cmd.Param1] = &cmd.Param2; break;
        case MIXING: hasOpMixer = true; break;
        case PANE:
          if (1 == cmd.Param1) channel.SetPane(0x80);
          else if (2 == cmd.Param1) channel.SetPane(0x40);
          else channel.SetPane(0xc0);
          break;
        case NOTERETRIG: dst.NoteRetrig = cmd.Param1; break;
        case NOTECUT: dst.NoteCut = cmd.Param1; break;
        case NOTEDELAY: dst.NoteDelay = cmd.Param1; break;
        case DROPEFFECTS: dropEffects = true; break;
      }
    }

    const bool hasNoteDelay = dst.NoteDelay != NO_VALUE;

    if (src.HasEnabled && !src.Enabled) channel.KeyOff();
    if (src.HasNote) {
      if (!hasPortamento) channel.KeyOff();
      const Instrument* newInstrument = src.HasSample ? &Data.Instruments[src.Sample] : nullptr;
      if (!dst.CurInstrument && !newInstrument) newInstrument = &Data.Instruments[1];
      if (dropEffects && dst.CurInstrument && !newInstrument) newInstrument = dst.CurInstrument;
      if ((newInstrument && newInstrument != dst.CurInstrument) || dropEffects) {
        if (src.HasVolume) dst.Volume = Level::FromInteger(src.Volume);
        dst.CurInstrument = newInstrument;
        LoadInstrument(multiplies, dst, channel);
        dst.HasVolumeChange = true;
      }
      if (hasPortamento) {
        dst.Portamento.SetTarget(Halftones::FromInteger(src.Note));
      } else {
        dst.Note = Halftones::FromInteger(src.Note);
        dst.Arpeggio.Reset();
        dst.Vibrato.ResetValue();
        dst.HasToneChange = true;
        if (!hasNoteDelay && !hasOpMixer) channel.KeyOn();
      }
    }
    if (src.HasVolume) {
      const int newVol = Level::FromInteger(src.Volume);
      if (newVol != dst.Volume) { dst.Volume = newVol; dst.HasVolumeChange = true; }
    }
    for (const auto& cmd : src.Commands) {
      switch (cmd.Type) {
        case ARPEGGIO: dst.Arpeggio.SetAddons(cmd.Param1, cmd.Param2); break;
        case TONESLIDE: dst.ToneSlide.SetDelta(cmd.Param1); break;
        case PORTAMENTO: dst.Portamento.SetStep(cmd.Param1); break;
        case VIBRATO:
          // ZXTune: parameter in 1/16 of halftone
          dst.Vibrato.SetParameters(cmd.Param1, cmd.Param2 * Halftones::PRECISION / 16);
          break;
        case LEVEL: dst.TotalLevel[cmd.Param1] = cmd.Param2; dst.HasVolumeChange = true; break;
        case VOLSLIDE: dst.VolumeSlide.SetDelta(cmd.Param1); dst.VolumeSlide.SetDelta(-cmd.Param2); break;
        case MULTIPLE:
          // ZXTune dereferences the current instrument unconditionally; a file
          // that sets a multiple before any note has none, so skip it there.
          if (dst.CurInstrument) channel.SetDetuneMultiple(cmd.Param1, dst.CurInstrument->Operators[cmd.Param1].Detune, cmd.Param2);
          break;
        case MIXING: channel.SetKey(cmd.Param1); break;
        case FEEDBACK: channel.SetupConnection(dst.Algorithm, cmd.Param1); break;
      }
    }
  }

  void SetSpecialMode(bool enabled, Registers& regs) {
    if (enabled != State.SpecialMode) {
      State.SpecialMode = enabled;
      ChannelBuilder(SPECIAL_MODE_CHANNEL, regs).SetMode(enabled ? 0x40 : 0x00);
    }
  }

  static void LoadInstrument(const int* multiplies[], ChannelState& dst, ChannelBuilder& channel) {
    const Instrument& ins = *dst.CurInstrument;
    channel.SetupConnection(dst.Algorithm = ins.Algorithm, ins.Feedback);
    for (unsigned opIdx = 0; opIdx != OPERATORS; ++opIdx) {
      const Instrument::Operator& op = ins.Operators[opIdx];
      dst.TotalLevel[opIdx] = op.TotalLevel;
      const unsigned multiple = multiplies[opIdx] ? *multiplies[opIdx] : op.Multiple;
      channel.SetDetuneMultiple(opIdx, op.Detune, multiple);
      channel.SetRateScalingAttackRate(opIdx, op.RateScaling, op.Attack);
      channel.SetDecay(opIdx, op.Decay);
      channel.SetSustain(opIdx, op.Sustain);
      channel.SetSustainLevelReleaseRate(opIdx, op.SustainLevel, op.Release);
      channel.SetEnvelopeType(opIdx, op.EnvelopeType);
    }
  }

  void SynthesizeChannel(unsigned idx, ChannelBuilder& channel) {
    ChannelState& state = State.Channels[idx];
    if (state.Portamento.Update(state.Note)) state.HasToneChange = true;
    if (state.Vibrato.Update()) state.HasToneChange = true;
    if (state.ToneSlide.Update(state.Note)) state.HasToneChange = true;
    if (state.Arpeggio.Update()) state.HasToneChange = true;
    if (state.HasToneChange) { SetTone(idx, state, channel); state.HasToneChange = false; }
    if (state.VolumeSlide.Update(state.Volume)) state.HasVolumeChange = true;
    if (state.HasVolumeChange) { SetLevel(state, channel); state.HasVolumeChange = false; }
  }

  void ProcessNoteEffects(unsigned quirk, unsigned idx, ChannelBuilder& channel) {
    const auto& state = State.Channels[idx];
    if (state.NoteRetrig != NO_VALUE && state.NoteRetrig != 0 && 0 == quirk % state.NoteRetrig) {
      channel.KeyOff();
      channel.KeyOn();
    }
    if (quirk == state.NoteCut) channel.KeyOff();
    if (quirk == state.NoteDelay) { channel.KeyOff(); channel.KeyOn(); }
  }

  struct RawNote { unsigned Octave = 0, Freq = 0; };

  void SetTone(unsigned idx, const ChannelState& state, ChannelBuilder& channel) const {
    const int note = state.Note + state.Arpeggio.GetValue() + state.Vibrato.GetValue();
    const RawNote rawNote = ConvertNote(Clamp(note));
    channel.SetTone(rawNote.Octave, rawNote.Freq);
    if (idx == SPECIAL_MODE_CHANNEL && State.SpecialMode) {
      for (unsigned op = 1; op != OPERATORS; ++op) {
        const int opNote = note + Halftones::FromInteger(State.ToneOffset[op]);
        const RawNote rawOpNote = ConvertNote(Clamp(opNote));
        channel.SetTone(op, rawOpNote.Octave, rawOpNote.Freq);
      }
    }
  }

  static int Clamp(int val) { return std::max(Halftones::Min(), std::min(val, Halftones::Max())); }

  static RawNote ConvertNote(int note) {
    static const unsigned FREQS[] = {707, 749, 793, 840, 890, 943, 999, 1059, 1122, 1189, 1259, 1334, 1413, 1497};
    const unsigned totalHalftones = note / Halftones::PRECISION;
    const unsigned fraction = note % Halftones::PRECISION;
    const unsigned octave = totalHalftones / 12;
    const unsigned halftone = totalHalftones % 12;
    const unsigned freq = FREQS[halftone] + ((FREQS[halftone + 1] - FREQS[halftone]) * fraction) / Halftones::PRECISION;
    return {octave, freq};
  }

  static void SetLevel(const ChannelState& state, ChannelBuilder& channel) {
    static const unsigned MIXER_TABLE[8] = {0x8, 0x8, 0x8, 0x8, 0x0c, 0xe, 0xe, 0x0f};
    static const unsigned LEVELS_TABLE[32] = {0x00, 0x00, 0x58, 0x5a, 0x5b, 0x5d, 0x5f, 0x60, 0x61, 0x62, 0x64,
                                              0x66, 0x68, 0x6a, 0x6b, 0x6d, 0x6e, 0x70, 0x71, 0x72, 0x73, 0x74,
                                              0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f};
    if (state.Algorithm == NO_VALUE) return;
    const unsigned mix = MIXER_TABLE[state.Algorithm & 7];
    // A cell volume above 31 would index past ZXTune's table; hold it at the top.
    const unsigned level = LEVELS_TABLE[std::min(31, state.Volume / Level::PRECISION)];
    for (unsigned op = 0; op != OPERATORS; ++op) {
      const unsigned out = (mix & (1 << op)) ? ScaleTL(state.TotalLevel[op], level) : state.TotalLevel[op];
      channel.SetTotalLevel(op, out);
    }
  }

  static unsigned ScaleTL(unsigned tl, unsigned scale) { return 0x7f - ((0x7f - tl) * scale / 127); }

  const Module& Data;
  PlayerState State;
};

// TrackStateModel and TrackStateIterator with alternative tempo logic and loop support (ZXTune)
struct PlainTrackState {
  unsigned Position = 0, Pattern = 0, Line = 0, Quirk = 0;
  unsigned EvenTempo = 0, OddTempo = 0, TempoInterleavePeriod = 0, TempoInterleaveCounter = 0;
  unsigned GetTempo() const { return TempoInterleaveCounter >= TempoInterleavePeriod ? OddTempo : EvenTempo; }
  void NextLine() {
    Quirk = 0;
    ++Line;
    if (++TempoInterleaveCounter >= 2 * TempoInterleavePeriod) TempoInterleaveCounter -= 2 * TempoInterleavePeriod;
  }
};

struct LoopState {
  void Start(const PlainTrackState& state) {
    if (!Begin || Begin->Line != state.Line || Begin->Position != state.Position) {
      Begin = std::make_unique<PlainTrackState>(state);
      Counter = 0;
    }
  }
  const PlainTrackState* Stop(unsigned repeatCount) {
    if (Counter >= repeatCount) return nullptr;
    // ZXTune: from original loop processing logic
    if (++Counter >= repeatCount) Counter = 16;  // max repeat count+1
    return Begin.get();
  }
  std::unique_ptr<const PlainTrackState> Begin;
  unsigned Counter = 0;
};

class TrackStateCursor {
 public:
  explicit TrackStateCursor(const Module& data) : Data(data) { Reset(); }

  bool IsValid() const { return Plain.Position < Data.Positions.size(); }
  const PlainTrackState& GetState() const { return Plain; }

  void Reset() {
    Plain.EvenTempo = Data.EvenInitialTempo;
    Plain.OddTempo = Data.OddInitialTempo;
    Plain.TempoInterleavePeriod = Data.InitialTempoInterleave;
    Plain.TempoInterleaveCounter = 0;
    SetPosition(0);
    NextLineState = nullptr;
  }

  void SetState(const PlainTrackState& state) { GoTo(state); }

  void Seek(unsigned position) {
    if (Plain.Position > position || (Plain.Position == position && (0 != Plain.Line || 0 != Plain.Quirk))) Reset();
    while (IsValid() && Plain.Position != position) {
      if (!NextLine()) NextPosition();
    }
  }

  bool NextFrame() { return NextQuirk() || NextLine() || NextPosition(); }

 private:
  void SetPosition(unsigned pos) {
    Plain.Position = pos;
    if (IsValid()) SetPattern(Data.Positions[Plain.Position]);
    else SetStubPattern();
  }
  void SetStubPattern() { Plain.Pattern = 0; CurPattern = nullptr; SetLine(0); }
  void SetPattern(unsigned pat) {
    Plain.Pattern = pat;
    CurPattern = Data.GetPattern(pat);
    if (CurPattern) SetLine(0); else SetStubPattern();
  }
  unsigned PatternSize() const { return CurPattern ? CurPattern->Size : 0; }
  void SetLine(unsigned line) { Plain.Quirk = 0; Plain.Line = line; LoadLine(); }
  void LoadLine() {
    CurLine = CurPattern ? CurPattern->GetLine(Plain.Line) : nullptr;
    if (CurLine) LoadNewLoopTempoParameters();
  }
  bool NextQuirk() { return ++Plain.Quirk < Plain.GetTempo(); }
  bool NextLine() {
    if (NextLineState) {
      GoTo(*NextLineState);
    } else {
      Plain.NextLine();
      if (Plain.Line >= PatternSize()) return false;
      LoadLine();
    }
    return true;
  }
  bool NextPosition() { SetPosition(Plain.Position + 1); return IsValid(); }
  void GoTo(const PlainTrackState& state) {
    SetPosition(state.Position);
    SetLine(state.Line);
    Plain.Quirk = state.Quirk;
    Plain.EvenTempo = state.EvenTempo;
    Plain.OddTempo = state.OddTempo;
    Plain.TempoInterleavePeriod = state.TempoInterleavePeriod;
    Plain.TempoInterleaveCounter = state.TempoInterleaveCounter;
    NextLineState = nullptr;
  }
  void LoadNewLoopTempoParameters() {
    for (const auto& chan : CurLine->Channels) {
      if (!chan.HasData()) continue;
      for (const auto& cmd : chan.Commands) {
        switch (cmd.Type) {
          case TEMPO_INTERLEAVE: Plain.TempoInterleavePeriod = cmd.Param1; break;
          case TEMPO_VALUES: Plain.EvenTempo = cmd.Param1; Plain.OddTempo = cmd.Param2; break;
          case LOOP_START: Loop.Start(Plain); break;
          case LOOP_STOP: NextLineState = Loop.Stop(cmd.Param1); break;
        }
      }
    }
  }

  const Module& Data;
  PlainTrackState Plain;
  const Pattern* CurPattern = nullptr;
  const tfm::Line* CurLine = nullptr;
  LoopState Loop;
  const PlainTrackState* NextLineState = nullptr;
};

}  // namespace

bool Parse(const uint8_t* data, size_t size, Module& out) {
  static const char SIGNATURE[] = "TFMfmtV2";
  if (size >= 8 && 0 == std::memcmp(data, SIGNATURE, 8)) return ParseLayout(V13, data, size, out);
  return ParseLayout(V05, data, size, out);
}

struct Player::Impl {
  explicit Impl(const Module& m) : Data(m), Cursor(m), Renderer(m) {}
  const Module& Data;
  TrackStateCursor Cursor;
  DataRenderer Renderer;
  bool Started = false;
  bool HasLoopState = false;
  PlainTrackState LoopStateCopy;

  void Frame(Registers& regs) {
    // ZXTune TrackDataIterator: frame 0 is synthesized on construction, each
    // later frame after the cursor moves; TrackStateIterator wraps to the loop.
    if (Started) {
      if (!Cursor.NextFrame()) {
        if (HasLoopState) {
          Cursor.SetState(LoopStateCopy);
        } else {
          Cursor.Seek(Data.LoopPosition);
          LoopStateCopy = Cursor.GetState();
          HasLoopState = true;
        }
      }
    }
    Started = true;
    const PlainTrackState& p = Cursor.GetState();
    TrackState t;
    t.Position = p.Position; t.Pattern = p.Pattern; t.Line = p.Line; t.Quirk = p.Quirk;
    Renderer.SynthesizeData(t, regs);
  }
};

Player::Player(const Module& m) : P(new Impl(m)) {}
Player::~Player() = default;
void Player::Frame(Registers& regs) { P->Frame(regs); }
unsigned Player::Position() const { return P->Cursor.GetState().Position; }
unsigned Player::Line() const { return P->Cursor.GetState().Line; }

}  // namespace tfm
