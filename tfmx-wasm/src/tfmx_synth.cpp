/**
 * tfmx_synth.cpp — Thin WASM wrapper for TFMX per-note synthesis
 *
 * Wraps libtfmxaudiodecoder to provide per-instrument, per-note triggering.
 * Each player instance owns one tfmxdec* decoder.
 *
 * On load_instrument: receives a blob containing all SndModSeqs, the target
 * VolModSeq, and the PCM sample bank. Constructs a minimal valid TFMX module
 * in memory (header + 1 VolModSeq + all SndModSeqs + 1 pattern + 1 track step
 * + sample headers + sample data).
 *
 * On note_on: updates the single pattern row with the requested note index,
 * then calls tfmxdec_init() to reinitialize the decoder with the updated module.
 *
 * On note_off: mutes voice 0 of the decoder and stops rendering.
 *
 * Binary blob format for tfmx_load_instrument():
 *   [0..3]:   sndSeqsCount  u32LE
 *   [4..7]:   sampleCount   u32LE
 *   [8..11]:  sampleDataLen u32LE
 *   [12 .. 12+64*sndSeqsCount-1]:         sndModSeqData
 *   [12+64*sndSeqsCount .. +63]:           volModSeqData (64 bytes)
 *   [12+64*sndSeqsCount+64 .. +30*sampleCount-1]:  sampleHeaders
 *   [12+64*sndSeqsCount+64+30*sampleCount ..]:      sampleData
 *
 * Minimal TFMX module layout built in memory:
 *   [0x00..0x1F]: header (TFMX magic + counts)
 *   [0x20 .. +64*sndSeqsCount]: SndModSeqs
 *   [+64]:  VolModSeq (1 only)
 *   [+64]:  Pattern (64 bytes, 32 rows × 2 bytes)
 *   [+12]:  TrackTable (1 step, 4 voices × 3 bytes)
 *   [+12]:  SubSongTable (2 entries × 6 bytes)
 *   [+30*sampleCount]: SampleHeaders
 *   [..]:   SampleData
 */

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// libtfmxaudiodecoder C API
#include "tfmxaudiodecoder.h"

#define MAX_PLAYERS          16
#define TFMX_SEQ_SIZE        64
#define TFMX_SAMPLE_HDR_SIZE 30
#define TFMX_TRACKTAB_STEP   12   // 4 voices × 3 bytes
#define TFMX_SONGTAB_ENTRY    6   // firstStep u16 + lastStep u16 + speed u16
#define TFMX_PATTERN_BYTES   64   // 32 rows × 2 bytes each

// ── Helpers ──────────────────────────────────────────────────────────────────

static inline void writeU16BE(uint8_t* buf, int off, uint16_t v) {
  buf[off]   = (uint8_t)((v >> 8) & 0xFF);
  buf[off+1] = (uint8_t)(v & 0xFF);
}

static inline uint32_t readU32LE(const uint8_t* buf, int off) {
  return (uint32_t)buf[off]
       | ((uint32_t)buf[off+1] << 8)
       | ((uint32_t)buf[off+2] << 16)
       | ((uint32_t)buf[off+3] << 24);
}

// ── Player state ─────────────────────────────────────────────────────────────

struct TFMXPlayer {
  void*    decoder;      // tfmxdec* from tfmxdec_new()
  uint8_t* miniMod;      // full minimal TFMX module buffer
  uint32_t miniModLen;
  uint32_t patternOff;   // byte offset of pattern data within miniMod
  bool     active;       // true = playing (note is on)
  bool     loaded;       // true = instrument loaded
};

static TFMXPlayer gPlayers[MAX_PLAYERS];
static int        gSampleRate = 44100;
static bool       gInit       = false;

// ── Exported C API ───────────────────────────────────────────────────────────

extern "C" {

EMSCRIPTEN_KEEPALIVE
void* tfmx_init(int sampleRate) {
  gSampleRate = sampleRate;
  for (int i = 0; i < MAX_PLAYERS; i++) {
    gPlayers[i] = { nullptr, nullptr, 0, 0, false, false };
  }
  gInit = true;
  return (void*)1; // non-null = success
}

EMSCRIPTEN_KEEPALIVE
void tfmx_dispose(void* /*ctx*/) {
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (gPlayers[i].decoder) {
      tfmxdec_delete(gPlayers[i].decoder);
      gPlayers[i].decoder = nullptr;
    }
    free(gPlayers[i].miniMod);
    gPlayers[i].miniMod = nullptr;
    gPlayers[i].active  = false;
    gPlayers[i].loaded  = false;
  }
  gInit = false;
}

EMSCRIPTEN_KEEPALIVE
int tfmx_create_player(void* /*ctx*/) {
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!gPlayers[i].loaded && !gPlayers[i].decoder) {
      void* dec = tfmxdec_new();
      if (!dec) return -1;
      gPlayers[i].decoder    = dec;
      gPlayers[i].miniMod    = nullptr;
      gPlayers[i].miniModLen = 0;
      gPlayers[i].active     = false;
      gPlayers[i].loaded     = false;
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void tfmx_destroy_player(void* /*ctx*/, int handle) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  TFMXPlayer& p = gPlayers[handle];
  if (p.decoder) {
    tfmxdec_delete(p.decoder);
    p.decoder = nullptr;
  }
  free(p.miniMod);
  p.miniMod  = nullptr;
  p.active   = false;
  p.loaded   = false;
}

/**
 * tfmx_load_instrument — blob format:
 *   [0..3]:   sndSeqsCount  u32LE
 *   [4..7]:   sampleCount   u32LE
 *   [8..11]:  sampleDataLen u32LE
 *   [12 ..]:  sndModSeqData (64 * sndSeqsCount bytes)
 *             volModSeqData (64 bytes)
 *             sampleHeaders (30 * sampleCount bytes)
 *             sampleData
 */
EMSCRIPTEN_KEEPALIVE
int tfmx_load_instrument(void* /*ctx*/, int handle, const uint8_t* blob, uint32_t blobLen) {
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;
  if (!gPlayers[handle].decoder)           return -2;
  if (blobLen < 12)                        return -3;

  TFMXPlayer& p = gPlayers[handle];

  const uint32_t sndSeqsCount  = readU32LE(blob, 0);
  const uint32_t sampleCount   = readU32LE(blob, 4);
  const uint32_t sampleDataLen = readU32LE(blob, 8);

  const uint32_t bSndOff   = 12;
  const uint32_t bVolOff   = bSndOff   + TFMX_SEQ_SIZE * sndSeqsCount;
  const uint32_t bHdrOff   = bVolOff   + TFMX_SEQ_SIZE;
  const uint32_t bDataOff  = bHdrOff   + TFMX_SAMPLE_HDR_SIZE * sampleCount;
  const uint32_t bMinNeeded = bDataOff + sampleDataLen;

  if (blobLen < bMinNeeded) return -4;

  // ── Build minimal TFMX module ─────────────────────────────────────────────
  // All section offsets relative to start (h = 0).
  const uint32_t mSndSeqsOff  = 0x20;
  const uint32_t mVolSeqsOff  = mSndSeqsOff + TFMX_SEQ_SIZE * sndSeqsCount;
  const uint32_t mPatternOff  = mVolSeqsOff + TFMX_SEQ_SIZE;          // 1 VolSeq
  const uint32_t mTrackTabOff = mPatternOff  + TFMX_PATTERN_BYTES;    // 1 Pattern
  const uint32_t mSubSongOff  = mTrackTabOff + TFMX_TRACKTAB_STEP;    // 1 step
  const uint32_t mSmpHdrsOff  = mSubSongOff  + TFMX_SONGTAB_ENTRY * 2; // 2 entries (songCount=1 → count+1=2)
  const uint32_t mSmpDataOff  = mSmpHdrsOff  + TFMX_SAMPLE_HDR_SIZE * sampleCount;
  const uint32_t mTotalLen    = mSmpDataOff  + sampleDataLen;

  free(p.miniMod);
  p.miniMod = (uint8_t*)calloc(1, mTotalLen);
  if (!p.miniMod) return -5;
  p.miniModLen = mTotalLen;
  p.patternOff = mPatternOff;

  // Header — "TFMX\0" magic overlaps with sndSeqsMax high byte
  // TFMX magic: T(0x54) F(0x46) M(0x4D) X(0x58) [null = sndSeqsMax hi]
  p.miniMod[0] = 'T'; p.miniMod[1] = 'F';
  p.miniMod[2] = 'M'; p.miniMod[3] = 'X';
  // h+0x04: sndSeqsMax u16BE = sndSeqsCount-1
  // Note: high byte at [4] will be 0 for count ≤ 256 (= the null in the magic)
  const uint16_t sndMax = (sndSeqsCount > 0) ? (uint16_t)(sndSeqsCount - 1) : 0;
  writeU16BE(p.miniMod, 0x04, sndMax);
  // h+0x06: volSeqsMax = 0 (1 VolSeq, index 0)
  writeU16BE(p.miniMod, 0x06, 0);
  // h+0x08: patternsMax = 0 (1 pattern, index 0)
  writeU16BE(p.miniMod, 0x08, 0);
  // h+0x0A: trackStepsMax = 0 (1 step, index 0)
  writeU16BE(p.miniMod, 0x0A, 0);
  // h+0x0C: reserved = 0 (already zero from calloc)
  // h+0x0D: patternSize = 64
  p.miniMod[0x0D] = 64;
  // h+0x0E..0x0F: reserved = 0
  // h+0x10: songCount = 1
  writeU16BE(p.miniMod, 0x10, 1);
  // h+0x12: sampleCount
  writeU16BE(p.miniMod, 0x12, (uint16_t)sampleCount);
  // h+0x14..0x1F: pad to 0x20 (already zeros)

  // Copy all SndModSeqs
  if (sndSeqsCount > 0) {
    memcpy(p.miniMod + mSndSeqsOff, blob + bSndOff, TFMX_SEQ_SIZE * sndSeqsCount);
  }

  // Copy this instrument's VolModSeq (just the one)
  memcpy(p.miniMod + mVolSeqsOff, blob + bVolOff, TFMX_SEQ_SIZE);

  // Pattern stays all zeros — updated on each note_on

  // TrackTable: 1 step, 4 voices × 3 bytes
  // Voice 0: [patIdx=0, transpose=0, soundTranspose=0x00] → active, plays pattern 0
  p.miniMod[mTrackTabOff + 0] = 0;    // patIdx
  p.miniMod[mTrackTabOff + 1] = 0;    // transpose
  p.miniMod[mTrackTabOff + 2] = 0x00; // soundTranspose = 0 → active
  // Voices 1-3: soundTranspose = 0x80 → off
  p.miniMod[mTrackTabOff + 3] = 0; p.miniMod[mTrackTabOff + 4] = 0; p.miniMod[mTrackTabOff + 5] = 0x80;
  p.miniMod[mTrackTabOff + 6] = 0; p.miniMod[mTrackTabOff + 7] = 0; p.miniMod[mTrackTabOff + 8] = 0x80;
  p.miniMod[mTrackTabOff + 9] = 0; p.miniMod[mTrackTabOff +10] = 0; p.miniMod[mTrackTabOff +11] = 0x80;

  // SubSongTable: 2 entries (songCount+1 = 2) — song 0: step 0 to 0, speed 6
  writeU16BE(p.miniMod, mSubSongOff + 0, 0); // firstStep
  writeU16BE(p.miniMod, mSubSongOff + 2, 0); // lastStep
  writeU16BE(p.miniMod, mSubSongOff + 4, 6); // speed
  writeU16BE(p.miniMod, mSubSongOff + 6, 0); // entry 1 firstStep
  writeU16BE(p.miniMod, mSubSongOff + 8, 0); // entry 1 lastStep
  writeU16BE(p.miniMod, mSubSongOff +10, 6); // entry 1 speed

  // Copy sample headers (startOffs within headers are relative to sampleData section)
  if (sampleCount > 0) {
    memcpy(p.miniMod + mSmpHdrsOff, blob + bHdrOff, TFMX_SAMPLE_HDR_SIZE * sampleCount);
  }

  // Copy sample data
  if (sampleDataLen > 0) {
    memcpy(p.miniMod + mSmpDataOff, blob + bDataOff, sampleDataLen);
  }

  p.loaded = true;
  p.active = false;
  return 0;
}

/**
 * Convert MIDI note to TFMX period-table index.
 * TFMX note index 0 = Amiga period 856 = B-1 (lowest note).
 * MIDI 36 (C2) ≈ Amiga B-1 → TFMX index 0.
 * MIDI note = TFMX index + 36.
 */
static int midiToTfmxNote(int midi) {
  int note = midi - 36;
  if (note < 0)  note = 0;
  if (note > 95) note = 95;
  return note;
}

EMSCRIPTEN_KEEPALIVE
void tfmx_note_on(void* /*ctx*/, int handle, int midiNote, int /*velocity*/) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  TFMXPlayer& p = gPlayers[handle];
  if (!p.decoder || !p.miniMod || !p.loaded) return;

  const int tfmxNote = midiToTfmxNote(midiNote);

  // Update pattern row 0: trigger note using VolModSeq index 0
  // byte0: bit7=hasNote, bits6-0=noteIdx
  // byte1: bits4-0=volSeqIdx (always 0 — our single remapped VolModSeq)
  p.miniMod[p.patternOff + 0] = (uint8_t)(0x80 | (tfmxNote & 0x7F));
  p.miniMod[p.patternOff + 1] = 0x00; // volSeqIdx = 0
  // Rows 1-31 remain zero (no note, decoder advances and loops via loop_mode)

  // (Re-)initialize decoder with updated module; library copies the buffer
  if (!tfmxdec_init(p.decoder, p.miniMod, p.miniModLen, 0)) {
    return; // init failed — decoder likely rejects our module
  }

  // Configure mixer: signed 16-bit stereo at the global sample rate, 75% pan
  tfmxdec_mixer_init(p.decoder, gSampleRate, 16, 2, 0, 75);

  // Enable loop so the track's sustain section loops indefinitely
  tfmxdec_set_loop_mode(p.decoder, 1);

  p.active = true;
}

EMSCRIPTEN_KEEPALIVE
void tfmx_note_off(void* /*ctx*/, int handle) {
  if (handle < 0 || handle >= MAX_PLAYERS) return;
  TFMXPlayer& p = gPlayers[handle];
  if (!p.decoder) return;
  if (p.active) {
    // Mute voice 0 to cut the note immediately
    tfmxdec_mute_voice(p.decoder, true, 0);
    p.active = false;
  }
}

EMSCRIPTEN_KEEPALIVE
void tfmx_render(void* /*ctx*/, int handle, float* outL, float* outR, int numSamples) {
  if (handle < 0 || handle >= MAX_PLAYERS) {
    memset(outL, 0, (size_t)numSamples * sizeof(float));
    memset(outR, 0, (size_t)numSamples * sizeof(float));
    return;
  }
  TFMXPlayer& p = gPlayers[handle];
  if (!p.decoder || !p.active) {
    memset(outL, 0, (size_t)numSamples * sizeof(float));
    memset(outR, 0, (size_t)numSamples * sizeof(float));
    return;
  }

  // Stack buffer: max 128 samples × 2 channels × 2 bytes = 512 bytes
  int16_t tmp[256]; // 128 stereo pairs
  const int byteLen = numSamples * 2 * (int)sizeof(int16_t);
  tfmxdec_buffer_fill(p.decoder, tmp, (uint32_t)byteLen);

  // Deinterleave and convert int16 → float32
  for (int i = 0; i < numSamples; i++) {
    outL[i] = tmp[i * 2 + 0] * (1.0f / 32768.0f);
    outR[i] = tmp[i * 2 + 1] * (1.0f / 32768.0f);
  }
}

EMSCRIPTEN_KEEPALIVE
void tfmx_set_param(void* /*ctx*/, int /*handle*/, int /*paramId*/, float /*value*/) {
  /* No runtime parameters implemented yet */
}

EMSCRIPTEN_KEEPALIVE
float tfmx_get_param(void* /*ctx*/, int /*handle*/, int /*paramId*/) {
  return 0.0f;
}

} // extern "C"
