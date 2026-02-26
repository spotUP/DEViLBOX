/**
 * SonixMusicDriverParser.ts — Sonix Music Driver Amiga music format native parser
 *
 * "Sonix Music Driver" is a 4-channel Amiga music format by Mark Riley (c) 1987-91.
 * The eagleplayer adapter was written by Wanted Team.
 *
 * Three sub-formats are detected, each with a different file prefix:
 *
 *   smus.*  — IFF SMUS variant with SNX1/INS1/TRAK/NAME chunks
 *             Detected when the first 4 bytes are 'FORM'.
 *
 *   tiny.*  — TINY variant
 *             Detected when the low nibble of the first byte is non-zero
 *             (i.e. word & 0x00F0 != 0).
 *
 *   snx.*   — Generic SNX variant (default when neither FORM nor TINY)
 *             Detected when the low nibble of the first byte is zero.
 *
 * Detection is ported 1:1 from the DTP_Check2 routine in
 * "Sonix Music Driver_v1.asm" (Wanted Team eagleplayer).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

const MIN_FILE_SIZE_SNX  = 21;  // at minimum: 4 longs (16) + 4-byte skip + 1 byte
const MIN_FILE_SIZE_TINY = 333; // cmp.l #332, D4 / ble fault → fileSize > 332
const MIN_FILE_SIZE_SMUS = 28;  // FORM(4)+size(4)+SMUS(4)+SHDR(4)+?(8)+byte23

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Sub-format detection helpers ───────────────────────────────────────────

/**
 * SNX sub-format detection.
 *
 * Precondition: first word & 0x00F0 == 0 and first 4 bytes != 'FORM'.
 *
 * Ported from the "else" branch of Check2 (lines 410-440):
 *
 *   A0 = data, A1 = data (saved copy), D4 = fileSize
 *   D3 = 20, D1 = 3
 *   NextPos loop (4 iters):
 *     D2 = u32BE(A0); A0 += 4
 *     if D2 == 0 || D2 < 0 || D2 odd  → fault
 *     D3 += D2
 *   if D3 >= D4  → fault
 *   A0 += 4
 *   SecPass loop (4 iters):
 *     byte at A0 must have bit7 set (bpl fault)
 *     if word at A0 == 0xFFFF  → OK1
 *     else if byte > 0x84      → fault
 *   OK1:
 *     A0 += u32BE(A1); A1 += 4
 *   after loop: byte at A0 must be non-zero
 */
function isSnxFormat(buf: Uint8Array): boolean {
  const fileSize = buf.length;
  if (fileSize < MIN_FILE_SIZE_SNX) return false;

  // Must be < 8 bytes to read 4 longs safely
  if (fileSize < 20) return false;

  let offA0 = 0;
  let offA1 = 0; // saved A1 = original A0
  let d3 = 20;

  // NextPos loop: 4 iterations (D1 = 3 down to 0 inclusive)
  const lengths: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (offA0 + 4 > fileSize) return false;
    const d2 = u32BE(buf, offA0);
    offA0 += 4;
    if (d2 === 0) return false;                         // beq fault
    if ((d2 & 0x80000000) !== 0) return false;          // bmi fault
    if ((d2 & 1) !== 0) return false;                   // btst #0 / bne fault
    d3 += d2;
    lengths.push(d2);
  }

  // cmp.l D4, D3 / bge fault — D3 must be < fileSize
  if (d3 >= fileSize) return false;

  // addq.l #4, A0
  offA0 += 4;

  // SecPass loop: 4 iterations (D1 = 3 down to 0)
  for (let i = 0; i < 4; i++) {
    if (offA0 >= fileSize) return false;

    // tst.b (A0) / bpl fault — bit7 must be set (i.e. byte >= 0x80)
    const b = buf[offA0];
    if ((b & 0x80) === 0) return false;

    // cmp.w #-1, (A0) / beq OK1 — word == 0xFFFF is unconditionally accepted
    if (offA0 + 2 <= fileSize) {
      const w = u16BE(buf, offA0);
      if (w !== 0xFFFF) {
        // cmp.b #$84, (A0) / bhi fault — byte must be <= 0x84
        if (b > 0x84) return false;
      }
    } else {
      // Can't read word: just check the byte
      if (b > 0x84) return false;
    }

    // add.l (A1)+, A0 — advance A0 by lengths[i] (A1 walks the saved original lengths)
    if (offA1 + 4 > fileSize) return false;
    offA0 += lengths[offA1 / 4];
    offA1 += 4;
  }

  // tst.b (A0) / beq fault — must be non-zero
  if (offA0 >= fileSize) return false;
  if (buf[offA0] === 0) return false;

  return true;
}

/**
 * TINY sub-format detection.
 *
 * Precondition: first word & 0x00F0 != 0 (low nibble of high byte is non-zero).
 *
 * Ported from TinyCheck (lines 443-472):
 *
 *   fileSize > 332
 *   u32BE at offset 48 must == 0x140
 *   A1 = data + 52 (= offset 48 + 4)
 *   D1 = 2 (3 iterations)
 *   NextPos2 loop (3 iters):
 *     D2 = u32BE(A1); A1 += 4
 *     D2 != 0, D2 >= 0, D2 even, D2 < fileSize
 *     A2 = data + D2
 *     if word at A2 == 0xFFFF → OK2
 *     else:
 *       u32BE(A2) == 0; u16BE(A2+4) == 0; byte at A2+6 has bit7 set; byte <= 0x82
 */
function isTinyFormat(buf: Uint8Array): boolean {
  const fileSize = buf.length;
  if (fileSize <= 332) return false; // cmp.l #332, D4 / ble fault

  // u32BE at offset 48 must == 0x140
  if (fileSize < 56) return false;
  if (u32BE(buf, 48) !== 0x140) return false;

  // A1 starts at offset 52 (after the 0x140 long)
  let offA1 = 52;

  // NextPos2: 3 iterations (D1 = 2 down to 0)
  for (let i = 0; i < 3; i++) {
    if (offA1 + 4 > fileSize) return false;
    const d2 = u32BE(buf, offA1);
    offA1 += 4;

    if (d2 === 0) return false;                         // beq fault
    if ((d2 & 0x80000000) !== 0) return false;          // bmi fault
    if ((d2 & 1) !== 0) return false;                   // btst #0 / bne fault
    if (d2 >= fileSize) return false;                   // cmp.l D2, D4 / ble fault

    // A2 = data + D2
    const offA2 = d2; // offset from start of buf

    if (offA2 + 2 > fileSize) return false;
    const w = u16BE(buf, offA2);
    if (w === 0xFFFF) {
      // OK2: accepted immediately
      continue;
    }

    // tst.l (A2)+ → u32BE(A2) must be 0; then A2 += 4
    if (offA2 + 7 > fileSize) return false;
    if (u32BE(buf, offA2) !== 0) return false;
    // tst.w (A2)+ → u16BE(A2+4) must be 0; then A2 += 2 → A2 at +6
    if (u16BE(buf, offA2 + 4) !== 0) return false;
    // tst.b (A2) / bpl fault — bit7 must be set
    const b = buf[offA2 + 6];
    if ((b & 0x80) === 0) return false;
    // cmp.b #$82, (A2) / bhi fault — byte must be <= 0x82
    if (b > 0x82) return false;
  }

  return true;
}

/**
 * SMUS sub-format detection.
 *
 * Precondition: first 4 bytes == 'FORM' (0x464F524D).
 *
 * Ported from SmusCheck (lines 475-514):
 *
 *   bytes 8-11 must be 'SMUS'
 *   byte 23 must be non-zero
 *   A1 = data + 24
 *   'NAME' chunk at A1; advance past it (round up chunk size to even)
 *   'SNX1' chunk at A1; advance past it
 *   Loop checking 'INS1' chunks until 'TRAK' appears:
 *     byte at A1+0: sample number, must be <= 63
 *     byte at A1+1: MIDI flag, must be 0
 *     advance by INS1 chunk size
 */
function isSmusFormat(buf: Uint8Array): boolean {
  const fileSize = buf.length;
  if (fileSize < MIN_FILE_SIZE_SMUS) return false;

  // bytes 8-11 must be 'SMUS' (0x534D5553)
  if (u32BE(buf, 8) !== 0x534D5553) return false; // 'SMUS'

  // byte at offset 23 must be non-zero
  if (buf[23] === 0) return false;

  // A1 starts at offset 24
  let off = 24;

  // Expect 'NAME' chunk (0x4E414D45)
  if (off + 8 > fileSize) return false;
  if (u32BE(buf, off) !== 0x4E414D45) return false; // 'NAME'
  off += 4;
  let chunkSize = u32BE(buf, off);
  off += 4;
  if ((chunkSize & 0x80000000) !== 0) return false; // bmi fault
  // addq.l #1, D1; bclr #0, D1 — round up to even
  chunkSize = (chunkSize + 1) & ~1;
  off += chunkSize;

  // Expect 'SNX1' chunk (0x534E5831)
  if (off + 8 > fileSize) return false;
  if (u32BE(buf, off) !== 0x534E5831) return false; // 'SNX1'
  off += 4;
  chunkSize = u32BE(buf, off);
  off += 4;
  if ((chunkSize & 0x80000000) !== 0) return false; // bmi fault
  chunkSize = (chunkSize + 1) & ~1;
  off += chunkSize;

  // Loop: expect 'INS1' chunks until 'TRAK' is found
  while (true) {
    if (off + 4 > fileSize) return false;
    const tag = u32BE(buf, off);

    // cmp.l #'TRAK', (A1) — if TRAK, we're done (valid)
    if (tag === 0x5452414B) { // 'TRAK'
      break;
    }

    // cmp.l #'INS1', (A1)+ / bne fault
    if (tag !== 0x494E5331) return false; // 'INS1'
    off += 4;

    if (off + 4 > fileSize) return false;
    chunkSize = u32BE(buf, off);
    off += 4;
    if ((chunkSize & 0x80000000) !== 0) return false; // bmi fault

    // cmp.b #63, (A1) — sample number at current A1 (= off) must be <= 63
    if (off >= fileSize) return false;
    if (buf[off] > 63) return false;

    // tst.b 1(A1) — MIDI flag at off+1 must be 0
    if (off + 1 >= fileSize) return false;
    if (buf[off + 1] !== 0) return false;

    // Advance by INS1 chunk size (rounded up to even)
    chunkSize = (chunkSize + 1) & ~1;
    off += chunkSize;
  }

  return true;
}

// ── Sub-format enum ────────────────────────────────────────────────────────

export type SonixSubFormat = 'smus' | 'tiny' | 'snx';

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Detects a Sonix Music Driver module and returns the sub-format, or null if not detected.
 *
 * Routing mirrors Check2 in Sonix Music Driver_v1.asm:
 *   if first 4 bytes == 'FORM' → SmusCheck  (prefix: smus.)
 *   else if first word & 0x00F0 != 0 → TinyCheck (prefix: tiny.)
 *   else → SNX check  (prefix: snx.)
 */
export function detectSonixFormat(buffer: ArrayBuffer | Uint8Array): SonixSubFormat | null {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return null;

  const firstLong = u32BE(buf, 0);

  if (firstLong === 0x464F524D) { // 'FORM'
    return isSmusFormat(buf) ? 'smus' : null;
  }

  const firstWord = u16BE(buf, 0);
  if ((firstWord & 0x00F0) !== 0) {
    return isTinyFormat(buf) ? 'tiny' : null;
  }

  return isSnxFormat(buf) ? 'snx' : null;
}

/**
 * Returns true if the buffer is any Sonix Music Driver variant.
 */
export function isSonixFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  return detectSonixFormat(buffer) !== null;
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseSonixFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const subFormat = detectSonixFormat(buf);
  if (subFormat === null) throw new Error('Not a Sonix Music Driver module');

  const baseName = filename.split('/').pop() ?? filename;

  // Strip the appropriate prefix from the module name
  let moduleName: string;
  switch (subFormat) {
    case 'smus':
      moduleName = baseName.replace(/^smus\./i, '') || baseName;
      break;
    case 'tiny':
      moduleName = baseName.replace(/^tiny\./i, '') || baseName;
      break;
    default:
      moduleName = baseName.replace(/^snx\./i, '') || baseName;
      break;
  }

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
    name: `${moduleName} [Sonix Music Driver]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
