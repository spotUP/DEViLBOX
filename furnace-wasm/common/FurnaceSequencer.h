#pragma once

/**
 * FurnaceSequencer.h - Sequencer state and API for Furnace WASM dispatch
 *
 * Mirrors Furnace's DivEngine playback logic (engine.h, song.h, pattern.h,
 * orders.h, defines.h) as a flat C-compatible struct suitable for running
 * inside an AudioWorklet alongside chip dispatch.
 *
 * Copyright (C) 2021-2026 tildearrow and contributors (original Furnace)
 * DEViLBOX WASM adaptation - same GPL-2.0-or-later license.
 */

#include <cstdint>
#include <cstring>

// ============================================================
// Constants (from Furnace defines.h)
// ============================================================

#define SEQ_MAX_CHANNELS  128
#define SEQ_MAX_ROWS      256
#define SEQ_MAX_PATTERNS  256
#define SEQ_MAX_ORDERS    256
#define SEQ_MAX_EFFECTS   8
#define SEQ_MAX_COLS      32   // 3 + MAX_EFFECTS*2 = 19, but Furnace uses 32
#define SEQ_MAX_GROOVE    16

// ============================================================
// Pattern column index macros (matches DivPattern.newData layout)
// ============================================================

#define SEQ_PAT_NOTE       0
#define SEQ_PAT_INS        1
#define SEQ_PAT_VOL        2
#define SEQ_PAT_FX(i)      (3 + ((i) << 1))
#define SEQ_PAT_FXVAL(i)   (4 + ((i) << 1))

// Column type checks (mirrors defines.h)
#define SEQ_PAT_IS_EFFECT(x)     ((x) > SEQ_PAT_VOL && ((x) & 1))
#define SEQ_PAT_IS_EFFECT_VAL(x) ((x) > SEQ_PAT_VOL && (!((x) & 1)))

// ============================================================
// Special note values (from Furnace defines.h)
// ============================================================

#define SEQ_NOTE_EMPTY         (-1)
#define SEQ_NOTE_NULL          252   // DIV_NOTE_NULL_PAT
#define SEQ_NOTE_OFF           253   // DIV_NOTE_OFF
#define SEQ_NOTE_RELEASE       254   // DIV_NOTE_REL
#define SEQ_NOTE_MACRO_RELEASE 255   // DIV_MACRO_REL

// ============================================================
// Compatibility flags bitfield
// Mirrors DivCompatFlags (song.h:187-276).
// Stored as a uint32_t bitfield for efficient WASM transfer.
// ============================================================

#define SEQ_COMPAT_LIMIT_SLIDES            (1u << 0)
#define SEQ_COMPAT_PROPER_NOISE_LAYOUT     (1u << 1)
#define SEQ_COMPAT_WAVE_DUTY_IS_VOL        (1u << 2)
#define SEQ_COMPAT_RESET_MACRO_ON_PORTA    (1u << 3)
#define SEQ_COMPAT_LEGACY_VOLUME_SLIDES    (1u << 4)
#define SEQ_COMPAT_COMPATIBLE_ARPEGGIO     (1u << 5)
#define SEQ_COMPAT_NOTE_OFF_RESETS_SLIDES  (1u << 6)
#define SEQ_COMPAT_TARGET_RESETS_SLIDES    (1u << 7)
#define SEQ_COMPAT_ARP_NON_PORTA          (1u << 8)
#define SEQ_COMPAT_ALG_MACRO_BEHAVIOR     (1u << 9)
#define SEQ_COMPAT_BROKEN_SHORTCUT_SLIDES (1u << 10)
#define SEQ_COMPAT_IGNORE_DUPLICATE_SLIDES (1u << 11)
#define SEQ_COMPAT_STOP_PORTA_ON_NOTE_OFF (1u << 12)
#define SEQ_COMPAT_CONTINUOUS_VIBRATO     (1u << 13)
#define SEQ_COMPAT_ONE_TICK_CUT           (1u << 14)
#define SEQ_COMPAT_NEW_INS_TRIGGERS_IN_PORTA (1u << 15)
#define SEQ_COMPAT_ARP0_RESET             (1u << 16)
#define SEQ_COMPAT_NO_SLIDES_ON_FIRST_TICK (1u << 17)
#define SEQ_COMPAT_BROKEN_PORTA_LEGATO    (1u << 18)
#define SEQ_COMPAT_BUGGY_PORTA_AFTER_SLIDE (1u << 19)
#define SEQ_COMPAT_IGNORE_JUMP_AT_END    (1u << 20)
#define SEQ_COMPAT_BROKEN_SPEED_SEL      (1u << 21)
#define SEQ_COMPAT_E1E2_STOP_ON_SAME_NOTE (1u << 22)
#define SEQ_COMPAT_E1E2_ALSO_TAKE_PRIORITY (1u << 23)
#define SEQ_COMPAT_ROW_RESETS_ARP_POS    (1u << 24)
#define SEQ_COMPAT_OLD_SAMPLE_OFFSET     (1u << 25)
#define SEQ_COMPAT_NO_VOL_SLIDE_RESET    (1u << 26)
#define SEQ_COMPAT_RESET_ARP_PHASE_ON_NEW_NOTE (1u << 27)
#define SEQ_COMPAT_OLD_ALWAYS_SET_VOLUME      (1u << 28)
#define SEQ_COMPAT_PRE_NOTE_NO_EFFECT         (1u << 29)

// Extended compat flags (second word) for fields needing >1 bit
// linearPitch (0-2), pitchSlideSpeed (0-2), loopModality (0-2),
// delayBehavior (0-2), jumpTreatment (0-2)
#define SEQ_COMPAT_EXT_LINEAR_PITCH_SHIFT      0
#define SEQ_COMPAT_EXT_LINEAR_PITCH_MASK       0x3u
#define SEQ_COMPAT_EXT_PITCH_SLIDE_SPEED_SHIFT 2
#define SEQ_COMPAT_EXT_PITCH_SLIDE_SPEED_MASK  0x3u
#define SEQ_COMPAT_EXT_LOOP_MODALITY_SHIFT     4
#define SEQ_COMPAT_EXT_LOOP_MODALITY_MASK      0x3u
#define SEQ_COMPAT_EXT_DELAY_BEHAVIOR_SHIFT    6
#define SEQ_COMPAT_EXT_DELAY_BEHAVIOR_MASK     0x3u
#define SEQ_COMPAT_EXT_JUMP_TREATMENT_SHIFT    8
#define SEQ_COMPAT_EXT_JUMP_TREATMENT_MASK     0x3u

// ============================================================
// SeqChannelState - mirrors DivChannelState (engine.h:159-244)
// ============================================================

struct SeqChannelState {
  // Note and instrument state
  int note;
  int oldNote;
  int lastIns;
  int pitch;
  int portaSpeed;
  int portaNote;

  // Volume state
  int volume;
  int volSpeed;
  int volSpeedTarget;
  int volMax;

  // Cut / delay / retrigger
  int cut;
  int volCut;
  int legatoDelay;
  int legatoTarget;
  int rowDelay;
  int delayOrder;
  int delayRow;
  int retrigSpeed;
  int retrigTick;

  // Vibrato state
  int vibratoDepth;
  int vibratoRate;
  int vibratoPos;
  int vibratoPosGiant;
  int vibratoShape;
  int vibratoFine;

  // Tremolo state
  int tremoloDepth;
  int tremoloRate;
  int tremoloPos;

  // Panning state
  int panDepth;
  int panRate;
  int panPos;
  int panSpeed;

  // Sample offset
  int sampleOff;

  // Byte-sized fields
  uint8_t arp;
  uint8_t arpStage;
  uint8_t arpTicks;
  uint8_t panL;
  uint8_t panR;
  uint8_t panRL;
  uint8_t panRR;
  uint8_t lastVibrato;
  uint8_t lastPorta;
  uint8_t cutType;

  // Boolean flags (packed for alignment)
  bool doNote;
  bool legato;
  bool portaStop;
  bool keyOn;
  bool keyOff;
  bool stopOnOff;
  bool releasing;
  bool arpYield;
  bool delayLocked;
  bool inPorta;
  bool scheduledSlideReset;
  bool shorthandPorta;
  bool wasShorthandPorta;
  bool noteOnInhibit;
  bool resetArp;
  bool sampleOffSet;
  bool wentThroughNote;
  bool goneThroughNote;
  bool midiAftertouch;

  void reset() {
    note = -1;
    oldNote = -1;
    lastIns = -1;
    pitch = 0;
    portaSpeed = -1;
    portaNote = -1;
    volume = 0x7f00;
    volSpeed = 0;
    volSpeedTarget = -1;
    volMax = 0;
    cut = -1;
    volCut = -1;
    legatoDelay = -1;
    legatoTarget = 0;
    rowDelay = 0;
    delayOrder = 0;
    delayRow = 0;
    retrigSpeed = 0;
    retrigTick = 0;
    vibratoDepth = 0;
    vibratoRate = 0;
    vibratoPos = 0;
    vibratoPosGiant = 0;
    vibratoShape = 0;
    vibratoFine = 15;
    tremoloDepth = 0;
    tremoloRate = 0;
    tremoloPos = 0;
    panDepth = 0;
    panRate = 0;
    panPos = 0;
    panSpeed = 0;
    sampleOff = 0;
    arp = 0;
    arpStage = 0xff; // -1 as unsigned
    arpTicks = 1;
    panL = 255;
    panR = 255;
    panRL = 0;
    panRR = 0;
    lastVibrato = 0;
    lastPorta = 0;
    cutType = 0;
    doNote = false;
    legato = false;
    portaStop = false;
    keyOn = false;
    keyOff = false;
    stopOnOff = false;
    releasing = false;
    arpYield = false;
    delayLocked = false;
    inPorta = false;
    scheduledSlideReset = false;
    shorthandPorta = false;
    wasShorthandPorta = false;
    noteOnInhibit = false;
    resetArp = false;
    sampleOffSet = false;
    wentThroughNote = false;
    goneThroughNote = false;
    midiAftertouch = false;
  }
};

// ============================================================
// SeqPatternData - flat array storage for one pattern
// Mirrors DivPattern.newData[MAX_ROWS][MAX_COLS] as short*
// ============================================================

struct SeqPatternData {
  short* data;       // flat array: data[row * SEQ_MAX_COLS + col]
  int    maxCols;    // active columns (3 + effectCols*2)
  bool   allocated;

  void clear() {
    if (data) {
      for (int i = 0; i < SEQ_MAX_ROWS * SEQ_MAX_COLS; i++) {
        data[i] = -1;  // empty cell
      }
    }
  }
};

// ============================================================
// SeqChannelPool - array of 256 patterns + effectCols for one channel
// Mirrors DivChannelData (pattern.h:61-96)
// ============================================================

struct SeqChannelPool {
  SeqPatternData pat[SEQ_MAX_PATTERNS];
  uint8_t effectCols;  // number of effect columns (1-8)

  void init() {
    effectCols = 1;
    for (int i = 0; i < SEQ_MAX_PATTERNS; i++) {
      pat[i].data = nullptr;
      pat[i].maxCols = 0;
      pat[i].allocated = false;
    }
  }
};

// ============================================================
// SeqGroovePattern - mirrors DivGroovePattern (song.h:61-73)
// ============================================================

struct SeqGroovePattern {
  uint16_t val[SEQ_MAX_GROOVE];
  uint16_t len;

  void reset() {
    len = 1;
    for (int i = 0; i < SEQ_MAX_GROOVE; i++) {
      val[i] = 6;
    }
  }
};

// ============================================================
// FurnaceSequencer - main sequencer state
// ============================================================

struct FurnaceSequencer {
  // --- Song structure ---
  int numChannels;
  int patLen;        // rows per pattern (default 64)
  int ordersLen;     // number of orders (default 1)

  // Order table: orders[channel][order] = pattern index
  uint8_t orders[SEQ_MAX_CHANNELS][SEQ_MAX_ORDERS];

  // Per-channel pattern pools
  SeqChannelPool chanPool[SEQ_MAX_CHANNELS];

  // --- Playback state ---
  bool playing;
  int  curRow;
  int  curOrder;
  int  prevRow;
  int  prevOrder;
  int  nextSpeed;
  int  prevSpeed;
  int  curSpeed;

  // Tick counters
  int  ticks;
  int  subticks;
  int  stepPlay;     // >0 = step-play mode (N rows then stop)

  // --- Tempo / timing ---
  SeqGroovePattern speeds;      // groove-based speed
  int16_t virtualTempoN;        // virtual tempo numerator (default 150)
  int16_t virtualTempoD;        // virtual tempo denominator (default 150)
  int16_t tempoAccum;           // fractional tick accumulator
  double  divider;              // tick rate divider (default 60.0)
  double  sampleRate;           // audio sample rate (e.g. 44100)

  // --- Groove state ---
  // groovePos removed — groove cycling uses curSpeed to index speeds.val[]
  bool useGroove;               // true if speeds is a groove pattern (len>1)

  // --- Groove bank (for 09xx effect) ---
  SeqGroovePattern grooves[256];
  int  numGrooves;

  // --- Repeat pattern flag ---
  bool repeatPattern;

  // --- Debug halt state (from Furnace debug menu) ---
  // haltOn: 0=none, 1=pattern, 2=row, 3=tick
  int  haltOn;
  bool halted;

  // --- Order jump state ---
  int  changeOrd;               // pending order jump (-1 = none)
  int  changePos;               // pending row jump (-1 = none)

  // --- Loop detection ---
  // Bitfield: walked[order*256 + row] bit set = visited
  // 8192 bytes = 65536 bits = 256 orders * 256 rows
  uint8_t walked[8192];

  // --- Remaining loops ---
  int remainingLoops;
  int totalLoops;

  // --- Compatibility flags ---
  uint32_t compatFlags;         // boolean compat flags (SEQ_COMPAT_*)
  uint32_t compatFlagsExt;      // multi-value compat fields (SEQ_COMPAT_EXT_*)
  uint8_t  pitchSlideSpeedFull; // full-range pitchSlideSpeed (0-255, default 4)

  // --- Per-channel playback state ---
  SeqChannelState chan[SEQ_MAX_CHANNELS];
  bool isMuted[SEQ_MAX_CHANNELS];

  // --- Key hit flags (one-frame pulse for GUI visualizers) ---
  bool keyHit[SEQ_MAX_CHANNELS];

  // --- Per-channel chip type (for platform-specific behavior) ---
  // Furnace DIV_SYSTEM_* enum values, set via furnace_seq_set_channel_chip().
  uint16_t chanChipId[SEQ_MAX_CHANNELS];
  // Sub-channel index within the chip (e.g., Genesis ch 0-5 = FM, 6-8 = PSG)
  uint8_t chanSubIdx[SEQ_MAX_CHANNELS];

  // --- Dispatch handles ---
  // Per-channel dispatch handle for multi-chip routing.
  // Set via furnace_seq_set_channel_dispatch().
  // Falls back to dispatchHandle for channels without a per-channel handle.
  void* dispatchHandle;                        // legacy single handle
  int chanDispatchHandle[SEQ_MAX_CHANNELS];    // per-channel dispatch handle (0 = use legacy)

  // --- Reset all state ---
  void reset() {
    numChannels = 0;
    patLen = 64;
    ordersLen = 1;
    memset(orders, 0, sizeof(orders));

    playing = false;
    curRow = 0;
    curOrder = 0;
    prevRow = 0;
    prevOrder = 0;
    nextSpeed = 0;
    prevSpeed = 0;
    curSpeed = 0;
    ticks = 0;
    subticks = 0;
    stepPlay = 0;

    speeds.reset();
    virtualTempoN = 150;
    virtualTempoD = 150;
    tempoAccum = 0;
    divider = 60.0;
    sampleRate = 44100.0;

    // groovePos removed
    useGroove = false;
    numGrooves = 0;
    repeatPattern = false;
    haltOn = 0;
    halted = false;
    for (int g = 0; g < 256; g++) grooves[g].reset();

    changeOrd = -1;
    changePos = -1;

    memset(walked, 0, sizeof(walked));
    remainingLoops = -1;
    totalLoops = 0;

    compatFlags = 0;
    compatFlagsExt = 0;
    pitchSlideSpeedFull = 4; // Default matches Furnace song.cpp:1114

    for (int i = 0; i < SEQ_MAX_CHANNELS; i++) {
      chan[i].reset();
      isMuted[i] = false;
      keyHit[i] = false;
      chanPool[i].init();
      chanChipId[i] = 0;
      chanSubIdx[i] = 0;
    }

    dispatchHandle = nullptr;
    memset(chanDispatchHandle, 0, sizeof(chanDispatchHandle));
  }
};

// ============================================================
// WASM-exported C API
// ============================================================

#ifdef __cplusplus
extern "C" {
#endif

// --- Song management ---

// Initialize sequencer state. Must be called before any other function.
void furnace_seq_load_song(int numChannels, int patLen, int ordersLen);

// Set a single cell in a pattern.
// channel: 0..127, patIndex: 0..255, row: 0..255, col: column index (use SEQ_PAT_* macros)
void furnace_seq_set_cell(int channel, int patIndex, int row, int col, short value);

// Set an order table entry.
// channel: 0..127, order: 0..255, patIndex: pattern index for that order
void furnace_seq_set_order(int channel, int order, uint8_t patIndex);

// Set the number of effect columns for a channel.
void furnace_seq_set_effect_cols(int channel, int effectCols);

// Register an instrument (opaque index for dispatch).
void furnace_seq_set_ins(int index, int type);

// Register a sample (opaque index for dispatch).
void furnace_seq_set_sample(int index, int length);

// --- Transport ---

// Start playback from the given order and row.
void furnace_seq_play(int order, int row);

// Stop playback and reset position.
void furnace_seq_stop(void);

// Seek to a specific order and row without stopping.
void furnace_seq_seek(int order, int row);

// --- Configuration ---

// Set speed values (up to 2 speeds for alternating tick mode).
void furnace_seq_set_speed(int speed1, int speed2);

// Set virtual tempo numerator and denominator.
void furnace_seq_set_tempo(int tempoN, int tempoD);

// Set groove pattern (array of up to SEQ_MAX_GROOVE speed values).
void furnace_seq_set_groove(const uint16_t* values, int len);

// Set compatibility flags (bitfield).
void furnace_seq_set_compat_flags(uint32_t flags, uint32_t flagsExt, int pitchSlideSpeed);

// Set a groove pattern in the groove bank (for 09xx effect).
void furnace_seq_set_groove_entry(int index, const uint16_t* values, int len);

// Set repeat pattern mode.
void furnace_seq_set_repeat_pattern(bool repeat);

// Set per-channel chip type and sub-channel index.
void furnace_seq_set_channel_chip(int channel, int chipId, int subIdx);

// Set per-channel dispatch handle for multi-chip routing.
void furnace_seq_set_channel_dispatch(int channel, int handle);

// Set pattern length (rows per pattern).
void furnace_seq_set_pat_len(int patLen);

// Set the dispatch handle for issuing chip commands.
void furnace_seq_set_dispatch_handle(void* handle);

// Set the audio sample rate (needed for timing calculations).
void furnace_seq_set_sample_rate(double sampleRate);

// Set divider (tick rate, default 60.0).
void furnace_seq_set_divider(double divider);

// Get current divider (may change mid-song via effects 0xC0-0xC3/0xF0).
double furnace_seq_get_divider(void);

// Mute/unmute a channel.
void furnace_seq_set_mute(int channel, bool muted);

// --- Per-tick processing ---

// Advance the sequencer by one tick. Processes pattern data and issues
// dispatch commands. Returns packed position: (order << 16) | row.
// Call this once per engine tick from the audio thread.
int furnace_seq_tick(void);

// Query current playback position.
int furnace_seq_get_order(void);
int furnace_seq_get_row(void);
bool furnace_seq_is_playing(void);

// Query key-hit flag for a channel (one-frame pulse, set on note-on/retrigger).
// Returns true once per note trigger, then auto-clears on next tick.
bool furnace_seq_get_key_hit(int channel);

#ifdef __cplusplus
} // extern "C"
#endif
