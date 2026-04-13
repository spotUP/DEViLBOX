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
#include <stdio.h>

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
  uint32_t volSeqOff;    // byte offset of VolModSeq within miniMod
  uint32_t sndSeqsOff;   // byte offset of SndModSeqs within miniMod
  uint32_t sndSeqsCount; // number of SndModSeqs
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
    gPlayers[i] = { nullptr, nullptr, 0, 0, 0, 0, 0, false, false };
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
  p.miniModLen   = mTotalLen;
  p.patternOff   = mPatternOff;
  p.volSeqOff    = mVolSeqsOff;
  p.sndSeqsOff   = mSndSeqsOff;
  p.sndSeqsCount = sndSeqsCount;

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
  /* No runtime parameters implemented yet — use tfmx_set_instrument_param instead */
}

EMSCRIPTEN_KEEPALIVE
float tfmx_get_param(void* /*ctx*/, int /*handle*/, int /*paramId*/) {
  return 0.0f;
}

/**
 * tfmx_set_instrument_param — write a byte into the miniMod buffer and reinit
 * the decoder so the change takes effect on the next note trigger.
 *
 * section:
 *   0 = VolModSeq  (64 bytes, byteIdx 0..63)
 *   1 = SndModSeq  (64 bytes per seq, byteIdx = seqIdx*64 + posInSeq)
 *
 * Returns 0 on success, negative on error.
 */
EMSCRIPTEN_KEEPALIVE
int tfmx_set_instrument_param(void* /*ctx*/, int handle, int section,
                              int byteIdx, int value) {
  if (handle < 0 || handle >= MAX_PLAYERS) return -1;
  TFMXPlayer& p = gPlayers[handle];
  if (!p.miniMod || !p.loaded) return -2;

  uint32_t absOff = 0;
  if (section == 0) {
    // VolModSeq: 64 bytes at p.volSeqOff
    if (byteIdx < 0 || byteIdx >= TFMX_SEQ_SIZE) return -3;
    absOff = p.volSeqOff + (uint32_t)byteIdx;
  } else if (section == 1) {
    // SndModSeq pool: sndSeqsCount * 64 bytes at p.sndSeqsOff
    if (byteIdx < 0 || (uint32_t)byteIdx >= p.sndSeqsCount * TFMX_SEQ_SIZE) return -3;
    absOff = p.sndSeqsOff + (uint32_t)byteIdx;
  } else {
    return -4; // unknown section
  }

  if (absOff >= p.miniModLen) return -5;

  p.miniMod[absOff] = (uint8_t)(value & 0xFF);

  // Reinitialize the decoder with the patched buffer so the change takes
  // effect on the next note_on.  If a note is currently playing, the reinit
  // will restart it — this is acceptable for live editing.
  if (p.decoder) {
    tfmxdec_init(p.decoder, p.miniMod, p.miniModLen, 0);
    tfmxdec_mixer_init(p.decoder, gSampleRate, 16, 2, 0, 75);
    tfmxdec_set_loop_mode(p.decoder, 1);
  }

  return 0;
}

// ── Full-module playback (uses player handle 0 as dedicated module player) ──

static uint8_t* gModuleSmpl = nullptr;
static uint32_t gModuleSmplLen = 0;
static uint64_t gSamplesRendered = 0;

/**
 * Load a full TFMX module (mdat + smpl) for streaming playback.
 * Uses player slot 0 as the dedicated module player.
 * Returns 0 on success, negative on error.
 */
EMSCRIPTEN_KEEPALIVE
int tfmx_load_module(void* /*ctx*/, const uint8_t* mdatData, uint32_t mdatLen,
                     const uint8_t* smplData, uint32_t smplLen, int subsong) {
  if (!gInit) return -1;

  TFMXPlayer& p = gPlayers[0];

  // Clean up any previous module player state
  if (p.decoder) {
    tfmxdec_delete(p.decoder);
    p.decoder = nullptr;
  }
  free(p.miniMod);
  p.miniMod = nullptr;
  p.active = false;
  p.loaded = false;

  // Free previous smpl data
  free(gModuleSmpl);
  gModuleSmpl = nullptr;
  gModuleSmplLen = 0;
  gSamplesRendered = 0;

  // Create a new decoder
  void* dec = tfmxdec_new();
  if (!dec) return -2;

  // Write both mdat and smpl to MEMFS with matching names so the library
  // can find the companion sample file via its internal path derivation.
  // The library's set_path() + init() or load() handles mdat→smpl pairing.

  // Write mdat to MEMFS
  FILE* fm = fopen("/tmp/mdat.song", "wb");
  if (fm) {
    fwrite(mdatData, 1, mdatLen, fm);
    fclose(fm);
  }

  // Write smpl to MEMFS (library derives "smpl.song" from "mdat.song")
  if (smplData && smplLen > 0) {
    gModuleSmpl = (uint8_t*)malloc(smplLen);
    if (gModuleSmpl) {
      memcpy(gModuleSmpl, smplData, smplLen);
      gModuleSmplLen = smplLen;
    }

    FILE* fs = fopen("/tmp/smpl.song", "wb");
    if (fs) {
      fwrite(smplData, 1, smplLen, fs);
      fclose(fs);
    }
  }

  // Load from MEMFS path — library handles mdat+smpl pairing internally
  if (!tfmxdec_load(dec, "/tmp/mdat.song", subsong)) {
    // Fallback: try buffer-based init (works for merged/single-file formats)
    tfmxdec_set_path(dec, "/tmp/mdat.song");
    if (!tfmxdec_init(dec, (void*)mdatData, mdatLen, subsong)) {
      tfmxdec_delete(dec);
      return -3;
    }
  }

  // Configure mixer: signed 16-bit stereo
  tfmxdec_mixer_init(dec, gSampleRate, 16, 2, 0, 75);
  tfmxdec_set_loop_mode(dec, 1);

  p.decoder = dec;
  p.loaded = true;
  p.active = true;
  gSamplesRendered = 0;

  return 0;
}

/**
 * Get the current playback position of the module player (slot 0).
 * Returns the total samples rendered so far (use with sample rate to derive time).
 */
EMSCRIPTEN_KEEPALIVE
uint32_t tfmx_get_samples_rendered(void* /*ctx*/) {
  return (uint32_t)(gSamplesRendered & 0xFFFFFFFF);
}

/**
 * Check if the module has reached its end.
 */
EMSCRIPTEN_KEEPALIVE
int tfmx_module_song_end(void* /*ctx*/) {
  TFMXPlayer& p = gPlayers[0];
  if (!p.decoder || !p.active) return 1;
  return tfmxdec_song_end(p.decoder) ? 1 : 0;
}

/**
 * Render audio from the full-module player (slot 0).
 * This also updates the samples-rendered counter.
 */
EMSCRIPTEN_KEEPALIVE
void tfmx_module_render(void* /*ctx*/, float* outL, float* outR, int numSamples) {
  TFMXPlayer& p = gPlayers[0];
  if (!p.decoder || !p.active) {
    memset(outL, 0, (size_t)numSamples * sizeof(float));
    memset(outR, 0, (size_t)numSamples * sizeof(float));
    return;
  }

  int16_t tmp[256]; // max 128 stereo pairs
  const int byteLen = numSamples * 2 * (int)sizeof(int16_t);
  tfmxdec_buffer_fill(p.decoder, tmp, (uint32_t)byteLen);

  for (int i = 0; i < numSamples; i++) {
    outL[i] = tmp[i * 2 + 0] * (1.0f / 32768.0f);
    outR[i] = tmp[i * 2 + 1] * (1.0f / 32768.0f);
  }

  gSamplesRendered += (uint64_t)numSamples;
}

/**
 * Stop the module player.
 */
EMSCRIPTEN_KEEPALIVE
void tfmx_module_stop(void* /*ctx*/) {
  TFMXPlayer& p = gPlayers[0];
  p.active = false;
}

/**
 * Get number of subsongs in the loaded module.
 */
EMSCRIPTEN_KEEPALIVE
int tfmx_module_songs(void* /*ctx*/) {
  TFMXPlayer& p = gPlayers[0];
  if (!p.decoder) return 0;
  return tfmxdec_songs(p.decoder);
}

/**
 * Get duration of current subsong in milliseconds.
 */
EMSCRIPTEN_KEEPALIVE
uint32_t tfmx_module_duration(void* /*ctx*/) {
  TFMXPlayer& p = gPlayers[0];
  if (!p.decoder) return 0;
  return tfmxdec_duration(p.decoder);
}

/**
 * Get per-voice volume (0-100) for VU meters.
 */
EMSCRIPTEN_KEEPALIVE
int tfmx_module_voice_volume(void* /*ctx*/, int voice) {
  TFMXPlayer& p = gPlayers[0];
  if (!p.decoder) return 0;
  return (int)tfmxdec_get_voice_volume(p.decoder, (unsigned int)voice);
}

/**
 * Get number of voices.
 */
EMSCRIPTEN_KEEPALIVE
int tfmx_module_voices(void* /*ctx*/) {
  TFMXPlayer& p = gPlayers[0];
  if (!p.decoder) return 0;
  return tfmxdec_voices(p.decoder);
}

/**
 * Mute/unmute a voice.
 */
EMSCRIPTEN_KEEPALIVE
void tfmx_module_mute_voice(void* /*ctx*/, int voice, int mute) {
  TFMXPlayer& p = gPlayers[0];
  if (!p.decoder) return;
  tfmxdec_mute_voice(p.decoder, mute != 0, (unsigned int)voice);
}

/**
 * DEViLBOX extension: trigger a single instrument macro on a chosen voice
 * for editor preview/audition. The macro is set up via the same path the
 * sequencer uses for a "note" command, then processed on the next render
 * tick. Returns 0 on success, -1 if no module is loaded.
 *
 * Typical use: while a song is playing, the user clicks "Preview" in the
 * macro editor → JS calls this with (macroIdx, note=24, volume=15,
 * channel=0). The preview note overlaps the song briefly until the song's
 * next pattern row writes to that voice. For a longer audition, stop
 * playback first or pick a voice the song doesn't use.
 */
EMSCRIPTEN_KEEPALIVE
int tfmx_module_preview_macro(void* /*ctx*/, int macroIdx, int note,
                              int volume, int channel) {
  TFMXPlayer& p = gPlayers[0];
  if (!p.decoder || !p.active) return -1;
  tfmxdec_preview_macro(p.decoder, macroIdx, note, volume, channel);
  return 0;
}

} // extern "C"
