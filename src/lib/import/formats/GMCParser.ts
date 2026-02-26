/**
 * GMCParser.ts — Game Music Creator (.gmc) format parser
 *
 * Game Music Creator is a 4-channel Amiga tracker with a 444-byte header and
 * no magic bytes — detection is purely structural.
 *
 * Binary layout:
 *   +0    15 × GMC sample headers (16 bytes each = 240 bytes)
 *         Each: offset(uint32BE) + length(uint16BE, words) + zero(uint8, must be 0)
 *               + volume(uint8, 0–64) + address(uint32BE) + loopLength(uint16BE, words)
 *               + dataStart(uint16BE, must be 0 or even)
 *   +240  3 zero bytes (must all be 0)
 *   +243  numOrders (uint8, 1–100)
 *   +244  orders[100] (uint16BE each, value / 1024 = pattern index) = 200 bytes → ends at 444
 *   +444  pattern data (sequential). Pattern at file offset 444 + patternIndex * 1024.
 *         Each pattern: 64 rows × 4 channels × 4 bytes = 1024 bytes.
 *   +444 + numPatterns * 1024: sample PCM data (signed int8, sequential per sample).
 *
 * Pattern cell (4 bytes — standard MOD ProTracker encoding):
 *   byte0: bits[7:4] = inst high nibble; bits[3:0] = period high nibble
 *   byte1: period low byte
 *   byte2: bits[7:4] = inst low nibble;  bits[3:0] = effect type
 *   byte3: effect parameter
 *   Special: byte0 === 0xFF && byte1 === 0xFE → note cut (XM note 97)
 *
 * Reference: OpenMPT Load_gmc.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number  { return v.getUint8(off); }
function u16(v: DataView, off: number): number { return v.getUint16(off, false); }
function u32(v: DataView, off: number): number { return v.getUint32(off, false); }

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE       = 444;
const NUM_SAMPLES       = 15;
const SAMPLE_HDR_SIZE   = 16;
const ORDERS_OFFSET     = 244;
const MAX_ORDERS        = 100;
const NUM_CHANNELS      = 4;
const ROWS_PER_PATTERN  = 64;
const PATTERN_SIZE      = ROWS_PER_PATTERN * NUM_CHANNELS * 4;   // 1024 bytes
const SAMPLE_RATE       = 8287;
const XM_NOTE_CUT       = 97;

const CHANNEL_PAN = [-50, 50, 50, -50] as const;  // Amiga LRRL

// ── Sample header ─────────────────────────────────────────────────────────────

interface GMCSampleHeader {
  offset:     number;   // uint32BE — file offset into sample data region
  length:     number;   // uint16BE, in words
  zero:       number;   // must be 0
  volume:     number;   // 0–64
  address:    number;   // uint32BE — Amiga memory address (informational)
  loopLength: number;   // uint16BE, in words (>2 means loop)
  dataStart:  number;   // uint16BE — bytes to trim from start (must be 0 or even)
}

function readSampleHeader(v: DataView, base: number): GMCSampleHeader {
  return {
    offset:     u32(v, base),
    length:     u16(v, base + 4),
    zero:       u8(v, base + 6),
    volume:     u8(v, base + 7),
    address:    u32(v, base + 8),
    loopLength: u16(v, base + 12),
    dataStart:  u16(v, base + 14),
  };
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer passes all GMC structural validation checks.
 * GMC has no magic bytes — detection is entirely structural.
 */
export function isGMCFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const v = new DataView(buffer);

  // Validate all 15 sample headers
  for (let s = 0; s < NUM_SAMPLES; s++) {
    const base = s * SAMPLE_HDR_SIZE;
    const hdr  = readSampleHeader(v, base);

    if (hdr.zero !== 0)                       return false;
    if (hdr.offset > 0x1FFFFF)                return false;
    if (hdr.offset % 2 !== 0)                 return false;
    if (hdr.address > 0x1FFFFF)               return false;
    if (hdr.address % 2 !== 0)                return false;
    if (hdr.length > 0x7FFF)                  return false;
    if (hdr.dataStart > 0x7FFF)               return false;
    if (hdr.dataStart % 2 !== 0)              return false;
    if (hdr.volume > 64)                      return false;
    // loopLength must not exceed total length when active
    if (hdr.loopLength > 2 && hdr.loopLength > hdr.length) return false;
  }

  // Bytes 240, 241, 242 must all be 0
  if (u8(v, 240) !== 0 || u8(v, 241) !== 0 || u8(v, 242) !== 0) return false;

  // numOrders: 1–100
  const numOrders = u8(v, 243);
  if (numOrders < 1 || numOrders > MAX_ORDERS) return false;

  // All order entries must be divisible by 1024
  for (let i = 0; i < MAX_ORDERS; i++) {
    const orderVal = u16(v, ORDERS_OFFSET + i * 2);
    if (orderVal % PATTERN_SIZE !== 0) return false;
  }

  return true;
}

// ── Effect mapping ────────────────────────────────────────────────────────────

function mapGMCEffect(effType: number, param: number): { effTyp: number; eff: number } {
  switch (effType) {
    case 0x00: return { effTyp: 0,    eff: 0            };  // no effect
    case 0x01: return { effTyp: 0x01, eff: param        };  // portamento up
    case 0x02: return { effTyp: 0x02, eff: param        };  // portamento down
    case 0x03: return { effTyp: 0x0C, eff: param & 0x7F };  // set volume
    case 0x04: return { effTyp: 0x0D, eff: param        };  // pattern break
    case 0x05: return { effTyp: 0x0B, eff: param        };  // position jump
    case 0x06: return { effTyp: 0x0E, eff: 0x00         };  // LED filter on
    case 0x07: return { effTyp: 0x0E, eff: 0x01         };  // LED filter off
    case 0x08: return { effTyp: 0x0F, eff: param        };  // set speed
    default:   return { effTyp: 0,    eff: 0            };
  }
}

// ── Parser ────────────────────────────────────────────────────────────────────

export async function parseGMCFile(
  buffer: ArrayBuffer,
  filename: string
): Promise<TrackerSong> {
  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── Sample headers ──────────────────────────────────────────────────────────
  const sampleHeaders: GMCSampleHeader[] = [];
  for (let s = 0; s < NUM_SAMPLES; s++) {
    sampleHeaders.push(readSampleHeader(v, s * SAMPLE_HDR_SIZE));
  }

  // ── Song order ──────────────────────────────────────────────────────────────
  const numOrders = Math.max(1, Math.min(u8(v, 243), MAX_ORDERS));

  const orderValues: number[] = [];
  for (let i = 0; i < MAX_ORDERS; i++) {
    orderValues.push(u16(v, ORDERS_OFFSET + i * 2));
  }

  // Active orders (first numOrders)
  const activeOrders = orderValues.slice(0, numOrders);

  // Pattern indices: orderVal / PATTERN_SIZE
  const patternIndices = activeOrders.map(v => v / PATTERN_SIZE);

  // Determine total number of unique patterns
  const maxPatternIdx = Math.max(0, ...patternIndices);
  const numPatterns   = maxPatternIdx + 1;

  // ── Build patterns ──────────────────────────────────────────────────────────
  const patternCache = new Map<number, Pattern>();

  function getOrBuildPattern(patIdx: number): Pattern {
    if (patternCache.has(patIdx)) return patternCache.get(patIdx)!;

    const patOffset = HEADER_SIZE + patIdx * PATTERN_SIZE;
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];

      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cellOff = patOffset + (row * NUM_CHANNELS + ch) * 4;

        if (cellOff + 3 >= buffer.byteLength) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const b0 = u8(v, cellOff);
        const b1 = u8(v, cellOff + 1);
        const b2 = u8(v, cellOff + 2);
        const b3 = u8(v, cellOff + 3);

        // Note cut special case
        let note = 0;
        if (b0 === 0xFF && b1 === 0xFE) {
          note = XM_NOTE_CUT;
        } else {
          const period     = ((b0 & 0x0F) << 8) | b1;
          const amigaNote  = periodToNoteIndex(period);
          note             = period > 0 ? amigaNoteToXM(amigaNote) : 0;
        }

        const instrument = ((b0 & 0xF0) | (b2 >> 4));
        const effType    = b2 & 0x0F;
        const effParam   = b3;

        const { effTyp, eff } = mapGMCEffect(effType, effParam);

        rows.push({
          note,
          instrument,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        });
      }

      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: CHANNEL_PAN[ch],
        instrumentId: null,
        color: null,
        rows,
      });
    }

    const pat: Pattern = {
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: 'GMC',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: numPatterns,
        originalInstrumentCount: NUM_SAMPLES,
      },
    };

    patternCache.set(patIdx, pat);
    return pat;
  }

  // Build ordered pattern list and song positions
  const patterns: Pattern[] = [];
  const patIndexToArrayIdx  = new Map<number, number>();
  const songPositions: number[] = [];

  for (const patIdx of patternIndices) {
    if (!patIndexToArrayIdx.has(patIdx)) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(getOrBuildPattern(patIdx));
    }
    songPositions.push(patIndexToArrayIdx.get(patIdx)!);
  }

  // ── Sample data — sequential after all pattern data ─────────────────────────
  const sampleDataStart = HEADER_SIZE + numPatterns * PATTERN_SIZE;

  const instruments: InstrumentConfig[] = sampleHeaders.map((hdr, i) => {
    const id         = i + 1;
    const name       = `Sample ${id}`;
    const lengthBytes = hdr.length * 2;

    // Loop geometry (loop from end of sample)
    const hasLoop       = hdr.loopLength > 2;
    const loopLenBytes  = hdr.loopLength * 2;
    const loopStartBytes = hasLoop ? lengthBytes - loopLenBytes : 0;
    const loopEndBytes   = hasLoop ? lengthBytes : 0;

    // Trim dataStart bytes from the front of the PCM data
    const trimBytes = hdr.dataStart;

    if (lengthBytes === 0) {
      return {
        id,
        name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as InstrumentConfig;
    }

    // Compute sequential start offset for this sample
    let startOff = sampleDataStart;
    for (let j = 0; j < i; j++) {
      startOff += sampleHeaders[j].length * 2;
    }

    // Skip trimmed bytes at the front
    const readStart = startOff + trimBytes;
    const readLen   = Math.max(0, lengthBytes - trimBytes);

    if (readStart + readLen > buffer.byteLength || readLen === 0) {
      return {
        id,
        name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as InstrumentConfig;
    }

    const pcm = raw.subarray(readStart, readStart + readLen);

    // Adjust loop points for trimmed prefix
    const adjustedLoopStart = hasLoop ? Math.max(0, loopStartBytes - trimBytes) : 0;
    const adjustedLoopEnd   = hasLoop ? Math.max(0, loopEndBytes   - trimBytes) : 0;

    return createSamplerInstrument(
      id,
      name,
      pcm,
      hdr.volume,
      SAMPLE_RATE,
      hasLoop ? adjustedLoopStart : 0,
      hasLoop ? adjustedLoopEnd   : 0,
    );
  });

  return {
    name: filename.replace(/\.[^/.]+$/, ''),
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
