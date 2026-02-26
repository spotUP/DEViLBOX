/**
 * NRUParser.ts — NoiseRunner (.nru) Amiga format parser
 *
 * NoiseRunner is a modified NoiseTracker / ProTracker format optimised for
 * efficient Amiga playback. It reuses the "M.K." magic bytes of ProTracker
 * but has a completely different sample header layout and pattern encoding.
 *
 * Binary layout (1084-byte header):
 *   +0    31 × NRU sample header (16 bytes each = 496 bytes)
 *           +0  volume        (uint16BE, 0–64)
 *           +2  sampleAddr    (uint32BE, Amiga memory address)
 *           +6  length        (uint16BE, in words)
 *           +8  loopStartAddr (uint32BE, Amiga memory address)
 *           +12 loopLength    (uint16BE, in words)
 *           +14 finetune      (int16BE, valid only when negative)
 *   +496  454 bytes of garbage (leftover ProTracker header data — ignored)
 *   +950  numOrders  (uint8)
 *   +951  restartPos (uint8)
 *   +952  order list (128 bytes, uint8 each)
 *   +1080 "M.K." magic (4 bytes)
 *   +1084 pattern data (numPatterns × 64 rows × 4 channels × 4 bytes)
 *   +1084 + numPatterns×1024: sample PCM data (signed int8, big-endian)
 *
 * Pattern cell (4 bytes):
 *   data[0] bits[7:2]: effect — 0x00 → porta (0x03), 0x0C → arp (0x00), else >> 2
 *   data[1]: effect parameter
 *   data[2]: note value (0=empty, else XM note = data[2]/2 + 36; must be even, ≤72)
 *   data[3]: instrument << 3 (data[3] >> 3; data[3] & 0x07 must be 0)
 *
 * Reference: OpenMPT Load_nru.cpp, ProWizard by Asle
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8 (v: DataView, off: number): number { return v.getUint8(off); }
// i8 kept for completeness but finetune is int16 in NRU
function u16(v: DataView, off: number): number { return v.getUint16(off, false); }
function i16(v: DataView, off: number): number { return v.getInt16(off, false); }
function u32(v: DataView, off: number): number { return v.getUint32(off, false); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE        = 1084;  // total NRU/MOD header length
const SAMPLE_HEADER_SIZE = 16;    // bytes per NRU sample header
const NUM_SAMPLES        = 31;
const NUM_CHANNELS       = 4;
const ROWS_PER_PATTERN   = 64;
const BYTES_PER_CELL     = 4;
const BYTES_PER_PATTERN  = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL; // 1024
const MAGIC_OFFSET       = 1080;
const ORDER_OFFSET       = 950;   // numOrders field
const SAMPLE_RATE        = 8287;  // standard Amiga PAL rate

// LRRL stereo panning (Amiga standard)
const CHANNEL_PAN = [-50, 50, 50, -50] as const;

// ── NRU sample header ─────────────────────────────────────────────────────────

interface NRUSample {
  volume:        number;  // 0–64
  sampleAddr:    number;  // Amiga absolute address
  length:        number;  // in words
  loopStartAddr: number;  // Amiga absolute address
  loopLength:    number;  // in words (>1 = loop active)
  finetune:      number;  // int16; meaningful only when negative
}

// ── MOD effect conversion ─────────────────────────────────────────────────────

/**
 * Convert a MOD effect + parameter pair to the XM effTyp/eff representation
 * used by TrackerCell. This is a direct translation of OpenMPT's ConvertModCommand.
 *
 * Only the subset of MOD effects that NRU uses is needed (the format's effect
 * byte is 6 bits wide so only effects 0–63 can appear), but we handle the full
 * standard MOD table for completeness and future-proofing.
 */
function convertModEffect(
  modEffect: number,
  modParam:  number,
): { effTyp: number; eff: number } {
  let effTyp = modEffect;
  let eff    = modParam;

  switch (modEffect) {
    case 0x00: // Arpeggio
      effTyp = 0x00;
      break;
    case 0x01: // Porta up
      effTyp = 0x01;
      break;
    case 0x02: // Porta down
      effTyp = 0x02;
      break;
    case 0x03: // Tone portamento
      effTyp = 0x03;
      break;
    case 0x04: // Vibrato
      effTyp = 0x04;
      break;
    case 0x05: // Tone porta + volume slide
      effTyp = 0x05;
      break;
    case 0x06: // Vibrato + volume slide
      effTyp = 0x06;
      break;
    case 0x07: // Tremolo
      effTyp = 0x07;
      break;
    case 0x08: // Set panning (MOD extension)
      effTyp = 0x08;
      break;
    case 0x09: // Sample offset
      effTyp = 0x09;
      break;
    case 0x0A: // Volume slide
      effTyp = 0x0A;
      break;
    case 0x0B: // Position jump
      effTyp = 0x0B;
      break;
    case 0x0C: // Set volume
      effTyp = 0x0C;
      break;
    case 0x0D: // Pattern break
      effTyp = 0x0D;
      break;
    case 0x0E: // Extended effect
      effTyp = 0x0E;
      break;
    case 0x0F: // Set speed / BPM
      effTyp = 0x0F;
      break;
    default:
      effTyp = modEffect;
      break;
  }

  return { effTyp, eff };
}

// ── Finetune conversion ───────────────────────────────────────────────────────

/**
 * Convert a NRU finetune value to an XM finetune byte.
 *
 * NRU stores finetune as a negative int16 in the range [-(72*15), 0], divisible
 * by 72. The index is: idx = finetune / -72  (0–15).
 *
 * MOD2XMFineTune maps that index to XM semitone-cents:
 *   index 0-7  → XM finetune = index * 16         (0, 16, 32 … 112)
 *   index 8-15 → XM finetune = (index - 16) * 16  (-128, -112 … -16)
 *
 * A value of 0 (non-negative finetune) returns 0 (no tuning adjustment).
 */
function nruFinetune(finetune: number): number {
  if (finetune >= 0) return 0;
  const idx = finetune / -72;           // 1–15 (finetune < 0 guaranteed here)
  return (idx < 8 ? idx : idx - 16) * 16;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a valid NoiseRunner file.
 *
 * NRU shares the "M.K." magic with ProTracker MOD but is identified by the
 * structure of its sample headers and additional internal consistency checks.
 */
export function isNRUFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;

  const v = new DataView(buffer);

  // 1. Magic check — "M.K." at offset 1080
  if (readString(v, MAGIC_OFFSET, 4) !== 'M.K.') return false;

  // 2. Order block sanity (at offset 950)
  const numOrders = u8(v, ORDER_OFFSET);
  if (numOrders === 0 || numOrders > 127) return false;

  let maxPattern = 0;
  for (let i = 0; i < 128; i++) {
    const pat = u8(v, ORDER_OFFSET + 2 + i);
    if (i < numOrders) {
      if (pat > 63) return false;
      if (pat > maxPattern) maxPattern = pat;
    } else {
      if (pat !== 0) return false;
    }
  }

  // 3. Sample header validation
  let totalSampleWords = 0;

  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base         = s * SAMPLE_HEADER_SIZE;
    const volume       = u16(v, base + 0);
    const sampleAddr   = u32(v, base + 2);
    const length       = u16(v, base + 6);
    const loopStartAddr = u32(v, base + 8);
    const loopLength   = u16(v, base + 12);
    const finetune     = i16(v, base + 14);

    // Volume must be 0–64
    if (volume > 64) return false;

    // Address must be ≤ 0x1FFFFF and even-aligned
    if (sampleAddr > 0x1FFFFF || (sampleAddr & 1)) return false;

    if (length === 0) {
      // Empty sample: loop fields must be trivially sane
      if (loopStartAddr !== sampleAddr || loopLength !== 1) return false;
    } else {
      if (length >= 0x8000) return false;
      if (loopStartAddr < sampleAddr) return false;
      const loopStart = loopStartAddr - sampleAddr;
      if (loopStart >= length * 2) return false;
      if (loopStart + loopLength * 2 > length * 2) return false;
      totalSampleWords += length;
    }

    // Finetune: if negative it must be in [-(72*15), 0] and divisible by 72
    if (finetune < 0) {
      if (finetune < -(72 * 15) || finetune % 72 !== 0) return false;
    }
  }

  // 4. At least 64 bytes of sample data (32 words × 2 bytes)
  if (totalSampleWords < 32) return false;

  // 5. Enough data in buffer for header + patterns
  const numPatterns = maxPattern + 1;
  const requiredSize = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN;
  if (buffer.byteLength < requiredSize) return false;

  // 6. Validate pattern data cell constraints
  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = HEADER_SIZE + pat * BYTES_PER_PATTERN;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const d0 = u8(v, cellOff + 0);
        const d2 = u8(v, cellOff + 2);
        const d3 = u8(v, cellOff + 3);

        // data[0] lower 2 bits must be 0 (effect field is bits[7:2])
        if (d0 & 0x03) return false;
        // Note must be even and ≤ 72
        if (d2 > 72 || (d2 & 0x01)) return false;
        // Instrument lower 3 bits must be 0
        if (d3 & 0x07) return false;
      }
    }
  }

  return true;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a NoiseRunner (.nru) file into a TrackerSong.
 *
 * @throws If the file fails NRU validation or contains structurally invalid data.
 */
export async function parseNRUFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isNRUFormat(buffer)) {
    throw new Error('NRUParser: file does not pass NRU format validation');
  }

  const v     = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ── Order block (at offset 950) ────────────────────────────────────────────

  const numOrders  = u8(v, ORDER_OFFSET);
  const restartPos = u8(v, ORDER_OFFSET + 1);

  let maxPattern = 0;
  const orderList: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    const pat = u8(v, ORDER_OFFSET + 2 + i);
    orderList.push(pat);
    if (pat > maxPattern) maxPattern = pat;
  }

  const numPatterns = maxPattern + 1;

  // ── Sample headers (at offset 0, 31 × 16 bytes) ────────────────────────────

  const sampleHeaders: NRUSample[] = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = s * SAMPLE_HEADER_SIZE;
    sampleHeaders.push({
      volume:        u16(v, base + 0),
      sampleAddr:    u32(v, base + 2),
      length:        u16(v, base + 6),
      loopStartAddr: u32(v, base + 8),
      loopLength:    u16(v, base + 12),
      finetune:      i16(v, base + 14),
    });
  }

  // Derive song name from filename (NRU has no song name field)
  const songName = filename.replace(/\.[^/.]+$/, '');

  // ── Pattern data (at offset 1084) ──────────────────────────────────────────
  // Patterns are stored sequentially. Each pattern:
  //   64 rows × 4 channels × 4 bytes = 1024 bytes per pattern.
  // Cell layout (row-major: row0ch0, row0ch1, row0ch2, row0ch3, row1ch0, …):
  //   data[0] bits[7:2]: encoded effect command
  //   data[1]: effect parameter
  //   data[2]: note value (0=empty, else XM note = data[2]/2 + 36)
  //   data[3]: instrument << 3

  const patterns: Pattern[] = [];

  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const patBase = HEADER_SIZE + pIdx * BYTES_PER_PATTERN;

    const channels: ChannelData[] = Array.from(
      { length: NUM_CHANNELS },
      (_, ch): ChannelData => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          CHANNEL_PAN[ch],
        instrumentId: null,
        color:        null,
        rows:         [],
      }),
    );

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;

        const d0 = u8(v, cellOff + 0);
        const d1 = u8(v, cellOff + 1);
        const d2 = u8(v, cellOff + 2);
        const d3 = u8(v, cellOff + 3);

        // Instrument: upper 5 bits of data[3]
        const instrument = d3 >> 3;

        // Note: 0 = empty; otherwise XM note = data[2]/2 + 36
        // NOTE_MIDDLEC - 13 = 60 - 13 = 47 in OpenMPT's numbering.
        // In XM, middle C (C-5) = note 61. data[2]/2 ranges 1–36.
        // OpenMPT: data[2]/2 + NOTE_MIDDLEC - 13 where NOTE_MIDDLEC = 49 → result 37–84.
        // We use 36 directly: data[2]/2 + 36  (same arithmetic, XM-relative).
        const xmNote = d2 > 0 ? (d2 / 2) + 36 : 0;

        // Effect decoding (matches OpenMPT exactly):
        //   data[0] == 0x00 → modEffect = 0x03 (tone portamento from arp slot)
        //   data[0] == 0x0C → modEffect = 0x00 (arpeggio from volume slot)
        //   otherwise       → modEffect = data[0] >> 2
        let modEffect: number;
        if (d0 === 0x00) {
          modEffect = 0x03;
        } else if (d0 === 0x0C) {
          modEffect = 0x00;
        } else {
          modEffect = d0 >> 2;
        }

        let effTyp = 0;
        let eff    = 0;

        if (modEffect !== 0 || d1 !== 0) {
          const converted = convertModEffect(modEffect, d1);
          effTyp = converted.effTyp;
          eff    = converted.eff;
        }

        const cell: TrackerCell = {
          note:     xmNote,
          instrument,
          volume:   0,   // NRU has no volume column
          effTyp,
          eff,
          effTyp2:  0,
          eff2:     0,
        };

        channels[ch].rows.push(cell);
      }
    }

    patterns.push({
      id:      `pattern-${pIdx}`,
      name:    `Pattern ${pIdx}`,
      length:  ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'NRU',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: NUM_SAMPLES,
      },
    });
  }

  // ── Sample PCM data (immediately after patterns) ───────────────────────────
  // Samples are stored sequentially. Each sample is (header.length * 2) bytes
  // of signed 8-bit PCM in big-endian order (standard Amiga format).
  // Loop fields use absolute Amiga addresses; loopStart byte offset within
  // the sample = loopStartAddr - sampleAddr.

  let pcmCursor = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN;
  const samplePCM: (Uint8Array | null)[] = [];

  for (let s = 0; s < NUM_SAMPLES; s++) {
    const hdr     = sampleHeaders[s];
    const byteLen = hdr.length * 2;

    if (byteLen > 0 && pcmCursor + byteLen <= buffer.byteLength) {
      samplePCM.push(bytes.slice(pcmCursor, pcmCursor + byteLen));
    } else {
      samplePCM.push(null);
    }
    pcmCursor += byteLen;
  }

  // ── Build InstrumentConfig list ────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < NUM_SAMPLES; s++) {
    const hdr = sampleHeaders[s];
    const id  = s + 1;
    const pcm = samplePCM[s];

    if (!pcm || pcm.length === 0) {
      // Silent placeholder — no PCM data for this slot
      instruments.push({
        id,
        name:      `Sample ${id}`,
        type:      'sample'  as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as unknown as InstrumentConfig);
      continue;
    }

    // Loop calculation:
    //   loopLength > 1  → active loop
    //     loopStart (bytes) = loopStartAddr - sampleAddr
    //     loopEnd   (bytes) = loopStart + loopLength * 2
    //   loopLength <= 1 → no loop
    let loopStart = 0;
    let loopEnd   = 0;

    if (hdr.loopLength > 1) {
      loopStart = hdr.loopStartAddr - hdr.sampleAddr;
      loopEnd   = loopStart + hdr.loopLength * 2;
      loopEnd   = Math.min(loopEnd, pcm.length);
    }

    // Finetune: convert NRU int16 to XM finetune byte
    const finetune = nruFinetune(hdr.finetune);

    const instr = createSamplerInstrument(
      id,
      `Sample ${id}`,
      pcm,
      hdr.volume,
      SAMPLE_RATE,
      loopStart,
      loopEnd,
    );

    // Patch in the finetune value via metadata
    if (finetune !== 0 && instr.metadata?.modPlayback) {
      instr.metadata.modPlayback.finetune = finetune;
    }

    instruments.push(instr);
  }

  // ── Assemble TrackerSong ───────────────────────────────────────────────────

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: restartPos,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
