/**
 * S3MParser.ts — ScreamTracker 3 (.s3m) format parser
 *
 * Binary layout:
 *   +0x00  title[28]
 *   +0x1C  dosEof (0x1A)
 *   +0x1D  type (0x10 = module)
 *   +0x1E  reserved[2]
 *   +0x20  ordNum u16LE
 *   +0x22  smpNum u16LE
 *   +0x24  patNum u16LE
 *   +0x26  flags u16LE
 *   +0x28  cwtv u16LE
 *   +0x2A  formatVersion u16LE  (1=signed, 2=unsigned PCM)
 *   +0x2C  magic[4] = "SCRM"
 *   +0x30  globalVol u8
 *   +0x31  initialSpeed u8
 *   +0x32  initialBPM u8
 *   +0x33  masterVolume u8
 *   +0x34  reserved[12]
 *   +0x40  channels[32]  (0xFF = disabled)
 *   +0x60  ordNum bytes (255=end, 254=skip), then smpNum×u16LE parapointers,
 *           then patNum×u16LE parapointers
 *
 * Sample header (80 bytes at parapointer × 16):
 *   +0   sampleType u8      (1=PCM; others = adlib/empty)
 *   +1   filename[12]
 *   +13  dataPointer[3]     → (b[0] | b[1]<<8 | b[2]<<16) * 16
 *   +16  length u32LE
 *   +20  loopStart u32LE
 *   +24  loopEnd u32LE
 *   +28  defaultVolume u8
 *   +29  reserved
 *   +30  pack u8            (0=raw PCM; 1=DP30ADPCM — skip)
 *   +31  flags u8           (0x01=loop, 0x02=stereo, 0x04=16-bit)
 *   +32  c5speed u32LE
 *   +36  reserved[12]
 *   +48  name[28]
 *   +76  magic[4] = "SCRS"
 *
 * Pattern (packed):
 *   header: packed_len u16LE, then 64 rows
 *   Row: read bytes until 0x00 (end of row)
 *     byte & 0x1F = channel (0-based)
 *     if byte & 0x20: note u8, instrument u8
 *     if byte & 0x40: volume u8 (0-64)
 *     if byte & 0x80: command u8, param u8
 *
 * Reference: OpenMPT Load_s3m.cpp, S3MTools.h
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { ParsedSample, ParsedInstrument } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';
import { convertToInstrument } from '../InstrumentConverter';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readString(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROWS_PER_PATTERN = 64;
const S3M_NOTE_OFF     = 0xFE;
const S3M_NOTE_NONE    = 0xFF;
const XM_NOTE_OFF      = 97;  // Standard "note cut" value in XM convention

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if buffer has the "SCRM" magic at offset 0x2C.
 */
export function isS3MFormat(buffer: Uint8Array | ArrayBuffer): boolean {
  const raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (raw.length < 0x60) return false;
  return raw[0x2C] === 0x53 &&  // 'S'
         raw[0x2D] === 0x43 &&  // 'C'
         raw[0x2E] === 0x52 &&  // 'R'
         raw[0x2F] === 0x4D;    // 'M'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Count highest active channel index + 1 (channels[32] @ 0x40). */
function countActiveChannels(v: DataView): number {
  let highest = 0;
  for (let i = 0; i < 32; i++) {
    if (u8(v, 0x40 + i) !== 0xFF) highest = i + 1;
  }
  return Math.max(highest, 1);
}

/**
 * Extract PCM samples, converting unsigned→signed if isUnsigned.
 * For 8-bit: XOR 0x80 converts between unsigned and signed conventions.
 * For 16-bit LE: subtract 32768 for unsigned→signed.
 */
function extractPCM(
  raw: Uint8Array,
  offset: number,
  byteLength: number,
  is16bit: boolean,
  isUnsigned: boolean,
): ArrayBuffer {
  const end = Math.min(offset + byteLength, raw.length);
  const actualLen = end - offset;

  if (!is16bit) {
    const buf = new ArrayBuffer(actualLen);
    const out = new Uint8Array(buf);
    for (let i = 0; i < actualLen; i++) {
      out[i] = isUnsigned ? (raw[offset + i] ^ 0x80) : raw[offset + i];
    }
    return buf;
  } else {
    const numSamples = actualLen >> 1;
    const buf = new ArrayBuffer(numSamples * 2);
    const outView = new DataView(buf);
    for (let i = 0; i < numSamples; i++) {
      const byteOff = offset + i * 2;
      if (byteOff + 1 >= raw.length) break;
      if (isUnsigned) {
        const uval = raw[byteOff] | (raw[byteOff + 1] << 8);
        outView.setInt16(i * 2, (uval - 32768) & 0xFFFF, true);
      } else {
        outView.setInt16(i * 2, (raw[byteOff] | (raw[byteOff + 1] << 8)), true);
      }
    }
    return buf;
  }
}

/** Build a silent placeholder instrument config for empty sample slots. */
function makeEmptyInstrumentConfig(id: number, name: string): InstrumentConfig {
  return {
    id,
    name: name || `Sample ${id}`,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    -60,
    pan:       0,
  } as InstrumentConfig;
}

/** Build empty pattern rows for numChannels channels. */
function makeEmptyPattern(
  patIdx: number,
  numChannels: number,
  filename: string,
  maxPatIdx: number,
  smpNum: number,
): Pattern {
  const emptyCell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const channels: ChannelData[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          0,
      instrumentId: null,
      color:        null,
      rows:         Array.from({ length: ROWS_PER_PATTERN }, () => ({ ...emptyCell })),
    });
  }
  return {
    id:     `pattern-${patIdx}`,
    name:   `Pattern ${patIdx}`,
    length: ROWS_PER_PATTERN,
    channels,
    importMetadata: {
      sourceFormat:            'S3M',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numChannels,
      originalPatternCount:    maxPatIdx + 1,
      originalInstrumentCount: smpNum,
    },
  };
}

// ── Pattern decoder ───────────────────────────────────────────────────────────

/**
 * Decode a packed S3M pattern into a 2D array of TrackerCell [row][channel].
 * S3M row format: read bytes until 0x00 (end of row).
 *   flagByte = read byte
 *   channel  = flagByte & 0x1F
 *   if flagByte & 0x20: note u8, instrument u8
 *   if flagByte & 0x40: volume u8 (0-64; > 64 means no volume)
 *   if flagByte & 0x80: command u8, param u8
 */
function decodeS3MPattern(
  rowData: Uint8Array,
  numChannels: number,
): TrackerCell[][] {
  const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

  // Pre-fill with empty cells
  const cells: TrackerCell[][] = Array.from(
    { length: ROWS_PER_PATTERN },
    () => Array.from({ length: numChannels }, emptyCell),
  );

  let pos  = 0;
  let row  = 0;

  while (row < ROWS_PER_PATTERN && pos < rowData.length) {
    const flagByte = rowData[pos++];

    if (flagByte === 0x00) {
      // End of row
      row++;
      continue;
    }

    const ch = flagByte & 0x1F;

    let note       = 0;
    let instrument = 0;
    let volume     = 0;
    let effTyp     = 0;
    let eff        = 0;

    if (flagByte & 0x20) {
      // Note + instrument
      const noteByte = rowData[pos++];
      instrument     = rowData[pos++];

      if (noteByte === S3M_NOTE_OFF) {
        note = XM_NOTE_OFF;
      } else if (noteByte !== S3M_NOTE_NONE) {
        // High nibble = octave, low nibble = semitone (0=C)
        const octave   = (noteByte >> 4) & 0x0F;
        const semitone = noteByte & 0x0F;
        note = octave * 12 + semitone + 1; // 1-based, C-0 = 1
      }
    }

    if (flagByte & 0x40) {
      // Volume (0-64; values > 64 treated as no volume)
      const rawVol = rowData[pos++];
      volume = rawVol <= 64 ? rawVol : 0;
    }

    if (flagByte & 0x80) {
      // Effect: S3M command letter (A=1..Z=26) stored raw in effTyp
      effTyp = rowData[pos++];
      eff    = rowData[pos++];
    }

    if (ch < numChannels) {
      cells[row][ch] = { note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0 };
    }
  }

  return cells;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseS3MFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isS3MFormat(buffer)) throw new Error('Not a valid S3M file');

  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  // ── Header ──
  const songName      = readString(v, 0x00, 28);
  const ordNum        = u16le(v, 0x20);
  const smpNum        = u16le(v, 0x22);
  const patNum        = u16le(v, 0x24);
  const formatVersion = u16le(v, 0x2A); // 1=signed, 2=unsigned
  const initialSpeed  = u8(v, 0x31) || 6;
  const initialBPM    = u8(v, 0x32) || 125;

  const numChannels = countActiveChannels(v);
  const isUnsigned  = formatVersion === 2;

  // ── Order/parapointer tables (after 96-byte header at 0x60) ──
  let cursor = 0x60;

  const orders: number[] = [];
  for (let i = 0; i < ordNum; i++) {
    const val = u8(v, cursor + i);
    if (val === 255) break;        // end marker
    if (val !== 254) orders.push(val); // skip pattern-break markers (254)
  }
  cursor += ordNum;

  const sampleParapointers: number[] = [];
  for (let i = 0; i < smpNum; i++) {
    sampleParapointers.push(u16le(v, cursor + i * 2));
  }
  cursor += smpNum * 2;

  const patternParapointers: number[] = [];
  for (let i = 0; i < patNum; i++) {
    patternParapointers.push(u16le(v, cursor + i * 2));
  }

  // ── Samples → InstrumentConfig ──
  const instruments: InstrumentConfig[] = [];

  for (let si = 0; si < smpNum; si++) {
    const id     = si + 1;
    const smpOff = sampleParapointers[si] * 16;

    if (smpOff === 0 || smpOff + 80 > buffer.byteLength) {
      instruments.push(makeEmptyInstrumentConfig(id, `Sample ${id}`));
      continue;
    }

    const sampleType = u8(v, smpOff);
    if (sampleType !== 1) {
      // AdLib or empty — skip
      const name = readString(v, smpOff + 48, 28).replace(/\0/g, '').trim() || `Sample ${id}`;
      instruments.push(makeEmptyInstrumentConfig(id, name));
      continue;
    }

    // Three-byte paragraph pointer: byte[13]=high, byte[14-15]=low word LE
    // Format: (lowWordLo | lowWordHi<<8 | high<<16) * 16
    const dpHigh = u8(v, smpOff + 13);
    const dpLo   = u8(v, smpOff + 14);
    const dpHi   = u8(v, smpOff + 15);
    const dataPointer = (dpLo | (dpHi << 8) | (dpHigh << 16)) * 16;

    const length        = u32le(v, smpOff + 16);
    const loopStart     = u32le(v, smpOff + 20);
    const loopEnd       = u32le(v, smpOff + 24);
    const defaultVolume = Math.min(u8(v, smpOff + 28), 64);
    const pack          = u8(v, smpOff + 30);
    const flags         = u8(v, smpOff + 31);
    const c5speed       = u32le(v, smpOff + 32);
    const sampleName    = readString(v, smpOff + 48, 28);
    const name          = sampleName.replace(/\0/g, '').trim() || `Sample ${id}`;

    // Skip compressed (DP30ADPCM) and empty samples
    if (pack === 1 || length === 0 || dataPointer === 0 || dataPointer >= buffer.byteLength) {
      instruments.push(makeEmptyInstrumentConfig(id, name));
      continue;
    }

    const is16bit       = !!(flags & 0x04);
    const bytesPerSample = is16bit ? 2 : 1;
    const byteLength    = length * bytesPerSample;

    const pcmData = extractPCM(raw, dataPointer, byteLength, is16bit, isUnsigned);

    const hasLoop    = !!(flags & 0x01) && loopEnd > loopStart && loopEnd <= length;
    const loopLength = hasLoop ? loopEnd - loopStart : 0;

    const sample: ParsedSample = {
      id,
      name,
      pcmData,
      bitDepth:     is16bit ? 16 : 8,
      sampleRate:   c5speed || 8363,
      length,
      loopStart:    hasLoop ? loopStart : 0,
      loopLength,
      loopType:     hasLoop ? 'forward' : 'none',
      volume:       defaultVolume,
      finetune:     0,
      relativeNote: 0,
      panning:      128,
    };

    const parsedInst: ParsedInstrument = {
      id,
      name,
      samples:     [sample],
      fadeout:     0,
      volumeType:  'none',
      panningType: 'none',
    };

    const converted = convertToInstrument(parsedInst, id, 'S3M');
    if (converted.length > 0) {
      instruments.push(converted[0]);
    } else {
      instruments.push(makeEmptyInstrumentConfig(id, name));
    }
  }

  // ── Patterns ──
  const patterns: Pattern[] = [];
  const patIndexToArrayIdx = new Map<number, number>();

  const referencedPats = new Set<number>(orders);
  for (let i = 0; i < patNum; i++) referencedPats.add(i);
  const allPatIdxs = Array.from(referencedPats).sort((a, b) => a - b);
  const maxPatIdx  = allPatIdxs.length > 0 ? allPatIdxs[allPatIdxs.length - 1] : 0;

  for (const patIdx of allPatIdxs) {
    if (patIdx >= patternParapointers.length || patternParapointers[patIdx] === 0) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, smpNum));
      continue;
    }

    const patOff = patternParapointers[patIdx] * 16;
    if (patOff + 2 > buffer.byteLength) {
      patIndexToArrayIdx.set(patIdx, patterns.length);
      patterns.push(makeEmptyPattern(patIdx, numChannels, filename, maxPatIdx, smpNum));
      continue;
    }

    const packedLen = u16le(v, patOff);
    const rowData   = raw.subarray(patOff + 2, patOff + 2 + packedLen);
    const cells     = decodeS3MPattern(rowData, numChannels);

    const channels: ChannelData[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows: TrackerCell[] = [];
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        rows.push(cells[row]?.[ch] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      channels.push({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          0,
        instrumentId: null,
        color:        null,
        rows,
      });
    }

    patIndexToArrayIdx.set(patIdx, patterns.length);
    patterns.push({
      id:     `pattern-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'S3M',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    maxPatIdx + 1,
        originalInstrumentCount: smpNum,
      },
    });
  }

  // ── Song positions ──
  const songPositions: number[] = [];
  for (const patIdx of orders) {
    const arrIdx = patIndexToArrayIdx.get(patIdx);
    if (arrIdx !== undefined) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0) songPositions.push(0);

  return {
    name:            songName.replace(/\0/g, '').trim() || filename.replace(/\.[^/.]+$/, ''),
    format:          'S3M' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}
