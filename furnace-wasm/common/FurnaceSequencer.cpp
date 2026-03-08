/**
 * FurnaceSequencer.cpp - Sequencer core for Furnace WASM dispatch
 *
 * Adapted from Furnace Tracker's playback.cpp (tildearrow and contributors).
 * Copyright (C) 2021-2026 tildearrow and contributors (original Furnace)
 * DEViLBOX WASM adaptation - same GPL-2.0-or-later license.
 */

#include "FurnaceSequencer.h"
#include <cstdio>
#include <cmath>


#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#ifndef CLAMP
#define CLAMP(x, lo, hi) ((x) < (lo) ? (lo) : ((x) > (hi) ? (hi) : (x)))
#endif
#ifndef MAX
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#endif
#ifndef MIN
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#endif

// ============================================================
// DivCommand enum values (from dispatch.h)
// ============================================================

enum {
  DIV_CMD_NOTE_ON = 0,
  DIV_CMD_NOTE_OFF = 1,
  DIV_CMD_NOTE_OFF_ENV = 2,
  DIV_CMD_ENV_RELEASE = 3,
  DIV_CMD_INSTRUMENT = 4,
  DIV_CMD_VOLUME = 5,
  DIV_CMD_GET_VOLUME = 6,
  DIV_CMD_GET_VOLMAX = 7,
  DIV_CMD_NOTE_PORTA = 8,
  DIV_CMD_PITCH = 9,
  DIV_CMD_PANNING = 10,
  DIV_CMD_LEGATO = 11,
  DIV_CMD_PRE_PORTA = 12,
  DIV_CMD_PRE_NOTE = 13,

  DIV_CMD_HINT_VIBRATO = 14,
  DIV_CMD_HINT_VIBRATO_RANGE = 15,
  DIV_CMD_HINT_VIBRATO_SHAPE = 16,
  DIV_CMD_HINT_PITCH = 17,
  DIV_CMD_HINT_ARPEGGIO = 18,
  DIV_CMD_HINT_VOLUME = 19,
  DIV_CMD_HINT_VOL_SLIDE = 20,
  DIV_CMD_HINT_PORTA = 21,
  DIV_CMD_HINT_LEGATO = 22,
  DIV_CMD_HINT_VOL_SLIDE_TARGET = 23,
  DIV_CMD_HINT_TREMOLO = 24,
  DIV_CMD_HINT_PANBRELLO = 25,
  DIV_CMD_HINT_PAN_SLIDE = 26,
  DIV_CMD_HINT_PANNING = 27,

  DIV_CMD_SAMPLE_MODE = 28,
  DIV_CMD_SAMPLE_FREQ = 29,
  DIV_CMD_SAMPLE_BANK = 30,
  DIV_CMD_SAMPLE_POS = 31,
  DIV_CMD_SAMPLE_DIR = 32,

  // FM commands (34-61) — used by Genesis, OPN, OPL, OPLL, etc.
  DIV_CMD_FM_HARD_RESET = 33,
  DIV_CMD_FM_LFO = 34,
  DIV_CMD_FM_LFO_WAVE = 35,
  DIV_CMD_FM_TL = 36,
  DIV_CMD_FM_AM = 37,
  DIV_CMD_FM_AR = 38,
  DIV_CMD_FM_DR = 39,
  DIV_CMD_FM_SL = 40,
  DIV_CMD_FM_D2R = 41,
  DIV_CMD_FM_RR = 42,
  DIV_CMD_FM_DT = 43,
  DIV_CMD_FM_DT2 = 44,
  DIV_CMD_FM_RS = 45,
  DIV_CMD_FM_KSR = 46,
  DIV_CMD_FM_VIB = 47,
  DIV_CMD_FM_SUS = 48,
  DIV_CMD_FM_WS = 49,
  DIV_CMD_FM_SSG = 50,
  DIV_CMD_FM_REV = 51,
  DIV_CMD_FM_EG_SHIFT = 52,
  DIV_CMD_FM_FB = 53,
  DIV_CMD_FM_MULT = 54,
  DIV_CMD_FM_FINE = 55,
  DIV_CMD_FM_FIXFREQ = 56,
  DIV_CMD_FM_EXTCH = 57,
  DIV_CMD_FM_AM_DEPTH = 58,
  DIV_CMD_FM_PM_DEPTH = 59,
  DIV_CMD_FM_LFO2 = 60,
  DIV_CMD_FM_LFO2_WAVE = 61,

  // Standard PSG commands
  DIV_CMD_STD_NOISE_FREQ = 62,
  DIV_CMD_STD_NOISE_MODE = 63,
  DIV_CMD_WAVE = 64,

  // Platform-specific commands
  DIV_CMD_GB_SWEEP_TIME = 65,
  DIV_CMD_GB_SWEEP_DIR = 66,
  DIV_CMD_PCE_LFO_MODE = 67,
  DIV_CMD_PCE_LFO_SPEED = 68,
  DIV_CMD_NES_SWEEP = 69,
  DIV_CMD_NES_DMC = 70,

  // C64 commands
  DIV_CMD_C64_CUTOFF = 71,
  DIV_CMD_C64_RESONANCE = 72,
  DIV_CMD_C64_FILTER_MODE = 73,
  DIV_CMD_C64_RESET_TIME = 74,
  DIV_CMD_C64_RESET_MASK = 75,
  DIV_CMD_C64_FILTER_RESET = 76,
  DIV_CMD_C64_DUTY_RESET = 77,
  DIV_CMD_C64_EXTENDED = 78,
  DIV_CMD_C64_FINE_DUTY = 79,
  DIV_CMD_C64_FINE_CUTOFF = 80,

  // AY/YM PSG commands
  DIV_CMD_AY_ENVELOPE_SET = 81,
  DIV_CMD_AY_ENVELOPE_LOW = 82,
  DIV_CMD_AY_ENVELOPE_HIGH = 83,
  DIV_CMD_AY_ENVELOPE_SLIDE = 84,
  DIV_CMD_AY_NOISE_MASK_AND = 85,
  DIV_CMD_AY_NOISE_MASK_OR = 86,
  DIV_CMD_AY_AUTO_ENVELOPE = 87,
  DIV_CMD_AY_IO_WRITE = 88,
  DIV_CMD_AY_AUTO_PWM = 89,

  // SAA1099
  DIV_CMD_SAA_ENVELOPE = 95,

  // Amiga
  DIV_CMD_AMIGA_FILTER = 96,
  DIV_CMD_AMIGA_AM = 97,
  DIV_CMD_AMIGA_PM = 98,

  // FDS
  DIV_CMD_FDS_MOD_DEPTH = 90,
  DIV_CMD_FDS_MOD_HIGH = 91,
  DIV_CMD_FDS_MOD_LOW = 92,
  DIV_CMD_FDS_MOD_POS = 93,
  DIV_CMD_FDS_MOD_WAVE = 94,

  // Lynx
  DIV_CMD_LYNX_LFSR_LOAD = 99,

  // QSound
  DIV_CMD_QSOUND_ECHO_FEEDBACK = 100,
  DIV_CMD_QSOUND_ECHO_DELAY = 101,
  DIV_CMD_QSOUND_ECHO_LEVEL = 102,
  DIV_CMD_QSOUND_SURROUND = 103,

  // N163
  DIV_CMD_N163_WAVE_POSITION = 113,
  DIV_CMD_N163_WAVE_LENGTH = 114,
  DIV_CMD_N163_CHANNEL_LIMIT = 120,
  DIV_CMD_N163_GLOBAL_WAVE_LOAD = 121,
  DIV_CMD_N163_GLOBAL_WAVE_LOADPOS = 122,

  // ADPCM-A
  DIV_CMD_ADPCMA_GLOBAL_VOLUME = 131,

  // SNES commands
  DIV_CMD_SNES_ECHO = 132,
  DIV_CMD_SNES_PITCH_MOD = 133,
  DIV_CMD_SNES_INVERT = 134,
  DIV_CMD_SNES_GAIN_MODE = 135,
  DIV_CMD_SNES_GAIN = 136,
  DIV_CMD_SNES_ECHO_ENABLE = 137,
  DIV_CMD_SNES_ECHO_DELAY = 138,
  DIV_CMD_SNES_ECHO_VOL_LEFT = 139,
  DIV_CMD_SNES_ECHO_VOL_RIGHT = 140,
  DIV_CMD_SNES_ECHO_FEEDBACK = 141,
  DIV_CMD_SNES_ECHO_FIR = 142,

  // NES extra
  DIV_CMD_NES_ENV_MODE = 143,
  DIV_CMD_NES_LENGTH = 144,
  DIV_CMD_NES_COUNT_MODE = 145,

  // Macro commands — MUST match Furnace DivDispatchCmds values
  DIV_CMD_MACRO_OFF = 146,
  DIV_CMD_MACRO_ON = 147,

  // Surround panning
  DIV_CMD_SURROUND_PANNING = 148,

  // FM extra
  DIV_CMD_FM_AM2_DEPTH = 149,
  DIV_CMD_FM_PM2_DEPTH = 150,

  DIV_CMD_HINT_ARP_TIME = 162,

  // SNES global
  DIV_CMD_SNES_GLOBAL_VOL_LEFT = 163,
  DIV_CMD_SNES_GLOBAL_VOL_RIGHT = 164,

  // NES linear length
  DIV_CMD_NES_LINEAR_LENGTH = 165,

  DIV_CMD_EXTERNAL = 166,

  // C64 extra
  DIV_CMD_C64_AD = 167,
  DIV_CMD_C64_SR = 168,

  // ESFM
  DIV_CMD_ESFM_OP_PANNING = 169,
  DIV_CMD_ESFM_OUTLVL = 170,
  DIV_CMD_ESFM_MODIN = 171,
  DIV_CMD_ESFM_ENV_DELAY = 172,

  DIV_CMD_MACRO_RESTART = 173,

  // FDS extra
  DIV_CMD_FDS_MOD_AUTO = 184,

  // FM extra
  DIV_CMD_FM_OPMASK = 185,

  // C64 slides
  DIV_CMD_C64_PW_SLIDE = 214,
  DIV_CMD_C64_CUTOFF_SLIDE = 215,

  // FM algorithm/modulation
  DIV_CMD_FM_ALG = 222,
  DIV_CMD_FM_FMS = 223,
  DIV_CMD_FM_AMS = 224,
  DIV_CMD_FM_FMS2 = 225,
  DIV_CMD_FM_AMS2 = 226,
};

// Special note value for null note (retrigger without changing pitch)
#define DIV_NOTE_NULL 0x7fffffff

// ============================================================
// Platform/chip ID constants (from Furnace sysDef.h)
// ============================================================

#define SEQ_CHIP_GENESIS      2
#define SEQ_CHIP_GENESIS_EXT  3
#define SEQ_CHIP_SMS          4
#define SEQ_CHIP_GB           6
#define SEQ_CHIP_PCE          7
#define SEQ_CHIP_NES          8
#define SEQ_CHIP_C64_6581     11
#define SEQ_CHIP_C64_8580     12
#define SEQ_CHIP_YM2610_CRAP_EXT 16
#define SEQ_CHIP_AY8910       17
#define SEQ_CHIP_YM2612       20
#define SEQ_CHIP_SAA1099      22
#define SEQ_CHIP_AY8930       23
#define SEQ_CHIP_SNES         26
#define SEQ_CHIP_OPLL         28
#define SEQ_CHIP_YM2203       32
#define SEQ_CHIP_YM2203_EXT   33
#define SEQ_CHIP_YM2608       34
#define SEQ_CHIP_YM2608_EXT   35
#define SEQ_CHIP_OPL          36
#define SEQ_CHIP_OPL2         37
#define SEQ_CHIP_OPL3         38
#define SEQ_CHIP_YM2612_EXT   52
#define SEQ_CHIP_YM2610_FULL_EXT 58
#define SEQ_CHIP_LYNX         60
#define SEQ_CHIP_YM2610B_EXT  63
#define SEQ_CHIP_YM2612_DUALPCM_EXT 81
#define SEQ_CHIP_YM2612_CSM   89
#define SEQ_CHIP_YM2610_CSM   90
#define SEQ_CHIP_YM2610B_CSM  91
#define SEQ_CHIP_YM2203_CSM   92
#define SEQ_CHIP_YM2608_CSM   93
#define SEQ_CHIP_ARCADE       13   // YM2151 (OPM)
#define SEQ_CHIP_YM2151       19   // YM2151 standalone
#define SEQ_CHIP_VRC7         48
#define SEQ_CHIP_YM2610B      49
#define SEQ_CHIP_OPZ          44   // TX81Z / OPZ
#define SEQ_CHIP_OPL_DRUMS    54
#define SEQ_CHIP_OPL2_DRUMS   55
#define SEQ_CHIP_OPL3_DRUMS   56
#define SEQ_CHIP_YM2610_FULL  57
#define SEQ_CHIP_OPLL_DRUMS   59
#define SEQ_CHIP_YM2612_DUALPCM 80
#define SEQ_CHIP_SID2         108
#define SEQ_CHIP_FDS          29
#define SEQ_CHIP_N163         31
#define SEQ_CHIP_SCC          53
#define SEQ_CHIP_SCC_PLUS     72
#define SEQ_CHIP_QSOUND       61
#define SEQ_CHIP_ESFM         100

// ============================================================
// Per-platform helper functions
// ============================================================

// getPortaFloor: minimum portamento note per platform
// (from platform/*.cpp getPortaFloor() implementations)
static int getPortaFloor(int chipId, int subIdx) {
  switch (chipId) {
    case SEQ_CHIP_GB:
      return 24; // C-2
    case SEQ_CHIP_SMS:
    case SEQ_CHIP_SAA1099:
      return 12; // C-1
    case SEQ_CHIP_GENESIS:
    case SEQ_CHIP_GENESIS_EXT:
      // FM channels (0-5): 0, extended ch3 ops: 0, PSG channels (6+): 12
      return (subIdx >= 6) ? 12 : 0;
    case SEQ_CHIP_YM2612:
    case SEQ_CHIP_YM2612_EXT:
      return 0;
    case SEQ_CHIP_OPL:
    case SEQ_CHIP_OPL2:
    case SEQ_CHIP_OPL3:
      // OPL: FM channels have no floor, but drums/rhythm (ch>melodicChans) do
      // Simplified: melodic channels = 0, others = 12
      return (subIdx >= 6) ? 12 : 0;
    case SEQ_CHIP_OPLL:
      // OPLL: FM=0, rhythm channels (9+) = 12
      return (subIdx >= 9) ? 12 : 0;
    case SEQ_CHIP_LYNX:
      return 12;
    default:
      return 0;
  }
}

// keyOffAffectsPorta: whether note-off should stop portamento
// (from platform/*.cpp keyOffAffectsPorta() implementations)
static bool getKeyOffAffectsPorta(int chipId, int subIdx) {
  switch (chipId) {
    case SEQ_CHIP_SMS:
    case SEQ_CHIP_LYNX:
      return true;
    case SEQ_CHIP_GENESIS:
    case SEQ_CHIP_GENESIS_EXT:
      // PSG channels (6+) are affected
      return (subIdx >= 6);
    default:
      return false;
  }
}

// keyOffAffectsArp: whether note-off should reset arpeggio
// (from platform/*.cpp keyOffAffectsArp() implementations — default true in Furnace)
static bool getKeyOffAffectsArp(int chipId, int subIdx) {
  switch (chipId) {
    case SEQ_CHIP_SMS:
    case SEQ_CHIP_GB:
    case SEQ_CHIP_LYNX:
    case SEQ_CHIP_SAA1099:
      return true;
    case SEQ_CHIP_GENESIS:
    case SEQ_CHIP_GENESIS_EXT:
      return (subIdx >= 6); // PSG channels
    default:
      return true; // Furnace default: most platforms return true
  }
}

// getLegacyAlwaysSetVolume: platforms that override to return false
// (base DivDispatch returns true; only PSG-like chips return false)
static bool getLegacyAlwaysSetVolume(int chipId) {
  switch (chipId) {
    case SEQ_CHIP_SMS:
    case SEQ_CHIP_AY8910:
    case SEQ_CHIP_AY8930:
    case SEQ_CHIP_SAA1099:
    case SEQ_CHIP_LYNX:
      return false;
    default:
      return true; // FM chips and most others return true
  }
}

// getWantPreNote: whether platform wants PRE_NOTE dispatch before note-on
// (only C64/SID2 in Furnace)
static bool getWantPreNote(int chipId) {
  return (chipId == SEQ_CHIP_C64_6581 || chipId == SEQ_CHIP_C64_8580 || chipId == SEQ_CHIP_SID2);
}

// ============================================================
// Vibrato and tremolo lookup tables (from engine.cpp)
// ============================================================

static short vibTable[64];
static short tremTable[128];
static bool tablesInitialized = false;

static void initTables() {
  if (tablesInitialized) return;
  for (int i = 0; i < 64; i++) {
    vibTable[i] = (short)(127.0 * sin(((double)i / 64.0) * (2.0 * M_PI)));
  }
  for (int i = 0; i < 128; i++) {
    tremTable[i] = (short)(255.0 * 0.5 * (1.0 - cos(((double)i / 128.0) * (2.0 * M_PI))));
  }
  tablesInitialized = true;
}

// ============================================================
// Global sequencer state
// ============================================================

static FurnaceSequencer g_seq;

// Arp length (global, matches Furnace's curSubSong->arpLen)
static int g_arpLen = 1;

// firstTick flag (set by nextRow, cleared after per-tick processing)
static bool firstTick = false;

// endOfSong flag (set when loop detected, cleared after handling)
static bool endOfSong = false;

// shallStopSched flag (set by 0xFF effect)
static bool shallStopSched = false;

// ============================================================
// Dispatch bridge
// ============================================================

// Defined in FurnaceDispatchWrapper.cpp
extern "C" int furnace_dispatch_cmd(int handle, int cmd, int chan, int val1, int val2);

static int dispatchHandle = 0;

static int dispatchCmd(int cmd, int chan, int val1 = 0, int val2 = 0) {
  if (dispatchHandle <= 0) return -1;
  if (g_seq.isMuted[chan]) {
    // Still allow certain commands through even when muted
    // (volume, note off, instrument) for state tracking
    // But block note-on
    if (cmd == DIV_CMD_NOTE_ON) return 0;
  }
  return furnace_dispatch_cmd(dispatchHandle, cmd, chan, val1, val2);
}

// ============================================================
// Pattern access helpers
// ============================================================

// Get a cell value from the current pattern for a given channel
static short getPatCell(int ch, int order, int row, int col) {
  if (ch < 0 || ch >= g_seq.numChannels) return -1;
  if (order < 0 || order >= g_seq.ordersLen) return -1;
  int patIdx = g_seq.orders[ch][order];
  if (patIdx < 0 || patIdx >= SEQ_MAX_PATTERNS) return -1;
  SeqPatternData& pat = g_seq.chanPool[ch].pat[patIdx];
  if (!pat.allocated || !pat.data) return -1;
  if (row < 0 || row >= SEQ_MAX_ROWS) return -1;
  if (col < 0 || col >= SEQ_MAX_COLS) return -1;
  return pat.data[row * SEQ_MAX_COLS + col];
}

// Allocate pattern data if not already allocated
static void ensurePattern(int ch, int patIdx) {
  if (ch < 0 || ch >= SEQ_MAX_CHANNELS) return;
  if (patIdx < 0 || patIdx >= SEQ_MAX_PATTERNS) return;
  SeqPatternData& pat = g_seq.chanPool[ch].pat[patIdx];
  if (pat.allocated) return;
  pat.data = new short[SEQ_MAX_ROWS * SEQ_MAX_COLS];
  pat.maxCols = 3 + g_seq.chanPool[ch].effectCols * 2;
  pat.allocated = true;
  pat.clear();
}

// ============================================================
// Sequencer core functions (adapted from Furnace playback.cpp)
// ============================================================

// Forward declarations
static bool seqPerSystemPreEffect(int ch, int effect, int effectVal);

// Go to next order (adapted from DivEngine::nextOrder)
static void seqNextOrder() {
  g_seq.curRow = 0;
  if (g_seq.repeatPattern) return;
  if (++g_seq.curOrder >= g_seq.ordersLen) {
    endOfSong = true;
    memset(g_seq.walked, 0, sizeof(g_seq.walked));
    g_seq.curOrder = 0;
  }
}

// Process pre-effects for a channel (adapted from DivEngine::processRowPre)
static void seqProcessRowPre(int i) {
  int whatOrder = g_seq.curOrder;
  int whatRow = g_seq.curRow;
  int effectCols = g_seq.chanPool[i].effectCols;

  for (int j = 0; j < effectCols; j++) {
    short effect = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FX(j));
    short effectVal = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FXVAL(j));
    if (effectVal == -1) effectVal = 0;
    effectVal &= 255;

    // Per-chip pre-effects (from sysDef preEffectHandlers)
    seqPerSystemPreEffect(i, effect, effectVal);
  }
}

// Per-system pre-effect handler (called in processRowPre BEFORE main effect switch).
// Mirrors Furnace's perSystemPreEffect() which uses sysDef preEffectHandlers.
// EXT/CSM chips use fmExtChEffectHandlerMap as their preEffectHandler, containing
// 0x18 (FM_EXTCH) and inheriting fmEffectHandlerMap (0x30 = FM_HARD_RESET).
static bool seqPerSystemPreEffect(int ch, int effect, int effectVal) {
  int chipId = g_seq.chanChipId[ch];

  switch (chipId) {
    // EXT and CSM chip variants: fmExtChEffectHandlerMap as preEffectHandlers
    case SEQ_CHIP_GENESIS_EXT:
    case SEQ_CHIP_YM2610_CRAP_EXT:
    case SEQ_CHIP_YM2203_EXT:
    case SEQ_CHIP_YM2608_EXT:
    case SEQ_CHIP_YM2612_EXT:
    case SEQ_CHIP_YM2610_FULL_EXT:
    case SEQ_CHIP_YM2610B_EXT:
    case SEQ_CHIP_YM2612_DUALPCM_EXT:
    case SEQ_CHIP_YM2612_CSM:
    case SEQ_CHIP_YM2610_CSM:
    case SEQ_CHIP_YM2610B_CSM:
    case SEQ_CHIP_YM2203_CSM:
    case SEQ_CHIP_YM2608_CSM:
      switch (effect) {
        case 0x18: dispatchCmd(DIV_CMD_FM_EXTCH, ch, effectVal); return true;
        case 0x30: dispatchCmd(DIV_CMD_FM_HARD_RESET, ch, effectVal); return true;
      }
      break;

    // OPL/OPLL drum variants: fmOPLDrumsEffectHandlerMap (0x18 = drum mode toggle)
    case SEQ_CHIP_OPL_DRUMS:
    case SEQ_CHIP_OPL2_DRUMS:
    case SEQ_CHIP_OPL3_DRUMS:
    case SEQ_CHIP_OPLL_DRUMS:
      switch (effect) {
        case 0x18: dispatchCmd(DIV_CMD_FM_EXTCH, ch, effectVal); return true;
        case 0x30: dispatchCmd(DIV_CMD_FM_HARD_RESET, ch, effectVal); return true;
      }
      break;

    default:
      break;
  }

  return false;
}

// Helper to extract compat flag ext fields
static int getCompatExt(uint32_t shift, uint32_t mask) {
  return (int)((g_seq.compatFlagsExt >> shift) & mask);
}

static int getLinearPitch() {
  return getCompatExt(SEQ_COMPAT_EXT_LINEAR_PITCH_SHIFT, SEQ_COMPAT_EXT_LINEAR_PITCH_MASK);
}

static int getPitchSlideSpeed() {
  // Use full-range pitchSlideSpeed (0-255) stored separately
  int v = g_seq.pitchSlideSpeedFull;
  return v == 0 ? 1 : v;  // Default to 1 if not set
}

static int getJumpTreatment() {
  return getCompatExt(SEQ_COMPAT_EXT_JUMP_TREATMENT_SHIFT, SEQ_COMPAT_EXT_JUMP_TREATMENT_MASK);
}

static int getDelayBehavior() {
  return getCompatExt(SEQ_COMPAT_EXT_DELAY_BEHAVIOR_SHIFT, SEQ_COMPAT_EXT_DELAY_BEHAVIOR_MASK);
}

static int getLoopModality() {
  return getCompatExt(SEQ_COMPAT_EXT_LOOP_MODALITY_SHIFT, SEQ_COMPAT_EXT_LOOP_MODALITY_MASK);
}

#define COMPAT(flag) (g_seq.compatFlags & (flag))

// Dispatch HINT_PORTA with clamped values (matches Furnace reference)
#define HINT_PORTA(ch_idx, pNote, pSpeed) \
  dispatchCmd(DIV_CMD_HINT_PORTA, ch_idx, CLAMP(pNote, -128, 127), MAX(pSpeed, 0))

// ============================================================
// Per-system effect handlers (from Furnace sysDef.cpp)
// ============================================================

// Helper: extract operator index from high nibble (1-based → 0-based)
// Returns -1 if invalid (will cause the effect to be skipped)
static int opVal(int effectVal, int maxOp) {
  int op = (effectVal >> 4);
  if (op < 0 || op > maxOp) return -1;
  return op - 1; // -1 means "all operators" when input was 0
}

// Helper: same as opVal but rejects 0 (no "all operators")
static int opValNZ(int effectVal, int maxOp) {
  int op = (effectVal >> 4);
  if (op < 1 || op > maxOp) return -999; // invalid
  return op - 1;
}

// Per-system pre-effect handler (called BEFORE main effect switch).
// Returns true if the effect was handled (skip main switch for this effect).
// Mirrors Furnace's perSystemEffect() which uses sysDef effectHandlers.
static bool seqPerSystemEffect(int ch, int effect, int effectVal) {
  int chipId = g_seq.chanChipId[ch];

  switch (chipId) {
    // --- NES: effectHandlers (nesEffectHandlerMap) ---
    case SEQ_CHIP_NES:
      switch (effect) {
        case 0x11: dispatchCmd(DIV_CMD_NES_DMC, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_NES_SWEEP, ch, 0, effectVal); return true; // sweep up
        case 0x14: dispatchCmd(DIV_CMD_NES_SWEEP, ch, 1, effectVal); return true; // sweep down
        case 0x15: dispatchCmd(DIV_CMD_NES_ENV_MODE, ch, effectVal); return true;
        case 0x16: dispatchCmd(DIV_CMD_NES_LENGTH, ch, effectVal); return true;
        case 0x17: dispatchCmd(DIV_CMD_NES_COUNT_MODE, ch, effectVal); return true;
        case 0x18: dispatchCmd(DIV_CMD_SAMPLE_MODE, ch, effectVal); return true;
        case 0x19: dispatchCmd(DIV_CMD_NES_LINEAR_LENGTH, ch, effectVal); return true;
        case 0x20: dispatchCmd(DIV_CMD_SAMPLE_FREQ, ch, effectVal); return true;
      }
      break;

    // Lynx LFSR is a post-effect (handled in seqPerSystemPostEffect)
    case SEQ_CHIP_LYNX:
      break;

    // --- FM chips: effectHandlers (fmEffectHandlerMap / fmOPN2EffectHandlerMap) ---
    case SEQ_CHIP_GENESIS:
    case SEQ_CHIP_GENESIS_EXT:
    case SEQ_CHIP_YM2612:
    case SEQ_CHIP_YM2612_EXT:
    case SEQ_CHIP_YM2610_CRAP_EXT:
    case SEQ_CHIP_YM2203:
    case SEQ_CHIP_YM2203_EXT:
    case SEQ_CHIP_YM2608:
    case SEQ_CHIP_YM2608_EXT:
    case SEQ_CHIP_YM2610_FULL:
    case SEQ_CHIP_YM2610_FULL_EXT:
    case SEQ_CHIP_YM2610B:
    case SEQ_CHIP_YM2610B_EXT:
    case SEQ_CHIP_YM2612_DUALPCM:
    case SEQ_CHIP_YM2612_DUALPCM_EXT:
    case SEQ_CHIP_YM2612_CSM:
    case SEQ_CHIP_YM2610_CSM:
    case SEQ_CHIP_YM2610B_CSM:
    case SEQ_CHIP_YM2203_CSM:
    case SEQ_CHIP_YM2608_CSM:
    case SEQ_CHIP_ARCADE:
    case SEQ_CHIP_YM2151:
    case SEQ_CHIP_OPZ:
      switch (effect) {
        case 0x30: dispatchCmd(DIV_CMD_FM_HARD_RESET, ch, effectVal); return true;
        case 0xdf: dispatchCmd(DIV_CMD_SAMPLE_DIR, ch, effectVal); return true;
      }
      break;

    case SEQ_CHIP_OPL:
    case SEQ_CHIP_OPL2:
    case SEQ_CHIP_OPL3:
    case SEQ_CHIP_OPLL:
    case SEQ_CHIP_OPL_DRUMS:
    case SEQ_CHIP_OPL2_DRUMS:
    case SEQ_CHIP_OPL3_DRUMS:
    case SEQ_CHIP_OPLL_DRUMS:
    case SEQ_CHIP_VRC7:
      switch (effect) {
        case 0x30: dispatchCmd(DIV_CMD_FM_HARD_RESET, ch, effectVal); return true;
      }
      break;

    // --- Game Boy: effectHandlers (pre-effects) ---
    case SEQ_CHIP_GB:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_GB_SWEEP_TIME, ch, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_GB_SWEEP_DIR, ch, effectVal); return true;
      }
      break;

    // --- PC Engine: effectHandlers (pre-effects) ---
    case SEQ_CHIP_PCE:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_PCE_LFO_MODE, ch, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_PCE_LFO_SPEED, ch, effectVal); return true;
      }
      break;

    // --- SMS: effectHandlers (pre-effects) ---
    case SEQ_CHIP_SMS:
      switch (effect) {
        case 0x20: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
      }
      break;

    // --- SNES: effectHandlers (pre-effects — echo/global/FIR) ---
    case SEQ_CHIP_SNES:
      switch (effect) {
        case 0x18: dispatchCmd(DIV_CMD_SNES_ECHO_ENABLE, ch, effectVal); return true;
        case 0x19: dispatchCmd(DIV_CMD_SNES_ECHO_DELAY, ch, effectVal); return true;
        case 0x1a: dispatchCmd(DIV_CMD_SNES_ECHO_VOL_LEFT, ch, effectVal); return true;
        case 0x1b: dispatchCmd(DIV_CMD_SNES_ECHO_VOL_RIGHT, ch, effectVal); return true;
        case 0x1c: dispatchCmd(DIV_CMD_SNES_ECHO_FEEDBACK, ch, effectVal); return true;
        case 0x1e: dispatchCmd(DIV_CMD_SNES_GLOBAL_VOL_LEFT, ch, effectVal); return true;
        case 0x1f: dispatchCmd(DIV_CMD_SNES_GLOBAL_VOL_RIGHT, ch, effectVal); return true;
        case 0x30: dispatchCmd(DIV_CMD_SNES_ECHO_FIR, ch, 0, effectVal); return true;
        case 0x31: dispatchCmd(DIV_CMD_SNES_ECHO_FIR, ch, 1, effectVal); return true;
        case 0x32: dispatchCmd(DIV_CMD_SNES_ECHO_FIR, ch, 2, effectVal); return true;
        case 0x33: dispatchCmd(DIV_CMD_SNES_ECHO_FIR, ch, 3, effectVal); return true;
        case 0x34: dispatchCmd(DIV_CMD_SNES_ECHO_FIR, ch, 4, effectVal); return true;
        case 0x35: dispatchCmd(DIV_CMD_SNES_ECHO_FIR, ch, 5, effectVal); return true;
        case 0x36: dispatchCmd(DIV_CMD_SNES_ECHO_FIR, ch, 6, effectVal); return true;
        case 0x37: dispatchCmd(DIV_CMD_SNES_ECHO_FIR, ch, 7, effectVal); return true;
      }
      break;

    // --- FDS: waveOnlyEffectHandlerMap ---
    case SEQ_CHIP_FDS:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
      }
      break;

    // --- SCC / SCC+: waveOnlyEffectHandlerMap ---
    case SEQ_CHIP_SCC:
    case SEQ_CHIP_SCC_PLUS:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
      }
      break;

    // --- N163: effectHandlers ---
    case SEQ_CHIP_N163:
      switch (effect) {
        case 0x18: dispatchCmd(DIV_CMD_N163_CHANNEL_LIMIT, ch, effectVal); return true;
        case 0x20: dispatchCmd(DIV_CMD_N163_GLOBAL_WAVE_LOAD, ch, effectVal); return true;
        case 0x21: dispatchCmd(DIV_CMD_N163_GLOBAL_WAVE_LOADPOS, ch, effectVal); return true;
      }
      break;

    // --- QSound: effectHandlers ---
    case SEQ_CHIP_QSOUND:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_QSOUND_ECHO_FEEDBACK, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_QSOUND_ECHO_LEVEL, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_QSOUND_SURROUND, ch, effectVal); return true;
      }
      if (effect >= 0x30 && effect <= 0x3f) {
        // 3xxx: echo delay (12-bit value across 16 effect codes)
        dispatchCmd(DIV_CMD_QSOUND_ECHO_DELAY, ch, ((effect & 0x0f) << 8) | effectVal);
        return true;
      }
      break;

    // --- ESFM: effectHandlers (0x2E only) ---
    case SEQ_CHIP_ESFM:
      switch (effect) {
        case 0x2e: dispatchCmd(DIV_CMD_FM_HARD_RESET, ch, effectVal); return true;
      }
      break;
  }
  return false;
}

// Per-system post-effect handler (called AFTER note-on processing).
// Mirrors Furnace's perSystemPostEffect() which uses sysDef postEffectHandlers.
static bool seqPerSystemPostEffect(int ch, int effect, int effectVal) {
  int chipId = g_seq.chanChipId[ch];

  switch (chipId) {
    // --- Genesis/YM2612/OPN FM channels: fmOPN2PostEffectHandlerMap ---
    case SEQ_CHIP_GENESIS:
    case SEQ_CHIP_GENESIS_EXT:
    case SEQ_CHIP_YM2612:
    case SEQ_CHIP_YM2612_EXT:
    case SEQ_CHIP_YM2610_CRAP_EXT:
    case SEQ_CHIP_YM2203:
    case SEQ_CHIP_YM2203_EXT:
    case SEQ_CHIP_YM2608:
    case SEQ_CHIP_YM2608_EXT:
    case SEQ_CHIP_YM2610_FULL:
    case SEQ_CHIP_YM2610_FULL_EXT:
    case SEQ_CHIP_YM2610B:
    case SEQ_CHIP_YM2610B_EXT:
    case SEQ_CHIP_YM2612_DUALPCM:
    case SEQ_CHIP_YM2612_DUALPCM_EXT:
    case SEQ_CHIP_YM2612_CSM:
    case SEQ_CHIP_YM2610_CSM:
    case SEQ_CHIP_YM2610B_CSM:
    case SEQ_CHIP_YM2203_CSM:
    case SEQ_CHIP_YM2608_CSM: {
      // Only FM channels use FM post-effects; PSG channels use AY/SMS-like effects
      int sub = g_seq.chanSubIdx[ch];
      // Determine PSG channel threshold based on chip type
      int psgStart = 6; // Genesis: channels 6+ are PSG
      if (chipId == SEQ_CHIP_YM2203 || chipId == SEQ_CHIP_YM2203_EXT ||
          chipId == SEQ_CHIP_YM2203_CSM) {
        psgStart = 3; // YM2203: 3 FM + 3 PSG
      } else if (chipId == SEQ_CHIP_YM2608 || chipId == SEQ_CHIP_YM2608_EXT ||
                 chipId == SEQ_CHIP_YM2608_CSM) {
        psgStart = 6; // YM2608: 6 FM + 3 PSG (+ ADPCM)
      }
      if (sub >= psgStart) {
        // PSG channels on OPN chips: full AY effect set
        switch (effect) {
          case 0x20: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
          case 0x21: dispatchCmd(DIV_CMD_STD_NOISE_FREQ, ch, effectVal); return true;
          case 0x22: dispatchCmd(DIV_CMD_AY_ENVELOPE_SET, ch, effectVal); return true;
          case 0x23: dispatchCmd(DIV_CMD_AY_ENVELOPE_LOW, ch, effectVal); return true;
          case 0x24: dispatchCmd(DIV_CMD_AY_ENVELOPE_HIGH, ch, effectVal); return true;
          case 0x25: dispatchCmd(DIV_CMD_AY_ENVELOPE_SLIDE, ch, -(int)effectVal); return true;
          case 0x26: dispatchCmd(DIV_CMD_AY_ENVELOPE_SLIDE, ch, effectVal); return true;
          case 0x29: dispatchCmd(DIV_CMD_AY_AUTO_ENVELOPE, ch, effectVal); return true;
          case 0x2c: dispatchCmd(DIV_CMD_AY_AUTO_PWM, ch, effectVal); return true;
          case 0x2e: dispatchCmd(DIV_CMD_AY_IO_WRITE, ch, 0, effectVal); return true;
          case 0x2f: dispatchCmd(DIV_CMD_AY_IO_WRITE, ch, 1, effectVal); return true;
        }
        break;
      }
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_FM_LFO, ch, effectVal); return true;
        case 0x55: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_SSG, ch, o, effectVal & 15); return true; }
        case 0x11: dispatchCmd(DIV_CMD_FM_FB, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_FM_TL, ch, 0, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_FM_TL, ch, 1, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_FM_TL, ch, 2, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_FM_TL, ch, 3, effectVal); return true;
        case 0x16: { int o = opValNZ(effectVal, 4); if (o == -999) break; dispatchCmd(DIV_CMD_FM_MULT, ch, o, effectVal & 15); return true; }
        case 0x19: dispatchCmd(DIV_CMD_FM_AR, ch, -1, effectVal & 31); return true;
        case 0x1a: dispatchCmd(DIV_CMD_FM_AR, ch, 0, effectVal & 31); return true;
        case 0x1b: dispatchCmd(DIV_CMD_FM_AR, ch, 1, effectVal & 31); return true;
        case 0x1c: dispatchCmd(DIV_CMD_FM_AR, ch, 2, effectVal & 31); return true;
        case 0x1d: dispatchCmd(DIV_CMD_FM_AR, ch, 3, effectVal & 31); return true;
        case 0x50: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_AM, ch, o, effectVal & 1); return true; }
        case 0x51: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_SL, ch, o, effectVal & 15); return true; }
        case 0x52: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RR, ch, o, effectVal & 15); return true; }
        case 0x53: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_DT, ch, o, effectVal & 7); return true; }
        case 0x54: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RS, ch, o, effectVal & 3); return true; }
        case 0x56: dispatchCmd(DIV_CMD_FM_DR, ch, -1, effectVal & 31); return true;
        case 0x57: dispatchCmd(DIV_CMD_FM_DR, ch, 0, effectVal & 31); return true;
        case 0x58: dispatchCmd(DIV_CMD_FM_DR, ch, 1, effectVal & 31); return true;
        case 0x59: dispatchCmd(DIV_CMD_FM_DR, ch, 2, effectVal & 31); return true;
        case 0x5a: dispatchCmd(DIV_CMD_FM_DR, ch, 3, effectVal & 31); return true;
        case 0x5b: dispatchCmd(DIV_CMD_FM_D2R, ch, -1, effectVal & 31); return true;
        case 0x5c: dispatchCmd(DIV_CMD_FM_D2R, ch, 0, effectVal & 31); return true;
        case 0x5d: dispatchCmd(DIV_CMD_FM_D2R, ch, 1, effectVal & 31); return true;
        case 0x5e: dispatchCmd(DIV_CMD_FM_D2R, ch, 2, effectVal & 31); return true;
        case 0x5f: dispatchCmd(DIV_CMD_FM_D2R, ch, 3, effectVal & 31); return true;
        case 0x60: dispatchCmd(DIV_CMD_FM_OPMASK, ch, effectVal); return true;
        case 0x61: dispatchCmd(DIV_CMD_FM_ALG, ch, effectVal); return true;
        case 0x62: dispatchCmd(DIV_CMD_FM_FMS, ch, effectVal); return true;
        case 0x63: dispatchCmd(DIV_CMD_FM_AMS, ch, effectVal); return true;
        // YM2608/OPNA-specific: ADPCM-A global volume
        case 0x1f:
          if (chipId == SEQ_CHIP_YM2608 || chipId == SEQ_CHIP_YM2608_EXT || chipId == SEQ_CHIP_YM2608_CSM ||
              chipId == SEQ_CHIP_YM2610_CRAP_EXT || chipId == SEQ_CHIP_YM2610_FULL_EXT ||
              chipId == SEQ_CHIP_YM2610_FULL || chipId == SEQ_CHIP_YM2610B_EXT ||
              chipId == SEQ_CHIP_YM2610_CSM || chipId == SEQ_CHIP_YM2610B_CSM) {
            dispatchCmd(DIV_CMD_ADPCMA_GLOBAL_VOLUME, ch, effectVal); return true;
          }
          break;
      }
      break;
    }

    // --- YM2151/ARCADE (OPM): fmOPMPostEffectHandlerMap ---
    case SEQ_CHIP_ARCADE:
    case SEQ_CHIP_YM2151: {
      switch (effect) {
        // OPN base effects
        case 0x11: dispatchCmd(DIV_CMD_FM_FB, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_FM_TL, ch, 0, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_FM_TL, ch, 1, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_FM_TL, ch, 2, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_FM_TL, ch, 3, effectVal); return true;
        case 0x16: { int o = opValNZ(effectVal, 4); if (o == -999) break; dispatchCmd(DIV_CMD_FM_MULT, ch, o, effectVal & 15); return true; }
        case 0x19: dispatchCmd(DIV_CMD_FM_AR, ch, -1, effectVal & 31); return true;
        case 0x1a: dispatchCmd(DIV_CMD_FM_AR, ch, 0, effectVal & 31); return true;
        case 0x1b: dispatchCmd(DIV_CMD_FM_AR, ch, 1, effectVal & 31); return true;
        case 0x1c: dispatchCmd(DIV_CMD_FM_AR, ch, 2, effectVal & 31); return true;
        case 0x1d: dispatchCmd(DIV_CMD_FM_AR, ch, 3, effectVal & 31); return true;
        case 0x50: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_AM, ch, o, effectVal & 1); return true; }
        case 0x51: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_SL, ch, o, effectVal & 15); return true; }
        case 0x52: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RR, ch, o, effectVal & 15); return true; }
        case 0x53: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_DT, ch, o, effectVal & 7); return true; }
        case 0x54: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RS, ch, o, effectVal & 3); return true; }
        case 0x56: dispatchCmd(DIV_CMD_FM_DR, ch, -1, effectVal & 31); return true;
        case 0x57: dispatchCmd(DIV_CMD_FM_DR, ch, 0, effectVal & 31); return true;
        case 0x58: dispatchCmd(DIV_CMD_FM_DR, ch, 1, effectVal & 31); return true;
        case 0x59: dispatchCmd(DIV_CMD_FM_DR, ch, 2, effectVal & 31); return true;
        case 0x5a: dispatchCmd(DIV_CMD_FM_DR, ch, 3, effectVal & 31); return true;
        case 0x5b: dispatchCmd(DIV_CMD_FM_D2R, ch, -1, effectVal & 31); return true;
        case 0x5c: dispatchCmd(DIV_CMD_FM_D2R, ch, 0, effectVal & 31); return true;
        case 0x5d: dispatchCmd(DIV_CMD_FM_D2R, ch, 1, effectVal & 31); return true;
        case 0x5e: dispatchCmd(DIV_CMD_FM_D2R, ch, 2, effectVal & 31); return true;
        case 0x5f: dispatchCmd(DIV_CMD_FM_D2R, ch, 3, effectVal & 31); return true;
        case 0x61: dispatchCmd(DIV_CMD_FM_ALG, ch, effectVal); return true;
        case 0x62: dispatchCmd(DIV_CMD_FM_FMS, ch, effectVal); return true;
        case 0x63: dispatchCmd(DIV_CMD_FM_AMS, ch, effectVal); return true;
        // OPM-specific
        case 0x10: dispatchCmd(DIV_CMD_STD_NOISE_FREQ, ch, effectVal); return true;
        case 0x17: dispatchCmd(DIV_CMD_FM_LFO, ch, effectVal); return true;
        case 0x18: dispatchCmd(DIV_CMD_FM_LFO_WAVE, ch, effectVal); return true;
        case 0x1e: dispatchCmd(DIV_CMD_FM_AM_DEPTH, ch, effectVal & 127); return true;
        case 0x1f: dispatchCmd(DIV_CMD_FM_PM_DEPTH, ch, effectVal & 127); return true;
        case 0x55: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_DT2, ch, o, effectVal & 3); return true; }
        case 0x60: dispatchCmd(DIV_CMD_FM_OPMASK, ch, effectVal); return true;
      }
      break;
    }

    // --- OPZ (TX81Z): fmOPZPostEffectHandlerMap (extends OPM) ---
    case SEQ_CHIP_OPZ: {
      switch (effect) {
        // OPN base effects (inherited through OPM)
        case 0x11: dispatchCmd(DIV_CMD_FM_FB, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_FM_TL, ch, 0, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_FM_TL, ch, 1, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_FM_TL, ch, 2, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_FM_TL, ch, 3, effectVal); return true;
        case 0x16: { int o = opValNZ(effectVal, 4); if (o == -999) break; dispatchCmd(DIV_CMD_FM_MULT, ch, o, effectVal & 15); return true; }
        case 0x19: dispatchCmd(DIV_CMD_FM_AR, ch, -1, effectVal & 31); return true;
        case 0x1a: dispatchCmd(DIV_CMD_FM_AR, ch, 0, effectVal & 31); return true;
        case 0x1b: dispatchCmd(DIV_CMD_FM_AR, ch, 1, effectVal & 31); return true;
        case 0x1c: dispatchCmd(DIV_CMD_FM_AR, ch, 2, effectVal & 31); return true;
        case 0x1d: dispatchCmd(DIV_CMD_FM_AR, ch, 3, effectVal & 31); return true;
        case 0x50: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_AM, ch, o, effectVal & 1); return true; }
        case 0x51: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_SL, ch, o, effectVal & 15); return true; }
        case 0x52: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RR, ch, o, effectVal & 15); return true; }
        case 0x53: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_DT, ch, o, effectVal & 7); return true; }
        case 0x54: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RS, ch, o, effectVal & 3); return true; }
        case 0x56: dispatchCmd(DIV_CMD_FM_DR, ch, -1, effectVal & 31); return true;
        case 0x57: dispatchCmd(DIV_CMD_FM_DR, ch, 0, effectVal & 31); return true;
        case 0x58: dispatchCmd(DIV_CMD_FM_DR, ch, 1, effectVal & 31); return true;
        case 0x59: dispatchCmd(DIV_CMD_FM_DR, ch, 2, effectVal & 31); return true;
        case 0x5a: dispatchCmd(DIV_CMD_FM_DR, ch, 3, effectVal & 31); return true;
        case 0x5b: dispatchCmd(DIV_CMD_FM_D2R, ch, -1, effectVal & 31); return true;
        case 0x5c: dispatchCmd(DIV_CMD_FM_D2R, ch, 0, effectVal & 31); return true;
        case 0x5d: dispatchCmd(DIV_CMD_FM_D2R, ch, 1, effectVal & 31); return true;
        case 0x5e: dispatchCmd(DIV_CMD_FM_D2R, ch, 2, effectVal & 31); return true;
        case 0x5f: dispatchCmd(DIV_CMD_FM_D2R, ch, 3, effectVal & 31); return true;
        case 0x61: dispatchCmd(DIV_CMD_FM_ALG, ch, effectVal); return true;
        case 0x62: dispatchCmd(DIV_CMD_FM_FMS, ch, effectVal); return true;
        case 0x63: dispatchCmd(DIV_CMD_FM_AMS, ch, effectVal); return true;
        // OPM-specific (inherited)
        case 0x10: dispatchCmd(DIV_CMD_STD_NOISE_FREQ, ch, effectVal); return true;
        case 0x17: dispatchCmd(DIV_CMD_FM_LFO, ch, effectVal); return true;
        case 0x18: dispatchCmd(DIV_CMD_FM_LFO_WAVE, ch, effectVal); return true;
        case 0x1e: dispatchCmd(DIV_CMD_FM_AM_DEPTH, ch, effectVal & 127); return true;
        case 0x1f: dispatchCmd(DIV_CMD_FM_PM_DEPTH, ch, effectVal & 127); return true;
        case 0x55: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_DT2, ch, o, effectVal & 3); return true; }
        case 0x60: dispatchCmd(DIV_CMD_FM_OPMASK, ch, effectVal); return true;
        // OPZ-specific
        case 0x24: dispatchCmd(DIV_CMD_FM_LFO2, ch, effectVal); return true;
        case 0x25: dispatchCmd(DIV_CMD_FM_LFO2_WAVE, ch, effectVal); return true;
        case 0x26: dispatchCmd(DIV_CMD_FM_AM2_DEPTH, ch, effectVal & 127); return true;
        case 0x27: dispatchCmd(DIV_CMD_FM_PM2_DEPTH, ch, effectVal & 127); return true;
        case 0x28: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_REV, ch, o, effectVal & 7); return true; }
        case 0x2a: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_WS, ch, o, effectVal & 7); return true; }
        case 0x2b: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_EG_SHIFT, ch, o, effectVal & 3); return true; }
        case 0x2c: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_FINE, ch, o, effectVal & 15); return true; }
        // OPZ fixed frequency (0x30-0x4f)
        case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: case 0x35: case 0x36: case 0x37:
          dispatchCmd(DIV_CMD_FM_FIXFREQ, ch, 0, ((effect & 7) << 8) | effectVal); return true;
        case 0x38: case 0x39: case 0x3a: case 0x3b: case 0x3c: case 0x3d: case 0x3e: case 0x3f:
          dispatchCmd(DIV_CMD_FM_FIXFREQ, ch, 1, ((effect & 7) << 8) | effectVal); return true;
        case 0x40: case 0x41: case 0x42: case 0x43: case 0x44: case 0x45: case 0x46: case 0x47:
          dispatchCmd(DIV_CMD_FM_FIXFREQ, ch, 2, ((effect & 7) << 8) | effectVal); return true;
        case 0x48: case 0x49: case 0x4a: case 0x4b: case 0x4c: case 0x4d: case 0x4e: case 0x4f:
          dispatchCmd(DIV_CMD_FM_FIXFREQ, ch, 3, ((effect & 7) << 8) | effectVal); return true;
        // OPZ-specific: FMS2/AMS2
        case 0x64: dispatchCmd(DIV_CMD_FM_FMS2, ch, effectVal); return true;
        case 0x65: dispatchCmd(DIV_CMD_FM_AMS2, ch, effectVal); return true;
      }
      break;
    }

    // --- OPL/OPL2/OPL3: fmOPLPostEffectHandlerMap ---
    case SEQ_CHIP_OPL:
    case SEQ_CHIP_OPL2:
    case SEQ_CHIP_OPL3:
    case SEQ_CHIP_OPL_DRUMS:
    case SEQ_CHIP_OPL2_DRUMS:
    case SEQ_CHIP_OPL3_DRUMS:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_FM_LFO, ch, effectVal & 1); return true;
        case 0x11: dispatchCmd(DIV_CMD_FM_FB, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_FM_TL, ch, 0, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_FM_TL, ch, 1, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_FM_TL, ch, 2, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_FM_TL, ch, 3, effectVal); return true;
        case 0x16: { int o = opValNZ(effectVal, 4); if (o == -999) break; dispatchCmd(DIV_CMD_FM_MULT, ch, o, effectVal & 15); return true; }
        case 0x17: dispatchCmd(DIV_CMD_FM_LFO, ch, (effectVal & 1) + 2); return true;
        case 0x19: dispatchCmd(DIV_CMD_FM_AR, ch, -1, effectVal & 15); return true;
        case 0x1a: dispatchCmd(DIV_CMD_FM_AR, ch, 0, effectVal & 15); return true;
        case 0x1b: dispatchCmd(DIV_CMD_FM_AR, ch, 1, effectVal & 15); return true;
        case 0x1c: dispatchCmd(DIV_CMD_FM_AR, ch, 2, effectVal & 15); return true;
        case 0x1d: dispatchCmd(DIV_CMD_FM_AR, ch, 3, effectVal & 15); return true;
        case 0x2a: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_WS, ch, o, effectVal & 7); return true; }
        case 0x50: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_AM, ch, o, effectVal & 1); return true; }
        case 0x51: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_SL, ch, o, effectVal & 15); return true; }
        case 0x52: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RR, ch, o, effectVal & 15); return true; }
        case 0x53: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_VIB, ch, o, effectVal & 1); return true; }
        case 0x54: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RS, ch, o, effectVal & 3); return true; }
        case 0x55: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_SUS, ch, o, effectVal & 1); return true; }
        case 0x56: dispatchCmd(DIV_CMD_FM_DR, ch, -1, effectVal & 15); return true;
        case 0x57: dispatchCmd(DIV_CMD_FM_DR, ch, 0, effectVal & 15); return true;
        case 0x58: dispatchCmd(DIV_CMD_FM_DR, ch, 1, effectVal & 15); return true;
        case 0x59: dispatchCmd(DIV_CMD_FM_DR, ch, 2, effectVal & 15); return true;
        case 0x5a: dispatchCmd(DIV_CMD_FM_DR, ch, 3, effectVal & 15); return true;
        case 0x5b: { int o = opVal(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_KSR, ch, o, effectVal & 1); return true; }
      }
      break;

    // --- OPLL: fmOPLLPostEffectHandlerMap ---
    case SEQ_CHIP_OPLL:
    case SEQ_CHIP_OPLL_DRUMS:
    case SEQ_CHIP_VRC7:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_FM_FB, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_FM_TL, ch, 0, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_FM_TL, ch, 1, effectVal); return true;
        case 0x16: { int o = opValNZ(effectVal, 2); if (o == -999) break; dispatchCmd(DIV_CMD_FM_MULT, ch, o, effectVal & 15); return true; }
        case 0x19: dispatchCmd(DIV_CMD_FM_AR, ch, -1, effectVal & 15); return true;
        case 0x1a: dispatchCmd(DIV_CMD_FM_AR, ch, 0, effectVal & 15); return true;
        case 0x1b: dispatchCmd(DIV_CMD_FM_AR, ch, 1, effectVal & 15); return true;
        case 0x50: { int o = opVal(effectVal, 2); if (o < -1) break; dispatchCmd(DIV_CMD_FM_AM, ch, o, effectVal & 1); return true; }
        case 0x51: { int o = opVal(effectVal, 2); if (o < -1) break; dispatchCmd(DIV_CMD_FM_SL, ch, o, effectVal & 15); return true; }
        case 0x52: { int o = opVal(effectVal, 2); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RR, ch, o, effectVal & 15); return true; }
        case 0x53: { int o = opVal(effectVal, 2); if (o < -1) break; dispatchCmd(DIV_CMD_FM_VIB, ch, o, effectVal & 1); return true; }
        case 0x54: { int o = opVal(effectVal, 2); if (o < -1) break; dispatchCmd(DIV_CMD_FM_RS, ch, o, effectVal & 3); return true; }
        case 0x55: { int o = opVal(effectVal, 2); if (o < -1) break; dispatchCmd(DIV_CMD_FM_SUS, ch, o, effectVal & 1); return true; }
        case 0x56: dispatchCmd(DIV_CMD_FM_DR, ch, -1, effectVal & 15); return true;
        case 0x57: dispatchCmd(DIV_CMD_FM_DR, ch, 0, effectVal & 15); return true;
        case 0x58: dispatchCmd(DIV_CMD_FM_DR, ch, 1, effectVal & 15); return true;
        case 0x5b: { int o = opVal(effectVal, 2); if (o < -1) break; dispatchCmd(DIV_CMD_FM_KSR, ch, o, effectVal & 1); return true; }
      }
      break;

    // --- AY8910: ayPostEffectHandlerMap ---
    case SEQ_CHIP_AY8910:
      switch (effect) {
        case 0x20: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x21: dispatchCmd(DIV_CMD_STD_NOISE_FREQ, ch, effectVal); return true;
        case 0x22: dispatchCmd(DIV_CMD_AY_ENVELOPE_SET, ch, effectVal); return true;
        case 0x23: dispatchCmd(DIV_CMD_AY_ENVELOPE_LOW, ch, effectVal); return true;
        case 0x24: dispatchCmd(DIV_CMD_AY_ENVELOPE_HIGH, ch, effectVal); return true;
        case 0x25: dispatchCmd(DIV_CMD_AY_ENVELOPE_SLIDE, ch, -(int)effectVal); return true;
        case 0x26: dispatchCmd(DIV_CMD_AY_ENVELOPE_SLIDE, ch, effectVal); return true;
        case 0x29: dispatchCmd(DIV_CMD_AY_AUTO_ENVELOPE, ch, effectVal); return true;
        case 0x2c: dispatchCmd(DIV_CMD_AY_AUTO_PWM, ch, effectVal); return true;
        case 0x2e: dispatchCmd(DIV_CMD_AY_IO_WRITE, ch, 0, effectVal); return true;
        case 0x2f: dispatchCmd(DIV_CMD_AY_IO_WRITE, ch, 1, effectVal); return true;
      }
      break;

    // --- AY8930: ay8930PostEffectHandlerMap (extends AY with extra effects) ---
    case SEQ_CHIP_AY8930:
      switch (effect) {
        case 0x12: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, 0x10 + (effectVal & 15)); return true;
        case 0x20: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x21: dispatchCmd(DIV_CMD_STD_NOISE_FREQ, ch, effectVal); return true;
        case 0x22: dispatchCmd(DIV_CMD_AY_ENVELOPE_SET, ch, effectVal); return true;
        case 0x23: dispatchCmd(DIV_CMD_AY_ENVELOPE_LOW, ch, effectVal); return true;
        case 0x24: dispatchCmd(DIV_CMD_AY_ENVELOPE_HIGH, ch, effectVal); return true;
        case 0x25: dispatchCmd(DIV_CMD_AY_ENVELOPE_SLIDE, ch, -(int)effectVal); return true;
        case 0x26: dispatchCmd(DIV_CMD_AY_ENVELOPE_SLIDE, ch, effectVal); return true;
        case 0x27: dispatchCmd(DIV_CMD_AY_NOISE_MASK_AND, ch, effectVal); return true;
        case 0x28: dispatchCmd(DIV_CMD_AY_NOISE_MASK_OR, ch, effectVal); return true;
        case 0x29: dispatchCmd(DIV_CMD_AY_AUTO_ENVELOPE, ch, effectVal); return true;
        case 0x2c: dispatchCmd(DIV_CMD_AY_AUTO_PWM, ch, effectVal); return true;
        case 0x2d: dispatchCmd(DIV_CMD_AY_IO_WRITE, ch, 255, effectVal); return true;
        case 0x2e: dispatchCmd(DIV_CMD_AY_IO_WRITE, ch, 0, effectVal); return true;
        case 0x2f: dispatchCmd(DIV_CMD_AY_IO_WRITE, ch, 1, effectVal); return true;
      }
      break;

    // GB effects are all pre-effects (handled in seqPerSystemEffect)
    case SEQ_CHIP_GB:
      break;

    // --- C64: c64PostEffectHandlerMap ---
    case SEQ_CHIP_C64_6581:
    case SEQ_CHIP_C64_8580:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_C64_CUTOFF, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_C64_RESONANCE, ch, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_C64_FILTER_MODE, ch, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_C64_RESET_TIME, ch, effectVal); return true;
        case 0x1a: dispatchCmd(DIV_CMD_C64_RESET_MASK, ch, effectVal); return true;
        case 0x1b: dispatchCmd(DIV_CMD_C64_FILTER_RESET, ch, effectVal); return true;
        case 0x1c: dispatchCmd(DIV_CMD_C64_DUTY_RESET, ch, effectVal); return true;
        case 0x1e: dispatchCmd(DIV_CMD_C64_EXTENDED, ch, effectVal); return true;
        case 0x20: dispatchCmd(DIV_CMD_C64_AD, ch, effectVal); return true;
        case 0x21: dispatchCmd(DIV_CMD_C64_SR, ch, effectVal); return true;
        case 0x22: dispatchCmd(DIV_CMD_C64_PW_SLIDE, ch, effectVal, 1); return true;
        case 0x23: dispatchCmd(DIV_CMD_C64_PW_SLIDE, ch, effectVal, -1); return true;
        case 0x24: dispatchCmd(DIV_CMD_C64_CUTOFF_SLIDE, ch, effectVal, 1); return true;
        case 0x25: dispatchCmd(DIV_CMD_C64_CUTOFF_SLIDE, ch, effectVal, -1); return true;
      }
      // C64: 0x30-0x3F = fine duty (12-bit), 0x40-0x47 = fine cutoff (11-bit)
      if (effect >= 0x30 && effect <= 0x3f) {
        int val = ((effect & 0x0f) << 8) | effectVal;
        dispatchCmd(DIV_CMD_C64_FINE_DUTY, ch, val);
        return true;
      }
      if (effect >= 0x40 && effect <= 0x47) {
        int val = ((effect & 0x07) << 8) | effectVal;
        dispatchCmd(DIV_CMD_C64_FINE_CUTOFF, ch, val);
        return true;
      }
      break;

    // --- SID2: SID2PostEffectHandlerMap ---
    case SEQ_CHIP_SID2:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_C64_RESONANCE, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_C64_FILTER_MODE, ch, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_C64_RESET_MASK, ch, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_C64_FILTER_RESET, ch, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_C64_DUTY_RESET, ch, effectVal); return true;
        case 0x16: dispatchCmd(DIV_CMD_C64_EXTENDED, ch, effectVal); return true;
        case 0x17: dispatchCmd(DIV_CMD_C64_PW_SLIDE, ch, effectVal, 1); return true;
        case 0x18: dispatchCmd(DIV_CMD_C64_PW_SLIDE, ch, effectVal, -1); return true;
        case 0x19: dispatchCmd(DIV_CMD_C64_CUTOFF_SLIDE, ch, effectVal, 1); return true;
        case 0x1a: dispatchCmd(DIV_CMD_C64_CUTOFF_SLIDE, ch, effectVal, -1); return true;
      }
      // SID2: 0x30-0x3F = fine duty (12-bit), 0x40-0x4F = fine cutoff (11-bit)
      if (effect >= 0x30 && effect <= 0x3f) {
        int val = ((effect & 0x0f) << 8) | effectVal;
        dispatchCmd(DIV_CMD_C64_FINE_DUTY, ch, val);
        return true;
      }
      if (effect >= 0x40 && effect <= 0x4f) {
        int val = ((effect & 0x0f) << 8) | effectVal;
        dispatchCmd(DIV_CMD_C64_FINE_CUTOFF, ch, val);
        return true;
      }
      break;

    // PCE effects are all pre-effects (handled in seqPerSystemEffect)
    case SEQ_CHIP_PCE:
      break;

    // --- SNES: postEffectHandlers only (pre-effects in seqPerSystemEffect) ---
    case SEQ_CHIP_SNES:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_SNES_ECHO, ch, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_SNES_PITCH_MOD, ch, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_SNES_INVERT, ch, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_SNES_GAIN_MODE, ch, effectVal); return true;
        case 0x16: dispatchCmd(DIV_CMD_SNES_GAIN, ch, effectVal); return true;
        case 0x1d: dispatchCmd(DIV_CMD_STD_NOISE_FREQ, ch, effectVal); return true;
        case 0x20: dispatchCmd(DIV_CMD_FM_AR, ch, effectVal); return true;
        case 0x21: dispatchCmd(DIV_CMD_FM_DR, ch, effectVal); return true;
        case 0x22: dispatchCmd(DIV_CMD_FM_SL, ch, effectVal); return true;
        case 0x23: dispatchCmd(DIV_CMD_FM_RR, ch, effectVal); return true;
      }
      break;

    // --- SAA1099: saaPostEffectHandlerMap ---
    case SEQ_CHIP_SAA1099:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_STD_NOISE_FREQ, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_SAA_ENVELOPE, ch, effectVal); return true;
      }
      break;

    // SMS post-effects: none (pre-effects handled in seqPerSystemEffect)
    case SEQ_CHIP_SMS:
      break;

    // --- Lynx: postEffectHandlers (lynxEffectHandlerMap) ---
    case SEQ_CHIP_LYNX:
      if (effect >= 0x30 && effect <= 0x3f) {
        int val = ((effect & 0x0f) << 8) | effectVal;
        dispatchCmd(DIV_CMD_LYNX_LFSR_LOAD, ch, val);
        return true;
      }
      break;

    // --- FDS: postEffectHandlers ---
    case SEQ_CHIP_FDS:
      switch (effect) {
        case 0x11: dispatchCmd(DIV_CMD_FDS_MOD_DEPTH, ch, effectVal); return true;
        case 0x12: dispatchCmd(DIV_CMD_FDS_MOD_HIGH, ch, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_FDS_MOD_LOW, ch, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_FDS_MOD_POS, ch, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_FDS_MOD_WAVE, ch, effectVal); return true;
        case 0x16: dispatchCmd(DIV_CMD_FDS_MOD_AUTO, ch, effectVal); return true;
      }
      break;

    // --- N163: postEffectHandlers ---
    case SEQ_CHIP_N163:
      switch (effect) {
        case 0x10: dispatchCmd(DIV_CMD_WAVE, ch, effectVal); return true;
        case 0x11: dispatchCmd(DIV_CMD_N163_WAVE_POSITION, ch, effectVal, 1); return true;
        case 0x12: dispatchCmd(DIV_CMD_N163_WAVE_LENGTH, ch, effectVal, 1); return true;
        case 0x15: dispatchCmd(DIV_CMD_N163_WAVE_POSITION, ch, effectVal, 2); return true;
        case 0x16: dispatchCmd(DIV_CMD_N163_WAVE_LENGTH, ch, effectVal, 2); return true;
        case 0x1a: dispatchCmd(DIV_CMD_N163_WAVE_POSITION, ch, effectVal, 3); return true;
        case 0x1b: dispatchCmd(DIV_CMD_N163_WAVE_LENGTH, ch, effectVal, 3); return true;
      }
      break;

    // --- ESFM: postEffectHandlers (fmESFMPostEffectHandlerMap) ---
    case SEQ_CHIP_ESFM: {
      switch (effect) {
        case 0x10: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_AM_DEPTH, ch, o, effectVal & 1); return true; }
        case 0x12: dispatchCmd(DIV_CMD_FM_TL, ch, 0, effectVal); return true;
        case 0x13: dispatchCmd(DIV_CMD_FM_TL, ch, 1, effectVal); return true;
        case 0x14: dispatchCmd(DIV_CMD_FM_TL, ch, 2, effectVal); return true;
        case 0x15: dispatchCmd(DIV_CMD_FM_TL, ch, 3, effectVal); return true;
        case 0x16: { int o = opValNZ(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_MULT, ch, o, effectVal & 15); return true; }
        case 0x17: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_PM_DEPTH, ch, o, effectVal & 1); return true; }
        case 0x19: dispatchCmd(DIV_CMD_FM_AR, ch, -1, effectVal & 15); return true;
        case 0x1a: dispatchCmd(DIV_CMD_FM_AR, ch, 0, effectVal & 15); return true;
        case 0x1b: dispatchCmd(DIV_CMD_FM_AR, ch, 1, effectVal & 15); return true;
        case 0x1c: dispatchCmd(DIV_CMD_FM_AR, ch, 2, effectVal & 15); return true;
        case 0x1d: dispatchCmd(DIV_CMD_FM_AR, ch, 3, effectVal & 15); return true;
        case 0x20: dispatchCmd(DIV_CMD_ESFM_OP_PANNING, ch, 0, effectVal); return true;
        case 0x21: dispatchCmd(DIV_CMD_ESFM_OP_PANNING, ch, 1, effectVal); return true;
        case 0x22: dispatchCmd(DIV_CMD_ESFM_OP_PANNING, ch, 2, effectVal); return true;
        case 0x23: dispatchCmd(DIV_CMD_ESFM_OP_PANNING, ch, 3, effectVal); return true;
        case 0x24: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_ESFM_OUTLVL, ch, o, effectVal & 7); return true; }
        case 0x25: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_ESFM_MODIN, ch, o, effectVal & 7); return true; }
        case 0x26: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_ESFM_ENV_DELAY, ch, o, effectVal & 7); return true; }
        case 0x27: dispatchCmd(DIV_CMD_STD_NOISE_MODE, ch, effectVal & 3); return true;
        case 0x2a: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_WS, ch, o, effectVal & 7); return true; }
        case 0x2f: { int o = opValNZ(effectVal, 4); if (o < -1) break; dispatchCmd(DIV_CMD_FM_FIXFREQ, ch, o, effectVal & 7); return true; }
        case 0x40: dispatchCmd(DIV_CMD_FM_DT, ch, 0, effectVal); return true;
        case 0x41: dispatchCmd(DIV_CMD_FM_DT, ch, 1, effectVal); return true;
        case 0x42: dispatchCmd(DIV_CMD_FM_DT, ch, 2, effectVal); return true;
        case 0x43: dispatchCmd(DIV_CMD_FM_DT, ch, 3, effectVal); return true;
        case 0x50: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_AM, ch, o, effectVal & 1); return true; }
        case 0x51: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_SL, ch, o, effectVal & 15); return true; }
        case 0x52: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_RR, ch, o, effectVal & 15); return true; }
        case 0x53: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_VIB, ch, o, effectVal & 1); return true; }
        case 0x54: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_RS, ch, o, effectVal & 3); return true; }
        case 0x55: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_SUS, ch, o, effectVal & 1); return true; }
        case 0x56: dispatchCmd(DIV_CMD_FM_DR, ch, -1, effectVal & 15); return true;
        case 0x57: dispatchCmd(DIV_CMD_FM_DR, ch, 0, effectVal & 15); return true;
        case 0x58: dispatchCmd(DIV_CMD_FM_DR, ch, 1, effectVal & 15); return true;
        case 0x59: dispatchCmd(DIV_CMD_FM_DR, ch, 2, effectVal & 15); return true;
        case 0x5a: dispatchCmd(DIV_CMD_FM_DR, ch, 3, effectVal & 15); return true;
        case 0x5b: { int o = opVal(effectVal, 4); dispatchCmd(DIV_CMD_FM_KSR, ch, o, effectVal & 1); return true; }
      }
      // 0x30-0x3f: fixed frequency F-num (op determined by high nibble of effect code)
      if (effect >= 0x30 && effect <= 0x3f) {
        int opBlock = (effect & 0x0c) >> 2; // 0x30-33→op0, 0x34-37→op1, etc.
        int fNum = ((effect & 0x03) << 8) | effectVal;
        dispatchCmd(DIV_CMD_FM_FIXFREQ, ch, 4 + opBlock, fNum);
        return true;
      }
      break;
    }
  }

  return false;
}

// Process a row for a channel (adapted from DivEngine::processRow)
static void seqProcessRow(int i, bool afterDelay) {
  SeqChannelState& ch = g_seq.chan[i];
  int effectCols = g_seq.chanPool[i].effectCols;

  int whatOrder = afterDelay ? ch.delayOrder : g_seq.curOrder;
  int whatRow = afterDelay ? ch.delayRow : g_seq.curRow;

  // ---- Pre-effects (speed, tempo, jumps, delay) ----
  if (!afterDelay) {
    bool returnAfterPre = false;

    for (int j = 0; j < effectCols; j++) {
      short effect = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FX(j));
      short effectVal = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FXVAL(j));
      if (effectVal == -1) effectVal = 0;
      effectVal &= 255;

      switch (effect) {
        case 0x09: // select groove pattern / speed 1
          if (g_seq.numGrooves == 0) {
            // No grooves in song: just sets speed 1
            if (effectVal > 0) g_seq.speeds.val[0] = effectVal;
          } else {
            // Load groove pattern from groove bank (matches Furnace reference)
            if (effectVal < g_seq.numGrooves) {
              g_seq.speeds = g_seq.grooves[effectVal];
              g_seq.curSpeed = 0;
            }
          }
          break;
        case 0x0f: // speed
          if (g_seq.speeds.len == 2 && g_seq.numGrooves == 0) {
            if (effectVal > 0) g_seq.speeds.val[1] = effectVal;
          } else {
            if (effectVal > 0) g_seq.speeds.val[0] = effectVal;
          }
          break;
        case 0xfd: // virtual tempo numerator
          if (effectVal > 0) g_seq.virtualTempoN = effectVal;
          break;
        case 0xfe: // virtual tempo denominator
          if (effectVal > 0) g_seq.virtualTempoD = effectVal;
          break;
        case 0x0b: { // change order
          int jumpTreatment = getJumpTreatment();
          if (g_seq.changeOrd == -1 || jumpTreatment == 0) {
            g_seq.changeOrd = effectVal;
            if (jumpTreatment == 1 || jumpTreatment == 2) {
              g_seq.changePos = 0;
            }
          }
          break;
        }
        case 0x0d: { // next order
          int jumpTreatment = getJumpTreatment();
          bool ignoreJump = COMPAT(SEQ_COMPAT_IGNORE_JUMP_AT_END) && (g_seq.curOrder >= g_seq.ordersLen - 1);
          if (jumpTreatment == 2) {
            if (!ignoreJump) {
              g_seq.changeOrd = -2;
              g_seq.changePos = effectVal;
            }
          } else if (jumpTreatment == 1) {
            if (g_seq.changeOrd < 0 && !ignoreJump) {
              g_seq.changeOrd = -2;
              g_seq.changePos = effectVal;
            }
          } else {
            if (!ignoreJump) {
              if (g_seq.changeOrd < 0) {
                g_seq.changeOrd = -2;
              }
              g_seq.changePos = effectVal;
            }
          }
          break;
        }
        case 0xed: { // delay
          if (effectVal != 0) {
            int delayBehavior = getDelayBehavior();
            bool comparison = (delayBehavior == 1) ? (effectVal <= g_seq.nextSpeed) : (effectVal < g_seq.nextSpeed);
            if (delayBehavior == 2) comparison = true;
            if (comparison) {
              ch.rowDelay = effectVal;
              ch.delayOrder = whatOrder;
              ch.delayRow = whatRow;
              if (effectVal == g_seq.nextSpeed) {
                // delay lock (disabled per Furnace comment)
              } else {
                ch.delayLocked = false;
              }
              returnAfterPre = true;
            } else {
              ch.delayLocked = false;
            }
          }
          break;
        }
      }
    }

    if (returnAfterPre) return;
  }

  if (ch.delayLocked) return;

  // ---- Instrument ----
  bool insChanged = false;
  short insVal = getPatCell(i, whatOrder, whatRow, SEQ_PAT_INS);
  if (insVal != -1) {
    if (ch.lastIns != insVal) {
      dispatchCmd(DIV_CMD_INSTRUMENT, i, insVal, 0);
      ch.lastIns = insVal;
      insChanged = true;

      if (COMPAT(SEQ_COMPAT_LEGACY_VOLUME_SLIDES) && ch.volume == ch.volMax + 1) {
        ch.volume = ch.volMax;
        dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
        dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
      }
    }
  }

  // ---- Note reading ----
  short noteVal = getPatCell(i, whatOrder, whatRow, SEQ_PAT_NOTE);

  if (noteVal == SEQ_NOTE_OFF) {
    ch.keyOn = false;
    ch.keyOff = true;

    if (ch.inPorta && COMPAT(SEQ_COMPAT_NOTE_OFF_RESETS_SLIDES)) {
      if (ch.stopOnOff) {
        ch.portaNote = -1;
        ch.portaSpeed = -1;
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        ch.stopOnOff = false;
      }
      if (getKeyOffAffectsPorta(g_seq.chanChipId[i], g_seq.chanSubIdx[i])) {
        ch.portaNote = -1;
        ch.portaSpeed = -1;
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
      }
      ch.scheduledSlideReset = true;
    }

    dispatchCmd(DIV_CMD_NOTE_OFF, i);
  } else if (noteVal == SEQ_NOTE_RELEASE) {
    ch.keyOn = false;
    ch.keyOff = true;

    if (ch.inPorta && COMPAT(SEQ_COMPAT_NOTE_OFF_RESETS_SLIDES)) {
      if (ch.stopOnOff) {
        ch.portaNote = -1;
        ch.portaSpeed = -1;
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        ch.stopOnOff = false;
      }
      if (getKeyOffAffectsPorta(g_seq.chanChipId[i], g_seq.chanSubIdx[i])) {
        ch.portaNote = -1;
        ch.portaSpeed = -1;
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
      }
      ch.scheduledSlideReset = true;
    }

    dispatchCmd(DIV_CMD_NOTE_OFF_ENV, i);
    ch.releasing = true;
  } else if (noteVal == SEQ_NOTE_MACRO_RELEASE) {
    dispatchCmd(DIV_CMD_ENV_RELEASE, i);
    ch.releasing = true;
  } else if (noteVal != -1) {
    // New note
    ch.oldNote = ch.note;
    ch.note = noteVal - 60;  // Convert from pattern note to signed note

    // Per-platform: reset arp on new note if the chip requires it
    if (!ch.keyOn && getKeyOffAffectsArp(g_seq.chanChipId[i], g_seq.chanSubIdx[i])) {
      ch.arp = 0;
      dispatchCmd(DIV_CMD_HINT_ARPEGGIO, i, ch.arp);
    }

    ch.doNote = true;
    if (ch.arp != 0 && COMPAT(SEQ_COMPAT_COMPATIBLE_ARPEGGIO)) {
      ch.arpYield = true;
    }
  }

  // ---- Volume ----
  int volPortaTarget = -1;
  bool noApplyVolume = false;

  for (int j = 0; j < effectCols; j++) {
    short effect = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FX(j));
    if (effect == 0xd3 || effect == 0xd4) {
      short vol = getPatCell(i, whatOrder, whatRow, SEQ_PAT_VOL);
      volPortaTarget = vol << 8;  // can be -256

      short effectVal = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FXVAL(j));
      if (effectVal == -1) effectVal = 0;
      effectVal &= 255;

      noApplyVolume = effectVal > 0;
      break;
    }
  }

  short volVal = getPatCell(i, whatOrder, whatRow, SEQ_PAT_VOL);
  if (volVal != -1 && !noApplyVolume) {
    // COMPAT FLAG: oldAlwaysSetVolume — in legacy mode, only set volume if it changed
    // getLegacyAlwaysSetVolume() overrides: FM chips always set volume even with compat flag
    if (!COMPAT(SEQ_COMPAT_OLD_ALWAYS_SET_VOLUME) || getLegacyAlwaysSetVolume(g_seq.chanChipId[i]) || (MIN(ch.volMax, ch.volume) >> 8) != volVal) {
      // Let dispatchCmd know we can do MIDI aftertouch if there isn't a note
      if (noteVal == -1) {
        ch.midiAftertouch = true;
      }
      ch.volume = volVal << 8;
      dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
      dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
    }
  }

  // Reset retrigger
  ch.retrigSpeed = 0;

  // ---- Effects ----
  short lastSlide = -1;
  bool calledPorta = false;
  bool panChanged = false;
  bool surroundPanChanged = false;
  bool sampleOffSet = false;

  for (int j = 0; j < effectCols; j++) {
    short effect = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FX(j));
    short effectVal = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FXVAL(j));
    if (effectVal == -1) effectVal = 0;
    effectVal &= 255;

    // Per-system pre-effect: if handled, skip the main switch for this effect
    if (seqPerSystemEffect(i, effect, effectVal)) continue;

    switch (effect) {
      // --- Panning ---
      case 0x08: // panning (split 4-bit)
        ch.panL = (effectVal >> 4) | (effectVal & 0xf0);
        ch.panR = (effectVal & 15) | ((effectVal & 15) << 4);
        panChanged = true;
        break;
      case 0x80: { // panning (linear)
        // convertPanLinearToSplit(effectVal, 8, 255) from Furnace engine.cpp
        int val = effectVal;
        if (val < 0) val = 0;
        if (val > 255) val = 255;
        int panL = ((255 - val) * 255 * 2) / 255;
        int panR = (val * 255 * 2) / 255;
        if (panL > 255) panL = 255;
        if (panR > 255) panR = 255;
        ch.panL = panL;
        ch.panR = panR;
        panChanged = true;
        break;
      }
      case 0x81: // panning left
        ch.panL = effectVal;
        panChanged = true;
        break;
      case 0x82: // panning right
        ch.panR = effectVal;
        panChanged = true;
        break;
      case 0x88: // panning rear (split 4-bit)
        ch.panRL = (effectVal >> 4) | (effectVal & 0xf0);
        ch.panRR = (effectVal & 15) | ((effectVal & 15) << 4);
        surroundPanChanged = true;
        break;
      case 0x89: // panning rear left
        ch.panRL = effectVal;
        surroundPanChanged = true;
        break;
      case 0x8a: // panning rear right
        ch.panRR = effectVal;
        surroundPanChanged = true;
        break;
      case 0x83: // pan slide
        if (effectVal != 0) {
          if ((effectVal & 15) != 0) {
            ch.panSpeed = (effectVal & 15);
          } else {
            ch.panSpeed = -(effectVal >> 4);
          }
          ch.panDepth = 0;
          ch.panRate = 0;
          ch.panPos = 0;
        } else {
          ch.panSpeed = 0;
        }
        dispatchCmd(DIV_CMD_HINT_PAN_SLIDE, i, ch.panSpeed & 0xff);
        break;
      case 0x84: // panbrello
        if (ch.panDepth == 0) {
          ch.panPos = 0;
        }
        ch.panDepth = effectVal & 15;
        ch.panRate = effectVal >> 4;
        if (ch.panDepth != 0) {
          ch.panSpeed = 0;
        }
        dispatchCmd(DIV_CMD_HINT_PANBRELLO, i, effectVal);
        break;

      // --- Pitch slides ---
      case 0x01: // pitch slide up
        if (COMPAT(SEQ_COMPAT_IGNORE_DUPLICATE_SLIDES) && (lastSlide == 0x01 || lastSlide == 0x1337)) break;
        lastSlide = 0x01;
        if (effectVal == 0) {
          ch.portaNote = -1;
          ch.portaSpeed = -1;
          ch.inPorta = false;
          if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        } else {
          ch.portaNote = COMPAT(SEQ_COMPAT_LIMIT_SLIDES) ? 0x60 : 255;
          ch.portaSpeed = effectVal;
          ch.portaStop = true;
          ch.stopOnOff = false;
          ch.scheduledSlideReset = false;
          ch.wasShorthandPorta = false;
          ch.inPorta = false;
          if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 0);
        }
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        break;
      case 0x02: // pitch slide down
        if (COMPAT(SEQ_COMPAT_IGNORE_DUPLICATE_SLIDES) && (lastSlide == 0x02 || lastSlide == 0x1337)) break;
        lastSlide = 0x02;
        if (effectVal == 0) {
          ch.portaNote = -1;
          ch.portaSpeed = -1;
          ch.inPorta = false;
          if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        } else {
          ch.portaNote = (COMPAT(SEQ_COMPAT_LIMIT_SLIDES) && g_seq.chanChipId[i] != 0) ? getPortaFloor(g_seq.chanChipId[i], g_seq.chanSubIdx[i]) - 60 : -60;
          ch.portaSpeed = effectVal;
          ch.portaStop = true;
          ch.stopOnOff = false;
          ch.scheduledSlideReset = false;
          ch.wasShorthandPorta = false;
          ch.inPorta = false;
          if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 0);
        }
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        break;
      case 0x03: // portamento
        if (effectVal == 0) {
          ch.portaNote = -1;
          ch.portaSpeed = -1;
          HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
          ch.inPorta = false;
          dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        } else {
          ch.lastPorta = effectVal;
          calledPorta = true;
          // COMPAT FLAG: buggy portamento after sliding
          if (ch.note == ch.oldNote && !ch.inPorta && COMPAT(SEQ_COMPAT_BUGGY_PORTA_AFTER_SLIDE)) {
            ch.portaNote = ch.note;
            ch.portaSpeed = -1;
          } else {
            ch.portaNote = ch.note;
            ch.portaSpeed = effectVal;
            ch.inPorta = true;
            ch.wasShorthandPorta = false;
          }
          HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
          ch.portaStop = true;
          if (ch.keyOn) ch.doNote = false;
          ch.stopOnOff = COMPAT(SEQ_COMPAT_STOP_PORTA_ON_NOTE_OFF) ? true : false;
          ch.scheduledSlideReset = false;
          dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 1);
          lastSlide = 0x1337;
        }
        break;

      // --- Vibrato ---
      case 0x04: // vibrato
        if (effectVal) ch.lastVibrato = effectVal;
        ch.vibratoDepth = effectVal & 15;
        ch.vibratoRate = effectVal >> 4;
        dispatchCmd(DIV_CMD_HINT_VIBRATO, i, (ch.vibratoDepth & 15) | (ch.vibratoRate << 4));
        dispatchCmd(DIV_CMD_PITCH, i, ch.pitch + (((ch.vibratoDepth * vibTable[ch.vibratoPos] * ch.vibratoFine) >> 4) / 15));
        break;

      // --- Volume-related ---
      case 0x05: // vol slide + vibrato
        if (effectVal == 0) {
          ch.vibratoDepth = 0;
          ch.vibratoRate = 0;
        } else {
          ch.vibratoDepth = ch.lastVibrato & 15;
          ch.vibratoRate = ch.lastVibrato >> 4;
        }
        dispatchCmd(DIV_CMD_HINT_VIBRATO, i, (ch.vibratoDepth & 15) | (ch.vibratoRate << 4));
        dispatchCmd(DIV_CMD_PITCH, i, ch.pitch + (((ch.vibratoDepth * vibTable[ch.vibratoPos] * ch.vibratoFine) >> 4) / 15));
        if (effectVal != 0) {
          if ((effectVal & 15) != 0) {
            ch.volSpeed = -(effectVal & 15) * 64;
          } else {
            ch.volSpeed = (effectVal >> 4) * 64;
          }
          ch.tremoloDepth = 0;
          ch.tremoloRate = 0;
        } else {
          ch.volSpeed = 0;
        }
        ch.volSpeedTarget = -1;
        dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, ch.volSpeed);
        break;
      case 0x06: // vol slide + porta
        if (effectVal == 0 || ch.lastPorta == 0) {
          ch.portaNote = -1;
          ch.portaSpeed = -1;
          HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
          ch.inPorta = false;
          dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        } else {
          calledPorta = true;
          // COMPAT FLAG: buggy portamento after sliding (also affects 06xy)
          if (ch.note == ch.oldNote && !ch.inPorta && COMPAT(SEQ_COMPAT_BUGGY_PORTA_AFTER_SLIDE)) {
            ch.portaNote = ch.note;
            ch.portaSpeed = -1;
          } else {
            ch.portaNote = ch.note;
            ch.portaSpeed = ch.lastPorta;
            ch.inPorta = true;
            ch.wasShorthandPorta = false;
          }
          HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
          ch.portaStop = true;
          if (ch.keyOn) ch.doNote = false;
          ch.stopOnOff = COMPAT(SEQ_COMPAT_STOP_PORTA_ON_NOTE_OFF) ? true : false;
          ch.scheduledSlideReset = false;
          dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 1);
          lastSlide = 0x1337;
        }
        if (effectVal != 0) {
          if ((effectVal & 15) != 0) {
            ch.volSpeed = -(effectVal & 15) * 64;
          } else {
            ch.volSpeed = (effectVal >> 4) * 64;
          }
          ch.tremoloDepth = 0;
          ch.tremoloRate = 0;
        } else {
          ch.volSpeed = 0;
        }
        ch.volSpeedTarget = -1;
        dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, ch.volSpeed);
        break;
      case 0x07: // tremolo
        if (ch.tremoloDepth == 0) {
          ch.tremoloPos = 0;
        }
        ch.tremoloDepth = effectVal & 15;
        ch.tremoloRate = effectVal >> 4;
        dispatchCmd(DIV_CMD_HINT_TREMOLO, i, effectVal);
        if (ch.tremoloDepth != 0) {
          ch.volSpeed = 0;
          ch.volSpeedTarget = -1;
        } else {
          dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
          dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
        }
        break;
      case 0x0a: // volume slide
        if (effectVal != 0) {
          if ((effectVal & 15) != 0) {
            ch.volSpeed = -(effectVal & 15) * 64;
          } else {
            ch.volSpeed = (effectVal >> 4) * 64;
          }
          ch.tremoloDepth = 0;
          ch.tremoloRate = 0;
        } else {
          ch.volSpeed = 0;
        }
        ch.volSpeedTarget = -1;
        dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, ch.volSpeed);
        break;

      // --- Arpeggio ---
      case 0x00: // arpeggio
        ch.arp = effectVal;
        if (ch.arp == 0 && COMPAT(SEQ_COMPAT_ARP0_RESET)) {
          ch.resetArp = true;
        }
        dispatchCmd(DIV_CMD_HINT_ARPEGGIO, i, ch.arp);
        break;

      // --- Retrigger ---
      case 0x0c: // retrigger
        if (effectVal != 0) {
          ch.retrigSpeed = effectVal;
          ch.retrigTick = 0;
        }
        break;

      // --- Sample offset ---
      case 0x90: case 0x91: case 0x92:
      case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
      case 0x98: case 0x99: case 0x9a: case 0x9b:
      case 0x9c: case 0x9d: case 0x9e: case 0x9f:
        if (COMPAT(SEQ_COMPAT_OLD_SAMPLE_OFFSET)) {
          // Old sample offset: immediate dispatch with (nibble<<8|val)*256
          dispatchCmd(DIV_CMD_SAMPLE_POS, i, (((effect & 0x0f) << 8) | effectVal) * 256);
        } else {
          // New sample offset: only 0x90-0x92 set byte positions
          if (effect < 0x93) {
            ch.sampleOff &= ~(0xff << ((effect - 0x90) << 3));
            ch.sampleOff |= effectVal << ((effect - 0x90) << 3);
            sampleOffSet = true;
          }
        }
        break;

      // --- Set Hz ---
      case 0xc0: case 0xc1: case 0xc2: case 0xc3:
        g_seq.divider = (double)(((effect & 0x3) << 8) | effectVal);
        if (g_seq.divider < 1) g_seq.divider = 1;
        g_seq.subticks = 0;
        break;

      // --- Delayed mute ---
      case 0xdc: {
        int delayBehavior = getDelayBehavior();
        if (effectVal > 0 && (delayBehavior == 2 || effectVal < g_seq.nextSpeed)) {
          ch.volCut = effectVal + 1;
          ch.cutType = 0;
        }
        break;
      }

      // --- Volume portamento ---
      case 0xd3: // vol porta (slow)
        ch.tremoloDepth = 0;
        ch.tremoloRate = 0;
        ch.volSpeed = volPortaTarget < 0 ? 0 : volPortaTarget > ch.volume ? effectVal : -effectVal;
        ch.volSpeedTarget = ch.volSpeed == 0 ? -1 : volPortaTarget;
        dispatchCmd(DIV_CMD_HINT_VOL_SLIDE_TARGET, i, ch.volSpeed, ch.volSpeedTarget);
        break;
      case 0xd4: // vol porta (fast)
        ch.tremoloDepth = 0;
        ch.tremoloRate = 0;
        ch.volSpeed = volPortaTarget < 0 ? 0 : volPortaTarget > ch.volume ? 256 * effectVal : -256 * effectVal;
        ch.volSpeedTarget = ch.volSpeed == 0 ? -1 : volPortaTarget;
        dispatchCmd(DIV_CMD_HINT_VOL_SLIDE_TARGET, i, ch.volSpeed, ch.volSpeedTarget);
        break;

      // --- Arp speed ---
      case 0xe0:
        if (effectVal > 0) g_arpLen = effectVal;
        dispatchCmd(DIV_CMD_HINT_ARP_TIME, i, g_arpLen);
        break;

      // --- Shorthand portamento ---
      case 0xe1: // portamento up
        ch.portaNote = ch.note + (effectVal & 15);
        ch.portaSpeed = (effectVal >> 4) * 4;
        ch.portaStop = true;
        ch.stopOnOff = COMPAT(SEQ_COMPAT_STOP_PORTA_ON_NOTE_OFF) ? true : false;
        ch.scheduledSlideReset = false;
        if ((effectVal & 15) != 0) {
          ch.inPorta = true;
          ch.shorthandPorta = true;
          ch.wasShorthandPorta = true;
          if (!COMPAT(SEQ_COMPAT_BROKEN_SHORTCUT_SLIDES)) dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 0);
          // COMPAT FLAG: E1xy/E2xy also take priority over slides
          if (COMPAT(SEQ_COMPAT_E1E2_ALSO_TAKE_PRIORITY)) lastSlide = 0x1337;
        } else {
          ch.inPorta = false;
          if (!COMPAT(SEQ_COMPAT_BROKEN_SHORTCUT_SLIDES)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        }
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        break;
      case 0xe2: // portamento down
        ch.portaNote = ch.note - (effectVal & 15);
        ch.portaSpeed = (effectVal >> 4) * 4;
        ch.portaStop = true;
        ch.stopOnOff = COMPAT(SEQ_COMPAT_STOP_PORTA_ON_NOTE_OFF) ? true : false;
        ch.scheduledSlideReset = false;
        if ((effectVal & 15) != 0) {
          ch.inPorta = true;
          ch.shorthandPorta = true;
          ch.wasShorthandPorta = true;
          if (!COMPAT(SEQ_COMPAT_BROKEN_SHORTCUT_SLIDES)) dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 0);
          // COMPAT FLAG: E1xy/E2xy also take priority over slides
          if (COMPAT(SEQ_COMPAT_E1E2_ALSO_TAKE_PRIORITY)) lastSlide = 0x1337;
        } else {
          ch.inPorta = false;
          if (!COMPAT(SEQ_COMPAT_BROKEN_SHORTCUT_SLIDES)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        }
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        break;
      case 0xe3: // vibrato shape
        ch.vibratoShape = effectVal;
        dispatchCmd(DIV_CMD_HINT_VIBRATO_SHAPE, i, ch.vibratoShape);
        break;
      case 0xe4: // vibrato fine
        ch.vibratoFine = effectVal;
        dispatchCmd(DIV_CMD_HINT_VIBRATO_RANGE, i, ch.vibratoFine);
        break;
      case 0xe5: // pitch
        ch.pitch = effectVal - 0x80;
        dispatchCmd(DIV_CMD_PITCH, i, ch.pitch + (((ch.vibratoDepth * vibTable[ch.vibratoPos] * ch.vibratoFine) >> 4) / 15));
        dispatchCmd(DIV_CMD_HINT_PITCH, i, ch.pitch);
        break;

      // --- Delayed legato ---
      case 0xe6:
        if ((effectVal & 15) != 0) {
          ch.legatoDelay = (((effectVal & 0xf0) >> 4) & 7) + 1;
          if (effectVal & 128) {
            ch.legatoTarget = -(effectVal & 15);
          } else {
            ch.legatoTarget = (effectVal & 15);
          }
        } else {
          ch.legatoDelay = -1;
          ch.legatoTarget = 0;
        }
        break;
      case 0xe7: { // delayed macro release
        int delayBehavior = getDelayBehavior();
        if (effectVal > 0 && (delayBehavior == 2 || effectVal < g_seq.nextSpeed)) {
          ch.cut = effectVal + 1;
          ch.cutType = 2;
        }
        break;
      }
      case 0xe8: // delayed legato up
        if ((effectVal & 15) != 0) {
          ch.legatoDelay = ((effectVal & 0xf0) >> 4) + 1;
          ch.legatoTarget = (effectVal & 15);
        } else {
          ch.legatoDelay = -1;
          ch.legatoTarget = 0;
        }
        break;
      case 0xe9: // delayed legato down
        if ((effectVal & 15) != 0) {
          ch.legatoDelay = ((effectVal & 0xf0) >> 4) + 1;
          ch.legatoTarget = -(effectVal & 15);
        } else {
          ch.legatoDelay = -1;
          ch.legatoTarget = 0;
        }
        break;
      case 0xea: // legato mode
        ch.legato = effectVal;
        break;
      case 0xeb: // sample bank
        dispatchCmd(DIV_CMD_SAMPLE_BANK, i, effectVal);
        break;
      case 0xec: { // delayed note cut
        int delayBehavior = getDelayBehavior();
        if (effectVal > 0 && (delayBehavior == 2 || effectVal < g_seq.nextSpeed)) {
          ch.cut = effectVal + 1;
          ch.cutType = 0;
        }
        break;
      }

      // --- Fine volume slides ---
      case 0xf0: // set Hz by tempo
        g_seq.divider = (double)effectVal * 2.0 / 5.0;
        if (g_seq.divider < 1) g_seq.divider = 1;
        g_seq.subticks = 0;
        break;
      case 0xf3: // fine volume slide up
        ch.tremoloDepth = 0;
        ch.tremoloRate = 0;
        ch.volSpeed = effectVal;
        ch.volSpeedTarget = -1;
        dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, ch.volSpeed);
        break;
      case 0xf4: // fine volume slide down
        ch.tremoloDepth = 0;
        ch.tremoloRate = 0;
        ch.volSpeed = -effectVal;
        ch.volSpeedTarget = -1;
        dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, ch.volSpeed);
        break;
      case 0xf5: // disable macro
        dispatchCmd(DIV_CMD_MACRO_OFF, i, effectVal & 0xff);
        break;
      case 0xf6: // enable macro
        dispatchCmd(DIV_CMD_MACRO_ON, i, effectVal & 0xff);
        break;
      case 0xf7: // restart macro
        dispatchCmd(DIV_CMD_MACRO_RESTART, i, effectVal & 0xff);
        break;
      case 0xf8: // single volume slide up
        ch.volSpeed = 0;
        ch.volSpeedTarget = -1;
        ch.volume = MIN(ch.volume + effectVal * 256, ch.volMax);
        dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
        dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
        break;
      case 0xf9: // single volume slide down
        ch.volSpeed = 0;
        ch.volSpeedTarget = -1;
        ch.volume = MAX(ch.volume - effectVal * 256, 0);
        dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
        dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
        break;
      case 0xfa: // fast volume slide
        if (effectVal != 0) {
          if ((effectVal & 15) != 0) {
            ch.volSpeed = -(effectVal & 15) * 256;
          } else {
            ch.volSpeed = (effectVal >> 4) * 256;
          }
          ch.tremoloDepth = 0;
          ch.tremoloRate = 0;
        } else {
          ch.volSpeed = 0;
        }
        ch.volSpeedTarget = -1;
        dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, ch.volSpeed);
        break;
      case 0xfc: { // delayed note release
        int delayBehavior = getDelayBehavior();
        if (delayBehavior == 2 || effectVal < g_seq.nextSpeed) {
          ch.cut = effectVal + 1;
          ch.cutType = 1;
        }
        break;
      }
      case 0xee: // external command
        dispatchCmd(DIV_CMD_EXTERNAL, i, effectVal);
        break;
      case 0xff: // stop song
        shallStopSched = true;
        break;

      default:
        // Unhandled effects are ignored (matching Furnace reference behavior).
        // Chip-specific effects are handled by perSystemEffect() which is called
        // before this switch (see the effectHandlers approach in Furnace).
        // We don't forward raw effect bytes as dispatch command IDs — that would
        // send bogus commands to the chip (effect 0x10 != DivCommand 0x10).
        break;
    }
  }

  // Commit pending sample offset
  if (sampleOffSet) {
    dispatchCmd(DIV_CMD_SAMPLE_POS, i, ch.sampleOff);
  }

  // Commit pending panning
  if (panChanged) {
    dispatchCmd(DIV_CMD_PANNING, i, ch.panL, ch.panR);
    dispatchCmd(DIV_CMD_HINT_PANNING, i, ch.panL, ch.panR);
  }
  if (surroundPanChanged) {
    dispatchCmd(DIV_CMD_SURROUND_PANNING, i, 2, ch.panRL);
    dispatchCmd(DIV_CMD_SURROUND_PANNING, i, 3, ch.panRR);
  }

  // Instrument change during portamento
  if (insChanged && (ch.inPorta || calledPorta) && COMPAT(SEQ_COMPAT_NEW_INS_TRIGGERS_IN_PORTA)) {
    dispatchCmd(DIV_CMD_NOTE_ON, i, DIV_NOTE_NULL);
  }

  // ---- Note on ----
  if (ch.doNote) {
    if (!COMPAT(SEQ_COMPAT_CONTINUOUS_VIBRATO)) {
      ch.vibratoPos = 0;
    }
    dispatchCmd(DIV_CMD_PITCH, i, ch.pitch + (((ch.vibratoDepth * vibTable[ch.vibratoPos] * ch.vibratoFine) >> 4) / 15));

    // COMPAT FLAG: broken portamento during legato
    // - portamento would not occur if legato is on
    // - this was fixed in 0.6pre4
    if (ch.legato && (!ch.inPorta || COMPAT(SEQ_COMPAT_BROKEN_PORTA_LEGATO))) {
      dispatchCmd(DIV_CMD_LEGATO, i, ch.note);
      dispatchCmd(DIV_CMD_HINT_LEGATO, i, ch.note);
    } else {
      if (ch.inPorta && ch.keyOn && !ch.shorthandPorta) {
        // COMPAT FLAG: E1xy/E2xy stop on same note
        if (COMPAT(SEQ_COMPAT_E1E2_STOP_ON_SAME_NOTE) && ch.wasShorthandPorta) {
          ch.portaSpeed = -1;
          HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
          if (!COMPAT(SEQ_COMPAT_BROKEN_SHORTCUT_SLIDES)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
          ch.wasShorthandPorta = false;
          ch.inPorta = false;
        } else {
          // otherwise we change the portamento target
          ch.portaNote = ch.note;
          HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        }
      } else if (!ch.noteOnInhibit) {
        dispatchCmd(DIV_CMD_NOTE_ON, i, ch.note, ch.volume >> 8);
        ch.releasing = false;
        ch.goneThroughNote = true;
        ch.wentThroughNote = true;
        g_seq.keyHit[i] = true;
        // COMPAT FLAG: reset arp phase on new note
        if (COMPAT(SEQ_COMPAT_RESET_ARP_PHASE_ON_NEW_NOTE)) {
          ch.arpStage = 0xff; // -1 as unsigned
        }
      }
    }
    ch.doNote = false;

    if (!ch.keyOn && ch.scheduledSlideReset) {
      ch.portaNote = -1;
      ch.portaSpeed = -1;
      ch.scheduledSlideReset = false;
      ch.inPorta = false;
    }
    if (!ch.keyOn && ch.volume > ch.volMax) {
      ch.volume = ch.volMax;
      dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
      dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
    }
    ch.keyOn = true;
    ch.keyOff = false;
  }

  ch.shorthandPorta = false;
  ch.noteOnInhibit = false;

  // ---- Post effects (per-system + built-in) ----
  for (int j = 0; j < effectCols; j++) {
    short effect = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FX(j));
    short effectVal = getPatCell(i, whatOrder, whatRow, SEQ_PAT_FXVAL(j));
    if (effectVal == -1) effectVal = 0;
    effectVal &= 255;

    // Per-system post-effects (if handled, skip built-in post-effects)
    if (seqPerSystemPostEffect(i, effect, effectVal)) continue;

    switch (effect) {
      case 0xf1: // single pitch slide up
        ch.portaNote = COMPAT(SEQ_COMPAT_LIMIT_SLIDES) ? 0x60 : 255;
        ch.portaSpeed = effectVal;
        ch.portaStop = true;
        ch.stopOnOff = false;
        ch.scheduledSlideReset = false;
        ch.inPorta = false;
        if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 0);
        dispatchCmd(DIV_CMD_NOTE_PORTA, i, ch.portaSpeed * (getLinearPitch() ? getPitchSlideSpeed() : 1), ch.portaNote);
        ch.portaNote = -1;
        ch.portaSpeed = -1;
        ch.inPorta = false;
        if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        break;
      case 0xf2: // single pitch slide down
        ch.portaNote = (COMPAT(SEQ_COMPAT_LIMIT_SLIDES) && g_seq.chanChipId[i] != 0) ? getPortaFloor(g_seq.chanChipId[i], g_seq.chanSubIdx[i]) - 60 : -60;
        ch.portaSpeed = effectVal;
        ch.portaStop = true;
        ch.stopOnOff = false;
        ch.scheduledSlideReset = false;
        ch.inPorta = false;
        if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 0);
        dispatchCmd(DIV_CMD_NOTE_PORTA, i, ch.portaSpeed * (getLinearPitch() ? getPitchSlideSpeed() : 1), ch.portaNote);
        ch.portaNote = -1;
        ch.portaSpeed = -1;
        ch.inPorta = false;
        if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        break;
    }
  }
}

// Process the next row (adapted from DivEngine::nextRow)
static void seqNextRow() {
  g_seq.prevOrder = g_seq.curOrder;
  g_seq.prevRow = g_seq.curRow;

  // Process row pre on all channels
  for (int i = 0; i < g_seq.numChannels; i++) {
    seqProcessRowPre(i);
  }

  // Process row on all channels
  for (int i = 0; i < g_seq.numChannels; i++) {
    int delayBehavior = getDelayBehavior();
    if (delayBehavior != 2) {
      g_seq.chan[i].rowDelay = 0;
    }
    seqProcessRow(i, false);
  }

  // Mark row as walked
  g_seq.walked[((g_seq.curOrder << 5) + (g_seq.curRow >> 3)) & 8191] |= 1 << (g_seq.curRow & 7);

  // Commit pending jump or advance row
  if (g_seq.changeOrd != -1) {
    if (g_seq.repeatPattern) {
      // In repeat mode, ignore jumps and just reset row
      g_seq.curRow = 0;
      g_seq.changeOrd = -1;
    } else {
      g_seq.curRow = g_seq.changePos;
      g_seq.changePos = 0;
      if (g_seq.changeOrd == -2) g_seq.changeOrd = g_seq.curOrder + 1;
      g_seq.curOrder = g_seq.changeOrd;

      if (g_seq.curOrder >= g_seq.ordersLen) {
        g_seq.curOrder = 0;
        endOfSong = true;
        memset(g_seq.walked, 0, sizeof(g_seq.walked));
      }
      g_seq.changeOrd = -1;
    }
    // halt engine if requested (debug menu)
    if (g_seq.haltOn == 1) g_seq.halted = true;
  } else if (g_seq.playing) {
    if (++g_seq.curRow >= g_seq.patLen) {
      if (shallStopSched) {
        g_seq.curRow = g_seq.patLen - 1;
      } else if (g_seq.repeatPattern) {
        g_seq.curRow = 0;
        g_seq.changeOrd = -1;
      } else {
        seqNextOrder();
      }
    }
    // halt engine if requested (debug menu)
    if (g_seq.haltOn == 1) g_seq.halted = true;
  }

  // Loop detection
  if (!endOfSong && !shallStopSched) {
    if (g_seq.walked[((g_seq.curOrder << 5) + (g_seq.curRow >> 3)) & 8191] & (1 << (g_seq.curRow & 7))) {
      endOfSong = true;
      memset(g_seq.walked, 0, sizeof(g_seq.walked));
    }
  }

  // halt engine if requested (debug menu)
  if (g_seq.haltOn == 2) g_seq.halted = true;

  // Speed alternation
  g_seq.prevSpeed = g_seq.nextSpeed;
  // COMPAT FLAG: broken speed selection (DefleMask)
  if (COMPAT(SEQ_COMPAT_BROKEN_SPEED_SEL)) {
    uint16_t speed1 = g_seq.speeds.val[0];
    uint16_t speed2 = (g_seq.speeds.len >= 2) ? g_seq.speeds.val[1] : speed1;
    if ((g_seq.patLen & 1) && (g_seq.curOrder & 1)) {
      g_seq.ticks = (g_seq.curRow & 1) ? speed2 : speed1;
      g_seq.nextSpeed = (g_seq.curRow & 1) ? speed1 : speed2;
    } else {
      g_seq.ticks = (g_seq.curRow & 1) ? speed1 : speed2;
      g_seq.nextSpeed = (g_seq.curRow & 1) ? speed2 : speed1;
    }
  } else {
    g_seq.ticks = g_seq.speeds.val[g_seq.curSpeed];
    g_seq.curSpeed++;
    if (g_seq.curSpeed >= g_seq.speeds.len) g_seq.curSpeed = 0;
    g_seq.nextSpeed = g_seq.speeds.val[g_seq.curSpeed];
  }

  // Post row: schedule PRE_NOTE and oneTickCut (from Furnace playback.cpp:1892-1990)
  // Furnace reads the NEXT row (after advancement) to decide oneTickCut scheduling
  for (int i = 0; i < g_seq.numChannels; i++) {
    bool wantPreNote = getWantPreNote(g_seq.chanChipId[i]);

    // PRE_NOTE dispatch for C64/SID2 (gate timing from post-row path)
    if (wantPreNote && !g_seq.chan[i].legato) {
      short noteVal = getPatCell(i, g_seq.curOrder, g_seq.curRow, SEQ_PAT_NOTE);
      if (noteVal != -1 && noteVal != SEQ_NOTE_OFF && noteVal != SEQ_NOTE_RELEASE && noteVal != SEQ_NOTE_MACRO_RELEASE) {
        bool doPreparePreNote = true;
        int addition = 0;
        int effectCols = g_seq.chanPool[i].effectCols;

        for (int j = 0; j < effectCols; j++) {
          short effect = getPatCell(i, g_seq.curOrder, g_seq.curRow, SEQ_PAT_FX(j));
          short effectVal = getPatCell(i, g_seq.curOrder, g_seq.curRow, SEQ_PAT_FXVAL(j));
          if (effectVal == -1) effectVal = 0;
          effectVal &= 255;

          if (!COMPAT(SEQ_COMPAT_PRE_NOTE_NO_EFFECT)) {
            // Portamento cancels PRE_NOTE
            if ((effect == 0x03 || effect == 0x06) && effectVal != 0) {
              doPreparePreNote = false;
              break;
            }
            // Legato cancels PRE_NOTE
            if (effect == 0xea && effectVal > 0) {
              doPreparePreNote = false;
              break;
            }
          }
          // Delay shifts PRE_NOTE timing
          if (effect == 0xed && effectVal > 0) {
            addition = effectVal;
            break;
          }
        }

        if (doPreparePreNote) {
          dispatchCmd(DIV_CMD_PRE_NOTE, i, g_seq.ticks + addition);
        }
      }
    }

    // COMPAT FLAG: auto-insert one tick gap between notes (oneTickCut)
    if (COMPAT(SEQ_COMPAT_ONE_TICK_CUT) && !wantPreNote) {
      short noteVal = getPatCell(i, g_seq.curOrder, g_seq.curRow, SEQ_PAT_NOTE);
      if (noteVal != -1 && noteVal != SEQ_NOTE_OFF && noteVal != SEQ_NOTE_RELEASE && noteVal != SEQ_NOTE_MACRO_RELEASE) {
        if (!g_seq.chan[i].legato) {
          int effectCols = g_seq.chanPool[i].effectCols;
          bool doPrepareCut = true;
          int addition = 0;

          for (int j = 0; j < effectCols; j++) {
            short effect = getPatCell(i, g_seq.curOrder, g_seq.curRow, SEQ_PAT_FX(j));
            short effectVal = getPatCell(i, g_seq.curOrder, g_seq.curRow, SEQ_PAT_FXVAL(j));
            if (effectVal == -1) effectVal = 0;
            effectVal &= 255;
            if ((effect == 0x03 || effect == 0x06) && effectVal != 0) {
              doPrepareCut = false;
              break;
            }
            if (effect == 0xea && effectVal > 0) {
              doPrepareCut = false;
              break;
            }
            if (effect == 0xed && effectVal > 0) {
              addition = effectVal;
              break;
            }
          }

          if (doPrepareCut && g_seq.chan[i].cut <= 0) {
            g_seq.chan[i].cut = g_seq.ticks + addition;
            g_seq.chan[i].cutType = 0;
          }
        }
      }
    }
  }

  // Set firstTick
  firstTick = true;
}

// Advance one tick (adapted from DivEngine::nextTick)
static bool seqNextTick() {
  bool ret = false;

  // Clear key-hit flags at the start of each tick (reference: engine.cpp playSub)
  for (int i = 0; i < g_seq.numChannels; i++) {
    g_seq.keyHit[i] = false;
  }

  if (g_seq.divider < 1) g_seq.divider = 1;

  // Process delayed rows
  for (int i = 0; i < g_seq.numChannels; i++) {
    if (g_seq.chan[i].rowDelay > 0) {
      if (--g_seq.chan[i].rowDelay == 0) {
        seqProcessRow(i, true);
      }
    }
  }

  // Virtual tempo accumulator
  if (g_seq.stepPlay != 1) {
    g_seq.tempoAccum += g_seq.virtualTempoN;
    while (g_seq.tempoAccum >= g_seq.virtualTempoD) {
      g_seq.tempoAccum -= g_seq.virtualTempoD;
      if (--g_seq.ticks <= 0) {
        ret = endOfSong;
        if (shallStopSched) {
          g_seq.playing = false;
          shallStopSched = false;
          break;
        } else if (endOfSong) {
          int loopModality = getLoopModality();
          if (loopModality != 2) {
            // Reset channels on loop (matches Furnace playSub(true) → reset())
            for (int c = 0; c < g_seq.numChannels; c++) {
              dispatchCmd(DIV_CMD_NOTE_OFF, c);
              g_seq.chan[c].reset();
              int vm = dispatchCmd(DIV_CMD_GET_VOLMAX, c);
              if (vm > 0) {
                g_seq.chan[c].volMax = vm << 8;
              } else {
                g_seq.chan[c].volMax = 0x7f00;
              }
              if (!getLinearPitch()) {
                g_seq.chan[c].vibratoFine = 4;
              }
            }
            // Reset sequencer state (matches playSub(true) → reset() path)
            g_seq.curOrder = 0;
            g_seq.curRow = 0;
            g_seq.prevOrder = 0;
            g_seq.prevRow = 0;
            g_seq.curSpeed = 0;
            g_seq.ticks = 1;
            g_seq.tempoAccum = 0;
            g_arpLen = 1;
            // Re-initialize nextSpeed from speed table (matches playSub reset)
            g_seq.nextSpeed = g_seq.speeds.val[0];
            g_seq.prevSpeed = g_seq.nextSpeed;
            // Clear walked array so loop detection starts fresh
            memset(g_seq.walked, 0, sizeof(g_seq.walked));
          }
          // Track loop count
          if (g_seq.remainingLoops > 0) {
            g_seq.remainingLoops--;
            if (g_seq.remainingLoops <= 0) {
              g_seq.playing = false;
              break;
            }
          }
          g_seq.totalLoops++;
        }
        endOfSong = false;

        if (g_seq.stepPlay == 2) {
          g_seq.stepPlay = 1;
          g_seq.prevOrder = g_seq.curOrder;
          g_seq.prevRow = g_seq.curRow;
        }

        seqNextRow();
        break;
      }
    }
    if (g_seq.tempoAccum > 1023) g_seq.tempoAccum = 1023;
  }

  // Per-tick effects
  if (g_seq.playing && !shallStopSched) {
    for (int i = 0; i < g_seq.numChannels; i++) {
      SeqChannelState& ch = g_seq.chan[i];

      // Retrigger
      if (ch.retrigSpeed) {
        if (--ch.retrigTick < 0) {
          ch.retrigTick = ch.retrigSpeed - 1;
          dispatchCmd(DIV_CMD_NOTE_ON, i, DIV_NOTE_NULL);
          g_seq.keyHit[i] = true;
        }
      }

      // Volume slides and tremolo
      if (!COMPAT(SEQ_COMPAT_NO_SLIDES_ON_FIRST_TICK) || !firstTick) {
        if (ch.volSpeed != 0) {
          int gotVol = dispatchCmd(DIV_CMD_GET_VOLUME, i);
          if (gotVol >= 0) {
            ch.volume = (ch.volume & 0xff) | (gotVol << 8);
          }
          int preSpeedVol = ch.volume;
          ch.volume += ch.volSpeed;

          // Volume portamento target
          if (ch.volSpeedTarget != -1) {
            bool atTarget = false;
            if (ch.volSpeed > 0) {
              atTarget = (ch.volume >= ch.volSpeedTarget);
            } else if (ch.volSpeed < 0) {
              atTarget = (ch.volume <= ch.volSpeedTarget);
            } else {
              atTarget = true;
              ch.volSpeedTarget = ch.volume;
            }

            if (atTarget) {
              if (ch.volSpeed > 0) {
                ch.volume = MAX(preSpeedVol, ch.volSpeedTarget);
              } else if (ch.volSpeed < 0) {
                ch.volume = MIN(preSpeedVol, ch.volSpeedTarget);
              }
              if (!COMPAT(SEQ_COMPAT_NO_VOL_SLIDE_RESET)) {
                ch.volSpeed = 0;
                ch.volSpeedTarget = -1;
              }
              dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
              dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
              dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, 0);
            }
          }

          // Clamp volume
          if (ch.volume > ch.volMax) {
            ch.volume = ch.volMax;
            if (!COMPAT(SEQ_COMPAT_NO_VOL_SLIDE_RESET)) {
              ch.volSpeed = 0;
              ch.volSpeedTarget = -1;
            }
            dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
            dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
            dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, 0);
          } else if (ch.volume < 0) {
            if (!COMPAT(SEQ_COMPAT_NO_VOL_SLIDE_RESET)) {
              ch.volSpeed = 0;
              ch.volSpeedTarget = -1;
            }
            dispatchCmd(DIV_CMD_HINT_VOL_SLIDE, i, 0);
            if (COMPAT(SEQ_COMPAT_LEGACY_VOLUME_SLIDES)) {
              ch.volume = ch.volMax + 1;
            } else {
              ch.volume = 0;
            }
            dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
            dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
          } else {
            dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
          }
        } else if (ch.tremoloDepth > 0) {
          ch.tremoloPos += ch.tremoloRate;
          ch.tremoloPos &= 127;
          dispatchCmd(DIV_CMD_VOLUME, i, MAX(0, ch.volume - (tremTable[ch.tremoloPos] * ch.tremoloDepth)) >> 8);
        }
      }

      // Pan slides
      if (ch.panSpeed != 0) {
        int newPanL = ch.panL;
        int newPanR = ch.panR;
        if (ch.panSpeed > 0) {
          if (newPanR >= 0xff) {
            newPanL -= ch.panSpeed;
          } else {
            newPanR += ch.panSpeed;
          }
        } else {
          if (newPanL >= 0xff) {
            newPanR += ch.panSpeed;
          } else {
            newPanL -= ch.panSpeed;
          }
        }
        if (newPanL < 0) newPanL = 0;
        if (newPanL > 0xff) newPanL = 0xff;
        if (newPanR < 0) newPanR = 0;
        if (newPanR > 0xff) newPanR = 0xff;
        ch.panL = newPanL;
        ch.panR = newPanR;
        dispatchCmd(DIV_CMD_PANNING, i, ch.panL, ch.panR);
      } else if (ch.panDepth > 0) {
        // Panbrello
        ch.panPos += ch.panRate;
        ch.panPos &= 255;
        switch (ch.panPos & 0xc0) {
          case 0:
            ch.panL = ((ch.panPos & 0x3f) << 2);
            ch.panR = 0;
            break;
          case 0x40:
            ch.panL = 0xff - ((ch.panPos & 0x3f) << 2);
            ch.panR = 0;
            break;
          case 0x80:
            ch.panL = 0;
            ch.panR = ((ch.panPos & 0x3f) << 2);
            break;
          case 0xc0:
            ch.panL = 0;
            ch.panR = 0xff - ((ch.panPos & 0x3f) << 2);
            break;
        }
        ch.panL = (ch.panL * ch.panDepth) / 15;
        ch.panR = (ch.panR * ch.panDepth) / 15;
        ch.panL ^= 0xff;
        ch.panR ^= 0xff;
        dispatchCmd(DIV_CMD_PANNING, i, ch.panL, ch.panR);
      }

      // Vibrato
      if (ch.vibratoDepth > 0) {
        ch.vibratoPos += ch.vibratoRate;
        while (ch.vibratoPos >= 64) ch.vibratoPos -= 64;

        ch.vibratoPosGiant += ch.vibratoRate;
        while (ch.vibratoPosGiant >= 512) ch.vibratoPosGiant -= 512;

        int vibratoOut = 0;
        switch (ch.vibratoShape) {
          case 1: // sine, up only
            vibratoOut = MAX(0, vibTable[ch.vibratoPos]);
            break;
          case 2: // sine, down only
            vibratoOut = MIN(0, vibTable[ch.vibratoPos]);
            break;
          case 3: // triangle
            vibratoOut = (ch.vibratoPos & 31);
            if (ch.vibratoPos & 16) vibratoOut = 32 - (ch.vibratoPos & 31);
            if (ch.vibratoPos & 32) vibratoOut = -vibratoOut;
            vibratoOut <<= 3;
            break;
          case 4: // ramp up
            vibratoOut = ch.vibratoPos << 1;
            break;
          case 5: // ramp down
            vibratoOut = -(ch.vibratoPos << 1);
            break;
          case 6: // square
            vibratoOut = (ch.vibratoPos >= 32) ? -127 : 127;
            break;
          case 7: // random
            vibratoOut = (rand() & 255) - 128;
            break;
          case 8: // square up
            vibratoOut = (ch.vibratoPos >= 32) ? 0 : 127;
            break;
          case 9: // square down
            vibratoOut = (ch.vibratoPos >= 32) ? 0 : -127;
            break;
          case 10: // half sine up
            vibratoOut = vibTable[ch.vibratoPos >> 1];
            break;
          case 11: // half sine down
            vibratoOut = vibTable[32 | (ch.vibratoPos >> 1)];
            break;
          default: // sine
            vibratoOut = vibTable[ch.vibratoPos];
            break;
        }
        dispatchCmd(DIV_CMD_PITCH, i, ch.pitch + (((ch.vibratoDepth * vibratoOut * ch.vibratoFine) >> 4) / 15));
      }

      // Delayed legato
      if (ch.legatoDelay > 0) {
        if (--ch.legatoDelay < 1) {
          ch.note += ch.legatoTarget;
          dispatchCmd(DIV_CMD_LEGATO, i, ch.note);
          dispatchCmd(DIV_CMD_HINT_LEGATO, i, ch.note);
          ch.legatoDelay = -1;
          ch.legatoTarget = 0;
        }
      }

      // Portamento and pitch slides
      if (!COMPAT(SEQ_COMPAT_NO_SLIDES_ON_FIRST_TICK) || !firstTick) {
        if ((ch.keyOn || ch.keyOff) && ch.portaSpeed > 0) {
          int linearPitch = getLinearPitch();
          int pitchSlideSpeed = getPitchSlideSpeed();
          int portaResult = dispatchCmd(DIV_CMD_NOTE_PORTA, i, ch.portaSpeed * (linearPitch ? pitchSlideSpeed : 1), ch.portaNote);
          if (portaResult == 2 && ch.portaStop && COMPAT(SEQ_COMPAT_TARGET_RESETS_SLIDES)) {
            ch.portaSpeed = 0;
            HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
            ch.oldNote = ch.note;
            ch.note = ch.portaNote;
            ch.inPorta = false;
            dispatchCmd(DIV_CMD_LEGATO, i, ch.note);
            dispatchCmd(DIV_CMD_HINT_LEGATO, i, ch.note);
          }
        }
      }

      // Note cut
      if (ch.cut > 0) {
        if (--ch.cut < 1) {
          if (ch.cutType == 2) {
            dispatchCmd(DIV_CMD_ENV_RELEASE, i);
            ch.releasing = true;
          } else {
            ch.oldNote = ch.note;
            if (ch.inPorta && COMPAT(SEQ_COMPAT_NOTE_OFF_RESETS_SLIDES)) {
              ch.keyOff = true;
              ch.keyOn = false;
              if (ch.stopOnOff) {
                ch.portaNote = -1;
                ch.portaSpeed = -1;
                HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
                ch.stopOnOff = false;
              }
              // Per-platform: some chips reset portamento on note-off
              if (getKeyOffAffectsPorta(g_seq.chanChipId[i], g_seq.chanSubIdx[i])) {
                ch.portaNote = -1;
                ch.portaSpeed = -1;
                HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
              }
              dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
              ch.scheduledSlideReset = true;
            }
            if (ch.cutType == 1) {
              dispatchCmd(DIV_CMD_NOTE_OFF_ENV, i);
            } else {
              dispatchCmd(DIV_CMD_NOTE_OFF, i);
            }
            ch.releasing = true;
          }
        }
      }

      // Volume cut/mute
      if (ch.volCut > 0) {
        if (--ch.volCut < 1) {
          ch.volume = 0;
          dispatchCmd(DIV_CMD_VOLUME, i, ch.volume >> 8);
          dispatchCmd(DIV_CMD_HINT_VOLUME, i, ch.volume >> 8);
        }
      }

      // Arpeggio
      if (ch.resetArp) {
        dispatchCmd(DIV_CMD_LEGATO, i, ch.note);
        dispatchCmd(DIV_CMD_HINT_LEGATO, i, ch.note);
        ch.resetArp = false;
      }

      // COMPAT FLAG: reset arp position on row change (Amiga/PC tracker behavior)
      if (COMPAT(SEQ_COMPAT_ROW_RESETS_ARP_POS) && firstTick) {
        ch.arpStage = 0xff; // -1 as unsigned, will wrap to 0 on next increment
      }

      if (ch.arp != 0 && !ch.arpYield && ch.portaSpeed < 1) {
        if (--ch.arpTicks < 1) {
          ch.arpTicks = g_arpLen;
          ch.arpStage++;
          if (ch.arpStage > 2) ch.arpStage = 0;
          switch (ch.arpStage) {
            case 0:
              dispatchCmd(DIV_CMD_LEGATO, i, ch.note);
              break;
            case 1:
              dispatchCmd(DIV_CMD_LEGATO, i, ch.note + (ch.arp >> 4));
              break;
            case 2:
              dispatchCmd(DIV_CMD_LEGATO, i, ch.note + (ch.arp & 15));
              break;
          }
        }
      } else {
        ch.arpYield = false;
      }
    }
  }

  // Clear firstTick
  firstTick = false;

  return ret;
}

// ============================================================
// WASM-exported C API
// ============================================================

extern "C" {

EMSCRIPTEN_KEEPALIVE
void furnace_seq_load_song(int numChannels, int patLen, int ordersLen) {
  initTables();
  g_seq.reset();

  g_seq.numChannels = CLAMP(numChannels, 0, SEQ_MAX_CHANNELS);
  g_seq.patLen = CLAMP(patLen, 1, SEQ_MAX_ROWS);
  g_seq.ordersLen = CLAMP(ordersLen, 1, SEQ_MAX_ORDERS);

  // Initialize channel pools
  for (int ch = 0; ch < g_seq.numChannels; ch++) {
    g_seq.chanPool[ch].init();
  }

  // Reset global state
  g_arpLen = 1;
  firstTick = false;
  endOfSong = false;
  shallStopSched = false;

  printf("[FurnaceSequencer] load_song: %d channels, %d rows/pat, %d orders\n",
         g_seq.numChannels, g_seq.patLen, g_seq.ordersLen);
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_cell(int channel, int patIndex, int row, int col, short value) {
  if (channel < 0 || channel >= g_seq.numChannels) return;
  if (patIndex < 0 || patIndex >= SEQ_MAX_PATTERNS) return;
  if (row < 0 || row >= SEQ_MAX_ROWS) return;
  if (col < 0 || col >= SEQ_MAX_COLS) return;

  ensurePattern(channel, patIndex);
  SeqPatternData& pat = g_seq.chanPool[channel].pat[patIndex];
  pat.data[row * SEQ_MAX_COLS + col] = value;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_order(int channel, int order, uint8_t patIndex) {
  if (channel < 0 || channel >= g_seq.numChannels) return;
  if (order < 0 || order >= SEQ_MAX_ORDERS) return;
  g_seq.orders[channel][order] = patIndex;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_effect_cols(int channel, int effectCols) {
  if (channel < 0 || channel >= g_seq.numChannels) return;
  g_seq.chanPool[channel].effectCols = CLAMP(effectCols, 1, SEQ_MAX_EFFECTS);
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_ins(int index, int type) {
  // Instruments are managed by the dispatch side.
  // This is a placeholder for future instrument table support.
  (void)index;
  (void)type;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_sample(int index, int length) {
  // Samples are managed by the dispatch side.
  (void)index;
  (void)length;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_channel_chip(int channel, int chipId, int subIdx) {
  if (channel < 0 || channel >= g_seq.numChannels) return;
  g_seq.chanChipId[channel] = (uint16_t)chipId;
  g_seq.chanSubIdx[channel] = (uint8_t)subIdx;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_play(int order, int row) {
  initTables();

  g_seq.curOrder = CLAMP(order, 0, g_seq.ordersLen - 1);
  g_seq.curRow = CLAMP(row, 0, g_seq.patLen - 1);
  g_seq.prevOrder = g_seq.curOrder;
  g_seq.prevRow = g_seq.curRow;
  g_seq.playing = true;
  g_seq.curSpeed = 0;
  g_seq.ticks = 1;  // Force nextRow on first tick
  g_seq.tempoAccum = 0;
  g_seq.changeOrd = -1;
  g_seq.changePos = -1;
  g_seq.nextSpeed = g_seq.speeds.val[0];  // Initialize for first-row delay comparison

  endOfSong = false;
  shallStopSched = false;
  firstTick = false;

  // Clear walked array
  memset(g_seq.walked, 0, sizeof(g_seq.walked));

  // Reset channel state
  for (int i = 0; i < g_seq.numChannels; i++) {
    g_seq.chan[i].reset();
    // Query volMax from dispatch
    int vm = dispatchCmd(DIV_CMD_GET_VOLMAX, i);
    if (vm > 0) {
      g_seq.chan[i].volMax = vm << 8;
    } else {
      g_seq.chan[i].volMax = 0x7f00;  // Default
    }
    // Non-linear pitch uses smaller vibrato range (matches Furnace engine.cpp:2197)
    if (!getLinearPitch()) {
      g_seq.chan[i].vibratoFine = 4;
    }
  }

  printf("[FurnaceSequencer] play: order=%d row=%d\n", g_seq.curOrder, g_seq.curRow);
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_stop(void) {
  // Send note off to all channels
  for (int i = 0; i < g_seq.numChannels; i++) {
    dispatchCmd(DIV_CMD_NOTE_OFF, i);
    g_seq.chan[i].reset();
  }
  g_seq.playing = false;
  g_seq.curRow = 0;
  g_seq.curOrder = 0;
  g_seq.stepPlay = 0;
  endOfSong = false;
  shallStopSched = false;
  firstTick = false;
  printf("[FurnaceSequencer] stop\n");
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_seek(int order, int row) {
  g_seq.curOrder = CLAMP(order, 0, g_seq.ordersLen - 1);
  g_seq.curRow = CLAMP(row, 0, g_seq.patLen - 1);
  g_seq.prevOrder = g_seq.curOrder;
  g_seq.prevRow = g_seq.curRow;
  g_seq.changeOrd = -1;
  g_seq.changePos = -1;
  g_seq.ticks = 1;  // Force nextRow on next tick
  g_seq.tempoAccum = 0;
  memset(g_seq.walked, 0, sizeof(g_seq.walked));
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_speed(int speed1, int speed2) {
  g_seq.speeds.val[0] = speed1 > 0 ? speed1 : 6;
  if (speed2 > 0) {
    g_seq.speeds.val[1] = speed2;
    g_seq.speeds.len = 2;
  } else {
    g_seq.speeds.len = 1;
  }
  g_seq.curSpeed = 0;
  g_seq.nextSpeed = g_seq.speeds.val[0];
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_speed_pattern(const uint16_t* values, int len) {
  if (len < 1) len = 1;
  if (len > 16) len = 16;
  g_seq.speeds.len = len;
  for (int i = 0; i < len; i++) {
    g_seq.speeds.val[i] = values[i] > 0 ? values[i] : 6;
  }
  g_seq.curSpeed = 0;
  g_seq.nextSpeed = g_seq.speeds.val[0];
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_tempo(int tempoN, int tempoD) {
  g_seq.virtualTempoN = tempoN > 0 ? tempoN : 150;
  g_seq.virtualTempoD = tempoD > 0 ? tempoD : 150;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_groove(const uint16_t* values, int len) {
  if (len <= 0 || len > SEQ_MAX_GROOVE || !values) return;
  g_seq.speeds.len = len;
  for (int i = 0; i < len; i++) {
    g_seq.speeds.val[i] = values[i];
  }
  g_seq.useGroove = (len > 1);
  g_seq.curSpeed = 0;
  g_seq.nextSpeed = g_seq.speeds.val[0];
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_compat_flags(uint32_t flags, uint32_t flagsExt, int pitchSlideSpeed) {
  g_seq.compatFlags = flags;
  g_seq.compatFlagsExt = flagsExt;
  if (pitchSlideSpeed > 0) {
    g_seq.pitchSlideSpeedFull = (uint8_t)pitchSlideSpeed;
  }
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_pat_len(int patLen) {
  g_seq.patLen = CLAMP(patLen, 1, SEQ_MAX_ROWS);
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_groove_entry(int index, const uint16_t* values, int len) {
  if (index < 0 || index >= 256) return;
  if (len <= 0 || len > SEQ_MAX_GROOVE || !values) return;
  g_seq.grooves[index].len = len;
  for (int i = 0; i < len; i++) {
    g_seq.grooves[index].val[i] = values[i];
  }
  if (index >= g_seq.numGrooves) {
    g_seq.numGrooves = index + 1;
  }
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_repeat_pattern(bool repeat) {
  g_seq.repeatPattern = repeat;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_dispatch_handle(void* handle) {
  // The handle is actually an integer cast to pointer from JS
  // Store it for use by dispatchCmd
  g_seq.dispatchHandle = handle;
  dispatchHandle = (int)(intptr_t)handle;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_sample_rate(double sampleRate) {
  g_seq.sampleRate = sampleRate;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_divider(double divider) {
  g_seq.divider = divider > 0 ? divider : 60.0;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_mute(int channel, bool muted) {
  if (channel < 0 || channel >= SEQ_MAX_CHANNELS) return;
  g_seq.isMuted[channel] = muted;
}

EMSCRIPTEN_KEEPALIVE
int furnace_seq_tick(void) {
  if (!g_seq.playing || g_seq.halted) return (g_seq.curOrder << 16) | g_seq.curRow;

  seqNextTick();

  // halt engine if requested (debug menu)
  if (g_seq.haltOn == 3) g_seq.halted = true;

  return (g_seq.curOrder << 16) | g_seq.curRow;
}

EMSCRIPTEN_KEEPALIVE
int furnace_seq_get_order(void) {
  return g_seq.curOrder;
}

EMSCRIPTEN_KEEPALIVE
int furnace_seq_get_row(void) {
  return g_seq.curRow;
}

EMSCRIPTEN_KEEPALIVE
bool furnace_seq_is_playing(void) {
  return g_seq.playing;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_remaining_loops(int loops) {
  g_seq.remainingLoops = loops;
}

EMSCRIPTEN_KEEPALIVE
int furnace_seq_get_total_loops(void) {
  return g_seq.totalLoops;
}

EMSCRIPTEN_KEEPALIVE
bool furnace_seq_get_key_hit(int channel) {
  if (channel < 0 || channel >= SEQ_MAX_CHANNELS) return false;
  return g_seq.keyHit[channel];
}

} // extern "C"
