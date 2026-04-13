/**
 * CoreDesignParser.ts — Core Design Amiga music format native parser
 *
 * Core Design is a proprietary 4-channel Amiga music format used in games
 * developed by Core Design (e.g. Chuck Rock, Jaguar XJ220, Heimdall). The
 * module is a compiled 68k executable combining player code and music data
 * into a single self-contained file.
 *
 * Detection (from UADE Core Design.asm Check3 routine, big-endian reads):
 *   u32BE(buf, 0)  === 0x000003F3   (68k HUNK_HEADER magic)
 *   buf[20] !== 0                   (non-zero byte at offset 20)
 *   u32BE(buf, 32) === 0x70FF4E75   (68k MOVEQ #-1,D0 + RTS opcodes)
 *   u32BE(buf, 36) === 0x532E5048   (ASCII 'S.PH')
 *   u32BE(buf, 40) === 0x49505053   (ASCII 'IPPS')
 *   u32BE(buf, 44) !== 0            (Interrupt pointer)
 *   u32BE(buf, 48) !== 0            (Audio Interrupt pointer)
 *   u32BE(buf, 52) !== 0            (InitSong pointer)
 *   u32BE(buf, 56) !== 0            (EndSong pointer)
 *   u32BE(buf, 60) !== 0            (Subsongs pointer)
 *
 * Sample extraction (from Core Design.asm SampleInit + InitPlayer):
 *   The code body in the HUNK starts at file offset 32 (standard single-hunk).
 *   At code[32] (file offset 64): SampleInfoPtr (section-relative before relocation)
 *   At code[36] (file offset 68): EndSampleInfoPtr
 *   Count = (EndSampleInfoPtr - SampleInfoPtr) / 14
 *   Each 14-byte entry: u32 at +6 = section-relative address of sample data area.
 *   At sample data area: u16 length in words, then PCM data follows.
 *   Sample length in bytes = u16 * 2.
 *
 * File prefix: "CORE." (e.g. "CORE.songname")
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/CoreDesign/...
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_FILE_SIZE = 64;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isCoreDesignFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // 68k HUNK_HEADER magic
  if (u32BE(buf, 0) !== 0x000003F3) return false;

  // Byte at offset 20 must be non-zero
  if (buf[20] === 0) return false;

  // 68k MOVEQ #-1,D0 + RTS opcode pair
  if (u32BE(buf, 32) !== 0x70FF4E75) return false;

  // ASCII 'S.PH'
  if (u32BE(buf, 36) !== 0x532E5048) return false;

  // ASCII 'IPPS'
  if (u32BE(buf, 40) !== 0x49505053) return false;

  // Interrupt pointer
  if (u32BE(buf, 44) === 0) return false;

  // Audio Interrupt pointer
  if (u32BE(buf, 48) === 0) return false;

  // InitSong pointer
  if (u32BE(buf, 52) === 0) return false;

  // EndSong pointer
  if (u32BE(buf, 56) === 0) return false;

  // Subsongs pointer
  if (u32BE(buf, 60) === 0) return false;

  return true;
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

/**
 * Read a null-terminated ASCII string from buf starting at off, up to maxLen bytes.
 */
function readCString(buf: Uint8Array, off: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    const ch = buf[off + i];
    if (ch === 0) break;
    if (ch >= 0x20 && ch < 0x7f) s += String.fromCharCode(ch);
  }
  return s;
}

/**
 * Parse the Amiga HUNK header to find where the code body starts in the file.
 *
 * Standard single-hunk layout:
 *   offset  0: 0x000003F3 (HUNK_HEADER)
 *   offset  4: 0x00000000 (no string table)
 *   offset  8: num_hunks
 *   offset 12: first_hunk
 *   offset 16: last_hunk
 *   offset 20: hunk_sizes[0..n-1]  (n = last - first + 1)
 *   offset 20+n*4: 0x000003E9 (HUNK_CODE)
 *   offset 24+n*4: code_longwords
 *   offset 28+n*4: code body starts
 *
 * Returns the file offset of the first byte of code, or -1 on failure.
 */
function findHunkCodeBodyStart(buf: Uint8Array): number {
  if (buf.length < 32) return -1;
  if (u32BE(buf, 0) !== 0x000003F3) return -1;

  // Skip string table (offset 4: number of resident library name entries, usually 0)
  const stringTableCount = u32BE(buf, 4);
  let off = 8;
  for (let i = 0; i < stringTableCount; i++) {
    if (off + 4 > buf.length) return -1;
    const strLongs = u32BE(buf, off);
    off += 4 + strLongs * 4;
  }

  if (off + 12 > buf.length) return -1;
  const numHunks = u32BE(buf, off);
  off += 12; // skip numHunks, firstHunk, lastHunk

  // Skip hunk size entries
  off += numHunks * 4;

  // Expect HUNK_CODE (0x3E9), mask off memory type flags in high bits
  if (off + 8 > buf.length) return -1;
  const hunkType = u32BE(buf, off) & 0x3FFFFFFF;
  if (hunkType !== 0x3E9) return -1;
  off += 8; // skip HUNK_CODE + code_longwords

  return off;
}

/**
 * Extract sample PCM data from a Core Design module using HUNK structure.
 *
 * From the ASM (InitPlayer + SampleInit):
 *   - After codeBase + 12 (skip 0x70FF4E75 + 'S.PHIPPS'): 7 longword reads
 *   - code[32] = SampleInfoPtr, code[36] = EndSampleInfoPtr (section-relative)
 *   - Count = (EndSampleInfoPtr - SampleInfoPtr) / 14
 *   - Each 14-byte entry: u32 at +6 = section-relative address of sample data
 *   - At sample data: u16 length in words, then PCM follows
 */
function extractCoreDesignSamples(buf: Uint8Array, codeStart: number): InstrumentConfig[] {
  const instruments: InstrumentConfig[] = [];
  const ENTRY_SIZE = 14;

  // SampleInfoPtr at code[32], EndSampleInfoPtr at code[36]
  const sampleInfoPtrOff = codeStart + 32;
  const endSampleInfoPtrOff = codeStart + 36;

  if (endSampleInfoPtrOff + 4 > buf.length) return instruments;

  const sampleInfoRelative = u32BE(buf, sampleInfoPtrOff);
  const endSampleInfoRelative = u32BE(buf, endSampleInfoPtrOff);

  if (sampleInfoRelative === 0 || endSampleInfoRelative === 0) return instruments;
  if (endSampleInfoRelative <= sampleInfoRelative) return instruments;

  const sampleInfoFileOff = sampleInfoRelative + codeStart;
  const endSampleInfoFileOff = endSampleInfoRelative + codeStart;

  if (sampleInfoFileOff >= buf.length || endSampleInfoFileOff > buf.length) return instruments;

  const tableBytes = endSampleInfoFileOff - sampleInfoFileOff;
  if (tableBytes % ENTRY_SIZE !== 0) return instruments;
  const count = tableBytes / ENTRY_SIZE;
  if (count === 0 || count > 128) return instruments;

  for (let i = 0; i < count; i++) {
    const entryOff = sampleInfoFileOff + i * ENTRY_SIZE;
    if (entryOff + ENTRY_SIZE > buf.length) break;

    // u32 at entry+6 = section-relative address of sample data area
    const sampleAreaRelative = u32BE(buf, entryOff + 6);
    if (sampleAreaRelative === 0) {
      instruments.push({
        id: i + 1, name: `CORE Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    const sampleAreaFileOff = sampleAreaRelative + codeStart;
    if (sampleAreaFileOff + 2 > buf.length) {
      instruments.push({
        id: i + 1, name: `CORE Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    // First u16 at sample area = length in words
    const lengthWords = u16BE(buf, sampleAreaFileOff);
    const lengthBytes = lengthWords * 2;
    const pcmStart = sampleAreaFileOff + 2;

    if (lengthBytes > 0 && lengthBytes < 0x100000 && pcmStart + lengthBytes <= buf.length) {
      const pcm = buf.slice(pcmStart, pcmStart + lengthBytes);
      instruments.push(createSamplerInstrument(
        i + 1, `CORE Sample ${i + 1}`, pcm, 64, 8287, 0, 0,
      ));
    } else {
      instruments.push({
        id: i + 1, name: `CORE Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  return instruments;
}

export function parseCoreDesignFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isCoreDesignFormat(buf)) throw new Error('Not a Core Design module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^core\./i, '') || baseName;

  // ── Extract samples from HUNK code body ────────────────────────────────

  const instruments: InstrumentConfig[] = [];
  let songName = '';
  let authorName = '';

  const codeStart = findHunkCodeBodyStart(buf);

  if (codeStart > 0) {
    // Structural extraction using HUNK pointers
    const extracted = extractCoreDesignSamples(buf, codeStart);
    instruments.push(...extracted);

    // Extract song/author names from header pointers
    // After the 7 longword reads (code[12..39]), InitPlayer reads:
    //   code[40] = SongName, code[44] = AuthorName (section-relative pointers)
    const songNamePtrOff = codeStart + 40;
    const authorNamePtrOff = codeStart + 44;
    if (songNamePtrOff + 4 <= buf.length) {
      const songNameRelative = u32BE(buf, songNamePtrOff);
      if (songNameRelative > 0) {
        const nameFileOff = songNameRelative + codeStart;
        if (nameFileOff < buf.length) {
          songName = readCString(buf, nameFileOff, 64);
        }
      }
    }
    if (authorNamePtrOff + 4 <= buf.length) {
      const authorNameRelative = u32BE(buf, authorNamePtrOff);
      if (authorNameRelative > 0) {
        const nameFileOff = authorNameRelative + codeStart;
        if (nameFileOff < buf.length) {
          authorName = readCString(buf, nameFileOff, 64);
        }
      }
    }
  }

  // Fallback: single placeholder instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  // ── Empty pattern (placeholder — UADE handles actual audio) ───────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1,
      originalInstrumentCount: instruments.length,
    },
  };

  // ── Display name ─────────────────────────────────────────────────────

  let displayName = songName || moduleName;
  if (authorName) displayName += ` by ${authorName}`;
  displayName += ' [Core Design]';

  return {
    name: displayName,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    coreDesignFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'coreDesign',
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
