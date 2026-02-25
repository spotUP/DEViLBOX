/**
 * FCParser.ts — Future Composer 1.3 / 1.4 format parser with macro simulation
 *
 * Future Composer is a 4-channel Amiga tracker using wavetable/macro-based synthesis.
 * Two variants:
 *   FC 1.3: magic "FC13" (or "SMOD") — 47 preset wavetables
 *   FC 1.4: magic "FC14" — adds 80 custom wavetable slots
 *
 * This parser simulates the FC macro engine tick-by-tick at import time, capturing
 * volume envelopes, waveform switches, vibrato, and pitch bends into standard
 * TrackerSong patterns that the TrackerReplayer plays back natively.
 *
 * Reference: FlodJS FCPlayer by Christian Corti (Neoart)
 * Reference: furnace-master/src/engine/fileOps/fc.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Utility functions ─────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function s8(v: number): number {
  return v < 128 ? v : v - 256;
}

/**
 * Map an FC note (1-72) to an XM-style note number (13-84).
 * FC note 1 = Amiga C-1 = XM note 13 (C-1).
 * FC note 0 = empty, FC note 0x49 = pattern end marker.
 */
function fcNoteToXM(fcNote: number, transpose: number): number {
  if (fcNote === 0) return 0;
  if (fcNote >= 0x49) return 97; // note off
  // FC note numbering: note 1 = C-0 (period 1712), note 13 = C-1 (period 856), etc.
  // XM note numbering: note 1 = C-0, note 13 = C-1. Same base — no offset needed.
  // The previous +12 shifted every note one octave too high (C-1 → C-2, etc.)
  const xm = fcNote + transpose;
  return Math.max(1, Math.min(96, xm));
}

// ── FC Period Table (from FlodJS FCPlayer) ────────────────────────────────
// Index 0-47: octaves 0-3, then padding to 59, then octaves -1 to 3 again

export const FC_PERIODS = [
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
   113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,
  3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1812,
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
   113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,
];

// ── FC13 Built-in Waveform Data (from FlodJS FCPlayer.WAVES) ─────────────
// Flat array: first 47 values = waveform lengths in words (×2 for bytes),
// remaining 1344 values = concatenated 8-bit signed PCM data for all 47 waves.
// These map to sample indices 10-56 in the FC player.

const FC13_WAVES = [
  // Lengths (47 values): waves 0-31 = 16 words each, 32-39 = 8 words each, then misc
  16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
  16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
   8,  8,  8,  8,  8,  8,  8,  8, 16,  8, 16, 16,  8,  8, 24,
  // Wave 0: XOR triangle variant (32 bytes)
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
   63,  55,  47,  39,  31,  23,  15,   7,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 1
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64,  55,  47,  39,  31,  23,  15,   7,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 2
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72,  47,  39,  31,  23,  15,   7,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 3
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80,  39,  31,  23,  15,   7,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 4
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88,  31,  23,  15,   7,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 5
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,  23,  15,   7,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 6
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,  15,   7,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 7
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,   7,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 8
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,-120,  -1,   7,  15,  23,  31,  39,  47,  55,
  // Wave 9
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,-120,-128,   7,  15,  23,  31,  39,  47,  55,
  // Wave 10
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,-120,-128,-120,  15,  23,  31,  39,  47,  55,
  // Wave 11
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,-120,-128,-120,-112,  23,  31,  39,  47,  55,
  // Wave 12
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,-120,-128,-120,-112,-104,  31,  39,  47,  55,
  // Wave 13
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,-120,-128,-120,-112,-104, -96,  39,  47,  55,
  // Wave 14
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,-120,-128,-120,-112,-104, -96, -88,  47,  55,
  // Wave 15
  -64, -64, -48, -40, -32, -24, -16,  -8,   0,  -8, -16, -24, -32, -40, -48, -56,
  -64, -72, -80, -88, -96,-104,-112,-120,-128,-120,-112,-104, -96, -88, -80,  55,
  // Waves 16-31: pulse waves (32 bytes each, varying duty cycle)
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
   127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127, 127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127, 127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127, 127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127, 127, 127, 127, 127, 127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,
  -127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127,-127, 127, 127, 127, 127,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128, 127, 127, 127,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128, 127, 127,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,
  -128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128,-128, 127,
  // Waves 32-39: tiny pulse waves (16 bytes each)
  -128,-128,-128,-128,-128,-128,-128,-128, 127, 127, 127, 127, 127, 127, 127, 127,
  -128,-128,-128,-128,-128,-128,-128, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -128,-128,-128,-128,-128,-128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -128,-128,-128,-128,-128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -128,-128,-128,-128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -128,-128,-128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -128,-128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  -128, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  // Wave 40: sawtooth (32 bytes)
  -128,-128,-112,-104, -96, -88, -80, -72, -64, -56, -48, -40, -32, -24, -16,  -8,
     0,   8,  16,  24,  32,  40,  48,  56,  64,  72,  80,  88,  96, 104, 112, 127,
  // Wave 41: tiny sawtooth (16 bytes)
  -128, -96, -80, -64, -48, -32, -16,   0,  16,  32,  48,  64,  80,  96, 112, 127,
  // Wave 42: custom waveform 1 (32 bytes)
   69,  69, 121, 125, 122, 119, 112, 102,  97,  88,  83,  77,  44,  32,  24,  18,
    4, -37, -45, -51, -58, -68, -75, -82, -88, -93, -99,-103,-109,-114,-117,-118,
  // Wave 43: custom waveform 2 (32 bytes)
   69,  69, 121, 125, 122, 119, 112, 102,  91,  75,  67,  55,  44,  32,  24,  18,
    4,  -8, -24, -37, -49, -58, -66, -80, -88, -92, -98,-102,-107,-108,-115,-125,
  // Wave 44: tiny triangle (16 bytes)
    0,   0,  64,  96, 127,  96,  64,  32,   0, -32, -64, -96,-128, -96, -64, -32,
  // Wave 45: tiny triangle variant (16 bytes)
    0,   0,  64,  96, 127,  96,  64,  32,   0, -32, -64, -96,-128, -96, -64, -32,
  // Wave 46: sawtooth + tiny saw combined (48 bytes)
  -128,-128,-112,-104, -96, -88, -80, -72, -64, -56, -48, -40, -32, -24, -16,  -8,
     0,   8,  16,  24,  32,  40,  48,  56,  64,  72,  80,  88,  96, 104, 112, 127,
  -128, -96, -80, -64, -48, -32, -16,   0,  16,  32,  48,  64,  80,  96, 112, 127,
];

/**
 * Extract a single FC13 built-in waveform as an unsigned Uint8Array.
 * @param waveIndex 0-46 — index into FC13_WAVES length table
 */
function extractFC13Wave(waveIndex: number): Uint8Array {
  if (waveIndex < 0 || waveIndex >= 47) return new Uint8Array(0);
  let dataOffset = 47; // PCM data starts after 47 length values
  for (let i = 0; i < waveIndex; i++) {
    dataOffset += FC13_WAVES[i] * 2; // length in words → bytes
  }
  const byteLen = FC13_WAVES[waveIndex] * 2;
  const result = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    result[i] = FC13_WAVES[dataOffset + i] & 0xFF;
  }
  return result;
}

// ── FC Voice State for Macro Simulation ───────────────────────────────────

interface FCVoiceState {
  // Pattern state
  note: number;          // Current note (1-72)
  transpose: number;     // Channel transpose from sequence
  pitch: number;         // Accumulated pitch offset (period delta)

  // Freq macro state
  frqMacroIdx: number;   // Current freq macro index
  frqStep: number;       // Position within freq macro (0-63)
  frqSustain: number;    // Sustain counter
  frqTranspose: number;  // Pitch transpose from freq macro

  // Vol macro state
  volMacroIdx: number;   // Current vol macro index
  volStep: number;       // Position within vol data (relative to byte 5)
  volCtr: number;        // Tick counter for vol speed
  volSpeed: number;      // Ticks per vol step
  volSustain: number;    // Sustain counter

  // Volume bend (from vol macro 0xEA opcode)
  volBendFlag: number;   // Alternates each tick
  volBendSpeed: number;  // Volume change per active tick
  volBendTime: number;   // Remaining bend ticks

  // Output
  volume: number;        // Current volume (0-64)
  enabled: number;       // Voice enabled flag

  // Vibrato (from vol macro header / freq macro 0xE3)
  vibratoFlag: number;   // Direction: 0=decreasing, 1=increasing
  vibratoSpeed: number;  // Speed of oscillation
  vibratoDepth: number;  // Amplitude
  vibratoDelay: number;  // Ticks before vibrato starts
  vibrato: number;       // Current vibrato position

  // Pitch bend (from freq macro 0xEA)
  pitchBendFlag: number; // Alternates each tick
  pitchBendSpeed: number;
  pitchBendTime: number;

  // Portamento (from pattern data)
  portamentoFlag: number; // Alternates each tick
  portamento: number;     // Portamento value

  // Waveform tracking
  currentWaveform: number; // Current waveform/sample index (-1 = none)
}

function createVoice(): FCVoiceState {
  return {
    note: 0, transpose: 0, pitch: 0,
    frqMacroIdx: 0, frqStep: 0, frqSustain: 0, frqTranspose: 0,
    volMacroIdx: 0, volStep: 0, volCtr: 1, volSpeed: 1, volSustain: 0,
    volBendFlag: 0, volBendSpeed: 0, volBendTime: 0,
    volume: 0, enabled: 0,
    vibratoFlag: 0, vibratoSpeed: 0, vibratoDepth: 0, vibratoDelay: 0, vibrato: 0,
    pitchBendFlag: 0, pitchBendSpeed: 0, pitchBendTime: 0,
    portamentoFlag: 0, portamento: 0,
    currentWaveform: -1,
  };
}

// ── Freq Macro Processing (ported from FlodJS FCPlayer.process) ───────────

function processFreqMacro(voice: FCVoiceState, freqMacros: Uint8Array[]): void {
  let loopSustain: boolean;
  do {
    loopSustain = false;

    if (voice.frqSustain > 0) {
      voice.frqSustain--;
      break;
    }

    let fm = freqMacros[voice.frqMacroIdx];
    if (!fm) break;

    let loopEffect: boolean;
    do {
      loopEffect = false;
      if (voice.frqStep >= 64) break;

      let info = fm[voice.frqStep];
      if (info === 0xE1) break; // end

      // 0xE0: loop — jump to target position within this macro
      if (info === 0xE0) {
        voice.frqStep = (voice.frqStep + 1 < 64 ? fm[voice.frqStep + 1] : 0) & 0x3F;
        if (voice.frqStep >= 64) break;
        info = fm[voice.frqStep];
        if (info === 0xE1) break;
      }

      switch (info) {
        case 0xE2: // set wave + reset volume position
          voice.enabled = 1;
          voice.volCtr = 1;
          voice.volStep = 0;
          if (voice.frqStep + 1 < 64) {
            voice.currentWaveform = fm[voice.frqStep + 1];
          }
          voice.frqStep += 2;
          break;
        case 0xE4: // change wave (no vol reset)
          if (voice.frqStep + 1 < 64) {
            voice.currentWaveform = fm[voice.frqStep + 1];
          }
          voice.frqStep += 2;
          break;

        case 0xE9: { // SSMP pack sample
          if (voice.frqStep + 2 < 64) {
            voice.currentWaveform = 100 + fm[voice.frqStep + 1] * 10 + fm[voice.frqStep + 2];
          }
          voice.enabled = 1;
          voice.volCtr = 1;
          voice.volStep = 0;
          voice.frqStep += 3;
          break;
        }

        case 0xE7: { // jump to different freq macro
          loopEffect = true;
          if (voice.frqStep + 1 < 64) {
            const newIdx = fm[voice.frqStep + 1];
            if (newIdx < freqMacros.length) {
              voice.frqMacroIdx = newIdx;
              fm = freqMacros[newIdx];
            }
          }
          voice.frqStep = 0;
          break;
        }

        case 0xEA: // pitch bend
          if (voice.frqStep + 2 < 64) {
            voice.pitchBendSpeed = s8(fm[voice.frqStep + 1]);
            voice.pitchBendTime = fm[voice.frqStep + 2];
          }
          voice.frqStep += 3;
          break;

        case 0xE8: // sustain
          loopSustain = true;
          if (voice.frqStep + 1 < 64) {
            voice.frqSustain = fm[voice.frqStep + 1];
          }
          voice.frqStep += 2;
          break;

        case 0xE3: // new vibrato parameters
          if (voice.frqStep + 2 < 64) {
            voice.vibratoSpeed = fm[voice.frqStep + 1];
            voice.vibratoDepth = fm[voice.frqStep + 2];
          }
          voice.frqStep += 3;
          break;

        default:
          // Not an opcode — handled as transpose below
          break;
      }

      // Read freq transpose value (unless sustain or loop effect interrupted)
      if (!loopSustain && !loopEffect) {
        if (voice.frqStep < 64) {
          voice.frqTranspose = s8(fm[voice.frqStep]);
          voice.frqStep++;
        }
      }
    } while (loopEffect);
  } while (loopSustain);
}

// ── Vol Macro Processing ──────────────────────────────────────────────────

function processVolMacro(voice: FCVoiceState, volMacros: Uint8Array[]): void {
  if (voice.volSustain > 0) {
    voice.volSustain--;
    return;
  }

  if (voice.volBendTime > 0) {
    // Volume bend: alternates each tick
    voice.volBendFlag ^= 1;
    if (voice.volBendFlag) {
      voice.volBendTime--;
      voice.volume += voice.volBendSpeed;
      if (voice.volume < 0 || voice.volume > 64) voice.volBendTime = 0;
    }
    return;
  }

  // Decrement vol counter; only advance when it reaches 0
  voice.volCtr--;
  if (voice.volCtr > 0) return;
  voice.volCtr = voice.volSpeed;

  const vm = volMacros[voice.volMacroIdx];
  if (!vm) return;

  let loopEffect: boolean;
  do {
    loopEffect = false;
    const pos = 5 + voice.volStep; // data starts at byte 5 (after header)
    if (pos >= 64) break;

    const info = vm[pos];
    if (info === 0xE1) break; // end — hold current volume

    switch (info) {
      case 0xEA: // volume slide
        if (pos + 2 < 64) {
          voice.volBendSpeed = s8(vm[pos + 1]);
          voice.volBendTime = vm[pos + 2];
        }
        voice.volStep += 3;
        // Apply first tick of bend immediately
        voice.volBendFlag ^= 1;
        if (voice.volBendFlag) {
          voice.volBendTime--;
          voice.volume += voice.volBendSpeed;
          if (voice.volume < 0 || voice.volume > 64) voice.volBendTime = 0;
        }
        break;

      case 0xE8: // volume sustain
        if (pos + 1 < 64) {
          voice.volSustain = vm[pos + 1];
        }
        voice.volStep += 2;
        break;

      case 0xE0: { // volume loop
        loopEffect = true;
        const target = pos + 1 < 64 ? vm[pos + 1] & 0x3F : 5;
        voice.volStep = target - 5; // convert absolute offset to relative-to-data-start
        break;
      }

      default:
        // Direct volume value (0-64)
        voice.volume = info;
        voice.volStep++;
        break;
    }
  } while (loopEffect);
}

// ── Vibrato + Portamento + Pitch Bend Processing ──────────────────────────

function processVoicePitch(voice: FCVoiceState): void {
  // Vibrato
  if (voice.vibratoDelay > 0) {
    voice.vibratoDelay--;
  } else if (voice.vibratoSpeed > 0 && voice.vibratoDepth > 0) {
    let temp = voice.vibrato;
    if (voice.vibratoFlag) {
      const delta = voice.vibratoDepth << 1;
      temp += voice.vibratoSpeed;
      if (temp > delta) {
        temp = delta;
        voice.vibratoFlag = 0;
      }
    } else {
      temp -= voice.vibratoSpeed;
      if (temp < 0) {
        temp = 0;
        voice.vibratoFlag = 1;
      }
    }
    voice.vibrato = temp;
  }

  // Portamento (alternates each tick)
  voice.portamentoFlag ^= 1;
  if (voice.portamentoFlag && voice.portamento > 0) {
    if (voice.portamento > 0x1F) {
      voice.pitch += voice.portamento & 0x1F;
    } else {
      voice.pitch -= voice.portamento;
    }
  }

  // Pitch bend (alternates each tick)
  voice.pitchBendFlag ^= 1;
  if (voice.pitchBendFlag && voice.pitchBendTime > 0) {
    voice.pitchBendTime--;
    voice.pitch -= voice.pitchBendSpeed;
  }
}

// ── Main Parser ───────────────────────────────────────────────────────────

export function parseFCFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== 'FC13' && magic !== 'FC14' && magic !== 'SMOD') {
    throw new Error(`Not a Future Composer file: magic="${magic}"`);
  }
  const isFC14 = magic === 'FC14';

  // ── Header fields ─────────────────────────────────────────────────────────
  let off = 4;
  const seqLen       = u32BE(buf, off);  off += 4;
  const patPtr       = u32BE(buf, off);  off += 4;
  const patLen       = u32BE(buf, off);  off += 4;
  const freqMacroPtr = u32BE(buf, off);  off += 4;
  const freqMacroLen = u32BE(buf, off);  off += 4;
  const volMacroPtr  = u32BE(buf, off);  off += 4;
  const volMacroLen  = u32BE(buf, off);  off += 4;
  const samplePtr    = u32BE(buf, off);  off += 4;
  const wavePtr      = u32BE(buf, off);  off += 4;

  // ── 10 sample definitions (6 bytes each: len, loopStart, loopLen — u16 BE) ──
  const sampleDefs: Array<{ len: number; loopStart: number; loopLen: number }> = [];
  for (let i = 0; i < 10; i++) {
    sampleDefs.push({
      len:       u16BE(buf, off),
      loopStart: u16BE(buf, off + 2),
      loopLen:   u16BE(buf, off + 4),
    });
    off += 6;
  }

  // ── FC14: 80 wavetable lengths (one byte each) ────────────────────────────
  const waveLengths: number[] = [];
  if (isFC14) {
    for (let i = 0; i < 80; i++) waveLengths.push(buf[off++]);
  }

  // ── Sequences (13 bytes each, seqLen/13 entries) ──────────────────────────
  const numSeqs = Math.floor(seqLen / 13);
  const sequences: Array<{
    pat:       [number, number, number, number];
    transpose: [number, number, number, number];
    offsetIns: [number, number, number, number];
    speed:     number;
  }> = [];

  for (let i = 0; i < numSeqs; i++) {
    sequences.push({
      pat:       [buf[off],      buf[off + 3],  buf[off + 6],  buf[off + 9]] as [number, number, number, number],
      transpose: [s8(buf[off + 1]), s8(buf[off + 4]), s8(buf[off + 7]), s8(buf[off + 10])] as [number, number, number, number],
      offsetIns: [s8(buf[off + 2]), s8(buf[off + 5]), s8(buf[off + 8]), s8(buf[off + 11])] as [number, number, number, number],
      speed:     buf[off + 12],
    });
    off += 13;
  }

  // ── Patterns (64 bytes each = 32 rows × 2 bytes: note + val) ─────────────
  const numFCPatterns = Math.floor(patLen / 64);
  const fcPatterns: Array<{ note: Uint8Array; val: Uint8Array }> = [];
  for (let i = 0; i < numFCPatterns; i++) {
    const base = patPtr + i * 64;
    const note = new Uint8Array(32);
    const val  = new Uint8Array(32);
    for (let row = 0; row < 32; row++) {
      note[row] = buf[base + row * 2];
      val[row]  = buf[base + row * 2 + 1];
    }
    fcPatterns.push({ note, val });
  }

  // ── Freq macros (64 bytes each) ───────────────────────────────────────────
  const numFreqMacros = Math.floor(freqMacroLen / 64);
  const freqMacros: Uint8Array[] = [];
  for (let i = 0; i < numFreqMacros; i++) {
    freqMacros.push(buf.slice(freqMacroPtr + i * 64, freqMacroPtr + i * 64 + 64));
  }

  // ── Vol macros (64 bytes each) ────────────────────────────────────────────
  const numVolMacros = Math.floor(volMacroLen / 64);
  const volMacros: Uint8Array[] = [];
  for (let i = 0; i < numVolMacros; i++) {
    volMacros.push(buf.slice(volMacroPtr + i * 64, volMacroPtr + i * 64 + 64));
  }

  // ── Sample PCM data (8-bit signed, len*2 bytes per sample) ───────────────
  const samplePCMs: Uint8Array[] = [];
  let sampleReadOff = samplePtr;
  for (let i = 0; i < 10; i++) {
    const byteLen = sampleDefs[i].len * 2;
    if (byteLen > 0 && sampleReadOff + byteLen <= buf.length) {
      samplePCMs.push(buf.slice(sampleReadOff, sampleReadOff + byteLen));
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
    sampleReadOff += byteLen;
  }

  // ── FC14 wavetable PCM data ───────────────────────────────────────────────
  const waveTablePCMs: Uint8Array[] = [];
  if (isFC14) {
    let waveReadOff = wavePtr;
    for (let i = 0; i < 80; i++) {
      const byteLen = waveLengths[i] * 2;
      if (byteLen > 0 && waveReadOff + byteLen <= buf.length) {
        waveTablePCMs.push(buf.slice(waveReadOff, waveReadOff + byteLen));
      } else {
        waveTablePCMs.push(new Uint8Array(0));
      }
      waveReadOff += byteLen;
    }
  }

  // ── On-demand instrument creation ─────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];
  const waveToInstrument = new Map<number, number>();
  let nextInstrumentId = 1;

  function getOrCreateInstrument(waveIdx: number): number {
    if (waveToInstrument.has(waveIdx)) return waveToInstrument.get(waveIdx)!;

    const id = nextInstrumentId++;
    waveToInstrument.set(waveIdx, id);

    if (waveIdx < 10) {
      // PCM sample (indices 0-9)
      if (sampleDefs[waveIdx].len > 0) {
        const def = sampleDefs[waveIdx];
        const loopStart = def.loopLen > 1 ? def.loopStart * 2 : 0;
        const loopEnd   = def.loopLen > 1 ? (def.loopStart + def.loopLen) * 2 : 0;
        instruments.push(createSamplerInstrument(
          id, `Sample ${waveIdx}`, samplePCMs[waveIdx], 64, 8287, loopStart, loopEnd
        ));
      } else {
        instruments.push(makePlaceholder(id, `Sample ${waveIdx}`));
      }
    } else if (!isFC14 && waveIdx >= 10 && waveIdx < 57) {
      // FC13 built-in waveform (indices 10-56 → wave table 0-46)
      const pcm = extractFC13Wave(waveIdx - 10);
      if (pcm.length > 0) {
        instruments.push(createSamplerInstrument(
          id, `Wave ${waveIdx - 10}`, pcm, 64, 8287, 0, pcm.length
        ));
      } else {
        instruments.push(makePlaceholder(id, `Wave ${waveIdx - 10}`));
      }
    } else if (isFC14 && waveIdx >= 10 && waveIdx < 90) {
      // FC14 custom wavetable (indices 10-89 → wavetable 0-79)
      const wtIdx = waveIdx - 10;
      const pcm = wtIdx < waveTablePCMs.length ? waveTablePCMs[wtIdx] : new Uint8Array(0);
      if (pcm.length > 0) {
        instruments.push(createSamplerInstrument(
          id, `WaveTable ${wtIdx}`, pcm, 64, 8287, 0, pcm.length
        ));
      } else {
        instruments.push(makePlaceholder(id, `WaveTable ${wtIdx}`));
      }
    } else if (waveIdx >= 100) {
      // SSMP pack sample — create placeholder (pack data not extracted yet)
      instruments.push(makePlaceholder(id, `Pack ${Math.floor((waveIdx - 100) / 10)}:${(waveIdx - 100) % 10}`));
    } else {
      instruments.push(makePlaceholder(id, `Unknown ${waveIdx}`));
    }

    return id;
  }

  function makePlaceholder(id: number, name: string): InstrumentConfig {
    return {
      id,
      name,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: -6,
      pan: 0,
    } as InstrumentConfig;
  }

  // ── Macro simulation → TrackerSong patterns ─────────────────────────────
  const voices: FCVoiceState[] = [createVoice(), createVoice(), createVoice(), createVoice()];
  let currentSpeed = 3;
  const trackerPatterns: Pattern[] = [];

  for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
    const seq = sequences[seqIdx];
    const channelRows: TrackerCell[][] = [[], [], [], []];

    // Speed from sequence
    if (seq.speed > 0) currentSpeed = seq.speed;

    for (let row = 0; row < 32; row++) {
      // ── Pattern tick: read note/val data for each channel ──
      const triggered: boolean[] = [false, false, false, false];
      const waveformBefore: number[] = voices.map(v => v.currentWaveform);

      for (let ch = 0; ch < 4; ch++) {
        const voice = voices[ch];
        const patIdx = seq.pat[ch];
        const fcPat = patIdx < fcPatterns.length ? fcPatterns[patIdx] : null;
        const fcNote = fcPat ? fcPat.note[row] : 0;
        const fcVal  = fcPat ? fcPat.val[row]  : 0;

        if (fcNote !== 0 && fcNote < 0x49) {
          // Note trigger
          voice.note = fcNote & 0x7F;
          voice.pitch = 0;
          voice.portamento = 0;
          voice.enabled = 0;
          triggered[ch] = true;

          // Initialize vol/freq macros from instrument
          const instrIdx = Math.max(0, (fcVal & 0x3F) + seq.offsetIns[ch]);
          if (instrIdx < volMacros.length) {
            const vm = volMacros[instrIdx];
            voice.volMacroIdx = instrIdx;
            voice.volStep = 0;
            voice.volSpeed = vm[0] || 1;
            voice.volCtr = voice.volSpeed;
            voice.volSustain = 0;

            const freqIdx = vm[1];
            if (freqIdx < freqMacros.length) {
              voice.frqMacroIdx = freqIdx;
            }
            voice.frqStep = 0;
            voice.frqSustain = 0;

            voice.vibratoFlag = 0;
            voice.vibratoSpeed = vm[2];
            voice.vibratoDepth = vm[3];
            voice.vibrato = vm[3];
            voice.vibratoDelay = vm[4];

            voice.volBendFlag = 0;
            voice.volBendSpeed = 0;
            voice.volBendTime = 0;
            voice.pitchBendFlag = 0;
            voice.pitchBendSpeed = 0;
            voice.pitchBendTime = 0;
          }
        }

        // Handle portamento from pattern
        if (fcVal & 0x40) {
          voice.portamento = 0;
        } else if (fcVal & 0x80) {
          if (row < 31 && fcPat) {
            voice.portamento = fcPat.val[row + 1];
            if (!isFC14) voice.portamento <<= 1; // FC13 doubles portamento
          }
        }
      }

      // ── Run speed ticks of macro simulation ──
      for (let tick = 0; tick < currentSpeed; tick++) {
        for (let ch = 0; ch < 4; ch++) {
          processFreqMacro(voices[ch], freqMacros);
          processVolMacro(voices[ch], volMacros);
          processVoicePitch(voices[ch]);
        }
      }

      // ── Capture output state → TrackerCells ──
      for (let ch = 0; ch < 4; ch++) {
        const voice = voices[ch];
        const fcPat = seq.pat[ch] < fcPatterns.length ? fcPatterns[seq.pat[ch]] : null;
        const fcNote = fcPat ? fcPat.note[row] : 0;

        let xmNote = 0;
        if (triggered[ch]) {
          xmNote = fcNoteToXM(voice.note, seq.transpose[ch]);
        } else if (fcNote === 0x49 || (fcPat && fcPat.val[row] === 0xF0)) {
          xmNote = 97; // note off
        }

        // Instrument: emit on note trigger or waveform change
        let instrument = 0;
        if (voice.currentWaveform >= 0) {
          if (triggered[ch] || voice.currentWaveform !== waveformBefore[ch]) {
            instrument = getOrCreateInstrument(voice.currentWaveform);
          }
        }

        // Volume from simulation (0-64 → XM volume column 0x10-0x50)
        const vol = Math.max(0, Math.min(64, voice.volume));
        const xmVolume = (triggered[ch] || voice.enabled) ? (0x10 + vol) : 0;

        // Effects: approximate vibrato and portamento as XM effects
        let effTyp = 0, eff = 0;
        let effTyp2 = 0, eff2 = 0;

        // Vibrato → 4xy (x=speed 0-F, y=depth 0-F)
        if (voice.vibratoSpeed > 0 && voice.vibratoDepth > 0 && voice.vibratoDelay === 0) {
          effTyp = 0x04;
          const vSpeed = Math.min(voice.vibratoSpeed, 15);
          const vDepth = Math.min(voice.vibratoDepth, 15);
          eff = (vSpeed << 4) | vDepth;
        }

        // Portamento → 1xx (up) / 2xx (down) — only if no vibrato effect
        if (effTyp === 0 && voice.portamento > 0) {
          if (voice.portamento > 0x1F) {
            effTyp = 0x02; // period increases → pitch down
            eff = Math.min(voice.portamento & 0x1F, 0xFF);
          } else {
            effTyp = 0x01; // period decreases → pitch up
            eff = Math.min(voice.portamento, 0xFF);
          }
        }

        // Pitch bend → 1xx/2xx (only if no other effect)
        if (effTyp === 0 && voice.pitchBendTime > 0 && voice.pitchBendSpeed !== 0) {
          if (voice.pitchBendSpeed > 0) {
            effTyp = 0x01; // pitch -= speed → period decreases → pitch up
            eff = Math.min(voice.pitchBendSpeed, 0xFF);
          } else {
            effTyp = 0x02;
            eff = Math.min(-voice.pitchBendSpeed, 0xFF);
          }
        }

        // Speed effect on channel 3, row 0
        if (ch === 3 && row === 0 && seq.speed > 0) {
          if (effTyp === 0) {
            effTyp = 0x0F;
            eff = seq.speed;
          } else {
            effTyp2 = 0x0F;
            eff2 = seq.speed;
          }
        }

        channelRows[ch].push({
          note: xmNote, instrument, volume: xmVolume,
          effTyp, eff, effTyp2, eff2,
        });
      }
    }

    // Build TrackerPattern from channelRows
    trackerPatterns.push({
      id: `pattern-${seqIdx}`,
      name: `Pattern ${seqIdx}`,
      length: 32,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL hard stereo
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'FC',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numFCPatterns,
        originalInstrumentCount: numVolMacros || 10,
      },
    });
  }

  // Fallback: at least one empty pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 32,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL hard stereo
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 32 }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'FC',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name: moduleName,
    format: 'FC' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: sequences.length > 0 && sequences[0].speed > 0 ? sequences[0].speed : 3,
    initialBPM: 125,
    linearPeriods: false,
  };
}
