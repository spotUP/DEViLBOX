/**
 * EasyTraxParser.ts — EasyTrax (.etx) module loader
 *
 * EasyTrax is a PC DOS 4-channel tracker with a fixed magic signature.
 *
 * Binary layout:
 *   ETXFileHeader (32 bytes):
 *     +0   magic[14]             — "EASYTRAX 1.0\x01\x00"
 *     +14  tempo (uint8)         — initial BPM (> 0)
 *     +15  lastPattern (uint8)   — last pattern index (0-127)
 *     +16  orderlistOffset (uint32LE)   — offset to order list
 *     +20  patternsOffset (uint32LE)    — offset to pattern data
 *     +24  sampleHeadersOffset (uint32LE) — offset to sample header array
 *     +28  sampleDataOffset (uint32LE)    — offset to sample data
 *
 *   Order list: 1024 bytes of uint8 (0xFF = end)
 *
 *   Pattern data: (lastPattern + 1) × 64 rows × 4 channels × 4 bytes
 *     Pattern cell (4 bytes: note, vol, instr, unused):
 *       note == 0xFF → pattern break (row 0 col triggers break)
 *       note == 0xFE → ETX volume down effect (CMD_VOLUMEDOWN_ETX)
 *       1 ≤ note ≤ 96 → pitched note (NOTE_MIDDLEC - 24 + note)
 *       vol: volume 0-127 (clamped to 127, stored as (vol+1)/2 in range 0-64)
 *       instr: 0-based instrument index (stored as instr+1 in tracker cells)
 *
 *   Sample headers: 128 × ETXSampleHeader (32 bytes each):
 *     +0  name[13]
 *     +13 offset (uint32LE)     — relative to sampleDataOffset
 *     +17 length (uint32LE)
 *     +21 loopStart (uint32LE)  — 0xFFFFFFFF if no loop
 *     +25 sampleRate (uint32LE)
 *     +29 transpose (int8)
 *     +30 finetune (int8)
 *     +31 zero (uint8)
 *
 *   Sample data: 8-bit unsigned PCM, addressed by sampleDataOffset + header.offset
 *
 * Channels: 4 (mono, no default pan)
 * Default speed: 6 ticks/row
 * Reference: OpenMPT soundlib/Load_etx.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}
function i8(bytes: Uint8Array, off: number): number {
  const v = bytes[off] ?? 0;
  return v < 128 ? v : v - 256;
}
function u32le(bytes: Uint8Array, off: number): number {
  return (((bytes[off] ?? 0) | ((bytes[off + 1] ?? 0) << 8)
         | ((bytes[off + 2] ?? 0) << 16) | ((bytes[off + 3] ?? 0) << 24)) >>> 0);
}

function readString(bytes: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAGIC          = 'EASYTRAX 1.0\x01\x00';
const HDR_SIZE       = 32;
const NUM_CHANNELS   = 4;
const ROWS_PER_PAT   = 64;
const BYTES_PER_CELL = 4;
const NUM_SAMPLES    = 128;
const SMPL_HDR_SIZE  = 32;

// NOTE_MIDDLEC in XM = 49 (C5 in some conventions, or C4 — OpenMPT defines NOTE_MIDDLEC = 49)
// ETX note formula: NOTE_MIDDLEC - 24 + note  where NOTE_MIDDLEC = 49
const ETX_NOTE_OFFSET = 49 - 24; // = 25

// ── Format detection ──────────────────────────────────────────────────────────

export function isEasyTraxFormat(bytes: Uint8Array): boolean {
  if (bytes.length < HDR_SIZE) return false;

  // Check magic "EASYTRAX 1.0\x01\x00"
  for (let i = 0; i < MAGIC.length; i++) {
    if (u8(bytes, i) !== MAGIC.charCodeAt(i)) return false;
  }

  const tempo             = u8(bytes, 14);
  const lastPattern       = u8(bytes, 15);
  const orderlistOffset   = u32le(bytes, 16);
  const patternsOffset    = u32le(bytes, 20);
  const sampleHdrsOffset  = u32le(bytes, 24);
  const sampleDataOffset  = u32le(bytes, 28);

  if (tempo === 0)           return false;
  if (lastPattern > 127)     return false;
  if (orderlistOffset < 32 || orderlistOffset >= 0x800000)   return false;
  if (patternsOffset  < 32 || patternsOffset  >= 0x800000)   return false;
  if (sampleHdrsOffset < 32 || sampleHdrsOffset >= 0x800000) return false;
  if (sampleDataOffset < 32 || sampleDataOffset >= 0x800000) return false;

  return true;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseEasyTraxFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseInternal(bytes, filename);
  } catch {
    return null;
  }
}

function parseInternal(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isEasyTraxFormat(bytes)) return null;

  const tempo            = u8(bytes, 14);
  const lastPattern      = u8(bytes, 15);
  const orderlistOffset  = u32le(bytes, 16);
  const patternsOffset   = u32le(bytes, 20);
  const sampleHdrsOffset = u32le(bytes, 24);
  const sampleDataOffset = u32le(bytes, 28);

  const numPatterns = lastPattern + 1;

  // ── Order list ─────────────────────────────────────────────────────────────

  const orderList: number[] = [];
  for (let i = 0; i < 1024; i++) {
    const ord = u8(bytes, orderlistOffset + i);
    if (ord === 0xFF) break;
    if (ord > 127) return null;  // invalid order entry
    orderList.push(ord);
  }
  if (orderList.length === 0) orderList.push(0);

  // ── Patterns ───────────────────────────────────────────────────────────────

  const patterns: Pattern[] = [];
  const patternStride = ROWS_PER_PAT * NUM_CHANNELS * BYTES_PER_CELL; // 1024 bytes each

  for (let pat = 0; pat < numPatterns; pat++) {
    const patBase = patternsOffset + pat * patternStride;

    if (patBase + patternStride > bytes.length) {
      patterns.push(makeEmptyPattern(pat, filename, numPatterns));
      continue;
    }

    const channelRows: TrackerCell[][] = Array.from(
      { length: NUM_CHANNELS },
      () => Array.from({ length: ROWS_PER_PAT }, () => emptyCell()),
    );

    let actualRows = ROWS_PER_PAT;

    for (let row = 0; row < ROWS_PER_PAT; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const note    = u8(bytes, cellOff);
        const vol     = u8(bytes, cellOff + 1);
        const instr   = u8(bytes, cellOff + 2);
        // byte 3 is unused

        const cell = channelRows[ch][row];
        if (!cell) continue;

        if (note === 0xFF && ch === 0) {
          // Pattern break — insert on the row before (max(row, 1) - 1)
          const breakRow = Math.max(row, 1) - 1;
          const breakCell = channelRows[0][breakRow];
          if (breakCell) {
            breakCell.effTyp = 0x0D; // pattern break
            breakCell.eff    = 0;
          }
          actualRows = row > 0 ? row : 0;
          // Fill remaining rows with empty
          break;
        } else if (note === 0xFE) {
          // Volume down (CMD_VOLUMEDOWN_ETX) — map as a custom effect
          // We don't have CMD_VOLUMEDOWN_ETX in XM; treat as volume slide down
          cell.effTyp = 0x0A; // volume slide
          cell.eff    = vol;  // param as vol slide param
        } else if (note > 0 && note <= 96) {
          // Pitched note
          cell.note       = ETX_NOTE_OFFSET + note;
          cell.instrument = instr + 1;
          // Volume: clamped to 127, stored (vol+1)/2 → range 1-64
          cell.volume     = Math.floor((Math.min(vol, 127) + 1) / 2);
        }
      }
    }

    const channels: ChannelData[] = channelRows.map((rows, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          0,
      instrumentId: null,
      color:        null,
      rows:         rows.slice(0, actualRows > 0 ? actualRows : ROWS_PER_PAT),
    }));

    patterns.push({
      id:      `pattern-${pat}`,
      name:    `Pattern ${pat}`,
      length:  actualRows > 0 && actualRows < ROWS_PER_PAT ? actualRows : ROWS_PER_PAT,
      channels,
      importMetadata: {
        sourceFormat:            'ETX',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: NUM_SAMPLES,
      },
    });
  }

  // ── Sample headers + PCM data ──────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let smp = 0; smp < NUM_SAMPLES; smp++) {
    const hdrBase      = sampleHdrsOffset + smp * SMPL_HDR_SIZE;
    const smpName      = readString(bytes, hdrBase, 13) || `Sample ${smp + 1}`;
    const smpOffset    = u32le(bytes, hdrBase + 13);
    const smpLength    = u32le(bytes, hdrBase + 17);
    const loopStartRaw = u32le(bytes, hdrBase + 21);
    const sampleRate   = u32le(bytes, hdrBase + 25);
    const transpose    = i8(bytes, hdrBase + 29);
    const finetune     = i8(bytes, hdrBase + 30);

    const hasLoop  = loopStartRaw !== 0xFFFFFFFF;
    const loopStart = hasLoop ? loopStartRaw : 0;
    const loopEnd   = hasLoop ? smpLength    : 0;

    const dataOff = sampleDataOffset + smpOffset;

    if (smpLength === 0 || dataOff + smpLength > bytes.length) {
      instruments.push(silentInstrument(smp + 1, smpName));
      continue;
    }

    // ETX samples are 8-bit unsigned PCM
    const rawPcm = bytes.subarray(dataOff, dataOff + smpLength);
    const rate   = sampleRate > 0 ? sampleRate : 8363;

    // Apply transpose + finetune: Transpose() call in OpenMPT uses (transpose*100 + finetune) / 1200.0 semitones
    // For simplicity we bake into sampleRate adjustment (2^(cents/1200) multiplier)
    const cents     = transpose * 100 + finetune;
    const adjRate   = cents !== 0 ? Math.round(rate * Math.pow(2, cents / 1200)) : rate;

    const inst = createSamplerInstrument(smp + 1, smpName, rawPcm, 64, adjRate, loopStart, loopEnd);
    instruments.push(inst);
  }

  // ── Assemble TrackerSong ──────────────────────────────────────────────────

  const songName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName,
    format:          'S3M' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      tempo,
    linearPeriods:   false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeEmptyPattern(idx: number, filename: string, numPatterns: number): Pattern {
  const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
    id:           `channel-${ch}`,
    name:         `Channel ${ch + 1}`,
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          0,
    instrumentId: null,
    color:        null,
    rows:         Array.from({ length: ROWS_PER_PAT }, () => emptyCell()),
  }));
  return {
    id:      `pattern-${idx}`,
    name:    `Pattern ${idx}`,
    length:  ROWS_PER_PAT,
    channels,
    importMetadata: {
      sourceFormat:            'ETX',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    numPatterns,
      originalInstrumentCount: NUM_SAMPLES,
    },
  };
}

function silentInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig;
}
