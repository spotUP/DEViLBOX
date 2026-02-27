/**
 * JochenHippel7VParser.ts — Jochen Hippel 7V (TFMX-7V) format detection and stub parser
 *
 * Detection (from "Jochen Hippel 7V_v2.asm", DTP_Check2):
 *
 * Two code paths:
 *
 * Path A — wrapped in a loader stub (starts with $6000):
 *   cmp.w #$6000,(A0)   — no post-increment, just check byte 0
 *   addq.l #2,A0        — A0 = 2
 *   move.w (A0),D1      — read dist from offset 2, no post-increment
 *   D1 must be > 0, even, non-negative
 *   lea (A0,D1.W),A0    — scanOff = 2 + D1
 *   Scan up to 11 words (dbf D1=10) at scanOff for $308141FA
 *   On match (OK_1):
 *     addq.l #4,A0      — skip the found long
 *     move.w (A0),D1    — read next dist (no post-increment), validate
 *     lea (A0,D1.W),A0  — songOff = (matchOff+4) + D1  (no +2)
 *   Falls into TFMX-7V song check
 *
 * Path B — raw TFMX-7V song (Song label):
 *   'TFMX' at A0+0..3
 *   byte at A0+4 == 0 (null byte after 'TFMX')
 *   Then calculates expected size from header fields and validates:
 *     D1 = (word[4]+2 + word[5]+2) << 6          (pattern data size)
 *     D2 = (word[6]+1) * word[8]                   (track/seq data)
 *     D3 = (word[7]+1) * 28                        (macro data)
 *     D2 = (word[9]+1) << 3                        (sample table)
 *     advance A0 by D1+D2+D3+D2+32
 *     long at A0 must be 0
 *     word at A0+4 (== D2) must be > 0
 *     D2 * 2 must == long at A0+26+4 = A0+30
 *
 * Prefix: 'S7G.' (the player also accepts 'hip7.' prefix from UADE eagleplayer.conf)
 * Minimum file size: at least 32 bytes for the TFMX header fields.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 32;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/** 'TFMX' as a 32-bit big-endian value */
const MAGIC_TFMX = (0x54 << 24 | 0x46 << 16 | 0x4D << 8 | 0x58) >>> 0;
/** $308141FA — the Find_1 search pattern */
const MAGIC_FIND1 = (0x30 << 24 | 0x81 << 16 | 0x41 << 8 | 0xFA) >>> 0;

/**
 * Validate the TFMX-7V song header starting at songOff.
 * Mirrors the Song: label in Check2 of Jochen Hippel 7V_v2.asm.
 */
function checkTFMX7VSong(buf: Uint8Array, songOff: number): boolean {
  if (songOff + 20 > buf.length) return false;

  // 'TFMX' magic
  if (u32BE(buf, songOff) !== MAGIC_TFMX) return false;
  // byte after 'TFMX' must be 0
  if (buf[songOff + 4] !== 0) return false;

  let a0 = songOff + 4; // points at the null byte, then words follow

  // Read 7V header fields (offsets relative to a0 which starts at songOff+4)
  // word at a0+0 is already the null, so word accesses are:
  //   (A0)+ reads word at a0, advances a0 by 2
  // Following the ASM:
  //   moveq #2,D1
  //   add.w (A0)+,D1    → D1 = 2 + word[a0]; a0+=2
  //   add.w (A0)+,D1    → D1 += word[a0]; a0+=2  → D1 = 2 + w0 + w1
  //   lsl.l #6,D1       → D1 <<= 6

  if (a0 + 2 > buf.length) return false;
  const w0 = u16BE(buf, a0); a0 += 2;
  if (a0 + 2 > buf.length) return false;
  const w1 = u16BE(buf, a0); a0 += 2;
  let d1 = ((2 + w0 + w1) << 6) >>> 0;

  //   moveq #1,D2
  //   add.w (A0)+,D2    → D2 = 1 + w2; a0+=2
  if (a0 + 2 > buf.length) return false;
  const w2 = u16BE(buf, a0); a0 += 2;
  let d2 = (1 + w2) >>> 0;

  //   moveq #1,D3
  //   add.w (A0)+,D3    → D3 = 1 + w3; a0+=2
  //   mulu.w #28,D3
  if (a0 + 2 > buf.length) return false;
  const w3 = u16BE(buf, a0); a0 += 2;
  const d3 = Math.imul(1 + w3, 28) >>> 0;

  //   mulu.w (A0)+,D2   → D2 = (1+w2) * w4; a0+=2
  if (a0 + 2 > buf.length) return false;
  const w4 = u16BE(buf, a0); a0 += 2;
  d2 = Math.imul(d2, w4) >>> 0;

  //   add.l D2,D1
  //   add.l D3,D1
  d1 = (d1 + d2 + d3) >>> 0;

  //   addq.l #2,A0      → skip 1 word
  a0 += 2;

  //   moveq #1,D2
  //   add.w (A0)+,D2    → D2 = 1 + w5; a0+=2
  //   lsl.l #3,D2       → D2 <<= 3
  if (a0 + 2 > buf.length) return false;
  const w5 = u16BE(buf, a0); a0 += 2;
  d2 = ((1 + w5) << 3) >>> 0;

  //   moveq #32,D2 is a NEW d2 — no wait, add.l D2,D1 uses the same D2 then reuses D2=#32
  // Re-read: add.l D2,D1 uses (1+w5)<<3, then moveq #32,D2; add.l D2,D1
  d1 = (d1 + d2 + 32) >>> 0;

  // advance A0 by D1 from songOff+4: we need absolute position
  // a0 is the current pointer position in buf; add d1 to it
  const checkOff = a0 + d1;
  if (checkOff + 32 > buf.length) return false;

  // tst.l (A0)+  → must be 0
  if (u32BE(buf, checkOff) !== 0) return false;

  // move.w (A0),D2 → D2 = word at checkOff+4 (after the long)
  const d2final = u16BE(buf, checkOff + 4);
  if (d2final === 0) return false;

  // add.l D2,D2 → D2 *= 2
  const d2times2 = (d2final * 2) >>> 0;

  // cmp.l 26(A0),D2 → compare D2 with long at checkOff+4+26 = checkOff+30
  if (checkOff + 34 > buf.length) return false;
  const cmpVal = u32BE(buf, checkOff + 30);
  return d2times2 === cmpVal;
}

/**
 * Detect Jochen Hippel 7V format.
 *
 * Mirrors Check2 in "Jochen Hippel 7V_v2.asm":
 *   - Path A: loader stub starting with $6000, scanning for $308141FA
 *   - Path B: direct TFMX-7V song ('TFMX' magic + structural validation)
 */
export function isJochenHippel7VFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Path A: loader stub
  // ASM: cmp.w #$6000,(A0) — NO post-increment, just compare
  if (u16BE(buf, 0) === 0x6000) {
    // addq.l #2,A0  → A0 = 2
    // move.w (A0),D1  → read dist at offset 2, NO post-increment
    if (2 + 2 > buf.length) return false;
    const d1 = u16BE(buf, 2);
    if (d1 === 0) return false;
    if (d1 & 0x8000) return false; // negative
    if (d1 & 1) return false;      // odd

    // lea (A0,D1.W),A0 → scanOff = 2 + D1  (A0 was at 2, no additional advance)
    let scanOff = 2 + d1;
    let found = -1;
    for (let i = 0; i <= 10; i++) {
      if (scanOff + 4 > buf.length) break;
      if (u32BE(buf, scanOff) === MAGIC_FIND1) {
        found = scanOff;
        break;
      }
      scanOff += 2;
    }
    if (found < 0) return false;

    // OK_1: addq.l #4,A0 → afterFind = found + 4
    // move.w (A0),D1 → read dist at afterFind, NO post-increment
    const afterFind = found + 4;
    if (afterFind + 2 > buf.length) return false;
    const d1b = u16BE(buf, afterFind);
    if (d1b === 0) return false;
    if (d1b & 0x8000) return false;
    if (d1b & 1) return false;
    // lea (A0,D1.W),A0 → songOff = afterFind + D1b  (no +2)
    const songOff = afterFind + d1b;
    return checkTFMX7VSong(buf, songOff);
  }

  // Path B: direct song
  return checkTFMX7VSong(buf, 0);
}

export function parseJochenHippel7VFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJochenHippel7VFormat(buf)) throw new Error('Not a Jochen Hippel 7V module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^(hip7|s7g)\./i, '') || baseName;

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
    name: `${moduleName} [Jochen Hippel 7V]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
