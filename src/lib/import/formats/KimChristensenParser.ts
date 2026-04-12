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
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_FILE_SIZE = 1800;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Scan for opcode patterns in the Kim Christensen binary to locate sample data pointers.
 *
 * Opcode chain:
 *   0x207C → D0 (movea.l #imm,a0)
 *   0x0680 → D1 (addi.l)
 *   0xE341 → D7 (at -6 from the E341 match position)
 *   0x227C → D2 (movea.l #imm,a1)
 *   0x0680 → D3 (addi.l)
 *   0x0087 → origin computed from D7
 *
 * Returns { origin, sampleTableFileOff, sampleCount } or null if not found.
 */
function scanKimDataPointers(buf: Uint8Array): {
  origin: number; sampleTableFileOff: number; sampleCount: number;
} | null {
  const len = buf.length;

  // Step 1: find 0x207C in first 100 words → D0
  let pos = 0;
  let d0Pos = -1;
  for (let i = 0; i < 100 && pos + 5 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 0x207C) {
      d0Pos = pos;
      // D0 = u32BE at pos+2
      pos += 6; // skip opcode(2) + immediate(4)
      break;
    }
  }
  if (d0Pos < 0) return null;

  // Step 2: find 0x0680 → D1 (addi.l #imm, ...)
  let d1Pos = -1;
  for (let i = 0; i < 800 && pos + 5 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 0x0680) {
      d1Pos = pos;
      pos += 2;
      break;
    }
  }
  if (d1Pos < 0) return null;

  // Step 3: find 0xE341 → D7 is at pos-6 (the long before the E341)
  let e341Pos = -1;
  for (let i = 0; i < 800 && pos + 1 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 0xE341) {
      e341Pos = pos;
      pos += 2;
      break;
    }
  }
  if (e341Pos < 0 || e341Pos < 6) return null;
  const d7 = u32BE(buf, e341Pos - 4); // D7 from 4 bytes before E341

  // Step 4: find 0x227C → D2
  let d2Pos = -1;
  for (let i = 0; i < 800 && pos + 5 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 0x227C) {
      d2Pos = pos;
      pos += 2;
      break;
    }
  }
  if (d2Pos < 0) return null;
  pos = d2Pos + 6; // skip opcode(2) + immediate(4)

  // Step 5: find 0x0680 → D3
  let d3Pos = -1;
  for (let i = 0; i < 800 && pos + 5 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 0x0680) {
      d3Pos = pos;
      pos += 2;
      break;
    }
  }
  if (d3Pos < 0) return null;
  const d3Val = u32BE(buf, d3Pos + 2); // immediate after 0680
  pos = d3Pos + 6;

  // Step 6: find 0x0087 → origin
  let pos0087 = -1;
  for (let i = 0; i < 800 && pos + 1 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 0x0087) {
      pos0087 = pos;
      break;
    }
  }
  if (pos0087 < 0) return null;

  // origin = D7 - (0x0087_pos - 4)
  const origin = (d7 - (pos0087 - 4)) >>> 0;

  // Sample table at file offset (D3 - origin)
  const sampleTableFileOff = (d3Val - origin) >>> 0;
  if (sampleTableFileOff + 4 > buf.length) return null;

  // First DWORD at sample table = end pointer
  const firstDword = u32BE(buf, sampleTableFileOff);
  // Count = (firstDword - D3_absolute) / 6
  const d3Absolute = d3Val;
  const tableBytes = (firstDword - d3Absolute) >>> 0;
  if (tableBytes === 0 || tableBytes % 6 !== 0) return null;
  const sampleCount = tableBytes / 6;

  return { origin, sampleTableFileOff, sampleCount };
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
  const _base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (!_base.startsWith('kim.') && !_base.endsWith('.adsc') && !_base.endsWith('.as') && !isKimChristensenFormat(buf)) throw new Error('Not a Kim Christensen module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^kim\./i, '') || baseName;

  // ── Extract samples via opcode scanning ───────────────────────────────
  const instruments: InstrumentConfig[] = [];
  const ptrs = scanKimDataPointers(buf);

  if (ptrs) {
    const { origin, sampleTableFileOff, sampleCount } = ptrs;
    for (let i = 0; i < sampleCount; i++) {
      const descOff = sampleTableFileOff + i * 6;
      if (descOff + 6 > buf.length) break;
      const addr = u32BE(buf, descOff);
      const length = u16BE(buf, descOff + 4) * 2; // word count → byte count
      const fileOff = (addr - origin) >>> 0;

      if (fileOff + length <= buf.length && length > 0) {
        const pcm = buf.slice(fileOff, fileOff + length);
        instruments.push(createSamplerInstrument(
          i + 1, `KIM Sample ${i + 1}`, pcm, 64, 8287, 0, 0,
        ));
      } else {
        instruments.push({
          id: i + 1, name: `KIM Sample ${i + 1}`, type: 'synth' as const,
          synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
        } as InstrumentConfig);
      }
    }
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
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
      originalInstrumentCount: instruments.length,
    },
  };

  return {
    name: `${moduleName} [Kim Christensen]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'kimChristensen',
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
