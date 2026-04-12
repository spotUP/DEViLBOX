/**
 * MaximumEffectParser.ts — Maximum Effect format detection and parser
 *
 * Detection (from "Maximum Effect_v1.asm", DTP_Check2):
 *
 *   movea.l dtg_ChkData(A5),A0
 *   move.l  A0,A1
 *   move.l  (A1)+,D1    → D1 = long[0]; A1 points to offset 4
 *   beq.b   error       → fail if D1 == 0
 *   moveq   #15,D2
 *   cmp.l   D1,D2       → D2(15) >= D1? → bhi = branch if D2 > D1
 *   bhi.b   error       → fail if long[0] > 15 (i.e. D1 must be <= 15, > 0)
 *   move.l  dtg_ChkSize(A5),D3
 *   move.l  (A1)+,D1    → D1 = long[4]; A1 points to offset 8
 *   beq.b   Zero1       → allow zero
 *   bmi.b   error       → fail if negative
 *   btst    #0,D1       → fail if odd
 *   bne.b   error
 *   cmp.l   D3,D1       → fail if D1 > file size
 *   bgt.b   error
 *   subq.l  #2,D1       → D1 -= 2
 *   beq.b   error       → fail if D1 was exactly 2 (length - 2 == 0)
 *   divu.w  #18,D1      → divide by 18
 *   swap    D1
 *   tst.w   D1          → fail if remainder != 0 (must be divisible by 18)
 *   bne.b   error
 *
 * Zero1: (D1 == 0 is OK here)
 *   Loop 3 times (D2 = 2 down to 0):
 *     D0 = long[A1]
 *     fail if negative
 *     if D0 == 0 → skip (allowed)
 *     fail if odd
 *     fail if D0 > file size
 *     fail if long at (A0 + D0 - 6) != 0  ← tst.l -6(A0,D0.L) — checks that the
 *       6 bytes before end-of-data are zero (sanity check)
 *     set D1 = 1 (at least one non-zero pointer found)
 *   After loop: fail if D1 == 0 (no valid pointer found)
 *
 * Constraints on long[0]: 1..15 (number of sub-songs)
 * long[4]: 0, or even, positive, <= fileSize, (val-2) divisible by 18
 * Minimum file size: 8 bytes for the two longs checked initially,
 * but realistically the loop reads longs at offsets 8, 12, 16 → need 20 bytes.
 *
 * Sample extraction (from SMP.set data appended after module):
 *   The sample section starts with u16 sample count, then 16-byte entries at offset 2.
 *   Each entry (from EP_SampleInit + InitSamp):
 *     +0: u32 sample offset (relative to section start, pre-relocation)
 *     +4: u16 sample length in words (double for bytes)
 *     +8: u32 loop offset (relative)
 *    +12: u16 loop length in words
 *    +14: u16 padding
 *   The origin is the start of the sample section within the file.
 *
 * Prefix: 'MAX.'
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_FILE_SIZE = 20;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

const MAGIC_MXTX = 0x4D585458; // 'MXTX'

/**
 * Detect Maximum Effect / MaxTrax format.
 *
 * Files with 'MXTX' magic are MaxTrax files and are accepted directly.
 * Files without the magic are checked against the structural Check2 logic
 * from "Maximum Effect_v1.asm".
 */
export function isMaximumEffectFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Fast-accept: MaxTrax files start with 'MXTX' magic
  if (u32BE(buf, 0) === MAGIC_MXTX) return true;

  const fileSize = buf.length;
  const d1_0 = u32BE(buf, 0);

  // long[0] must be 1..15 (sub-song count)
  if (d1_0 === 0) return false;
  if (d1_0 > 15) return false;

  // long[4]: pattern list pointer
  const d1_4 = u32BE(buf, 4);
  if (d1_4 !== 0) {
    if (d1_4 & 0x80000000) return false; // negative
    if (d1_4 & 1) return false;          // odd
    if (d1_4 > fileSize) return false;
    const adjusted = d1_4 - 2;
    if (adjusted === 0) return false;
    // must be divisible by 18
    if (adjusted % 18 !== 0) return false;
  }

  // Loop over longs at offsets 8, 12, 16
  let foundOne = false;
  for (let i = 0; i < 3; i++) {
    const off = 8 + i * 4;
    if (off + 4 > buf.length) return false;
    const d0 = u32BE(buf, off);
    if (d0 & 0x80000000) return false; // negative
    if (d0 === 0) continue;            // zero is allowed
    if (d0 & 1) return false;          // odd
    if (d0 > fileSize) return false;
    // tst.l -6(A0,D0.L): check that long at (buf[0 + D0 - 6]) == 0
    const testOff = d0 - 6;
    if (testOff + 4 > buf.length) return false;
    if (u32BE(buf, testOff) !== 0) return false;
    foundOne = true;
  }

  return foundOne;
}

/**
 * Find the end of module data by examining header pointers.
 *
 * The module header has pointers at offsets 4, 8, 12, 16 that reference
 * data sections within the file. The highest pointer value marks the end
 * of module data. After that, sample data (SMP.set) may be appended.
 */
function findModuleDataEnd(buf: Uint8Array): number {
  let maxPtr = 20; // minimum: 5 longs header
  for (let i = 1; i < 5; i++) {
    const off = i * 4;
    if (off + 4 > buf.length) break;
    const ptr = u32BE(buf, off);
    if (ptr > 0 && !(ptr & 0x80000000) && ptr <= buf.length) {
      if (ptr > maxPtr) maxPtr = ptr;
    }
  }
  return maxPtr;
}

/**
 * Try to find and parse the sample table from the SMP.set section appended
 * after the module data.
 *
 * SMP.set format (from InitSamp / EP_SampleInit):
 *   u16 sampleCount at offset 0
 *   then (sampleCount+1) entries of 16 bytes each starting at offset 2:
 *     +0: u32 sample offset (relative to section start)
 *     +4: u16 sample length in words
 *     +6: u16 (unused)
 *     +8: u32 loop start offset (relative to section start)
 *    +12: u16 loop length in words
 *    +14: u16 (unused)
 *
 * Returns extracted instruments or null if no valid sample section found.
 */
function extractSamples(buf: Uint8Array, smpOffset: number): InstrumentConfig[] | null {
  if (smpOffset + 2 > buf.length) return null;
  const sampleCount = u16BE(buf, smpOffset);
  if (sampleCount === 0 || sampleCount > 256) return null;

  const tableStart = smpOffset + 2;
  const tableSize = (sampleCount + 1) * 16;
  if (tableStart + tableSize > buf.length) return null;

  const instruments: InstrumentConfig[] = [];
  let validSamples = 0;

  for (let i = 0; i <= sampleCount; i++) {
    const entryOff = tableStart + i * 16;
    const smpAddr = u32BE(buf, entryOff);
    const lenWords = u16BE(buf, entryOff + 4);
    const loopAddr = u32BE(buf, entryOff + 8);
    const loopLenWords = u16BE(buf, entryOff + 12);

    const lenBytes = lenWords * 2;
    const loopLenBytes = loopLenWords * 2;

    // Sample offset is relative to the section start (pre-relocation)
    const pcmFileOff = smpOffset + smpAddr;

    if (lenBytes > 0 && pcmFileOff >= 0 && pcmFileOff + lenBytes <= buf.length) {
      const pcm = buf.slice(pcmFileOff, pcmFileOff + lenBytes);

      // Compute loop points relative to sample start
      let loopStart = 0;
      let loopEnd = 0;
      if (loopLenBytes > 2 && loopAddr >= smpAddr) {
        loopStart = loopAddr - smpAddr;
        loopEnd = loopStart + loopLenBytes;
        if (loopEnd > lenBytes) {
          loopStart = 0;
          loopEnd = 0;
        }
      }

      instruments.push(createSamplerInstrument(
        i + 1,
        `MAX Sample ${i + 1}`,
        pcm,
        64,
        8287,
        loopStart,
        loopEnd,
      ));
      validSamples++;
    } else {
      instruments.push({
        id: i + 1, name: `MAX Sample ${i + 1}`,
        type: 'synth' as const, synthType: 'Synth' as const,
        effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  // Require at least one valid sample to accept this as a real sample section
  return validSamples > 0 ? instruments : null;
}

export function parseMaximumEffectFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isMaximumEffectFormat(buf)) throw new Error('Not a Maximum Effect module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^max\./i, '') || baseName;

  // Try to extract samples from appended SMP.set data
  let instruments: InstrumentConfig[] = [];
  let samplesExtracted = false;

  // Skip MXTX files — they use a different internal structure
  if (u32BE(buf, 0) !== MAGIC_MXTX) {
    const moduleEnd = findModuleDataEnd(buf);
    if (moduleEnd < buf.length) {
      const extracted = extractSamples(buf, moduleEnd);
      if (extracted) {
        instruments = extracted;
        samplesExtracted = true;
      }
    }
  }

  if (!samplesExtracted) {
    instruments = [{
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig];
  }

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const sampleInfo = samplesExtracted ? ` (${instruments.length} samples)` : '';

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
    name: `${moduleName}${sampleInfo} [Maximum Effect]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'maximumEffect',
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
