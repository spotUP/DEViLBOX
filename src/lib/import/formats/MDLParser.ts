/**
 * MDLParser.ts — Digitrakker (.mdl) format parser
 *
 * Digitrakker MDL is a PC DOS tracker format by Harald Zappe.
 * It uses a RIFF-style chunk structure with 2-byte chunk IDs.
 *
 * Binary layout:
 *   +0   MDLFileHeader (5 bytes): id[4]="DMDL", version(u8)
 *   +5   RIFF-style chunks, each:
 *          id(u16le) + length(u32le) + data[length]
 *
 * Chunk IDs (little-endian 16-bit magic):
 *   "IN" = Info block (song name, speed, tempo, order list, channel setup)
 *   "ME" = Message (song message text)
 *   "PA" = Patterns (pattern header + track index table per pattern)
 *   "PN" = Pattern names
 *   "TR" = Tracks (compressed per-channel track data)
 *   "II" = Instruments
 *   "VE" = Volume envelopes
 *   "PE" = Panning envelopes
 *   "FE" = Frequency envelopes
 *   "IS" = Sample info (sample headers + filenames + c5speed + loop points)
 *   "SA" = Sample audio data (MDL-compressed)
 *
 * Track encoding (per track):
 *   byte = (x<<2) | y
 *   y=0: skip (x+1) empty rows
 *   y=1: repeat previous note (x+1) times
 *   y=2: copy note from row x
 *   y=3: new note data; x = flags:
 *     bit 0 (MDLNOTE_NOTE)   = note byte follows (>120 = key-off, else 1-based note)
 *     bit 1 (MDLNOTE_SAMPLE) = sample byte follows
 *     bit 2 (MDLNOTE_VOLUME) = volume byte follows
 *     bit 3 (MDLNOTE_EFFECTS)= effects byte follows: low nibble=e1, high nibble=e2
 *     bit 4 (MDLNOTE_PARAM1) = param1 byte follows
 *     bit 5 (MDLNOTE_PARAM2) = param2 byte follows
 *
 * Sample data uses MDL delta compression (flags & 0x0C != 0).
 *
 * Reference: OpenMPT soundlib/Load_mdl.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ─────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readStringPadded(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c !== 0) s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── MDL note bit flags ─────────────────────────────────────────────────────────

const MDLNOTE_NOTE    = 1 << 0;
const MDLNOTE_SAMPLE  = 1 << 1;
const MDLNOTE_VOLUME  = 1 << 2;
const MDLNOTE_EFFECTS = 1 << 3;
const MDLNOTE_PARAM1  = 1 << 4;
const MDLNOTE_PARAM2  = 1 << 5;

// ── MDL effect translation ─────────────────────────────────────────────────────
// OpenMPT MDLEffTrans array (index → XM effect type):
// 0=none, 1=porta-up, 2=porta-dn, 3=tone-porta, 4=vibrato, 5=arpeggio,
// 6=none, 7=tempo, 8=panning, 9=S3Mcmdex, A=none, B=pos-jump, C=global-vol,
// D=pat-break, E=S3Mcmdex, F=speed,
// G=vol-slide-up(0x10), H=vol-slide-dn(0x11), I=retrig(0x1B), J=tremolo(0x07),
// K=tremor(0x1D), L=none
// XM/OpenMPT internal command codes (effTyp field):
const MDL_EFF_PORTA_UP    = 0x01;
const MDL_EFF_PORTA_DN    = 0x02;
const MDL_EFF_TONE_PORTA  = 0x03;
const MDL_EFF_VIBRATO     = 0x04;
const MDL_EFF_ARPEGGIO    = 0x00; // arpeggio is effTyp 0 (same as none, but with param)
const MDL_EFF_TEMPO       = 0x0F; // Fxx
const MDL_EFF_PANNING     = 0x08;
const MDL_EFF_POS_JUMP    = 0x0B;
const MDL_EFF_GLOBAL_VOL  = 0x10; // Cxx global volume (XM Gxx = 0x10)
const MDL_EFF_PAT_BREAK   = 0x0D;
const MDL_EFF_SPEED       = 0x0F; // Fxx (same as tempo; separate table entry)
const MDL_EFF_VOL_SLIDE   = 0x0A; // Dxx
const MDL_EFF_RETRIG      = 0x1B;
const MDL_EFF_TREMOLO     = 0x07;
const MDL_EFF_TREMOR      = 0x1D;

// MDL command 0 = none
// MDL commands 1-6 are for first effect column only
// MDL commands 7-F are for either column
// MDL commands G-L (offset 16-21) are for second effect column (mapped from 1-6 + 15)

interface MDLEffPair {
  effTyp: number;
  eff:    number;
}

/**
 * Convert a single MDL effect command + param into effTyp/eff.
 * Mirrors OpenMPT's ConvertMDLCommand().
 */
function convertMDLCommand(command: number, param: number): MDLEffPair {
  // MDL effect table (0-based index = MDL command number)
  // Commands 0..21 per MDLEffTrans in Load_mdl.cpp:
  // idx: 0=none,1=portaUp,2=portaDn,3=tonePorta,4=vibrato,5=arpeggio,6=none,
  //      7=tempo,8=pan,9=S3Mcmdex,A=none,B=posJump,C=globalVol,D=patBreak,
  //      E=S3Mcmdex,F=speed,
  //      10=volslide-up,11=volslide-dn,12=retrig,13=tremolo,14=tremor,15=none

  switch (command) {
    case 0x00: return { effTyp: 0x00, eff: 0 };
    case 0x01: return { effTyp: MDL_EFF_PORTA_UP, eff: param };
    case 0x02: return { effTyp: MDL_EFF_PORTA_DN, eff: param };
    case 0x03: return { effTyp: MDL_EFF_TONE_PORTA, eff: param };
    case 0x04: return { effTyp: MDL_EFF_VIBRATO, eff: param };
    case 0x05: return { effTyp: MDL_EFF_ARPEGGIO, eff: param }; // arpeggio = effTyp 0 with param
    case 0x06: return { effTyp: 0x00, eff: 0 };

    case 0x07: // Tempo — Fxx with value clamped to >= 0x20
      return { effTyp: MDL_EFF_TEMPO, eff: Math.max(0x20, param) };

    case 0x08: // Panning — param: (param & 0x7F) * 2
      return { effTyp: MDL_EFF_PANNING, eff: (param & 0x7F) * 2 };

    case 0x09: // Set Envelope (S3M extended)
      // We can only have one envelope per type; map to S3M-style enable
      if (param < 0x40)       return { effTyp: 0x0E, eff: 0x78 }; // vol envelope enable
      else if (param < 0x80)  return { effTyp: 0x0E, eff: 0x7A }; // pan envelope enable
      else if (param < 0xC0)  return { effTyp: 0x0E, eff: 0x7C }; // pitch envelope enable
      else                    return { effTyp: 0x00, eff: 0 };

    case 0x0A: return { effTyp: 0x00, eff: 0 };

    case 0x0B: return { effTyp: MDL_EFF_POS_JUMP, eff: param };

    case 0x0C: // Global volume — param: (param+1)/2
      return { effTyp: MDL_EFF_GLOBAL_VOL, eff: Math.floor((param + 1) / 2) };

    case 0x0D: { // Pattern break — BCD param to decimal
      const decimal = 10 * (param >> 4) + (param & 0x0F);
      return { effTyp: MDL_EFF_PAT_BREAK, eff: decimal };
    }

    case 0x0E: { // Special S3M-style extended effects
      const hi = param >> 4;
      const lo = param & 0x0F;
      switch (hi) {
        case 0x0: return { effTyp: 0x00, eff: 0 }; // unused
        case 0x1: // Pan slide left — maps to CMD_PANNINGSLIDE
          return { effTyp: 0x19, eff: (Math.min(lo, 0x0E) << 4) | 0x0F };
        case 0x2: // Pan slide right
          return { effTyp: 0x19, eff: 0xF0 | Math.min(lo, 0x0E) };
        case 0x3: return { effTyp: 0x00, eff: 0 }; // unused
        case 0x4: // Vibrato waveform
          return { effTyp: 0x0E, eff: 0x30 | lo };
        case 0x5: { // Set finetune
          const fineEff = (lo << 4) ^ 0x80;
          return { effTyp: 0x21, eff: fineEff }; // CMD_FINETUNE
        }
        case 0x6: // Pattern loop
          return { effTyp: 0x0E, eff: 0xB0 | lo };
        case 0x7: // Tremolo waveform
          return { effTyp: 0x0E, eff: 0x40 | lo };
        case 0x8: return { effTyp: 0x00, eff: 0 }; // Set sample loop type — ignored
        case 0x9: // Retrig (lower nibble only)
          return { effTyp: MDL_EFF_RETRIG, eff: lo };
        case 0xA: { // Global vol slide up
          const upParam = 0xF0 & (((lo + 1) << 3) & 0xF0);
          return { effTyp: 0x11, eff: upParam }; // CMD_GLOBALVOLSLIDE
        }
        case 0xB: { // Global vol slide down
          const dnParam = ((lo + 1) >> 1) & 0xFF;
          return { effTyp: 0x11, eff: dnParam }; // CMD_GLOBALVOLSLIDE
        }
        case 0xC: // Note cut
          return { effTyp: 0x0E, eff: 0xC0 | lo };
        case 0xD: // Note delay
          return { effTyp: 0x0E, eff: 0xD0 | lo };
        case 0xE: // Pattern delay
          return { effTyp: 0x0E, eff: 0xE0 | lo };
        case 0xF: // Offset (CMD_OFFSET) — further handled in ImportMDLCommands
          return { effTyp: 0x09, eff: param }; // will be post-processed
        default:
          return { effTyp: 0x00, eff: 0 };
      }
    }

    case 0x0F: return { effTyp: MDL_EFF_SPEED, eff: param };

    case 0x10: { // Volslide up (G in MDL)
      // 00..DF regular slide (4x more precise than XM)
      // E0..EF extra fine slide
      // F0..FF regular fine slide
      let p = param;
      if (p < 0xE0) {
        p >>= 2;
        if (p > 0x0F) p = 0x0F;
        p <<= 4;
      } else if (p < 0xF0) {
        p = (((p & 0x0F) << 2) | 0x0F);
      } else {
        p = ((p << 4) | 0x0F);
      }
      return { effTyp: MDL_EFF_VOL_SLIDE, eff: p };
    }

    case 0x11: { // Volslide down (H in MDL)
      let p = param;
      if (p < 0xE0) {
        p >>= 2;
        if (p > 0x0F) p = 0x0F;
        // result already in lo nibble (no shift)
      } else if (p < 0xF0) {
        p = (((p & 0x0F) >> 2) | 0xF0);
      }
      // F0..FF: pass through unchanged
      return { effTyp: MDL_EFF_VOL_SLIDE, eff: p };
    }

    case 0x12: return { effTyp: MDL_EFF_RETRIG, eff: param };   // I
    case 0x13: return { effTyp: MDL_EFF_TREMOLO, eff: param };  // J
    case 0x14: return { effTyp: MDL_EFF_TREMOR, eff: param };   // K
    case 0x15: return { effTyp: 0x00, eff: 0 };                 // L (none)

    default:
      return { effTyp: 0x00, eff: 0 };
  }
}

/**
 * Import MDL commands into a TrackerCell.
 * Mirrors OpenMPT's ImportMDLCommands() logic (simplified, without
 * the full CombineEffects/FillInTwoCommands infrastructure).
 */
function importMDLCommands(
  cell: TrackerCell,
  vol: number,
  cmd1Raw: number,
  cmd2Raw: number,
  param1: number,
  param2: number,
): void {
  // Map second effect column values 1-6 to G-L (indices 16-21)
  let cmd2 = cmd2Raw;
  if (cmd2 >= 1 && cmd2 <= 6) cmd2 += 15;

  const e1 = convertMDLCommand(cmd1Raw, param1);
  const e2 = convertMDLCommand(cmd2, param2);

  // Volume column: MDL vol 1-255 → XM vol = (vol + 2) / 4 (0-64 range)
  if (vol > 0) {
    cell.volume = Math.floor((vol + 2) / 4);
  }

  // Store primary effect
  if (e1.effTyp !== 0 || e1.eff !== 0) {
    cell.effTyp = e1.effTyp;
    cell.eff    = e1.eff;
  }

  // Store secondary effect in slot 2
  if (e2.effTyp !== 0 || e2.eff !== 0) {
    cell.effTyp2 = e2.effTyp;
    cell.eff2    = e2.eff;
  }
}

// ── MDL sample data decompressor ────────────────────────────────────────────────
// OpenMPT SampleIO::MDL compression: 8-bit or 16-bit delta PCM.
// The delta is applied to successive samples with bit-reversal unpacking.

/**
 * Decompress MDL 8-bit sample data (delta encoded, bit-reversed).
 * OpenMPT: each byte is a delta applied to running sum; bits are reversed.
 */
function decompressMDL8(src: Uint8Array, numSamples: number): Uint8Array {
  const out = new Uint8Array(numSamples);
  let acc = 0;
  let srcIdx = 0;
  for (let i = 0; i < numSamples && srcIdx < src.length; i++) {
    const b = src[srcIdx++];
    // Reverse bits of byte
    let rev = 0;
    for (let bit = 0; bit < 8; bit++) {
      rev |= ((b >> bit) & 1) << (7 - bit);
    }
    // Apply delta (signed)
    const delta = rev < 128 ? rev : rev - 256;
    acc = (acc + delta) & 0xFF;
    out[i] = acc;
  }
  return out;
}

/**
 * Decompress MDL 16-bit sample data (delta encoded, bit-reversed pairs).
 */
function decompressMDL16(src: Uint8Array, numSamples: number): Int16Array {
  const out = new Int16Array(numSamples);
  let acc = 0;
  let srcIdx = 0;
  for (let i = 0; i < numSamples && srcIdx + 1 < src.length; i++) {
    const lo = src[srcIdx++];
    const hi = src[srcIdx++];
    const raw = (hi << 8) | lo;
    // Reverse bits of 16-bit value
    let rev = 0;
    for (let bit = 0; bit < 16; bit++) {
      rev |= ((raw >> bit) & 1) << (15 - bit);
    }
    // Apply delta (signed)
    const delta = rev < 32768 ? rev : rev - 65536;
    acc = (acc + delta) & 0xFFFF;
    const signed = acc < 32768 ? acc : acc - 65536;
    out[i] = signed;
  }
  return out;
}

// ── Empty instrument placeholder ─────────────────────────────────────────────

function blankInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name || `Sample ${id}`,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    -60,
    pan:       0,
  } as InstrumentConfig;
}

// ── 16-bit PCM → WAV ArrayBuffer ─────────────────────────────────────────────

function pcm16ToWAV(samples: Int16Array, rate: number): ArrayBuffer {
  const numSamples = samples.length;
  const dataSize   = numSamples * 2;
  const fileSize   = 44 + dataSize;
  const buf        = new ArrayBuffer(fileSize);
  const view       = new DataView(buf);

  const ws = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  ws(0,  'RIFF');
  view.setUint32(4,  fileSize - 8, true);
  ws(8,  'WAVE');
  ws(12, 'fmt ');
  view.setUint32(16, 16,       true);
  view.setUint16(20, 1,        true);   // PCM
  view.setUint16(22, 1,        true);   // mono
  view.setUint32(24, rate,     true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2,        true);
  view.setUint16(34, 16,       true);
  ws(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(off, samples[i], true);
    off += 2;
  }
  return buf;
}

function createSamplerInstrument16(
  id: number,
  name: string,
  pcm: Int16Array,
  volume: number,
  sampleRate: number,
  loopStart: number,
  loopEnd: number,
): InstrumentConfig {
  const hasLoop  = loopEnd > loopStart && loopEnd > 2;
  const wavBuf   = pcm16ToWAV(pcm, sampleRate);
  const wavBytes = new Uint8Array(wavBuf);

  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < wavBytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...Array.from(wavBytes.subarray(i, Math.min(i + CHUNK, wavBytes.length))),
    );
  }
  const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;

  return {
    id,
    name: name.replace(/\0/g, '').trim() || `Sample ${id}`,
    type:      'sample'  as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    volume > 0 ? 20 * Math.log10(volume / 255) : -60,
    pan:       0,
    sample: {
      audioBuffer: wavBuf,
      url:         dataUrl,
      baseNote:    'C3',
      detune:      0,
      loop:        hasLoop,
      loopType:    hasLoop ? 'forward' as const : 'off' as const,
      loopStart,
      loopEnd:     loopEnd > 0 ? loopEnd : pcm.length,
      sampleRate,
      reverse:     false,
      playbackRate: 1.0,
    },
    metadata: {
      modPlayback: {
        usePeriodPlayback: false,
        periodMultiplier:  3546895,
        finetune:          0,
        defaultVolume:     Math.round(volume * 64 / 255),
      },
    },
  } as InstrumentConfig;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if buffer starts with a valid MDL file header.
 * Detection: "DMDL" magic at offset 0, version < 0x20.
 */
export function isMDLFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false;
  const v = new DataView(buffer);
  const id = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  const version = v.getUint8(4);
  return id === 'DMDL' && version < 0x20;
}

// ── Chunk reader ──────────────────────────────────────────────────────────────

interface MDLChunk {
  id:     number;  // uint16le
  offset: number;  // offset to start of chunk data (after 6-byte header)
  length: number;
}

function readChunks(v: DataView, startOff: number): Map<number, MDLChunk> {
  const chunks = new Map<number, MDLChunk>();
  let off = startOff;
  const fileLen = v.byteLength;

  while (off + 6 <= fileLen) {
    const id  = u16le(v, off);
    const len = u32le(v, off + 2);
    const dataOff = off + 6;

    if (dataOff + len > fileLen) break; // truncated chunk
    chunks.set(id, { id, offset: dataOff, length: len });
    off = dataOff + len;
  }

  return chunks;
}

// Chunk ID magic values (little-endian 16-bit)
const CHUNK_IN = 0x4E49; // "IN"
const CHUNK_PA = 0x4150; // "PA"
const CHUNK_TR = 0x5254; // "TR"
const CHUNK_IS = 0x5349; // "IS"
const CHUNK_SA = 0x4153; // "SA"

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Digitrakker MDL file into a TrackerSong.
 *
 * @throws If the file fails format validation or is fatally malformed.
 */
export async function parseMDLFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isMDLFormat(buffer)) {
    throw new Error('MDLParser: file does not match DMDL magic');
  }

  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  const fileVersion = u8(v, 4);

  // Read all chunks starting at byte 5
  const chunks = readChunks(v, 5);

  // ── Info block (IN chunk) ─────────────────────────────────────────────────
  const inChunk = chunks.get(CHUNK_IN);
  if (!inChunk) throw new Error('MDLParser: missing IN chunk');

  let inOff = inChunk.offset;
  const songTitle    = readStringPadded(v, inOff,      32);
  // composer at +32 (20 bytes) — not used in TrackerSong
  const numOrders    = u16le(v, inOff + 52);
  const restartPos   = u16le(v, inOff + 54);
  // globalVol at +56 (uint8)
  const speed        = u8(v, inOff + 57);
  const tempo        = u8(v, inOff + 58);
  // chnSetup[32] at +59
  const chnSetupOff  = inOff + 59;

  // Determine number of channels: last non-muted (bit7 clear) channel index + 1
  let numChannels = 0;
  for (let c = 0; c < 32; c++) {
    const setup = u8(v, chnSetupOff + c);
    if (!(setup & 0x80)) numChannels = c + 1;
  }
  if (numChannels < 1) numChannels = 1;

  // Read order list (numOrders × uint8) starting right after chnSetup[32]
  // MDLInfoBlock size = 91 bytes; orders start at inOff + 91
  const ordersOff = inOff + 91;
  const songPositions: number[] = [];
  for (let i = 0; i < numOrders && ordersOff + i < inChunk.offset + inChunk.length; i++) {
    songPositions.push(u8(v, ordersOff + i));
  }

  // Channel panning: chnSetup[c] & 0x7F * 2 → 0-254 (0-127 LE, 128-254 RE)
  const channelPan: number[] = [];
  for (let c = 0; c < numChannels; c++) {
    const setup = u8(v, chnSetupOff + c);
    let pan = (setup & 0x7F) * 2;
    if (pan >= 254) pan = 256; // surround/right edge
    // convert 0-256 to -128..+128 for ChannelData.pan
    channelPan.push(pan - 128);
  }

  // ── Check for muted channels that have data in PA/TR ─────────────────────
  // OpenMPT: scan PA chunk to find actual highest channel used
  // We honour this by expanding numChannels if needed (up to 32)
  // (simplified: we use the numChannels from the info block since we can't
  //  scan track data without reading the PA chunk first)

  // ── Read tracks (TR chunk) ────────────────────────────────────────────────
  // Each track = a compressed channel track for one pattern channel.
  // Format: uint16le numTracks, then per track: uint16le size + size bytes.

  interface MDLTrack {
    data: Uint8Array;
  }

  const tracks: MDLTrack[] = []; // 1-based; index 0 = unused placeholder

  const trChunk = chunks.get(CHUNK_TR);
  if (trChunk) {
    let trOff = trChunk.offset;
    const trEnd = trOff + trChunk.length;
    if (trOff + 2 <= trEnd) {
      const numTracks = u16le(v, trOff);
      trOff += 2;
      // slot 0 is unused (tracks are 1-based)
      tracks.push({ data: new Uint8Array(0) });
      for (let i = 1; i <= numTracks && trOff + 2 <= trEnd; i++) {
        const trkSize = u16le(v, trOff);
        trOff += 2;
        const trkEnd = Math.min(trOff + trkSize, trEnd);
        tracks.push({ data: raw.slice(trOff, trkEnd) });
        trOff += trkSize;
      }
    }
  }

  // ── Read patterns (PA chunk) ──────────────────────────────────────────────

  const patterns: Pattern[] = [];

  const paChunk = chunks.get(CHUNK_PA);
  if (paChunk) {
    let paOff = paChunk.offset;
    const paEnd = paOff + paChunk.length;

    if (paOff < paEnd) {
      const numPats = u8(v, paOff);
      paOff++;

      for (let pat = 0; pat < numPats && paOff < paEnd; pat++) {
        let numChans = 32;
        let numRows  = 64;
        let patName  = '';

        if (fileVersion >= 0x10) {
          // MDLPatternHeader: channels(u8) + lastRow(u8) + name[16]
          if (paOff + 18 > paEnd) break;
          numChans = u8(v, paOff);
          numRows  = u8(v, paOff + 1) + 1;
          patName  = readStringPadded(v, paOff + 2, 16);
          paOff   += 18;
        }

        // Expand global numChannels if needed
        if (numChans > numChannels) numChannels = Math.min(numChans, 32);

        // Read track index table: numChans × uint16le
        if (paOff + numChans * 2 > paEnd) break;

        const trackNums: number[] = [];
        for (let chn = 0; chn < numChans; chn++) {
          trackNums.push(u16le(v, paOff));
          paOff += 2;
        }

        // Build pattern grid
        // grid[row][chn] = TrackerCell
        const grid: TrackerCell[][] = Array.from({ length: numRows }, () =>
          Array.from({ length: numChannels }, (): TrackerCell => ({
            note: 0, instrument: 0, volume: 0,
            effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          })),
        );

        // Decode each channel's track
        for (let chn = 0; chn < numChans && chn < numChannels; chn++) {
          const trkNum = trackNums[chn];
          if (trkNum === 0 || trkNum >= tracks.length) continue;

          const trkData = tracks[trkNum].data;
          let pos = 0;
          let row = 0;

          while (row < numRows && pos < trkData.length) {
            const b = trkData[pos++];
            const x = (b >> 2) & 0x3F;
            const y = b & 0x03;

            switch (y) {
              case 0:
                // (x+1) empty notes follow
                row += x + 1;
                break;

              case 1:
                // Repeat previous note (x+1) times
                if (row > 0) {
                  const prevCell = grid[row - 1][chn];
                  let repeatCount = x;
                  while (row < numRows && repeatCount >= 0) {
                    grid[row][chn] = { ...prevCell };
                    row++;
                    repeatCount--;
                  }
                }
                break;

              case 2:
                // Copy note from row x
                if (row > x) {
                  grid[row][chn] = { ...grid[x][chn] };
                }
                row++;
                break;

              case 3: {
                // New note data; x = bitmask flags
                const cell = grid[row][chn];

                if (x & MDLNOTE_NOTE) {
                  if (pos >= trkData.length) break;
                  const nb = trkData[pos++];
                  if (nb > 120) {
                    cell.note = 97; // key-off
                  } else {
                    cell.note = nb; // 1-based MDL note = 1-based XM note
                  }
                }

                if (x & MDLNOTE_SAMPLE) {
                  if (pos >= trkData.length) break;
                  cell.instrument = trkData[pos++];
                }

                let vol = 0, e1 = 0, e2 = 0, p1 = 0, p2 = 0;

                if (x & MDLNOTE_VOLUME) {
                  if (pos >= trkData.length) break;
                  vol = trkData[pos++];
                }
                if (x & MDLNOTE_EFFECTS) {
                  if (pos >= trkData.length) break;
                  const efByte = trkData[pos++];
                  e1 = efByte & 0x0F;
                  e2 = efByte >> 4;
                }
                if (x & MDLNOTE_PARAM1) {
                  if (pos >= trkData.length) break;
                  p1 = trkData[pos++];
                }
                if (x & MDLNOTE_PARAM2) {
                  if (pos >= trkData.length) break;
                  p2 = trkData[pos++];
                }

                importMDLCommands(cell, vol, e1, e2, p1, p2);
                row++;
                break;
              }
            }
          }
        }

        // Build ChannelData
        const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch): ChannelData => ({
          id:           `channel-${ch}`,
          name:         `Channel ${ch + 1}`,
          muted:        false,
          solo:         false,
          collapsed:    false,
          volume:       100,
          pan:          channelPan[ch] ?? 0,
          instrumentId: null,
          color:        null,
          rows:         grid.map(r => r[ch]),
        }));

        patterns.push({
          id:      `pattern-${pat}`,
          name:    patName || `Pattern ${pat}`,
          length:  numRows,
          channels,
          importMetadata: {
            sourceFormat:            'MDL',
            sourceFile:              filename,
            importedAt:              new Date().toISOString(),
            originalChannelCount:    numChannels,
            originalPatternCount:    numPats,
            originalInstrumentCount: 0, // filled after instrument pass
          },
        });
      }
    }
  }

  // ── Read sample info (IS chunk) and audio data (SA chunk) ─────────────────
  //
  // IS chunk: uint8 numSamples, then for each sample:
  //   sampleIndex(u8) + name[32] + filename[8] + c4speed(u16le/u32le) +
  //   length(u32le) + loopStart(u32le) + loopLength(u32le) +
  //   volume(u8) + flags(u8)
  //
  // Flags: bit 0 = 16-bit, bit 1 = ping-pong loop, bits 2-3 = MDL compression
  //
  // SA chunk: sample audio data in sequence, each compressed per flags.

  // Maximum sample index in MDL = 255
  const instruments: (InstrumentConfig | null)[] = new Array(256).fill(null);

  const isChunk = chunks.get(CHUNK_IS);
  const saChunk = chunks.get(CHUNK_SA);

  if (isChunk) {
    let isOff = isChunk.offset;
    const isEnd = isOff + isChunk.length;

    // SA chunk data cursor
    let saOff = saChunk ? saChunk.offset : 0;
    const saEnd = saChunk ? saChunk.offset + saChunk.length : 0;

    if (isOff < isEnd) {
      const numSamples = u8(v, isOff);
      isOff++;

      for (let s = 0; s < numSamples && isOff < isEnd; s++) {
        const sampleIndex = u8(v, isOff);
        isOff++;
        if (sampleIndex === 0) break;

        // Sample name [32]
        const smpName = readStringPadded(v, isOff, 32);
        isOff += 32;
        // Filename [8]
        isOff += 8;

        // c4speed: version < 0x10 → uint16le, else → uint32le
        // OpenMPT: nC5Speed = c4speed * 2
        let c4speed: number;
        if (fileVersion < 0x10) {
          c4speed = u16le(v, isOff);
          isOff += 2;
        } else {
          c4speed = u32le(v, isOff);
          isOff += 4;
        }
        const sampleRate = c4speed * 2;

        let smpLength    = u32le(v, isOff); isOff += 4;
        let loopStart    = u32le(v, isOff); isOff += 4;
        let loopLength   = u32le(v, isOff); isOff += 4;
        const smpVolume  = u8(v, isOff);    isOff++;
        const smpFlags   = u8(v, isOff);    isOff++;

        const is16Bit       = (smpFlags & 0x01) !== 0;
        // const isPingPong = (smpFlags & 0x02) !== 0;
        const isMDLComp     = (smpFlags & 0x0C) !== 0;
        const hasLoop       = loopLength !== 0;

        // For 16-bit samples, length/loopStart/loopLength are in bytes → divide by 2
        if (is16Bit) {
          smpLength  = Math.floor(smpLength  / 2);
          loopStart  = Math.floor(loopStart  / 2);
          loopLength = Math.floor(loopLength / 2);
        }

        const loopEnd = hasLoop ? loopStart + loopLength : 0;

        // Read sample data from SA chunk
        if (!saChunk || smpLength === 0 || saOff >= saEnd) {
          instruments[sampleIndex] = blankInstrument(sampleIndex, smpName || `Sample ${sampleIndex}`);
          continue;
        }

        // The raw byte length in the SA chunk:
        // For 16-bit uncompressed: smpLength * 2 bytes
        // For MDL compressed: data ends at the next boundary — we read smpLength frames
        const rawByteLen = is16Bit ? smpLength * 2 : smpLength;
        const available  = saEnd - saOff;

        if (rawByteLen > available) {
          // Truncated file — use what's available
          const readLen = available;
          const smpRaw  = raw.slice(saOff, saOff + readLen);
          saOff += readLen;

          if (is16Bit) {
            const frames = Math.floor(readLen / 2);
            const pcm16  = new Int16Array(frames);
            for (let i = 0; i < frames; i++) {
              pcm16[i] = (smpRaw[i * 2 + 1] << 8) | smpRaw[i * 2];
            }
            instruments[sampleIndex] = createSamplerInstrument16(
              sampleIndex, smpName || `Sample ${sampleIndex}`,
              pcm16, smpVolume, sampleRate, loopStart, loopEnd,
            );
          } else {
            instruments[sampleIndex] = createSamplerInstrument(
              sampleIndex, smpName || `Sample ${sampleIndex}`,
              smpRaw, Math.round(smpVolume * 64 / 255), sampleRate, loopStart, loopEnd,
            );
          }
          continue;
        }

        const smpRaw = raw.slice(saOff, saOff + rawByteLen);
        saOff += rawByteLen;

        if (is16Bit) {
          let pcm16: Int16Array;
          if (isMDLComp) {
            pcm16 = decompressMDL16(smpRaw, smpLength);
          } else {
            pcm16 = new Int16Array(smpLength);
            for (let i = 0; i < smpLength; i++) {
              const lo = smpRaw[i * 2];
              const hi = smpRaw[i * 2 + 1];
              const val = (hi << 8) | lo;
              pcm16[i] = val < 32768 ? val : val - 65536;
            }
          }
          instruments[sampleIndex] = createSamplerInstrument16(
            sampleIndex, smpName || `Sample ${sampleIndex}`,
            pcm16, smpVolume, sampleRate, loopStart, loopEnd,
          );
        } else {
          let pcm8: Uint8Array;
          if (isMDLComp) {
            pcm8 = decompressMDL8(smpRaw, smpLength);
          } else {
            pcm8 = smpRaw;
          }
          instruments[sampleIndex] = createSamplerInstrument(
            sampleIndex, smpName || `Sample ${sampleIndex}`,
            pcm8, Math.round(smpVolume * 64 / 255), sampleRate, loopStart, loopEnd,
          );
        }
      }
    }
  }

  // ── Build instruments array (1-based, compact) ─────────────────────────────
  // Collect non-null entries sorted by index
  const instrumentsList: InstrumentConfig[] = [];
  for (let i = 1; i < 256; i++) {
    if (instruments[i] !== null) {
      instrumentsList.push(instruments[i]!);
    }
  }

  // ── Sanitize song positions ────────────────────────────────────────────────
  const maxPatternIdx = patterns.length - 1;
  const finalPositions = songPositions
    .filter(p => p <= maxPatternIdx)
    .map(p => p);

  if (finalPositions.length === 0) finalPositions.push(0);

  const clampedRestart = Math.min(restartPos, Math.max(0, finalPositions.length - 1));

  return {
    name:            songTitle || filename.replace(/\.[^/.]+$/i, ''),
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments:     instrumentsList,
    songPositions:   finalPositions,
    songLength:      finalPositions.length,
    restartPosition: clampedRestart,
    numChannels,
    initialSpeed:    Math.max(1, speed),
    initialBPM:      Math.max(4, tempo),
    linearPeriods:   false,
  };
}
