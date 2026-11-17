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
#include <map>
#include <algorithm>

// upstream src/engine/defines.h:63: bit 31 marks a raw-frequency note
#ifndef DIV_NOTE_RAW_FLAG
#define DIV_NOTE_RAW_FLAG 0x80000000
#endif


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

// DivDispatchCmds, EffectHandler and the per-system effect maps come from Furnace's own
// sysDef.cpp via tools/gen-furnace-effect-table.ts.
#include <unordered_map>
#include <functional>
#include "FurnaceEffectTable.gen.h"

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
#define SEQ_CHIP_VBOY         47
#define SEQ_CHIP_SWAN         43
#define SEQ_CHIP_PV1000       95
#define SEQ_CHIP_BIFURCATOR   107

// ============================================================
// Per-platform helper functions
// ============================================================

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


// firstTick flag (set by nextRow, cleared after per-tick processing)
static bool firstTick = false;

// endOfSong flag (set when loop detected, cleared after handling)
static bool endOfSong = false;

// shallStopSched flag (set by 0xFF effect)
static bool shallStopSched = false;

// seeking flag — true during tick-level loop re-seek (prevents recursive loop handling)
static bool seeking = false;

// ============================================================
// Dispatch bridge
// ============================================================

// Defined in FurnaceDispatchWrapper.cpp
extern "C" int furnace_dispatch_cmd(int handle, int cmd, int chan, int val1, int val2);
extern "C" void furnace_dispatch_reset(int handle);
extern "C" void furnace_dispatch_set_skip_writes(int handle, int skip);
extern "C" void furnace_dispatch_force_ins(int handle, int chan);
extern "C" void furnace_cmd_log_tick();
extern "C" void furnace_cmd_log_set_global_chan(int globalChan);
extern "C" void furnace_cmd_log_pause();
extern "C" void furnace_cmd_log_resume();
extern "C" int furnace_dispatch_chan_trait(int handle, int chan, int trait);

static int dispatchHandle = 0;

static int dispatchCmd(int cmd, int chan, int val1 = 0, int val2 = 0) {
  if (chan < 0 || chan >= g_seq.numChannels) return -1;
  if (g_seq.isMuted[chan]) {
    // Still allow certain commands through even when muted
    // (volume, note off, instrument) for state tracking
    // But block note-on
    if (cmd == DIV_CMD_NOTE_ON) return 0;
  }
  // Multi-chip routing: use per-channel handle and sub-channel index
  int handle = g_seq.chanDispatchHandle[chan];
  int subChan = (int)g_seq.chanSubIdx[chan];
  if (handle <= 0) {
    // Fallback to legacy single handle (for single-chip songs)
    handle = dispatchHandle;
    subChan = chan; // Use global channel index
  }
  if (handle <= 0) return -1;
  // Set global channel for accurate command log (matches upstream -view commands output)
  furnace_cmd_log_set_global_chan(chan);
  return furnace_dispatch_cmd(handle, cmd, subChan, val1, val2);
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

// Mirrors DivEngine::perSystemEffect / perSystemPostEffect / perSystemPreEffect (playback.cpp):
// find the handler in the system's table, map val/val2, dispatch. A throwing val function
// ("do not handle") returns onThrow: false for effect and pre, true for post.
static bool seqPerSystemLane(int kind, int ch, int effect, int effectVal, bool onThrow) {
  const EffectHandler* h = furnaceFindEffect(kind, g_seq.chanChipId[ch], effect);
  if (!h) return false;
  int val = 0, val2 = 0;
  try {
    val = h->val ? h->val((unsigned char)effect, (unsigned char)effectVal) : effectVal;
    val2 = h->val2 ? h->val2((unsigned char)effect, (unsigned char)effectVal) : 0;
  } catch (DivDoNotHandleEffect&) {
    return onThrow;
  }
  return dispatchCmd(h->dispatchCmd, ch, val, val2) != 0;
}

static bool seqPerSystemPreEffect(int ch, int effect, int effectVal) {
  return seqPerSystemLane(FURNACE_FX_PRE, ch, effect, effectVal, false);
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

// ============================================================
// Per-channel platform traits
// ============================================================

// The traits playback.cpp asks of the dispatch that runs a channel
// (disCont[dispatchOfChan[i]].dispatch->...(dispatchChanOfChan[i])), asked of
// the real platform instance through the wrapper - not a table copied here:
// hand tables drifted (porta floor 60 notes low, key-off arp reset on every
// chip including the Game Boy).
enum SeqChanTrait { TRAIT_PORTA_FLOOR = 0, TRAIT_KEYOFF_ARP = 1, TRAIT_KEYOFF_PORTA = 2,
                    TRAIT_LEGACY_ALWAYS_SET_VOLUME = 3, TRAIT_WANT_PRE_NOTE = 4, TRAIT_MAX_FREQ = 5 };

// -1 when the channel has no dispatch (upstream: dispatchChanOfChan[i] < 0).
static int chanTrait(int chan, SeqChanTrait trait) {
  if (chan < 0 || chan >= g_seq.numChannels) return -1;
  int handle = g_seq.chanDispatchHandle[chan];
  int subChan = (int)g_seq.chanSubIdx[chan];
  if (handle <= 0) { handle = dispatchHandle; subChan = chan; }
  if (handle <= 0) return -1;
  return furnace_dispatch_chan_trait(handle, subChan, (int)trait);
}

// limitSlides' slide-down target (playback.cpp:1038, 1683): the platform's floor note, else 0.
static int slideDownTarget(int chan) {
  if (!COMPAT(SEQ_COMPAT_LIMIT_SLIDES)) return 0;
  int floor = chanTrait(chan, TRAIT_PORTA_FLOOR);
  return floor < 0 ? 0 : floor;
}
// DivEngine::getMaxFreqChan (engine.cpp:2482): the platform's highest raw frequency.
static unsigned int getMaxFreqChan(int chan) {
  int v = chanTrait(chan, TRAIT_MAX_FREQ);
  return v < 0 ? 0 : (unsigned int)v;
}
static bool keyOffAffectsPorta(int chan) { return chanTrait(chan, TRAIT_KEYOFF_PORTA) == 1; }
static bool keyOffAffectsArp(int chan) { return chanTrait(chan, TRAIT_KEYOFF_ARP) == 1; }
static bool legacyAlwaysSetVolume(int chan) { return chanTrait(chan, TRAIT_LEGACY_ALWAYS_SET_VOLUME) == 1; }
static bool wantPreNote(int chan) { return chanTrait(chan, TRAIT_WANT_PRE_NOTE) == 1; }


// Dispatch HINT_PORTA with clamped values (matches Furnace reference)
#define HINT_PORTA(ch_idx, pNote, pSpeed) \
  dispatchCmd(DIV_CMD_HINT_PORTA, ch_idx, pNote, MAX(pSpeed, 0))

// ============================================================
// Per-system effect handlers (from Furnace sysDef.cpp)
// ============================================================

static bool seqPerSystemEffect(int ch, int effect, int effectVal) {
  return seqPerSystemLane(FURNACE_FX_EFFECT, ch, effect, effectVal, false);
}

static bool seqPerSystemPostEffect(int ch, int effect, int effectVal) {
  return seqPerSystemLane(FURNACE_FX_POST, ch, effect, effectVal, true);
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
        ch.portaNote = 0;
        ch.portaSpeed = -1;
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        ch.stopOnOff = false;
      }
      if (keyOffAffectsPorta(i)) {
        ch.portaNote = 0;
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
        ch.portaNote = 0;
        ch.portaSpeed = -1;
        HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
        ch.stopOnOff = false;
      }
      if (keyOffAffectsPorta(i)) {
        ch.portaNote = 0;
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
    ch.note = noteVal;  // engine 258: chan.note is the pattern note as stored (dispatch adds no further 60)

    // Per-platform: reset arp on new note if the chip requires it
    if (!ch.keyOn && keyOffAffectsArp(i)) {
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
    if (!COMPAT(SEQ_COMPAT_OLD_ALWAYS_SET_VOLUME) || legacyAlwaysSetVolume(i) || (MIN(ch.volMax, ch.volume) >> 8) != volVal) {
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
          ch.portaNote = 0;
          ch.portaSpeed = -1;
          ch.inPorta = false;
          if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        } else {
          if (ch.note & DIV_NOTE_RAW_FLAG) {
            // raw frequency mode: use the max raw frequency (playback.cpp:1058)
            ch.portaNote = getMaxFreqChan(i) | DIV_NOTE_RAW_FLAG;
          } else {
            ch.portaNote = COMPAT(SEQ_COMPAT_LIMIT_SLIDES) ? 156 : 179;
          }
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
          ch.portaNote = 0;
          ch.portaSpeed = -1;
          ch.inPorta = false;
          if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        } else {
          if (ch.note & DIV_NOTE_RAW_FLAG) {
            // raw frequency mode: zero (playback.cpp:1101)
            ch.portaNote = 0 | DIV_NOTE_RAW_FLAG;
          } else {
            ch.portaNote = slideDownTarget(i);
          }
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
          ch.portaNote = 0;
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
          ch.portaNote = 0;
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
        // don't accept simultaneous arp and raw frequency (playback.cpp:1295)
        if (ch.note & DIV_NOTE_RAW_FLAG) break;
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
        if (effectVal > 0) {
          if (COMPAT(SEQ_COMPAT_ARP_SPEED_GLOBAL)) {
            for (int c = 0; c < g_seq.numChannels; c++) g_seq.chan[c].arpSpeed = effectVal;
          } else {
            ch.arpSpeed = effectVal;
          }
          dispatchCmd(DIV_CMD_HINT_ARP_TIME, i, effectVal);
        }
        break;

      // --- Shorthand portamento ---
      case 0xe1: // portamento up
        if (ch.note & DIV_NOTE_RAW_FLAG) break; // ignored in raw frequency mode (playback.cpp:1395)
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
        if (ch.note & DIV_NOTE_RAW_FLAG) break; // ignored in raw frequency mode (playback.cpp:1426)
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
        // playback.cpp:1615 sends the note alone; a VOLUME ahead of it overrode the
        // instrument's own envelope volume (Game Boy NR12 0xF0 where Furnace writes 0xC0).
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
      ch.portaNote = 0;
      ch.portaSpeed = -1;
      HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
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
        if (ch.note & DIV_NOTE_RAW_FLAG) ch.portaNote = getMaxFreqChan(i) | DIV_NOTE_RAW_FLAG; // playback.cpp:1759
        else ch.portaNote = COMPAT(SEQ_COMPAT_LIMIT_SLIDES) ? 156 : 179;
        ch.portaSpeed = effectVal;
        ch.portaStop = true;
        ch.stopOnOff = false;
        ch.scheduledSlideReset = false;
        ch.inPorta = false;
        if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 0);
        dispatchCmd(DIV_CMD_NOTE_PORTA, i, ch.portaSpeed * ((getLinearPitch() && !(ch.note & DIV_NOTE_RAW_FLAG)) ? getPitchSlideSpeed() : 1), ch.portaNote);
        ch.portaNote = 0;
        ch.portaSpeed = -1;
        ch.inPorta = false;
        if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        break;
      case 0xf2: // single pitch slide down
        if (ch.note & DIV_NOTE_RAW_FLAG) ch.portaNote = 0 | DIV_NOTE_RAW_FLAG; // playback.cpp:1763
        else ch.portaNote = slideDownTarget(i);
        ch.portaSpeed = effectVal;
        ch.portaStop = true;
        ch.stopOnOff = false;
        ch.scheduledSlideReset = false;
        ch.inPorta = false;
        if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, true, 0);
        dispatchCmd(DIV_CMD_NOTE_PORTA, i, ch.portaSpeed * ((getLinearPitch() && !(ch.note & DIV_NOTE_RAW_FLAG)) ? getPitchSlideSpeed() : 1), ch.portaNote);
        ch.portaNote = 0;
        ch.portaSpeed = -1;
        ch.inPorta = false;
        if (!COMPAT(SEQ_COMPAT_ARP_NON_PORTA)) dispatchCmd(DIV_CMD_PRE_PORTA, i, false, 0);
        break;
    }
  }
}

// SNES echo filter blend, DEViLBOX-only 38xx (mirror of src/lib/furnace/snesFirBlend.ts SnesFirBlender,
// which the TAD export uses too). Taps written by 30xx-37xx on a row are the target; 38xx = blend rows;
// the filter steps linearly toward the target, one step per row. Without 38xx the taps jump, as in Furnace.
// State is per dispatch handle (one SNES chip), merged over all that chip's channels like the JS.
struct SeqFirState { int fir[8]; bool blending; int from[8], to[8], rows, step; };
static std::map<int, SeqFirState> g_firState;

static void seqSnesFirReset() { g_firState.clear(); }

static void seqSnesFirRow() {
  struct Row { int rep; bool written[8]; int val[8]; int rows; };
  std::map<int, Row> rows;
  for (int ch = 0; ch < g_seq.numChannels; ch++) {
    if (g_seq.chanChipId[ch] != SEQ_CHIP_SNES) continue;
    int h = g_seq.chanDispatchHandle[ch];
    auto it = rows.find(h);
    if (it == rows.end()) { Row r; r.rep = ch; r.rows = 0; for (int k = 0; k < 8; k++) { r.written[k] = false; r.val[k] = 0; } it = rows.insert({h, r}).first; }
    Row& r = it->second;
    for (int j = 0; j < g_seq.chanPool[ch].effectCols; j++) {
      int e = getPatCell(ch, g_seq.curOrder, g_seq.curRow, SEQ_PAT_FX(j));
      int v = getPatCell(ch, g_seq.curOrder, g_seq.curRow, SEQ_PAT_FXVAL(j));
      if (v == -1) v = 0;
      v &= 255;
      if (e >= 0x30 && e <= 0x37) { r.written[e - 0x30] = true; r.val[e - 0x30] = v > 127 ? v - 256 : v; }
      else if (e == 0x38) r.rows = v;
    }
  }
  for (auto& kv : rows) {
    Row& r = kv.second;
    auto st = g_firState.find(kv.first);
    if (st == g_firState.end()) {
      SeqFirState n; n.blending = false; n.rows = 1; n.step = 0;
      for (int k = 0; k < 8; k++) { n.fir[k] = k == 0 ? 127 : 0; n.from[k] = n.to[k] = n.fir[k]; }
      st = g_firState.insert({kv.first, n}).first;
    }
    SeqFirState& s = st->second;
    bool any = false;
    for (int k = 0; k < 8; k++) any = any || r.written[k];
    int prev[8];
    for (int k = 0; k < 8; k++) prev[k] = s.fir[k];
    if (any) {
      int to[8];
      for (int k = 0; k < 8; k++) to[k] = r.written[k] ? r.val[k] : s.fir[k];
      s.blending = r.rows > 1;
      if (s.blending) { for (int k = 0; k < 8; k++) { s.from[k] = s.fir[k]; s.to[k] = to[k]; } s.rows = r.rows; s.step = 0; }
      else {
        // A jump is always sent (the chip's real taps may differ from the tracked ones).
        for (int k = 0; k < 8; k++) { s.fir[k] = to[k]; if (r.written[k]) dispatchCmd(DIV_CMD_SNES_ECHO_FIR, r.rep, k, to[k] & 255); }
        continue;
      }
    }
    if (s.blending) {
      s.step++;
      double t = std::max(0.0, std::min(1.0, (double)s.step / std::max(1, s.rows)));
      for (int k = 0; k < 8; k++) s.fir[k] = (int)std::floor(s.from[k] + (s.to[k] - s.from[k]) * t + 0.5);
      if (s.step >= s.rows) s.blending = false;
      for (int k = 0; k < 8; k++) if (s.fir[k] != prev[k]) dispatchCmd(DIV_CMD_SNES_ECHO_FIR, r.rep, k, s.fir[k] & 255);
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

  seqSnesFirRow();

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
    bool wantPreNote = ::wantPreNote(i);

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
        bool didTickSeek = false;
        if (shallStopSched) {
          g_seq.playing = false;
          shallStopSched = false;
          break;
        } else if (endOfSong) {
          if (seeking) {
            // During tick-level seek, just break — caller handles it
            break;
          }
          int loopModality = getLoopModality();
          if (loopModality != 2) {
            // Collect unique dispatch handles
            int resetHandles[SEQ_MAX_CHANNELS];
            int numResetHandles = 0;
            for (int c = 0; c < g_seq.numChannels; c++) {
              int h = g_seq.chanDispatchHandle[c];
              if (h <= 0) h = dispatchHandle;
              bool found = false;
              for (int k = 0; k < numResetHandles; k++) {
                if (resetHandles[k] == h) { found = true; break; }
              }
              if (!found && h > 0) {
                resetHandles[numResetHandles++] = h;
              }
            }

            // Reset dispatches (matches Furnace playSub → reset → dispatch->reset())
            for (int k = 0; k < numResetHandles; k++) {
              furnace_dispatch_reset(resetHandles[k]);
            }

            // Reset sequencer channel state
            for (int c = 0; c < g_seq.numChannels; c++) {
              g_seq.chan[c].reset();
              int vm = dispatchCmd(DIV_CMD_GET_VOLMAX, c);
              if (vm > 0) {
                g_seq.chan[c].volMax = (vm << 8) | 0xff;
              } else {
                g_seq.chan[c].volMax = 0x7f00;
              }
              g_seq.chan[c].volume = g_seq.chan[c].volMax;
              if (!getLinearPitch()) {
                g_seq.chan[c].vibratoFine = 4;
              }
            }
            // Save loop target position (walked-detected or order-overflow)
            int loopOrder = g_seq.curOrder;
            int loopRow = g_seq.curRow;

            // Reset sequencer state to order 0
            g_seq.curOrder = 0;
            g_seq.curRow = 0;
            g_seq.prevOrder = 0;
            g_seq.prevRow = 0;
            g_seq.curSpeed = 0;
            g_seq.ticks = 1;
            g_seq.tempoAccum = 0;
            for (int c = 0; c < g_seq.numChannels; c++) g_seq.chan[c].arpSpeed = g_seq.arpLen;
            g_seq.nextSpeed = g_seq.speeds.val[0];
            g_seq.prevSpeed = g_seq.nextSpeed;
            memset(g_seq.walked, 0, sizeof(g_seq.walked));

            // Tick-level re-seek to the loop position.
            // Matches reference playSub(true): setSkipRegisterWrites(true) →
            // tick through entire song → setSkipRegisterWrites(false) → forceIns().
            // This processes ALL per-tick effects (arp, vibrato, portamento, volume
            // slides) during seek, unlike the old row-level seek which only ran
            // seqNextRow() and missed inter-tick state changes.
            if (loopOrder > 0 || loopRow > 0) {
              furnace_cmd_log_pause();

              // Enable skip-register-writes for all dispatches
              for (int k = 0; k < numResetHandles; k++) {
                furnace_dispatch_set_skip_writes(resetHandles[k], 1);
              }

              memset(g_seq.walked, 0, sizeof(g_seq.walked));
              endOfSong = false;
              seeking = true;

              // Phase 1: tick until we reach the goal order
              while (g_seq.playing && g_seq.curOrder < loopOrder) {
                seqNextTick();
                if (endOfSong) { endOfSong = false; break; }
              }

              // Phase 2: tick until we reach the goal row within the goal order
              // (matches reference: curRow < goalRow || ticks > 1)
              if (g_seq.playing && g_seq.curOrder == loopOrder && !endOfSong) {
                while (g_seq.playing && (g_seq.curRow < loopRow || g_seq.ticks > 1)) {
                  int oldOrder = g_seq.curOrder;
                  seqNextTick();
                  if (endOfSong) { endOfSong = false; break; }
                  if (g_seq.curOrder != oldOrder) break; // Bxx/Dxx jumped order
                }
              }

              seeking = false;

              // Disable skip-register-writes and force instrument reload
              for (int k = 0; k < numResetHandles; k++) {
                furnace_dispatch_set_skip_writes(resetHandles[k], 0);
                furnace_dispatch_force_ins(resetHandles[k], 0);
              }

              furnace_cmd_log_resume();
              endOfSong = true; // restore for loop handling below

              // Walked array cleared — fresh for next loop detection
              memset(g_seq.walked, 0, sizeof(g_seq.walked));
              didTickSeek = true;
            }
          }
          // Track loop count
          if (g_seq.remainingLoops > 0) {
            g_seq.remainingLoops--;
          }
          g_seq.totalLoops++;
        }
        endOfSong = false;

        if (g_seq.stepPlay == 2) {
          g_seq.stepPlay = 1;
          g_seq.prevOrder = g_seq.curOrder;
          g_seq.prevRow = g_seq.curRow;
        }

        // Process the first row of the loop (dispatches NOTE_ON etc.)
        // Only needed when no tick-level seek was done (loop to 0,0).
        // Tick-level seek already processed the goal row during seeking.
        if (!didTickSeek) {
          seqNextRow();
        }

        // Stop after processing the loop's first row
        if (g_seq.remainingLoops <= 0 && g_seq.remainingLoops != -1) {
          g_seq.playing = false;
        }
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
          int portaResult = dispatchCmd(DIV_CMD_NOTE_PORTA, i, ch.portaSpeed * ((linearPitch && !(ch.note & DIV_NOTE_RAW_FLAG)) ? pitchSlideSpeed : 1), ch.portaNote);
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
                ch.portaNote = 0;
                ch.portaSpeed = -1;
                HINT_PORTA(i, ch.portaNote, ch.portaSpeed);
                ch.stopOnOff = false;
              }
              // Per-platform: some chips reset portamento on note-off
              if (keyOffAffectsPorta(i)) {
                ch.portaNote = 0;
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
          ch.arpTicks = ch.arpSpeed;
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

  // Send NOTE_OFF to all active channels before resetting to prevent stale audio
  if (g_seq.playing || g_seq.numChannels > 0) {
    for (int i = 0; i < g_seq.numChannels; i++) {
      dispatchCmd(DIV_CMD_NOTE_OFF, i);
    }
    g_seq.playing = false;
  }

  g_seq.reset();

  g_seq.numChannels = CLAMP(numChannels, 0, SEQ_MAX_CHANNELS);
  g_seq.patLen = CLAMP(patLen, 1, SEQ_MAX_ROWS);
  g_seq.ordersLen = CLAMP(ordersLen, 1, SEQ_MAX_ORDERS);

  // Initialize channel pools
  for (int ch = 0; ch < g_seq.numChannels; ch++) {
    g_seq.chanPool[ch].init();
  }

  // Reset global state
  firstTick = false;
  endOfSong = false;
  shallStopSched = false;
  seeking = false;

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
void furnace_seq_set_channel_dispatch(int channel, int handle) {
  if (channel < 0 || channel >= g_seq.numChannels) return;
  g_seq.chanDispatchHandle[channel] = handle;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_play(int order, int row) {
  initTables();
  seqSnesFirReset();

  g_seq.curOrder = CLAMP(order, 0, g_seq.ordersLen - 1);
  g_seq.curRow = CLAMP(row, 0, g_seq.patLen - 1);
  g_seq.prevOrder = g_seq.curOrder;
  g_seq.prevRow = g_seq.curRow;
  g_seq.playing = true;
  g_seq.curSpeed = 0;
  g_seq.ticks = 1;  // Force nextRow on first tick
  g_seq.tempoAccum = 0;
  g_seq.changeOrd = -1;
  g_seq.changePos = 0;
  g_seq.nextSpeed = g_seq.speeds.val[0];  // Initialize for first-row delay comparison

  endOfSong = false;
  shallStopSched = false;
  firstTick = false;

  // Clear walked array
  memset(g_seq.walked, 0, sizeof(g_seq.walked));

  // Reset channel state
  for (int i = 0; i < g_seq.numChannels; i++) {
    g_seq.chan[i].reset();
    // Query volMax from dispatch (matches Furnace engine.cpp:2194-2196)
    int vm = dispatchCmd(DIV_CMD_GET_VOLMAX, i);
    if (vm > 0) {
      g_seq.chan[i].volMax = (vm << 8) | 0xff;
    } else {
      g_seq.chan[i].volMax = 0x7f00;  // Default
    }
    g_seq.chan[i].volume = g_seq.chan[i].volMax;
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
  seqSnesFirReset();
  g_seq.curOrder = CLAMP(order, 0, g_seq.ordersLen - 1);
  g_seq.curRow = CLAMP(row, 0, g_seq.patLen - 1);
  g_seq.prevOrder = g_seq.curOrder;
  g_seq.prevRow = g_seq.curRow;
  g_seq.changeOrd = -1;
  g_seq.changePos = 0;
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
void furnace_seq_set_arp_len(int arpLen) {
  g_seq.arpLen = arpLen > 1 ? (uint8_t)arpLen : 1;
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
double furnace_seq_get_divider(void) {
  return g_seq.divider;
}

EMSCRIPTEN_KEEPALIVE
void furnace_seq_set_mute(int channel, bool muted) {
  if (channel < 0 || channel >= SEQ_MAX_CHANNELS) return;
  g_seq.isMuted[channel] = muted;
}

EMSCRIPTEN_KEEPALIVE
int furnace_seq_tick(void) {
  if (!g_seq.playing || g_seq.halted) return (g_seq.curOrder << 16) | g_seq.curRow;

  furnace_cmd_log_tick();
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
