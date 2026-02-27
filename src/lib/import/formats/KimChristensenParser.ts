/**
 * KimChristensenParser.ts — Kim Christensen music format parser
 *
 * Kim Christensen is an Amiga music format from 1989, used in various Amiga games.
 * Detection is based on the Wanted Team EaglePlayer DTP_Check2 routine.
 *
 * Detection (from Kim Christensen_v1.asm, DTP_Check2):
 *
 *   1. File must be at least 1800 bytes.
 *   2. Scan first 100 words for opcode 0x207C (MOVEA.L #imm,A0).
 *   3. From that position, scan up to 800 more words for opcode 0x0680 (ADDI.L).
 *   4. From that position scan for 0xE341 (ASL.W #1,D1).
 *   5. From that position scan for 0x227C (MOVEA.L #imm,A1).
 *   6. From that position scan for 0x0680 again.
 *   7. From that position scan for 0x0087 (last two bytes of ADDI.L $xx,D7 or similar).
 *   All scans after step 2 share a 800-word decrement counter (D2 = 800-1).
 *
 * This parser returns a stub TrackerSong for use with the UADE replayer.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 1800;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}


/**
 * Detect a Kim Christensen module.
 *
 * Mirrors DTP_Check2 from Kim Christensen_v1.asm exactly.
 *
 * The assembly uses a single D2 counter initialised to 800-1 = 799 that is shared
 * across all the sequential scans after the first. Each dbf decrements it; if it
 * hits -1 at any point before the match, the detection fails.
 *
 * Step-by-step:
 *   pos = 0
 *   1. Scan [pos, pos+100) words for 0x207C. On match, advance pos past it.
 *   2. Shared counter D2 = 799. Scan for 0x0680; each non-match decrements D2.
 *   3. On 0x0680 found, scan (reusing D2) for 0xE341.
 *   4. On 0xE341 found, scan (reusing D2) for 0x227C.
 *   5. On 0x227C found, scan (reusing D2) for 0x0680.
 *   6. On 0x0680 found, scan (reusing D2) for 0x0087.
 *   7. On 0x0087 found → return true (D0 = 0).
 */
export function isKimChristensenFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Step 1: scan first 100 words (0..99) for 0x207C
  let pos = 0;
  let found207C = false;
  for (let i = 0; i < 100; i++) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 0x207C) {
      found207C = true;
      pos += 2;
      break;
    }
    pos += 2;
  }
  if (!found207C) return false;

  // Shared counter D2 = 800 - 1 = 799 (dbf counts from D2 down to -1)
  let d2 = 799;

  // Step 2: scan for 0x0680
  let found = false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 0x0680) { pos += 2; found = true; break; }
    pos += 2;
    d2--;
  }
  if (!found) return false;

  // Step 3: scan for 0xE341
  found = false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 0xE341) { pos += 2; found = true; break; }
    pos += 2;
    d2--;
  }
  if (!found) return false;

  // Step 4: scan for 0x227C
  found = false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 0x227C) { pos += 2; found = true; break; }
    pos += 2;
    d2--;
  }
  if (!found) return false;

  // Step 5: scan for 0x0680
  found = false;
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 0x0680) { pos += 2; found = true; break; }
    pos += 2;
    d2--;
  }
  if (!found) return false;

  // Step 6: scan for 0x0087
  while (d2 >= 0) {
    if (pos + 2 > buf.length) return false;
    if (u16BE(buf, pos) === 0x0087) return true; // moveq #0,D0; rts → found
    pos += 2;
    d2--;
  }
  return false;
}

export function parseKimChristensenFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isKimChristensenFormat(buf)) throw new Error('Not a Kim Christensen module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^kim\./i, '') || baseName;

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
    name: `${moduleName} [Kim Christensen]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
