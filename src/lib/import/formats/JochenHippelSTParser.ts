/**
 * JochenHippelSTParser.ts — Jochen Hippel ST (TFMX-ST) format detection and stub parser
 *
 * Detection (from "Jochen Hippel_v1.asm", DTP_Check2):
 *
 * The player detects two sub-formats, both containing a TFMX-ST song:
 *
 * MCMD format (D5 = -1, $FF):
 *   long[0] == $48E7FFFE  (movem.l push)
 *   byte[4] == $61 (bsr.b)
 *   byte[5] == D1 (> 0, even)  → advance A0 by D1
 *   long == $2F006100
 *   advance by word offset
 *   word == $41FA  → advance 18 bytes
 *   word == $41FA  → advance by word offset
 *   A2 = A0 (song pointer)
 *   long == 'MCMD' → goto Found
 *
 * Non-MCMD format (D5 = 0):
 *   byte[0] == $60
 *   If byte[1] == 0: 32-bit branch (long form)
 *     word[1..2] = D1 (positive, even)
 *     word[3..4] == $6000
 *     advance by D1
 *     long == $48E7FFFE → goto Later
 *   Else: 8-bit branch (short form)
 *     D1 = byte[1] (> 0, even)
 *     advance by D1
 *   Later:
 *     word == $41FA or word == $41FA (tries both, two addq.l #2,A0 steps)
 *     advance by word offset
 *     A2 = A0 (song pointer)
 *     long == 'TFMX'
 *     byte at A0+4 == 0
 *     word at A0+12 (SFX file test) != 0
 *   Then validate TFMX-ST structure (same size calculation as 7V but mulu #12 for macros, mulu #6 for sample table).
 *
 * Prefixes: 'SOG.' (initialized), 'MCMD.' (MCMD variant)
 * Minimum file size: 20 bytes
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 20;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

const MAGIC_TFMX = (0x54 << 24 | 0x46 << 16 | 0x4D << 8 | 0x58) >>> 0; // 'TFMX'
const MAGIC_MCMD = (0x4D << 24 | 0x43 << 16 | 0x4D << 8 | 0x44) >>> 0; // 'MCMD'

/**
 * Validate the TFMX-ST song header (non-MCMD format) starting at songOff.
 * Mirrors the Found branch validation in Jochen Hippel_v1.asm Check2.
 *
 * Structure (from the assembly after the "Later2" → "Found" path):
 *   'TFMX' magic
 *   null byte at +4
 *   non-zero word at +12 (SFX file test)
 *   D1 = (w0+2 + w1) << 6
 *   D2 = (w2+1) * w4
 *   D3 = (w3+1) * 12           ← mulu #12 (differs from 7V which uses 28)
 *   D2b = (w5+1) * 6           ← mulu #6  (differs from 7V which uses <<3)
 *   D1 += D2 + D3 + D2b + 32
 *   advance A0 by D1; long must be 0
 *   word D2final > 0; D2final*2 == long at +30
 */
function checkTFMXSTSong(buf: Uint8Array, songOff: number): boolean {
  if (songOff + 20 > buf.length) return false;

  if (u32BE(buf, songOff) !== MAGIC_TFMX) return false;
  if (buf[songOff + 4] !== 0) return false;
  if (u16BE(buf, songOff + 12) === 0) return false; // SFX file test

  let a0 = songOff + 4;

  if (a0 + 2 > buf.length) return false;
  const w0 = u16BE(buf, a0); a0 += 2;
  if (a0 + 2 > buf.length) return false;
  const w1 = u16BE(buf, a0); a0 += 2;
  let d1 = ((2 + w0 + w1) << 6) >>> 0;

  if (a0 + 2 > buf.length) return false;
  const w2 = u16BE(buf, a0); a0 += 2;
  let d2 = (1 + w2) >>> 0;

  if (a0 + 2 > buf.length) return false;
  const w3 = u16BE(buf, a0); a0 += 2;
  const d3 = Math.imul(1 + w3, 12) >>> 0; // mulu #12 for ST (not 28 like 7V)

  if (a0 + 2 > buf.length) return false;
  const w4 = u16BE(buf, a0); a0 += 2;
  d2 = Math.imul(d2, w4) >>> 0;

  d1 = (d1 + d2 + d3) >>> 0;

  // addq.l #2,A0 → skip one word
  a0 += 2;

  if (a0 + 2 > buf.length) return false;
  const w5 = u16BE(buf, a0); a0 += 2;
  const d2b = Math.imul(1 + w5, 6) >>> 0; // mulu #6 for ST (not <<3 like 7V)

  d1 = (d1 + d2b + 32) >>> 0;

  const checkOff = a0 + d1;
  if (checkOff + 34 > buf.length) return false;

  if (u32BE(buf, checkOff) !== 0) return false;

  const d2final = u16BE(buf, checkOff + 4);
  if (d2final === 0) return false;

  const d2times2 = (d2final * 2) >>> 0;
  const cmpVal = u32BE(buf, checkOff + 30);
  return d2times2 === cmpVal;
}

/**
 * Detect Jochen Hippel ST format.
 *
 * Three detection paths:
 *   1. Raw TFMX-ST song data: starts with 'TFMX' magic directly (common rip format, *.sog).
 *   2. MCMD wrapper: starts with $48E7FFFE (movem push) + player code → 'MCMD' song.
 *   3. SOG wrapper: starts with $60xx (BRA) + player code → 'TFMX' song validation.
 *
 * Mirrors Check2 in "Jochen Hippel_v1.asm".
 */
export function isJochenHippelSTFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  const first4 = u32BE(buf, 0);

  // Fast-accept: raw TFMX-ST song data starting with 'TFMX' magic
  if (first4 === MAGIC_TFMX) return true;

  // MCMD format: starts with $48E7FFFE
  if (first4 === 0x48E7FFFE) {
    let off = 4;
    if (off >= buf.length) return false;
    if (buf[off] !== 0x61) return false;
    off += 1;
    const d1 = buf[off]; off += 1;
    if (d1 === 0) return false;
    if (d1 & 1) return false;
    off += d1;
    if (off + 4 > buf.length) return false;
    if (u32BE(buf, off) !== 0x2F006100) return false;
    off += 4;
    if (off + 2 > buf.length) return false;
    const jmp1 = u16BE(buf, off); off += 2;
    off += jmp1;
    if (off + 2 > buf.length) return false;
    if (u16BE(buf, off) !== 0x41FA) return false;
    off += 18; // lea  skip: addq.l #4 + 2-byte check = 18 bytes per asm
    if (off + 2 > buf.length) return false;
    if (u16BE(buf, off) !== 0x41FA) return false;
    off += 2;
    if (off + 2 > buf.length) return false;
    const jmp2 = u16BE(buf, off); off += 2;
    off += jmp2;
    if (off + 4 > buf.length) return false;
    return u32BE(buf, off) === MAGIC_MCMD;
  }

  // SOG / non-MCMD format: starts with $60xx
  if (buf[0] !== 0x60) return false;

  let off = 1;
  const shortBranch = buf[off]; off += 1;

  if (shortBranch === 0) {
    // Long form (word offset)
    if (off + 4 > buf.length) return false;
    const d1 = u16BE(buf, off); off += 2;
    if (d1 & 0x8000) return false; // negative
    if (d1 & 1) return false;
    if (u16BE(buf, off) !== 0x6000) return false;
    off += 2; // skip the $6000 word
    // advance by d1 (relative to start of d1 reading = position 2)
    off = 2 + d1;
    if (off + 4 > buf.length) return false;
    if (u32BE(buf, off) !== 0x48E7FFFE) return false;
    off += 4;
  } else {
    // Short form (byte offset) — BRA.S / No3 path
    // Assembly lines 367–381:
    //   btst #0,D1 → must be even
    //   add.w D1,A0 → advance by byte displacement
    //   cmp.l #$48E7FFFE,(A0)+
    //   cmp.w #$6100,(A0)+  → BSR.W opcode
    //   add.w (A0),A0
    //   cmp.l #$2F006100,(A0)+
    //   add.w (A0),A0
    //   cmp.w #$41FA,(A0)
    //   lea 20(A0),A0  → then fall through to Later
    if (shortBranch & 1) return false;
    off = 2 + shortBranch;
    // cmp.l #$48E7FFFE,(A0)+
    if (off + 4 > buf.length || u32BE(buf, off) !== 0x48E7FFFE) return false;
    off += 4;
    // cmp.w #$6100,(A0)+
    if (off + 2 > buf.length || u16BE(buf, off) !== 0x6100) return false;
    off += 2;
    // add.w (A0),A0
    if (off + 2 > buf.length) return false;
    const jmpA = u16BE(buf, off);
    off = off + jmpA;
    // cmp.l #$2F006100,(A0)+
    if (off + 4 > buf.length || u32BE(buf, off) !== 0x2F006100) return false;
    off += 4;
    // add.w (A0),A0
    if (off + 2 > buf.length) return false;
    const jmpB = u16BE(buf, off);
    off = off + jmpB;
    // cmp.w #$41FA,(A0)
    if (off + 2 > buf.length || u16BE(buf, off) !== 0x41FA) return false;
    // lea 20(A0),A0
    off += 20;
  }

  // Later: look for $41FA (try two positions)
  if (off + 2 > buf.length) return false;
  if (u16BE(buf, off) === 0x41FA) {
    off += 2;
  } else {
    off += 2; // advance one word
    if (off + 2 > buf.length) return false;
    if (u16BE(buf, off) !== 0x41FA) return false;
    off += 2;
  }

  // advance by word offset to reach song data
  if (off + 2 > buf.length) return false;
  const jmp = u16BE(buf, off); off += 2;
  const songOff = off + jmp;

  return checkTFMXSTSong(buf, songOff);
}

export function parseJochenHippelSTFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJochenHippelSTFormat(buf)) throw new Error('Not a Jochen Hippel ST module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^hst\./i, '') || baseName;

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
    name: `${moduleName} [Jochen Hippel ST]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
