/**
 * AshleyHoggParser.ts — Ashley Hogg format detection and stub parser
 *
 * Detection (from Ashley Hogg_v1.asm, DTP_Check2):
 *
 * Two sub-formats are detected:
 *
 * New format (Format = $FF):
 *   Checks words at offsets 0,2,4,6,8,10,12,14 (4 pairs):
 *     each pair: word == $6000, next word > 0, even, non-negative
 *   Then checks 2 more pairs the same way, then jumps forward by that last word value,
 *   then checks for $48E7FFFE (movem.l push), $6100 (bsr), and $4DF9/$00DFF000 (lea $DFF000).
 *
 * Old format (Format = 0):
 *   At offset 16 (the 5th pair opcode slot): $303C0000 followed by $662233C0.
 *   The ASM does subq.l #2,A0 after reading (and failing) the 5th opcode word,
 *   which winds A0 back to offset 16 (18-2=16).
 *
 * The assembly loop (loop1) checks 4 pairs of words:
 *   for i in 0..3: word[2i] == $6000, word[2i+1] > 0, even, non-negative
 * Then tries new-format checks; on failure, falls to OldCheck.
 *
 * New format preamble offset: after reading the 6th pair's opcode (at 20) the ASM
 * does move.w (A0),D2 (no post-increment, reads at 22), then add.w D2,A0 (A0=22+D2).
 * So preambleOff = 22 + dist6.
 *
 * Minimum file size: old format needs 24 bytes; new format needs substantially more.
 * Using 20 bytes as a conservative minimum.
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

/** Signed 16-bit big-endian read (two's complement). */
function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect Ashley Hogg format.
 *
 * Mirrors Check2 in Ashley Hogg_v1.asm:
 *
 * loop1: 4 iterations checking word pairs at A0:
 *   cmp.w #$6000,(A0)+  → fail if not $6000
 *   move.w (A0)+,D2     → fail if zero, negative, or odd
 *
 * Then tries new-format path (one more pair + $48E7FFFE + bsr + lea $DFF000),
 * or falls back to old-format ($303C0000 / $662233C0).
 */
export function isAshleyHoggFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  let off = 0;

  // loop1: 4 pairs must each be ($6000, positive-even-nonzero word)
  for (let i = 0; i < 4; i++) {
    if (off + 4 > buf.length) return false;
    if (u16BE(buf, off) !== 0x6000) return false;
    off += 2;
    const d2 = u16BE(buf, off);
    off += 2;
    if (d2 === 0) return false;
    if (d2 & 0x8000) return false; // bmi → negative (sign bit set in 16-bit)
    if (d2 & 1) return false;      // btst #0 → odd
  }

  // Try new format: check 5th pair opcode at off (= 16).
  // ASM: cmp.w (A0)+,D3  → A0 advances from 16 to 18.
  // If opcode == $6000 → continue new-format checks.
  // Otherwise A0 = 18 → OldCheck does subq.l #2,A0 → A0 = 16.
  if (off + 4 <= buf.length) {
    const w0 = u16BE(buf, off);
    if (w0 === 0x6000) {
      // 5th pair distance at off+2
      const d2a = u16BE(buf, off + 2);
      if (d2a !== 0 && !(d2a & 0x8000) && !(d2a & 1)) {
        // off2 = off+4 = 20: start of 6th pair opcode
        const off2 = off + 4;
        if (off2 + 4 <= buf.length) {
          const w1 = u16BE(buf, off2);
          if (w1 === 0x6000) {
            // 6th pair: ASM reads distance with move.w (A0),D2 — no post-increment.
            // A0 is at off2+2 = 22 after reading the opcode. add.w D2,A0 → A0 = 22+d2b.
            const d2b = u16BE(buf, off2 + 2);
            if (d2b !== 0 && !(d2b & 0x8000) && !(d2b & 1)) {
              // preamble starts at off2+2+d2b = 22+d2b
              const codeOff = off2 + 2 + d2b;
              if (codeOff + 10 <= buf.length) {
                if (u32BE(buf, codeOff) === 0x48E7FFFE &&
                    u16BE(buf, codeOff + 4) === 0x6100) {
                  // BSR displacement is a signed 16-bit word relative to A0 after
                  // consuming the opcode (A0 at codeOff+6). Use s16BE so that
                  // backward branches (negative displacement) resolve correctly.
                  const bsrOff = s16BE(buf, codeOff + 6);
                  // LEA target: A0 = (codeOff+6) + bsrOff = codeOff+6+bsrOff
                  const leaOff = codeOff + 6 + bsrOff;
                  if (leaOff + 6 <= buf.length &&
                      u16BE(buf, leaOff) === 0x4DF9 &&
                      u32BE(buf, leaOff + 2) === 0x00DFF000) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // OldCheck: 5th pair opcode was not $6000.
  // ASM: after cmp.w (A0)+,D3 the A0 was at 18; subq.l #2,A0 → A0 = 16.
  // So OldCheck reads at off = 16 (not off-2 = 14).
  if (off + 8 <= buf.length) {
    if (u32BE(buf, off) === 0x303C0000 &&
        u32BE(buf, off + 4) === 0x662233C0) {
      return true;
    }
  }

  return false;
}

/**
 * Determine if this is the old format (Format = 0).
 * Old format: 4 pairs of ($6000, positive-even word), then $303C0000 at offset 16.
 */
function isOldFormat(buf: Uint8Array): boolean {
  if (buf.length < 24) return false;
  let off = 0;
  for (let i = 0; i < 4; i++) {
    if (u16BE(buf, off) !== 0x6000) return false;
    const d2 = u16BE(buf, off + 2);
    if (d2 === 0 || (d2 & 0x8000) || (d2 & 1)) return false;
    off += 4;
  }
  // Off is now 16. Check for old-format marker.
  return u32BE(buf, 16) === 0x303C0000 && u32BE(buf, 20) === 0x662233C0;
}

/** Scan forward from `off` for a 16-bit word `needle`, return offset AFTER the match, or -1. */
function scanWord(buf: Uint8Array, off: number, needle: number, limit: number): number {
  const end = Math.min(buf.length - 1, off + limit);
  for (let i = off; i < end; i += 2) {
    if (u16BE(buf, i) === needle) return i + 2;
  }
  return -1;
}

/**
 * Extract samples from old-format Ashley Hogg module.
 *
 * Mirrors the "Old" path in InitPlayer (Ashley Hogg_v1.asm lines 776-843):
 * 1. A2 = module+16 (PlayPtr)
 * 2. Scan opcodes to find SamplesPtr ($47FA) and SamplesInfoPtr ($C2FC)
 * 3. Sample descriptors are $2C bytes: offset $20 = long sample_offset, $28 = word length_in_words
 * 4. PCM is raw 8-bit signed at SamplesPtr + sample_offset
 */
function extractOldFormatSamples(buf: Uint8Array): InstrumentConfig[] {
  const instruments: InstrumentConfig[] = [];
  const len = buf.length;

  // Step 1: Navigate to code area. A0 = module+2, A0 += word at (A0)
  if (len < 20) return instruments;
  let a0 = 2;
  const jumpDist = u16BE(buf, a0);
  a0 += jumpDist;
  if (a0 >= len) return instruments;

  // Step 2: Find5 — scan from A2=16 for $C2FC
  let a2 = 16;
  const find5Pos = scanWord(buf, a2, 0xC2FC, 0x10000);
  if (find5Pos < 0) return instruments;
  a2 = find5Pos;

  // After Find5: skip 4 bytes, then A1 = A2 + 4, and A1 += s16BE(buf, A1)
  a2 += 4; // addq.l #4,A2
  let samplesInfoPtr = a2;
  if (samplesInfoPtr + 2 > len) return instruments;
  const infoDisp = s16BE(buf, samplesInfoPtr);
  samplesInfoPtr += infoDisp; // A1 = A2; add.w (A1),A1
  if (samplesInfoPtr < 0 || samplesInfoPtr >= len) return instruments;

  // Find6 — scan from A2 for $47FA
  const find6Pos = scanWord(buf, a2, 0x47FA, 0x10000);
  if (find6Pos < 0) return instruments;
  a0 = find6Pos; // A0 = after $47FA

  // SamplesPtr: A2 = find6Pos position (at the word after $47FA), A2 += word at (A2)
  const sampDisp = s16BE(buf, find6Pos);
  let samplesPtr = find6Pos + sampDisp;
  if (samplesPtr < 0 || samplesPtr >= len) return instruments;

  // Find sample count: Find7 ($49FA), Find8 ($49FA again)
  let find7Pos = scanWord(buf, a0, 0x49FA, 0x10000);
  if (find7Pos < 0) return instruments;
  const find8Pos = scanWord(buf, find7Pos, 0x49FA, 0x10000);
  if (find8Pos < 0) return instruments;

  // A0 = find8Pos, A0 += word at (A0) — gives end of sample info table
  if (find8Pos + 2 > len) return instruments;
  const endDisp = s16BE(buf, find8Pos);
  const endInfoPtr = find8Pos + endDisp;

  // Sample count = (endInfoPtr - samplesInfoPtr) / $2C
  const rawCount = Math.floor((endInfoPtr - samplesInfoPtr) / 0x2C);
  const sampleCount = Math.min(Math.max(0, rawCount), 64);

  // Extract samples from descriptors
  for (let i = 0; i < sampleCount; i++) {
    const descOff = samplesInfoPtr + i * 0x2C;
    if (descOff + 0x2C > len) break;

    const sampleOffset = u32BE(buf, descOff + 0x20);
    // Check for negative offset (bmi.b SkipSam in ASM)
    if (sampleOffset >= 0x80000000) continue;

    const lengthInWords = u16BE(buf, descOff + 0x28);
    const sampleLen = lengthInWords * 2;

    const pcmFileOff = samplesPtr + sampleOffset;
    if (sampleLen > 0 && pcmFileOff + sampleLen <= len) {
      const pcm = buf.slice(pcmFileOff, pcmFileOff + sampleLen);
      instruments.push(createSamplerInstrument(
        i + 1, `ASH Sample ${i + 1}`, pcm, 64, 8287, 0, 0,
      ));
    } else {
      instruments.push({
        id: i + 1, name: `ASH Sample ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  return instruments;
}

/**
 * Extract samples from new-format Ashley Hogg module.
 *
 * New format (Format = $FF): sample data is in the same file, structured as
 * 16-byte descriptors followed by raw PCM. From SampleInit (lines 127-153):
 *   D3 = 104 (for NAME check offset)
 *   Each descriptor (16 bytes): long sampleOffset, 4 bytes, word lengthInWords, 2 bytes, 4 bytes
 *   PCM address = SamplesPtr + sampleOffset
 *   Sample length = lengthInWords * 2
 *
 * SamplesPtr for new format is loaded from external file (dtg_GetListData D0=1).
 * However, the descriptors within the external file are self-referencing:
 *   first descriptor's long offset tells where within the sample data block the PCM starts.
 *   The descriptor table and PCM are in the SAME external file.
 *
 * Since we only have the main file in single-file mode, new-format samples cannot be extracted.
 * Return empty to fall through to placeholder.
 */
function extractNewFormatSamples(_buf: Uint8Array): InstrumentConfig[] {
  // New format requires external sample file — cannot extract from main file alone
  return [];
}

export function parseAshleyHoggFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isAshleyHoggFormat(buf)) throw new Error('Not an Ashley Hogg module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^ash\./i, '') || baseName;

  // ── Extract samples ─────────────────────────────────────────────────────
  // Old format: samples are in the file, found by scanning 68k opcodes
  // New format: samples are in external file — cannot extract here
  let instruments: InstrumentConfig[];
  if (isOldFormat(buf)) {
    instruments = extractOldFormatSamples(buf);
  } else {
    instruments = extractNewFormatSamples(buf);
  }

  // Fallback placeholder if no samples found
  if (instruments.length === 0) {
    instruments = [{
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig];
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
    name: `${moduleName} [Ashley Hogg]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'ashleyHogg',
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
