/**
 * JesperOlsenParser.ts — Jesper Olsen music format parser
 *
 * Jesper Olsen is an Amiga music format used in games from the early 1990s.
 * The format has three variants (Format 0, 1, and -1/latest) detected by
 * the Wanted Team EaglePlayer DTP_Check2 routine.
 *
 * Detection (from Jesper Olsen_v1.asm, DTP_Check2):
 *
 * Format -1 (new/latest, Format byte = 0xFF set via `st`):
 *   Word at offset 0 is NOT 0x6000, so falls to the new-format branch:
 *   - word[0] (D1) must be in range [4, 0x200] (inclusive), even
 *   - word[0] / 2 - 1 iterations of: read word[2+i*2], must be > 0, even,
 *     and data[word[2+i*2] - 2] == 0x7FFF
 *
 * Format 1 (old/second):
 *   Word at offset 0 IS 0x6000 (BRA instruction):
 *   - Three consecutive pairs at A0+0, A0+2, A0+4 must be 0x6000 + positive-even offset
 *   Then navigate to song body via: A0+6, add word, check sequence:
 *   0x4A406B00 / 0x000641FA → navigate → check word[4] == 0x017FFF
 *
 * Format 0 (oldest/third, Format byte = 0 = cleared via `clr.b`):
 *   After the BRA chain fails the 0x4A40... test, checks two sub-variants:
 *   a) word at A0 is 0xC0FC → look forward for the sync marker 0x6AE064E0
 *   b) scan up to 16 words for 0x02800000 → then check 0x00FFC0FC, then scan
 *      for 0x6AE064E0 within 800..900 bytes
 *
 * This parser returns a stub TrackerSong for use with the UADE replayer.
 * Real playback is handled by UADE/EaglePlayer with the WantedTeam.bin external player.
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

/**
 * Detect a Jesper Olsen module.
 *
 * Mirrors DTP_Check2 from Jesper Olsen_v1.asm exactly:
 *
 * Branch A — new format (word[0] != 0x6000):
 *   D1 = word[0]; must be 4 <= D1 <= 0x200 and even.
 *   Loop (D1/2 - 1) + 1 times: read word at buf[2 + i*2].
 *     Each must be > 0, even, and buf[word - 2] == 0x7FFF.
 *
 * Branch B — old format (word[0] == 0x6000):
 *   Three consecutive 0x6000+positive-even-offset pairs required.
 *   Then check for 0x4A406B00/0x000641FA marker or 0xC0FC/0x02800000/0x6AE064E0 markers.
 */
export function isJesperOlsenFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  const w0 = u16BE(buf, 0);

  // ── Branch A: new format ───────────────────────────────────────────────
  if (w0 !== 0x6000) {
    // D1 = word[0]; 4 <= D1 <= 0x200 and even
    const d1 = w0;
    if (d1 < 4 || d1 > 0x200) return false;
    if (d1 & 1) return false;

    const count = (d1 >>> 1) - 1; // loop count (dbf: count+1 iterations)
    for (let i = 0; i <= count; i++) {
      const off = 2 + i * 2;
      if (off + 2 > buf.length) return false;
      const d2 = u16BE(buf, off);
      if (d2 === 0 || d2 & 0x8000) return false; // beq / bmi → fault
      if (d2 & 1) return false;                   // btst #0 → fault
      // check buf[d2 - 2] == 0x7FFF
      const chkOff = d2 - 2;
      if (chkOff < 0 || chkOff + 2 > buf.length) return false;
      if (u16BE(buf, chkOff) !== 0x7FFF) return false;
    }
    return true; // st (A3) — format = 0xFF = new format
  }

  // ── Branch B: old format (word[0] == 0x6000) ──────────────────────────
  // Three consecutive 0x6000 + positive-even offset pairs
  let a1 = 0; // A1 = A0
  for (let iter = 0; iter <= 2; iter++) {
    if (a1 + 4 > buf.length) return false;
    if (u16BE(buf, a1) !== 0x6000) return false;
    const d2 = u16BE(buf, a1 + 2);
    if (d2 === 0 || d2 & 0x8000) return false; // beq / bmi → fault
    if (d2 & 1) return false;
    a1 += 4;
  }

  // Navigate: A0+6, add word, then check for 0x4A406B00 marker
  let a0b = 6;
  if (a0b + 2 > buf.length) return false;
  const jumpOff = u16BE(buf, a0b);
  a0b += jumpOff; // add.w (A0),A0
  if (a0b + 8 > buf.length) return false;

  const marker1 = u32BE(buf, a0b);
  if (marker1 === 0x4A406B00) {
    const marker2 = u32BE(buf, a0b + 4);
    if (marker2 !== 0x000641FA) return false;
    // add.w (A0),A0 → skip 2 bytes
    a0b += 8;
    if (a0b + 2 > buf.length) return false;
    const disp = u16BE(buf, a0b);
    a0b += disp; // add.w (A0),A0
    // check word[4] == 0x017FFF i.e. words: 0x0001 0x7FFF
    if (a0b + 6 > buf.length) return false;
    const chk = u32BE(buf, a0b + 4);
    return chk === 0x00017FFF;
  }

  // CheckOlder path:
  // subq.l #4,A0 → we're back at a0b (we didn't advance from the jump yet,
  // but the asm does subq.l #4 to undo marker1 read peek).
  // In practice a0b here is the position after the jump.
  let pos = a0b;

  // Check for 0xC0FC at pos
  if (pos + 2 <= buf.length && u16BE(buf, pos) === 0xC0FC) {
    pos += 2;
    // scan for 0x6AE064E0 within buf[pos+800..pos+900]
    const scanStart = pos + 800;
    const scanEnd = pos + 900;
    for (let s = scanStart; s < scanEnd && s + 4 <= buf.length; s += 2) {
      if (u32BE(buf, s) === 0x6AE064E0) return true;
    }
    return false;
  }

  // Scan up to 16 words for 0x02800000
  let found0280 = -1;
  for (let i = 0; i <= 15 && pos + 4 <= buf.length; i++, pos += 2) {
    if (u32BE(buf, pos) === 0x02800000) {
      found0280 = pos;
      break;
    }
  }
  if (found0280 < 0) return false;

  // Late path: addq.l #4,A0; check 0x00FFC0FC
  pos = found0280 + 4;
  if (pos + 4 > buf.length) return false;
  if (u32BE(buf, pos) !== 0x00FFC0FC) return false;
  pos += 4;

  // Older path: scan buf[pos+800..pos+900] for 0x6AE064E0
  const scanStart = pos + 800;
  const scanEnd = pos + 900;
  for (let s = scanStart; s < scanEnd && s + 4 <= buf.length; s += 2) {
    if (u32BE(buf, s) === 0x6AE064E0) return true;
  }
  return false;
}

export function parseJesperOlsenFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJesperOlsenFormat(buf)) throw new Error('Not a Jesper Olsen module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^jo\./i, '') || baseName;

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
    name: `${moduleName} [Jesper Olsen]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
