/**
 * FurnaceFileOps.cpp — WASM wrapper for Furnace file parsing/saving
 *
 * Uses Furnace's REAL C++ parser (loadFur/saveFur) compiled to WASM.
 * Exposes a C API for TypeScript to load .fur files and read pattern data.
 *
 * This eliminates all TS parser regressions by using the exact same code
 * as the Furnace CLI — byte-for-byte identical parsing.
 */

#include "engine.h"
#include <cstring>
#include <cstdlib>

// Access private DivEngine members via derived class
class DivEngineAccess: public DivEngine {
public:
  bool doLoadFur(unsigned char* data, size_t len) { return loadFur(data, len); }
  bool doLoad(unsigned char* data, size_t len, const char* nameHint=NULL) { return load(data, len, nameHint); }
  SafeWriter* doSaveFur() { return saveFur(false); }
  void doRegisterSystems() { registerSystems(); }
  void setActive(bool a) { active = a; }
  String getError() { return lastError; }
};

// ============================================================
// Global engine instance — holds the loaded song
// ============================================================
static DivEngineAccess g_engine;
static bool g_initialized = false;
static char g_errorBuf[1024] = {0};

static void ensureInit() {
  if (!g_initialized) {
    g_engine.doRegisterSystems();
    g_engine.setActive(false);  // Skip dispatch init in loadFur
    g_initialized = true;
  }
}

// ============================================================
// C API exports
// ============================================================
extern "C" {

/**
 * Load a .fur file from a memory buffer.
 * Returns 0 on success, -1 on error. Call fur_get_error() for details.
 */
int fur_load(const uint8_t* data, size_t len) {
  ensureInit();

  // load() takes ownership of the buffer and deletes it,
  // so we must provide a copy allocated with new[]
  unsigned char* buf = new unsigned char[len];
  memcpy(buf, data, len);

  // Use load() dispatcher which handles .fur, .dmf, .ftm, and other formats
  bool ok = g_engine.doLoad(buf, len);
  if (!ok) {
    snprintf(g_errorBuf, sizeof(g_errorBuf), "load failed: %s",
             g_engine.getError().c_str());
    return -1;
  }

  g_errorBuf[0] = 0;
  return 0;
}

/**
 * Save the current song as .fur format.
 * Returns pointer to buffer (caller must free with fur_free_buffer).
 * Sets *outLen to buffer size. Returns NULL on error.
 */
uint8_t* fur_save(size_t* outLen) {
  ensureInit();
  *outLen = 0;

  SafeWriter* w = g_engine.doSaveFur();
  if (!w) {
    snprintf(g_errorBuf, sizeof(g_errorBuf), "saveFur failed");
    return NULL;
  }

  size_t sz = w->size();
  uint8_t* result = (uint8_t*)malloc(sz);
  if (!result) {
    delete w;
    return NULL;
  }
  memcpy(result, w->getFinalBuf(), sz);
  *outLen = sz;
  delete w;
  return result;
}

void fur_free_buffer(uint8_t* buf) {
  free(buf);
}

const char* fur_get_error() {
  return g_errorBuf;
}

// ============================================================
// Song metadata
// ============================================================

int fur_get_num_subsongs() {
  return (int)g_engine.song.subsong.size();
}

int fur_get_num_channels() {
  return g_engine.song.chans;
}

int fur_get_num_instruments() {
  return (int)g_engine.song.ins.size();
}

int fur_get_num_samples() {
  return (int)g_engine.song.sample.size();
}

int fur_get_num_wavetables() {
  return (int)g_engine.song.wave.size();
}

int fur_get_system_len() {
  return g_engine.song.systemLen;
}

int fur_get_system_id(int idx) {
  if (idx < 0 || idx >= g_engine.song.systemLen) return 0;
  return (int)g_engine.song.system[idx];
}

int fur_get_system_channels(int idx) {
  if (idx < 0 || idx >= g_engine.song.systemLen) return 0;
  return g_engine.song.systemChans[idx];
}

/**
 * Get system flags as a string (key=value\n format).
 * Returns pointer to internal buffer — valid until next call.
 */
static char g_flagsBuf[4096];
const char* fur_get_system_flags(int idx) {
  if (idx < 0 || idx >= g_engine.song.systemLen) return "";
  String s = g_engine.song.systemFlags[idx].toString();
  strncpy(g_flagsBuf, s.c_str(), sizeof(g_flagsBuf) - 1);
  g_flagsBuf[sizeof(g_flagsBuf) - 1] = 0;
  return g_flagsBuf;
}

// ============================================================
// Subsong metadata
// ============================================================

int fur_get_pat_len(int subsong) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 0;
  return g_engine.song.subsong[subsong]->patLen;
}

int fur_get_orders_len(int subsong) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 0;
  return g_engine.song.subsong[subsong]->ordersLen;
}

int fur_get_effect_cols(int subsong, int chan) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 1;
  if (chan < 0 || chan >= DIV_MAX_CHANS) return 1;
  return g_engine.song.subsong[subsong]->pat[chan].effectCols;
}

int fur_get_speed(int subsong, int which) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 6;
  if (which < 0 || which >= (int)g_engine.song.subsong[subsong]->speeds.len) return 6;
  return g_engine.song.subsong[subsong]->speeds.val[which];
}

int fur_get_tempo(int subsong) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 150;
  return (int)g_engine.song.subsong[subsong]->virtualTempoN;
}

float fur_get_hz(int subsong) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 60.0f;
  return g_engine.song.subsong[subsong]->hz;
}

int fur_get_virtual_tempo(int subsong, int which) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 150;
  if (which == 0) return g_engine.song.subsong[subsong]->virtualTempoN;
  return g_engine.song.subsong[subsong]->virtualTempoD;
}

int fur_get_groove(int subsong, int grooveIdx, int pos) {
  if (grooveIdx < 0 || grooveIdx >= (int)g_engine.song.grooves.size()) return -1;
  if (pos < 0 || pos >= (int)g_engine.song.grooves[grooveIdx].len) return -1;
  return g_engine.song.grooves[grooveIdx].val[pos];
}

// ============================================================
// Song name/author
// ============================================================
static char g_nameBuf[1024];

const char* fur_get_song_name() {
  strncpy(g_nameBuf, g_engine.song.name.c_str(), sizeof(g_nameBuf) - 1);
  g_nameBuf[sizeof(g_nameBuf) - 1] = 0;
  return g_nameBuf;
}

const char* fur_get_song_author() {
  strncpy(g_nameBuf, g_engine.song.author.c_str(), sizeof(g_nameBuf) - 1);
  g_nameBuf[sizeof(g_nameBuf) - 1] = 0;
  return g_nameBuf;
}

const char* fur_get_subsong_name(int subsong) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return "";
  strncpy(g_nameBuf, g_engine.song.subsong[subsong]->name.c_str(), sizeof(g_nameBuf) - 1);
  g_nameBuf[sizeof(g_nameBuf) - 1] = 0;
  return g_nameBuf;
}

const char* fur_get_channel_name(int subsong, int chan) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return "";
  if (chan < 0 || chan >= DIV_MAX_CHANS) return "";
  strncpy(g_nameBuf, g_engine.song.subsong[subsong]->chanName[chan].c_str(), sizeof(g_nameBuf) - 1);
  g_nameBuf[sizeof(g_nameBuf) - 1] = 0;
  return g_nameBuf;
}

// ============================================================
// Pattern data access
// ============================================================

int fur_get_order(int subsong, int chan, int pos) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 0;
  if (chan < 0 || chan >= DIV_MAX_CHANS) return 0;
  if (pos < 0 || pos >= DIV_MAX_PATTERNS) return 0;
  return g_engine.song.subsong[subsong]->orders.ord[chan][pos];
}

/**
 * Get a pattern cell value.
 * col layout: 0=note, 1=octave, 2=ins, 3=vol,
 *             4=fx0cmd, 5=fx0val, 6=fx1cmd, 7=fx1val, ...
 *
 * Returns the raw short value from DivPattern::data[row][col].
 * Returns -2 on invalid args.
 */
int fur_get_cell(int subsong, int chan, int pat, int row, int col) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return -2;
  if (chan < 0 || chan >= DIV_MAX_CHANS) return -2;
  if (pat < 0 || pat >= DIV_MAX_PATTERNS) return -2;

  DivSubSong* sub = g_engine.song.subsong[subsong];
  DivPattern* p = sub->pat[chan].getPattern(pat, false);
  if (!p) return -2;
  if (row < 0 || row >= sub->patLen) return -2;
  if (col < 0 || col >= (2 + sub->pat[chan].effectCols * 2 + 2)) return -2;

  return p->newData[row][col];
}

/**
 * Set a pattern cell value (for editing).
 */
void fur_set_cell(int subsong, int chan, int pat, int row, int col, int val) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return;
  if (chan < 0 || chan >= DIV_MAX_CHANS) return;
  if (pat < 0 || pat >= DIV_MAX_PATTERNS) return;

  DivSubSong* sub = g_engine.song.subsong[subsong];
  DivPattern* p = sub->pat[chan].getPattern(pat, true);  // create=true
  if (!p) return;
  if (row < 0 || row >= sub->patLen) return;

  p->newData[row][col] = (short)val;
}

// ============================================================
// Compat flags (for sequencer setup)
// ============================================================

/**
 * Get dispatch compat flags as raw struct bytes.
 * Returns pointer to DivCompatFlags struct (valid until next fur_load).
 * Use fur_get_dispatch_compat_flags_size() to get byte count.
 */
const void* fur_get_dispatch_compat_flags() {
  return &g_engine.song.compatFlags;
}

int fur_get_dispatch_compat_flags_size() {
  return (int)sizeof(DivCompatFlags);
}

/**
 * Get A-4 tuning frequency in Hz (default 440.0).
 */
float fur_get_tuning() {
  return g_engine.song.tuning;
}

/**
 * Get master volume (float, default 1.0; old format default 2.0).
 */
float fur_get_master_vol() {
  return g_engine.song.masterVol;
}

/**
 * Get per-system volume (float, 0.0-1.0+).
 * idx = system slot index (0-based).
 */
float fur_get_system_vol(int idx) {
  if (idx < 0 || idx >= g_engine.song.systemLen) return 1.0f;
  return g_engine.song.systemVol[idx];
}

/**
 * Get per-system panning (float, -1.0..+1.0, 0=center).
 * idx = system slot index.
 */
float fur_get_system_pan(int idx) {
  if (idx < 0 || idx >= g_engine.song.systemLen) return 0.0f;
  return g_engine.song.systemPan[idx];
}

/**
 * Get per-system front/rear panning (float, -1.0..+1.0, 0=center).
 * idx = system slot index.
 */
float fur_get_system_pan_fr(int idx) {
  if (idx < 0 || idx >= g_engine.song.systemLen) return 0.0f;
  return g_engine.song.systemPanFR[idx];
}

/**
 * Get compat flags pre-packed into the WASM sequencer's bitmask format.
 * which=0: flags (uint32 bitmask), which=1: flagsExt (uint32 packed multi-bit),
 * which=2: pitchSlideSpeed (int)
 *
 * This packs DivCompatFlags directly into the same format that
 * furnace_seq_set_compat_flags() expects — no TS intermediary needed.
 */
int fur_get_packed_compat_flags(int which) {
  const DivCompatFlags& cf = g_engine.song.compatFlags;

  if (which == 0) {
    // Primary bitmask — matches SEQ_COMPAT_* defines in FurnaceSequencer.h
    uint32_t flags = 0;
    if (cf.limitSlides)            flags |= (1u << 0);
    if (cf.properNoiseLayout)      flags |= (1u << 1);
    if (cf.waveDutyIsVol)          flags |= (1u << 2);
    if (cf.resetMacroOnPorta)      flags |= (1u << 3);
    if (cf.legacyVolumeSlides)     flags |= (1u << 4);
    if (cf.compatibleArpeggio)     flags |= (1u << 5);
    if (cf.noteOffResetsSlides)    flags |= (1u << 6);
    if (cf.targetResetsSlides)     flags |= (1u << 7);
    if (cf.arpNonPorta)            flags |= (1u << 8);
    if (cf.algMacroBehavior)       flags |= (1u << 9);
    if (cf.brokenShortcutSlides)   flags |= (1u << 10);
    if (cf.ignoreDuplicateSlides)  flags |= (1u << 11);
    if (cf.stopPortaOnNoteOff)     flags |= (1u << 12);
    if (cf.continuousVibrato)      flags |= (1u << 13);
    if (cf.oneTickCut)             flags |= (1u << 14);
    if (cf.newInsTriggersInPorta)  flags |= (1u << 15);
    if (cf.arp0Reset)              flags |= (1u << 16);
    if (cf.noSlidesOnFirstTick)    flags |= (1u << 17);
    if (cf.brokenPortaLegato)      flags |= (1u << 18);
    if (cf.buggyPortaAfterSlide)   flags |= (1u << 19);
    if (cf.ignoreJumpAtEnd)        flags |= (1u << 20);
    if (cf.brokenSpeedSel)         flags |= (1u << 21);
    if (cf.e1e2StopOnSameNote)     flags |= (1u << 22);
    if (cf.e1e2AlsoTakePriority)   flags |= (1u << 23);
    if (cf.rowResetsArpPos)        flags |= (1u << 24);
    if (cf.oldSampleOffset)        flags |= (1u << 25);
    if (cf.noVolSlideReset)        flags |= (1u << 26);
    if (cf.resetArpPhaseOnNewNote) flags |= (1u << 27);
    if (cf.oldAlwaysSetVolume)     flags |= (1u << 28);
    if (cf.preNoteNoEffect)        flags |= (1u << 29);
    return (int)flags;
  }
  else if (which == 1) {
    // Extended flags — multi-bit values packed into uint32
    uint32_t ext = 0;
    ext |= ((uint32_t)cf.linearPitch & 0x3u)     << 0;   // bits 0-1
    // bits 2-3 reserved for pitchSlideSpeed (but it's passed separately)
    ext |= ((uint32_t)cf.loopModality & 0x3u)     << 4;   // bits 4-5
    ext |= ((uint32_t)cf.delayBehavior & 0x3u)    << 6;   // bits 6-7
    ext |= ((uint32_t)cf.jumpTreatment & 0x3u)    << 8;   // bits 8-9
    return (int)ext;
  }
  else if (which == 2) {
    // pitchSlideSpeed — full 0-255 range
    return (int)cf.pitchSlideSpeed;
  }
  return 0;
}

/**
 * Get speed pattern length. Returns 0 if using speed1/speed2.
 */
int fur_get_speed_len(int subsong) {
  if (subsong < 0 || subsong >= (int)g_engine.song.subsong.size()) return 0;
  return g_engine.song.subsong[subsong]->speeds.len;
}

// ============================================================
// Instrument data access
// ============================================================

/**
 * Get instrument binary data (INS2 format).
 * Writes to the provided buffer. Returns bytes written, or -1 on error.
 * If buf is NULL, returns required size.
 */
int fur_get_ins_data(int idx, uint8_t* buf, size_t bufLen) {
  if (idx < 0 || idx >= (int)g_engine.song.ins.size()) return -1;
  DivInstrument* ins = g_engine.song.ins[idx];
  if (!ins) return -1;

  SafeWriter w;
  w.init();
  ins->putInsData2(&w, false, NULL, true);

  size_t sz = w.size();
  if (!buf) return (int)sz;
  if (bufLen < sz) return -1;
  memcpy(buf, w.getFinalBuf(), sz);
  w.finish();
  return (int)sz;
}

// ============================================================
// Sample data access
// ============================================================

/**
 * Get sample info.
 * Returns sample info packed as: [centerRate, loopStart, loopEnd, depth, loop, samples]
 */
int fur_get_sample_info(int idx, int field) {
  if (idx < 0 || idx >= (int)g_engine.song.sample.size()) return 0;
  DivSample* s = g_engine.song.sample[idx];
  if (!s) return 0;
  switch (field) {
    case 0: return s->centerRate;
    case 1: return s->loopStart;
    case 2: return s->loopEnd;
    case 3: return (int)s->depth;
    case 4: return s->loop ? 1 : 0;
    case 5: return (int)s->samples;
    case 6: return (int)s->getCurBufLen();
    default: return 0;
  }
}

/**
 * Get sample data pointer and length.
 * Returns pointer to the sample's current depth buffer.
 * Sets *outLen to byte length.
 */
const void* fur_get_sample_data(int idx, size_t* outLen) {
  if (idx < 0 || idx >= (int)g_engine.song.sample.size()) { *outLen = 0; return NULL; }
  DivSample* s = g_engine.song.sample[idx];
  if (!s) { *outLen = 0; return NULL; }
  *outLen = s->getCurBufLen();
  return s->getCurBuf();
}

// ============================================================
// Wavetable data access
// ============================================================

int fur_get_wave_info(int idx, int field) {
  if (idx < 0 || idx >= (int)g_engine.song.wave.size()) return 0;
  DivWavetable* w = g_engine.song.wave[idx];
  if (!w) return 0;
  switch (field) {
    case 0: return w->len;
    case 1: return w->min;
    case 2: return w->max;
    default: return 0;
  }
}

/**
 * Get wavetable data at position.
 */
int fur_get_wave_data(int idx, int pos) {
  if (idx < 0 || idx >= (int)g_engine.song.wave.size()) return 0;
  DivWavetable* w = g_engine.song.wave[idx];
  if (!w || pos < 0 || pos >= w->len) return 0;
  return w->data[pos];
}

} // extern "C"
