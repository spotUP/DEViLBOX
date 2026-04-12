/**
 * PaulTongeParser.ts — Paul Tonge format detection and parser
 *
 * Detection (from "Paul Tonge_v1.asm", DTP_Check2):
 *
 *   move.l  A0,A1               -> save base pointer
 *   cmp.w   #$000C,(A0)+        -> word[0] must be $000C (12)
 *   bne.b   fail
 *   moveq   #2,D2               -> loop 3 times (D2 = 2 downto 0)
 * next:
 *   move.w  (A0)+,D1            -> read next word
 *   bmi.b   fail                -> fail if negative
 *   beq.b   skip                -> if zero, skip (allowed)
 *   btst    #0,D1               -> fail if odd
 *   bne.b   fail
 *   move.w  (A1,D1.W),D1       -> indirect: read word at base + D1
 *   ble.b   fail                -> fail if <= 0
 *   cmp.b   #$80,-1(A1,D1.W)   -> byte at base + D1 - 1 must be $80 or $8F
 *   beq.b   skip
 *   cmp.b   #$8F,-1(A1,D1.W)
 *   bne.b   fail
 * skip:
 *   dbf     D2,next
 *
 * Layout: word[0] = $000C = 12, then 3 offset words follow.
 * Each offset (if non-zero) must be:
 *   - positive, even
 *   - points to a word in the file that is > 0
 *   - byte at (offset - 1) must be $80 or $8F
 *
 * Minimum file size: 2 (header word) + 3x2 (offsets) = 8 bytes.
 * Practically at least one offset must be non-zero and valid, requiring
 * enough bytes for the pointed-to data. We use 8 as the absolute minimum.
 *
 * Prefix: 'PAT.'
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_FILE_SIZE = 8;
const MAX_INSTRUMENTS = 64;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/**
 * Detect Paul Tonge format.
 *
 * Mirrors Check2 in "Paul Tonge_v1.asm".
 */
export function isPaulTongeFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  let off = 0;

  // word[0] must be $000C = 12
  if (u16BE(buf, off) !== 0x000C) return false;
  off += 2;

  // Loop 3 times
  let foundOne = false;
  for (let i = 0; i < 3; i++) {
    if (off + 2 > buf.length) return false;
    const d1raw = u16BE(buf, off); off += 2;

    // bmi -> fail if negative (sign bit set in 16-bit)
    if (d1raw & 0x8000) return false;

    // zero is allowed (skip)
    if (d1raw === 0) continue;

    // btst #0 -> fail if odd
    if (d1raw & 1) return false;

    // indirect: read word at base + d1
    const indOff = d1raw;
    if (indOff + 2 > buf.length) return false;
    const indWord = s16BE(buf, indOff);

    // ble -> fail if <= 0
    if (indWord <= 0) return false;

    // byte at base + d1 - 1 must be $80 or $8F
    const byteOff = d1raw - 1;
    if (byteOff >= buf.length) return false;
    const b = buf[byteOff];
    if (b !== 0x80 && b !== 0x8F) return false;

    foundOne = true;
  }

  // At least one non-zero, valid offset must have been found
  return foundOne;
}

export function parsePaulTongeFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const _base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (!_base.startsWith('pat.') && !_base.endsWith('.tf') && !isPaulTongeFormat(buf)) throw new Error('Not a Paul Tonge module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^pat\./i, '') || baseName;

  // ── Sample extraction ─────────────────────────────────────────────────────
  //
  // Paul Tonge is a multi-file format: file 0 = module, file 1 = sample data.
  // The sample file contains 12-byte descriptor entries (terminated by a zero
  // longword), followed by sequential PCM data. Offsets in descriptors are
  // relative to the start of the sample file (D2 = SamplesPtr in SampleInit).
  //
  // From SampleInit:
  //   D2 = SamplesPtr (base of sample file / descriptor table)
  //   Loop:
  //     move.l (A2)+,D1  -> +0: u32 relative offset (add D2 for absolute)
  //     add.l  D2,D1     -> absolute sample address
  //     move.w (A2)+,D0  -> +4: u16 length in words
  //     add.l  D0,D0     -> length in bytes
  //     addq.l #6,A2     -> skip 6 bytes (total entry = 12 bytes)
  //
  // From InitPlayer (counting samples):
  //   Scan 12-byte entries in sample file until longword at +0 == 0.
  //
  // In single-file UADE bundles, the sample data may be appended after the
  // module's pattern data. We scan for a plausible descriptor table after
  // the module data ends.

  const instruments: InstrumentConfig[] = [];
  let samplesExtracted = false;
  let sampleCount = 0;

  // Try to find a sample descriptor table after the module's main data.
  // The voice offsets (first 4 words) tell us where sequence data is.
  // Find the maximum referenced offset to estimate end of pattern data.
  let maxModuleOff = 8; // at least past the 4 voice offset words
  for (let i = 0; i < 4; i++) {
    const voff = u16BE(buf, i * 2);
    if (voff > 0 && voff < buf.length) {
      // Each voice offset points to sequence data; scan for end marker
      let scan = voff;
      while (scan + 2 <= buf.length) {
        const w = u16BE(buf, scan);
        if (w === 0x8000 || w === 0x8F00) { scan += 2; break; }
        scan += 2;
      }
      if (scan > maxModuleOff) maxModuleOff = scan;
    }
  }

  // Try to find a sample descriptor table starting at even offsets after module data.
  // Each entry: u32 offset (non-zero, even) + u16 length (non-zero) + 6 skip.
  // Terminated by u32 zero.
  function trySampleTableAt(tableOff: number): Array<{ offset: number; lengthBytes: number }> | null {
    const entries: Array<{ offset: number; lengthBytes: number }> = [];
    let pos = tableOff;
    for (let i = 0; i < MAX_INSTRUMENTS; i++) {
      if (pos + 4 > buf.length) return null;
      const off32 = u32BE(buf, pos);
      if (off32 === 0) break; // terminator
      if (pos + 6 > buf.length) return null;
      const lenWords = u16BE(buf, pos + 4);
      const lenBytes = lenWords * 2;
      // Validate: offset should be even and within file when added to tableOff
      if (off32 & 1) return null;
      if (off32 >= buf.length) return null;
      const absOff = tableOff + off32;
      if (absOff + lenBytes > buf.length) return null;
      if (lenBytes === 0) return null;
      entries.push({ offset: absOff, lengthBytes: lenBytes });
      pos += 12;
    }
    return entries.length > 0 ? entries : null;
  }

  for (let tryOff = maxModuleOff; tryOff < buf.length - 12; tryOff += 2) {
    const entries = trySampleTableAt(tryOff);
    if (entries && entries.length >= 1) {
      sampleCount = entries.length;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const pcm = buf.slice(entry.offset, entry.offset + entry.lengthBytes);
        instruments.push(createSamplerInstrument(
          i + 1, `PT Sample ${i + 1}`, pcm, 64, 8287, 0, 0,
        ));
      }
      samplesExtracted = true;
      break;
    }
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1',
      type: 'synth' as const, synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
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
      originalInstrumentCount: sampleCount,
    },
  };

  const nameParts: string[] = [`${moduleName} [Paul Tonge]`];
  if (samplesExtracted) nameParts.push(`(${instruments.length} smp)`);

  return {
    name: nameParts.join(' '), format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'paulTonge',
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
