/**
 * hippel_coso_synth.cpp — Jochen Hippel CoSo keyboard-preview voice
 *
 * A CoSo instrument is a volume sequence (envelope, vibrato and the number of
 * a sound-modulation sequence) plus that sound-modulation sequence (pitch
 * transposes, wave switches, wave modulation) over a bank of samples. The
 * previous model here was a square-wave oscillator that read the sound
 * sequence's wave-select commands as transposes: it never played a sample.
 *
 * This voice does not model the player, it runs it: libtfmxaudiodecoder's
 * HippelDecoder is the replayer (COSO_init and the TFMX sound / volume
 * modulation code, the same code UADE-agnostic ports of the 68k player use).
 * hc_note_on assembles the smallest valid COSO module around the instrument -
 * one sound sequence, one volume sequence, one note pattern for voice 0, the
 * samples the sequence references - and lets the decoder play it, voices 1-3
 * muted. Key release cuts the voice (the player has no release: the next note
 * or a pattern end does it).
 *
 * Binary blob for hc_load_instrument (little-endian), version 2:
 *   [0]      u8   version = 2
 *   [1]      u8   volSpeed   (volume sequence header byte 0, as the player reads it)
 *   [2]      u8   vibSpeed   (header byte 2)
 *   [3]      u8   vibAmpl    (header byte 3)
 *   [4]      u8   vibDelay   (header byte 4)
 *   [5..6]   u16  fseqLen
 *   [7..8]   u16  vseqLen
 *   [9..10]  u16  sampleCount
 *   then fseq bytes, vseq bytes, and per sample:
 *     u16 index, u16 lengthWords, u16 repOffs, u16 repLenWords, u32 pcmLen, pcm bytes
 */

#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "tfmxaudiodecoder.h"

#define MAX_PLAYERS 32

namespace {

inline void be16(uint8_t *b, uint32_t o, uint32_t v) { b[o] = (uint8_t)(v >> 8); b[o + 1] = (uint8_t)v; }
inline void be32(uint8_t *b, uint32_t o, uint32_t v) { be16(b, o, v >> 16); be16(b, o + 2, v & 0xFFFF); }
inline uint32_t le16(const uint8_t *b) { return (uint32_t)b[0] | ((uint32_t)b[1] << 8); }
inline uint32_t le32(const uint8_t *b) { return le16(b) | (le16(b + 2) << 16); }

struct Player {
  bool      alive;
  void     *decoder;
  uint8_t  *mod;          /* the assembled COSO module */
  uint32_t  modLen;
  uint32_t  patternOff;   /* voice 0's pattern: note byte at +0 */
  uint32_t  volHdrOff;    /* the volume sequence's 5 header bytes */
  bool      loaded;
  bool      active;
  float     gain;
};

Player   g_players[MAX_PLAYERS];
int      g_sampleRate = 48000;
bool     g_init = false;

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void *hc_init(int sampleRate) {
  g_sampleRate = sampleRate;
  memset(g_players, 0, sizeof(g_players));
  g_init = true;
  return (void *)1;
}

EMSCRIPTEN_KEEPALIVE
void hc_dispose(void *) {
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (g_players[i].decoder) tfmxdec_delete(g_players[i].decoder);
    free(g_players[i].mod);
  }
  memset(g_players, 0, sizeof(g_players));
  g_init = false;
}

EMSCRIPTEN_KEEPALIVE
int hc_create_player(void *) {
  for (int i = 0; i < MAX_PLAYERS; i++) {
    if (!g_players[i].alive) {
      memset(&g_players[i], 0, sizeof(Player));
      g_players[i].alive = true;
      g_players[i].gain = 1.0f;
      g_players[i].decoder = tfmxdec_new();
      if (!g_players[i].decoder) { g_players[i].alive = false; return -1; }
      return i;
    }
  }
  return -1;
}

EMSCRIPTEN_KEEPALIVE
void hc_destroy_player(void *, int h) {
  if (h < 0 || h >= MAX_PLAYERS) return;
  Player &p = g_players[h];
  if (p.decoder) tfmxdec_delete(p.decoder);
  free(p.mod);
  memset(&p, 0, sizeof(Player));
}

/* Assemble the minimal COSO module (libtfmxaudiodecoder COSO_init layout, all
 * offsets relative to the header at 0). Returns 0 on success. */
EMSCRIPTEN_KEEPALIVE
int hc_load_instrument(void *, int h, const uint8_t *d, int len) {
  if (h < 0 || h >= MAX_PLAYERS || !g_players[h].alive || len < 11 || d[0] != 2) return -1;
  Player &p = g_players[h];

  const uint32_t fseqLen = le16(d + 5), vseqLen = le16(d + 7), nSamples = le16(d + 9);
  uint32_t pos = 11;
  if (pos + fseqLen + vseqLen > (uint32_t)len) return -2;
  const uint8_t *fseq = d + pos; pos += fseqLen;
  const uint8_t *vseq = d + pos; pos += vseqLen;

  struct S { uint32_t index, lenW, repOffs, repLenW, pcmLen; const uint8_t *pcm; } smp[64];
  if (nSamples > 64) return -3;
  uint32_t maxIdx = 0, dataLen = 4; /* 4 zero bytes at the start of the data serve unused slots */
  for (uint32_t i = 0; i < nSamples; i++) {
    if (pos + 12 > (uint32_t)len) return -4;
    smp[i] = { le16(d + pos), le16(d + pos + 2), le16(d + pos + 4), le16(d + pos + 6), le32(d + pos + 8), d + pos + 12 };
    pos += 12;
    if (pos + smp[i].pcmLen > (uint32_t)len) return -5;
    pos += smp[i].pcmLen;
    if (smp[i].index > maxIdx) maxIdx = smp[i].index;
    dataLen += smp[i].pcmLen + 2;
  }
  const uint32_t nHdr = nSamples ? maxIdx + 1 : 1;
  if (nHdr > 255) return -6;

  const uint32_t BODIES = 0x60;
  const uint32_t fseqOff = BODIES;
  const uint32_t volOff = fseqOff + fseqLen;
  const uint32_t pat0Off = volOff + 5 + vseqLen;
  const uint32_t pat1Off = pat0Off + 5;
  const uint32_t hdrOff = pat1Off + 5;
  const uint32_t dataOff = hdrOff + 10 * nHdr;
  const uint32_t total = dataOff + dataLen + 8;
  if (total > 0xFFFF * 2) return -7;

  free(p.mod);
  p.mod = (uint8_t *)calloc(1, total);
  if (!p.mod) return -8;
  p.modLen = total;
  uint8_t *m = p.mod;

  memcpy(m, "COSO", 4);
  be32(m, 0x04, 0x40);       /* sound sequence offset table */
  be32(m, 0x08, 0x42);       /* volume sequence offset table */
  be32(m, 0x0c, 0x44);       /* pattern offset table */
  be32(m, 0x10, 0x48);       /* track table */
  be32(m, 0x14, 0x54);       /* subsong table */
  be32(m, 0x18, hdrOff);     /* sample headers */
  be32(m, 0x1c, dataOff);    /* sample data */
  memcpy(m + 0x20, "TFMX", 4);
  be16(m, 0x24, 0);          /* sound sequences - 1 */
  be16(m, 0x26, 0);          /* volume sequences - 1 */
  be16(m, 0x28, 1);          /* patterns - 1 */
  be16(m, 0x2a, 0);          /* track steps - 1 */
  be16(m, 0x30, 1);          /* songs */
  be16(m, 0x32, nHdr);       /* samples */
  be16(m, 0x40, fseqOff);
  be16(m, 0x42, volOff);
  be16(m, 0x44, pat0Off);
  be16(m, 0x46, pat1Off);
  /* Track table, one step: voice 0 plays pattern 0, voices 1-3 pattern 1. */
  m[0x48 + 3] = 1; m[0x48 + 6] = 1; m[0x48 + 9] = 1;
  /* Subsong 0: step 0..0, 50 ticks per row; entry 1 is the undefined one. */
  be16(m, 0x54, 0); be16(m, 0x56, 0); be16(m, 0x58, 50);

  memcpy(m + fseqOff, fseq, fseqLen);
  m[volOff + 0] = d[1];      /* envelope speed */
  m[volOff + 1] = 0;         /* sound sequence 0 */
  m[volOff + 2] = d[2];      /* vibrato speed */
  m[volOff + 3] = d[3];      /* vibrato amplitude */
  m[volOff + 4] = d[4];      /* vibrato delay */
  memcpy(m + volOff + 5, vseq, vseqLen);
  p.volHdrOff = volOff;

  /* Pattern 0: the note (patched at note-on), then a long hold (the row-skip
   * count is a signed byte: 127 rows of 50 ticks, over two minutes), then the end
   * marker. Pattern 1: no instrument trigger (note bit 7), the same hold. */
  m[pat0Off + 0] = 0; m[pat0Off + 1] = 0; m[pat0Off + 2] = 0xFD; m[pat0Off + 3] = 0x7F; m[pat0Off + 4] = 0xFF;
  m[pat1Off + 0] = 0x80; m[pat1Off + 1] = 0; m[pat1Off + 2] = 0xFD; m[pat1Off + 3] = 0x7F; m[pat1Off + 4] = 0xFF;
  p.patternOff = pat0Off;

  /* Sample headers: unused slots point at the zero bytes. Header words are as
   * the file stores them: start (relative to the data), length in words,
   * repeat offset, repeat length in words. */
  for (uint32_t i = 0; i < nHdr; i++) { be32(m, hdrOff + 10 * i, 0); be16(m, hdrOff + 10 * i + 4, 1); be16(m, hdrOff + 10 * i + 6, 0); be16(m, hdrOff + 10 * i + 8, 1); }
  uint32_t at = 4;
  for (uint32_t i = 0; i < nSamples; i++) {
    const uint32_t o = hdrOff + 10 * smp[i].index;
    be32(m, o, at); be16(m, o + 4, smp[i].lenW); be16(m, o + 6, smp[i].repOffs); be16(m, o + 8, smp[i].repLenW);
    memcpy(m + dataOff + at, smp[i].pcm, smp[i].pcmLen);
    at += smp[i].pcmLen + 2;
  }

  p.loaded = true;
  p.active = false;
  return 0;
}

/* The keyboard key for a grid cell is MIDI = grid note + 11, and the player
 * sounds period-table index (grid note - 1) for a pattern note byte (measured
 * against UADE on prehistoric_tale.hipc: grid 32 -> 285 = periods[31]). */
EMSCRIPTEN_KEEPALIVE
void hc_note_on(void *, int h, int midiNote, int) {
  if (h < 0 || h >= MAX_PLAYERS) return;
  Player &p = g_players[h];
  if (!p.alive || !p.loaded) return;

  int note = midiNote - 12;
  if (note < 0) note = 0;
  if (note > 0x7c) note = 0x7c;
  p.mod[p.patternOff] = (uint8_t)note;

  if (!tfmxdec_init(p.decoder, p.mod, p.modLen, 0)) { p.active = false; return; }
  tfmxdec_mixer_init(p.decoder, g_sampleRate, 16, 1, 0, 50);
  tfmxdec_set_filtering(p.decoder, 0);
  tfmxdec_set_loop_mode(p.decoder, 1);
  for (unsigned v = 1; v < 4; v++) tfmxdec_mute_voice(p.decoder, true, v);
  p.active = true;
}

EMSCRIPTEN_KEEPALIVE
void hc_note_off(void *, int h) {
  if (h < 0 || h >= MAX_PLAYERS) return;
  Player &p = g_players[h];
  if (p.decoder && p.active) tfmxdec_mute_voice(p.decoder, true, 0);
  p.active = false;
}

EMSCRIPTEN_KEEPALIVE
int hc_render(void *, int h, float *outL, float *outR, int n) {
  if (h < 0 || h >= MAX_PLAYERS) return 0;
  Player &p = g_players[h];
  if (!p.decoder || !p.active) { memset(outL, 0, n * sizeof(float)); memset(outR, 0, n * sizeof(float)); return n; }
  static int16_t tmp[4096];
  if (n > 4096) n = 4096;
  tfmxdec_buffer_fill(p.decoder, tmp, (uint32_t)n * sizeof(int16_t));
  /* The decoder's mono mixer outputs int8 * 256 / 4 voices * volume / 64, i.e.
   * int8 * volume / 32768 for one voice: the same level UADE's audio.c gives a
   * Paula voice (a full-scale voice is 0.25), so no further scaling. */
  const float k = p.gain / 32768.0f;
  for (int i = 0; i < n; i++) { outL[i] = outR[i] = tmp[i] * k; }
  return n;
}

/* Live parameter edits patch the assembled module's volume sequence header; they
 * apply from the next note. paramId: 0 gain, 1 vibAmpl, 2 vibSpeed, 3 vibDelay, 4 volSpeed. */
EMSCRIPTEN_KEEPALIVE
void hc_set_param(void *, int h, int id, float v) {
  if (h < 0 || h >= MAX_PLAYERS) return;
  Player &p = g_players[h];
  if (!p.alive) return;
  if (id == 0) { p.gain = v < 0 ? 0 : (v > 1 ? 1 : v); return; }
  if (!p.loaded) return;
  uint8_t *hdr = p.mod + p.volHdrOff;
  switch (id) {
    case 1: hdr[3] = (uint8_t)(v * 255.0f); break;
    case 2: hdr[2] = (uint8_t)(v * 127.0f); break;
    case 3: hdr[4] = (uint8_t)(v * 255.0f); break;
    case 4: { int s = 1 + (int)(v * 15.0f); hdr[0] = (uint8_t)(s < 1 ? 1 : s); } break;
  }
}

EMSCRIPTEN_KEEPALIVE
float hc_get_param(void *, int h, int id) {
  if (h < 0 || h >= MAX_PLAYERS) return -1.0f;
  Player &p = g_players[h];
  if (id == 0) return p.gain;
  if (!p.loaded) return -1.0f;
  const uint8_t *hdr = p.mod + p.volHdrOff;
  switch (id) {
    case 1: return hdr[3] / 255.0f;
    case 2: return hdr[2] / 127.0f;
    case 3: return hdr[4] / 255.0f;
    case 4: return (hdr[0] - 1) / 15.0f;
  }
  return -1.0f;
}

}  // extern "C"
