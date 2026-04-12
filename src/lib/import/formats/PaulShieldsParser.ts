/**
 * PaulShieldsParser.ts — Paul Shields music format detector/parser
 *
 * Detects modules composed with the Paul Shields / Paul Hunter music system
 * (c) 1988-91. Common prefix: ps.*
 *
 * Detection logic ported from:
 *   uade-3.05/amigasrc/players/wanted_team/PaulShields/src/Paul Shields.AMP.asm
 *   -> EP_Check5 routine (identical algorithm in DTP_Check2 of _v3.asm)
 *
 * The format has three recognized sub-variants (stored in internal Format byte):
 *
 *   New format (Format=1):
 *     - bytes 0..9 are all zero (tst.l (A0), tst.l 4(A0), tst.w 8(A0))
 *     - words at offsets 164, 168, 172, 176 are all equal (song-pointer table)
 *     - word at offset 160 is non-zero, non-negative, and even (sample-block pointer)
 *     - dereference: buf[160..161] as u16 added to base A0 -> check u32 == 0x00B400B6
 *
 *   Old format (Format=0xFF i.e. -1, stored as byte via `st`):
 *     - same zero-prefix check at the top (implicit, falls from New check)
 *     - words at offsets 516, 520, 524, 528 are all equal
 *     - word at offset 512 is non-zero, non-negative, and even
 *     - dereference: buf[512..513] as u16 -> base+u16 -> check u32 == 0x02140216
 *
 *   Very-old format (Format=0):
 *     - Same zero-prefix (implied since the "Last" branch is reached after Old fails)
 *     - words at offsets 514, 518, 522, 526 are all equal
 *     - word at offset 516 is non-zero, non-negative, and even
 *     - dereference: buf[516..517] as u16 -> A1+u16 -> check word at -2 == 0xFFEC (loop)
 *       or 0xFFE8 (stop)
 *
 * Song name suffix: [Paul Shields]
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

// The detection code checks offsets up to 528+2 bytes from file start.
const MIN_FILE_SIZE = 530;

const NUM_SAMPLES = 15;

// Format variants detected by Check2:
//   1  = New format   (10-byte sample records, song pointers at offset 160/164)
//  -1  = Old format   (32-byte sample records, song pointers at offset 512/516)
//   0  = Very-old format (32-byte sample records, song pointers at offset 516/514)
type PaulShieldsVariant = 'new' | 'old' | 'veryold' | null;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

function safeU16(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 1 >= buf.length) return 1; // non-zero sentinel -- causes fails
  return u16BE(buf, off);
}

function safeU32(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 3 >= buf.length) return 0;
  return u32BE(buf, off);
}

/**
 * Detect which sub-variant of the Paul Shields format this file is.
 * Returns null if not a valid Paul Shields module.
 */
function detectVariant(buf: Uint8Array): PaulShieldsVariant {
  if (buf.length < MIN_FILE_SIZE) return null;
  if (safeU32(buf, 0) !== 0) return null;
  if (safeU32(buf, 4) !== 0) return null;
  if (safeU16(buf, 8) !== 0) return null;

  // New format
  const d1_new = safeU16(buf, 164);
  if (d1_new === safeU16(buf, 168) && d1_new === safeU16(buf, 172) && d1_new === safeU16(buf, 176)) {
    const ptr_new = safeU16(buf, 160);
    if (ptr_new !== 0 && (ptr_new & 0x8000) === 0 && (ptr_new & 1) === 0) {
      if (safeU32(buf, ptr_new) === 0x00B400B6) return 'new';
    }
  }
  // Old format
  const d1_old = safeU16(buf, 516);
  if (d1_old === safeU16(buf, 520) && d1_old === safeU16(buf, 524) && d1_old === safeU16(buf, 528)) {
    const ptr_old = safeU16(buf, 512);
    if (ptr_old !== 0 && (ptr_old & 0x8000) === 0 && (ptr_old & 1) === 0) {
      if (safeU32(buf, ptr_old) === 0x02140216) return 'old';
    }
  }
  // Very-old format
  const d1_vold = safeU16(buf, 514);
  if (d1_vold === safeU16(buf, 518) && d1_vold === safeU16(buf, 522) && d1_vold === safeU16(buf, 526)) {
    const ptr_vold = safeU16(buf, 516);
    if (ptr_vold !== 0 && (ptr_vold & 0x8000) === 0 && (ptr_vold & 1) === 0) {
      const wordBefore = safeU16(buf, ptr_vold - 2);
      if (wordBefore === 0xFFEC || wordBefore === 0xFFE8) return 'veryold';
    }
  }
  return null;
}

export function isPaulShieldsFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return detectVariant(buf) !== null;
}

/**
 * Find the offset where sequential PCM sample data begins (SamplePtr in ASM).
 *
 * From InitPlayer: the code finds the max of 4 song pointer words, adds that to
 * base to locate the end-of-song-data marker, then scans past repeated values
 * to find the start of PCM data.
 */
function findSampleDataOffset(buf: Uint8Array, variant: PaulShieldsVariant): number {
  // Determine the 4 song pointer word offsets based on variant
  let ptrOffsets: number[];
  if (variant === 'new') {
    // offsets 166, 170, 174, 178 (words at module+166)
    ptrOffsets = [166, 170, 174, 178];
  } else if (variant === 'old') {
    // offsets 518, 522, 526, 530
    ptrOffsets = [518, 522, 526, 530];
  } else {
    // veryold: offsets 514, 518, 522, 526
    ptrOffsets = [514, 518, 522, 526];
  }

  // Find max of the 4 song pointer words
  let maxPtr = 0;
  for (const off of ptrOffsets) {
    const val = safeU16(buf, off);
    if (val > maxPtr) maxPtr = val;
  }

  if (maxPtr === 0 || maxPtr >= buf.length) return 0;

  // A3 = base + maxPtr, then scan for end-of-repeated-values
  // The ASM reads the last word before A3, then scans forward until a word differs
  let pos = maxPtr;
  if (pos < 2) return 0;
  const sentinel = safeU16(buf, pos - 2);
  while (pos + 1 < buf.length) {
    if (safeU16(buf, pos) !== sentinel) break;
    pos += 2;
  }
  return pos;
}

export function parsePaulShieldsFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const variant = detectVariant(buf);
  if (!variant) throw new Error('Not a Paul Shields module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^ps\./i, '').replace(/\.ps$/i, '') || baseName;

  // ── Sample extraction ────────────────────────────────────────────────────
  //
  // From Paul Shields_v3.asm SampleInit + InitSamplesNew/InitSamplesOld/InitSamples_2:
  //
  // New format (variant='new', Format=1): 10-byte sample records starting at module+10
  //   Record layout: [2B unused | 2B length(words) | 2B loopStart | 2B loopLen | 2B finetune]
  //
  // Old format (variant='old', Format=0xFF): 32-byte records starting at module+32
  //   Record: [22B name | 2B length(words) | 2B volume | 2B loopStart | 2B loopLen | 2B finetune]
  //
  // Very-old format (variant='veryold', Format=0): 32-byte records starting at module+32
  //   Same layout as Old (InitSamples_2 reads same offsets as InitSamplesOld)
  //
  // PCM data starts at SamplePtr (found by scanning past song data).
  // Samples are sequential: each sample's PCM length = length_words * 2 bytes.

  const isNew = variant === 'new';
  const recordSize = isNew ? 10 : 32;      // SampleInit: D2 = 10 or 32
  const recordStart = isNew ? 10 : 32;     // SampleInit: add.l D2,A2 from base
  const lenOffset = isNew ? 2 : 22;        // length field within record

  const sampleDataStart = findSampleDataOffset(buf, variant);
  const instruments: InstrumentConfig[] = [];
  let pcmPos = sampleDataStart;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const recOff = recordStart + i * recordSize;
    if (recOff + recordSize > buf.length) {
      instruments.push({
        id: i + 1, name: `Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    const lenWords = u16BE(buf, recOff + lenOffset);
    const lenBytes = lenWords * 2;  // SampleInit: add.l D0,D0

    // Read loop info
    let loopStart = 0;
    let loopLen = 0;
    if (isNew) {
      // InitSamplesNew: loopStart at +4, loopLen at +6
      loopStart = u16BE(buf, recOff + 4);
      loopLen = u16BE(buf, recOff + 6);
    } else {
      // InitSamplesOld/InitSamples_2: loopStart at +26 ($1A), loopLen at +28 ($1C)
      loopStart = u16BE(buf, recOff + 26);
      loopLen = u16BE(buf, recOff + 28);
    }

    // Read sample name (Old/VeryOld have 22-byte name at record start; New has no real name)
    let name = '';
    if (!isNew) {
      for (let j = 0; j < 22; j++) {
        const c = buf[recOff + j];
        if (c === 0) break;
        if (c >= 0x20 && c < 0x7f) name += String.fromCharCode(c);
      }
    }

    if (lenBytes === 0 || sampleDataStart === 0) {
      instruments.push({
        id: i + 1, name: name || `Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    // Extract PCM data
    const safeLen = Math.min(lenBytes, buf.length - pcmPos);
    if (safeLen > 0 && pcmPos < buf.length) {
      const pcm = buf.slice(pcmPos, pcmPos + safeLen);

      // Loop: loopLen < 2 means no loop (cmp.w #2,D0; bcc.s -> if < 2, clamp to 2 = no loop)
      const hasLoop = loopLen >= 2;
      const loopStartBytes = loopStart;  // already in bytes (word offset added to address)
      const loopEndBytes = hasLoop ? loopStartBytes + loopLen * 2 : 0;

      instruments.push(createSamplerInstrument(
        i + 1,
        name || `Sample ${i + 1}`,
        pcm,
        64,     // EPS_Volume = 64
        8287,   // Amiga PAL base rate
        hasLoop ? loopStartBytes : 0,
        hasLoop ? loopEndBytes : 0,
      ));
    } else {
      instruments.push({
        id: i + 1, name: name || `Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
    pcmPos += lenBytes;
  }

  // Fallback if no samples extracted
  if (instruments.length === 0) {
    for (let i = 0; i < 8; i++) {
      instruments.push({
        id: i + 1, name: `Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1,
      originalInstrumentCount: instruments.length,
    },
  };

  return {
    name: `${moduleName} [Paul Shields]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'paulShields',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: 4,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
      decodeCell: decodeMODCell,
    } as UADEPatternLayout,
  };
}
