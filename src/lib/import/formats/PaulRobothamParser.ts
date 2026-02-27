/**
 * PaulRobothamParser.ts — Paul Robotham music format detector/parser
 *
 * Detects modules created with the Paul Robotham / Pete Barnett music system
 * (c) 1990–95, as used in games like Starlord (Microprose, 1994).
 * Common prefix: dat.*
 *
 * Detection logic ported from:
 *   uade-3.05/amigasrc/players/wanted_team/PaulRobotham/src/Paul Robotham.AMP.asm
 *   → EP_Check5 / DTP_Check2 routines (identical algorithm in both files)
 *
 * The format is a structured binary with the following header layout:
 *
 *   Offset 0, word D1: number of voices (1–4 inclusive). High byte must be 0.
 *   Offset 2, word D2: number of sequence pointers. High byte must be 0.
 *   Offset 4, word D3: number of pattern pointers. High byte must be 0.
 *   Offset 6, word D4: number of instruments.
 *   Offset 8+: voice start-position table (D1 entries × 4 bytes each).
 *     Each entry: upper word must be 0, lower word must be non-zero (absolute ptr).
 *   Then: D2 sequence pointers (4 bytes each, non-zero, non-negative, even).
 *   Then: D3 pattern pointers (4 bytes each, non-zero, non-negative, even).
 *     The first of these D3 pattern pointers (D2's first entry) is saved as D2_ref.
 *   Then: D4 × 12 bytes of instrument records.
 *   Verification:
 *     - offset of first byte past instrument table, relative to file start, must
 *       equal D2_ref (the first sequence pointer value).
 *     - 127 words starting at (base + D2_ref) must all equal 0x3F3F.
 *
 * Song name suffix: [Paul Robotham]
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// Header is 8 bytes + variable tables. The FinalCheck reads 128 words = 256 bytes
// at the location pointed to by the first sequence pointer. A conservative minimum.
const MIN_FILE_SIZE = 270;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

function safeU16(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 1 >= buf.length) return 0xFFFF; // sentinel — not 0x3F3F
  return u16BE(buf, off);
}

function safeU32(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 3 >= buf.length) return 0;
  return u32BE(buf, off);
}

export function isPaulRobothamFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // move.w (A0)+, D1   → word at 0; A0→2
  // beq.b Fault        → D1 must be non-zero
  // cmp.w #4, D1       → D1 must be ≤ 4
  // bhi.b Fault
  // tst.b (A0)         → byte at 2 must be 0 (high byte of D2 word)
  // bne.b Fault
  const D1 = safeU16(buf, 0);
  if (D1 === 0 || D1 > 4) return false;
  // buf[0] (high byte of D1) must be 0: already guaranteed by D1 ≤ 4 above.

  // move.w (A0)+, D2   → word at 2; A0→4
  // tst.b (A0)         → byte at 4 must be 0 (high byte of D3 word)
  // bne.b Fault
  if (buf[2] !== 0) return false; // high byte of D2
  const D2 = safeU16(buf, 2);

  // move.w (A0)+, D3   → word at 4; A0→6
  // tst.b (A0)         → byte at 6 must be 0 (high byte of D4 word)
  // bne.b Fault
  if (buf[4] !== 0) return false; // high byte of D3
  const D3 = safeU16(buf, 4);

  // move.w (A0)+, D4   → word at 6; A0→8
  const D4 = safeU16(buf, 6);

  // subq.w #1, D1  (for dbf loop, D1 entries total)
  // StartPos loop: D1 times (0..D1-1):
  //   tst.w (A0)       → upper word of 4-byte entry must be 0
  //   bne.b Fault
  //   tst.l (A0)+      → full longword must be non-zero; A0+=4
  //   beq.b Fault
  let pos = 8;
  for (let i = 0; i < D1; i++) {
    if (safeU16(buf, pos) !== 0) return false;   // upper word must be 0
    if (safeU32(buf, pos) === 0) return false;    // full longword must be non-zero
    pos += 4;
  }

  // subq.w #1, D2 (for dbf loop, D2 entries)
  // Next1 loop: D2 times:
  //   move.l (A0)+, D1  → longword: non-zero, non-negative, even
  //   beq.b Fault
  //   bmi.b Fault
  //   btst #0, D1 → bne.b Fault
  for (let i = 0; i < D2; i++) {
    const val = safeU32(buf, pos);
    if (val === 0) return false;
    if (val & 0x80000000) return false;
    if (val & 1) return false;
    pos += 4;
  }

  // subq.w #1, D3
  // move.l (A0), D2  → save D2_ref = first pattern pointer (before advancing)
  const D2_ref = safeU32(buf, pos);

  // Next2 loop: D3 times:
  //   move.l (A0)+, D1  → non-zero, non-negative, even
  for (let i = 0; i < D3; i++) {
    const val = safeU32(buf, pos);
    if (val === 0) return false;
    if (val & 0x80000000) return false;
    if (val & 1) return false;
    pos += 4;
  }

  // mulu.w #12, D4  → skip D4 * 12 instrument bytes
  // lea (A0, D4.W), A0
  pos += D4 * 12;

  // sub.l A1, A0  → A0 is now relative offset from file start
  // cmp.l A0, D2  → must equal D2_ref
  if (pos !== D2_ref) return false;

  // add.l D2, A1  → A1 = base + D2_ref
  const finalBase = D2_ref;

  // FinalCheck: 127 times (moveq #126, D1; dbf):
  //   cmp.w (A1)+, D2  where D2 = #$3F3F
  for (let i = 0; i < 127; i++) {
    if (safeU16(buf, finalBase + i * 2) !== 0x3F3F) return false;
  }

  return true;
}

export function parsePaulRobothamFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isPaulRobothamFormat(buf)) throw new Error('Not a Paul Robotham module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^dat\./i, '') || baseName;

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
    name: `${moduleName} [Paul Robotham]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
