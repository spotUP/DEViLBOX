/**
 * DigitalSonixChromeParser.ts — Digital Sonix & Chrome Amiga music format native parser
 *
 * "Digital Sonix & Chrome" is a 4-channel Amiga music format by Andrew E. Bailey &
 * David M. Hanlon (c) 1990, as used in the game "Dragon's Breath". The eagleplayer
 * adapter was written by Wanted Team.
 *
 * File prefix: "DSC." (e.g. "DSC.songname")
 *
 * Detection is ported 1:1 from the DTP_Check2 routine in
 * DigitalSonixChrome_v1.asm (Wanted Team eagleplayer).
 *
 * File layout (big-endian):
 *   +0x00  word   — non-zero header word
 *   +0x02  byte   — D0: "length" count (number of sequence length entries, must be > 0)
 *   +0x03  byte   — D1: sample count (must be >= 2)
 *   +0x04  long   — D2: song data size (even, non-zero, <= 0x80000, < fileSize)
 *   +0x08  long   — D3: sequence count (non-zero, <= 0x20000)
 *   +0x0C  (D1-1) * 6 bytes: instrument entries (long length + word extra)
 *   After entries:
 *     long   — must be zero
 *     word   — must be zero
 *     D3*4 bytes — sequence table
 *     D0*18 bytes — sample info records
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

// Minimum meaningful file: header(2) + counts(2) + D2(4) + D3(4) + zero(6) = 18 bytes
const MIN_FILE_SIZE = 18;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Detects a Digital Sonix & Chrome module.
 *
 * Ported exactly from Check2 in DigitalSonixChrome_v1.asm:
 *
 *   A0 = start of data, D3 = file size, A1 = A0 + D3 (end pointer)
 *
 *   tst.w  (A0)+          ; word at 0 must be non-zero; A0 -> 2
 *   move.b (A0)+, D0      ; byte at 2 = nLengths (must be non-zero); A0 -> 3
 *   move.b (A0)+, D1      ; byte at 3 = nSamples (must be non-zero); A0 -> 4
 *   move.l (A0)+, D2      ; long at 4 = song data size; A0 -> 8
 *     beq / btst #0 / cmp #$80000 / cmp D3  => D2 non-zero, even, <=0x80000, < fileSize
 *   move.l (A0)+, D3      ; long at 8 = seqCount; A0 -> 12
 *     beq / cmp #$20000   => D3 non-zero, <=0x20000
 *   subq.l #2, D1 / bmi   ; nSamples must be >= 2; D1 = nSamples-2
 *   CheckOne loop (D1+1 iters, i.e. nSamples-1 iters):
 *     move.l (A0)+, D4    ; bmi / btst #0 / cmp #$20000 => non-neg, even, <=0x20000
 *     addq.l #2, A0       ; skip 2 bytes
 *   After loop:
 *     tst.l  (A0)+        ; must be zero
 *     tst.w  (A0)+        ; must be zero
 *   lsl.l #2, D3          ; seqCount * 4
 *   add.l D3, A0          ; skip sequence table
 *   mulu.w #18, D0        ; nLengths * 18 = sample info size
 *   lea (A0, D0.W), A2    ; A2 = end of sample records
 *   cmp.l A2, A1 / ble    ; file must extend past A2 (A1 > A2)
 *   CheckTwo loop (while A0 != A2, stride 18):
 *     move.l 2(A0), D1    ; sample length: non-zero, non-neg, <= D2
 *     move.l 12(A0), D0   ; sample offset: <= D2
 *     lea 18(A0), A0
 *   After loop:
 *     add.l -16(A0), D0   ; D0 = last sample offset + last sample prev-to-last length
 *     cmp.l D2, D0 / bne  ; must equal D2
 */
export function isDscFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const fileSize = buf.length;
  if (fileSize < MIN_FILE_SIZE) return false;

  let off = 0;

  // tst.w (A0)+ — word at offset 0 must be non-zero
  const headerWord = u16BE(buf, off);
  off += 2;
  if (headerWord === 0) return false;

  // move.b (A0)+, D0 — nLengths, must be non-zero
  const nLengths = buf[off];
  off += 1;
  if (nLengths === 0) return false;

  // move.b (A0)+, D1 — nSamples, must be non-zero
  let nSamples = buf[off];
  off += 1;
  if (nSamples === 0) return false;

  // Bounds check before reading two longs
  if (off + 8 > fileSize) return false;

  // move.l (A0)+, D2 — song data size
  const d2 = u32BE(buf, off);
  off += 4;
  if (d2 === 0) return false;
  if ((d2 & 1) !== 0) return false;       // btst #0, D2 — must be even
  if (d2 > 0x80000) return false;         // cmp.l #$80000, D2 / bhi
  if (d2 >= fileSize) return false;       // cmp.l D3, D2 / bge (D3 = fileSize)

  // move.l (A0)+, D3 — sequence count
  const seqCount = u32BE(buf, off);
  off += 4;
  if (seqCount === 0) return false;
  if (seqCount > 0x20000) return false;

  // subq.l #2, D1 / bmi — nSamples must be >= 2
  nSamples -= 2;
  if (nSamples < 0) return false; // bmi

  // CheckOne loop: (nSamples+1) = original_nSamples-1 iterations
  // Each iteration: read long (6 bytes = long + word), advance 6 bytes
  const checkOneIters = nSamples + 1; // dbf D1,CheckOne counts D1 down to -1
  if (off + checkOneIters * 6 + 6 > fileSize) return false; // rough bounds
  for (let i = 0; i < checkOneIters; i++) {
    if (off + 6 > fileSize) return false;
    const d4 = u32BE(buf, off);
    off += 4;
    if (d4 >= 0x80000000) return false;   // bmi — must not be negative (bit 31 set)
    if ((d4 & 1) !== 0) return false;     // btst #0, D4 — must be even
    if (d4 > 0x20000) return false;       // cmp.l #$20000
    off += 2; // addq.l #2, A0 (skip the extra word)
  }

  // After CheckOne loop:
  // tst.l (A0)+ — must be zero (long)
  if (off + 6 > fileSize) return false;
  const zeroLong = u32BE(buf, off);
  off += 4;
  if (zeroLong !== 0) return false;

  // tst.w (A0)+ — must be zero (word)
  const zeroWord = u16BE(buf, off);
  off += 2;
  if (zeroWord !== 0) return false;

  // lsl.l #2, D3; add.l D3, A0 — skip seqCount * 4 bytes
  const seqTableSize = seqCount * 4;
  if (off + seqTableSize > fileSize) return false;
  off += seqTableSize;

  // mulu.w #18, D0; lea (A0, D0.W), A2
  const sampleInfoSize = nLengths * 18;
  const a2 = off + sampleInfoSize;

  // cmp.l A2, A1 / ble Fault — A1 (= fileSize) must be > A2
  if (fileSize <= a2) return false;

  // CheckTwo loop: while off != a2, stride 18
  // Each record: [word period, long length, long ?, long offset, word ?, word loopLen, ...]
  // Actually the ASM reads: 2(A0) = length, 12(A0) = offset
  let lastSampleOffset = 0;
  let lastSampleLength = 0;
  while (off !== a2) {
    if (off + 18 > fileSize) return false;

    // move.l 2(A0), D1 — sample length at byte offset 2
    const sampleLen = u32BE(buf, off + 2);
    // beq Fault — must be non-zero
    if (sampleLen === 0) return false;
    // bmi Fault — must not be negative
    if ((sampleLen & 0x80000000) !== 0) return false;
    // cmp.l D2, D1 / bgt Fault — sampleLen <= d2
    if (sampleLen > d2) return false;

    // move.l 12(A0), D0 — sample offset at byte offset 12
    const sampleOffset = u32BE(buf, off + 12);
    // cmp.l D2, D0 / bhi Fault — sampleOffset <= d2
    if (sampleOffset > d2) return false;

    lastSampleLength = sampleLen;
    lastSampleOffset = sampleOffset;

    off += 18;
  }

  // After CheckTwo: add.l -16(A0), D0; cmp.l D2, D0 / bne Fault
  // -16(A0) after last lea 18(A0) means byte offset +2 of the last record (length)
  // D0 = last sample offset + length at -16 relative to post-loop A0
  // The ASM: after the final "lea 18(A0), A0", reads -16(A0) = off-18+2 = sampleLen (already read)
  // Then: D0 = lastSampleOffset + lastSampleLength; must equal d2
  if (a2 > 0) {
    // Only validate if there was at least one sample record
    if (lastSampleOffset + lastSampleLength !== d2) return false;
  }

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseDscFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isDscFormat(buf)) throw new Error('Not a Digital Sonix & Chrome module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^dsc\./i, '') || baseName;

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

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
      originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [Digital Sonix & Chrome]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
