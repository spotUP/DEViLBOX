/**
 * PierreAdaneParser.ts — Pierre Adane Packer music format detector/parser
 *
 * Detects modules packed with Pierre Adane's Amiga music packer (c) 1990,
 * as seen in games like Pang (Ocean, 1990).
 * Common prefix: pap.*
 *
 * Detection logic ported from:
 *   uade-3.05/amigasrc/players/wanted_team/PierreAdanePacker/src/Pierre Adane Packer.AMP_2.asm
 *   → EP_Check5 routine
 *
 * Header layout (all big-endian words):
 *
 *   Offset  0, word D1: offset to sequence/pattern table (even, non-zero, non-negative)
 *   Offset  2, word D2: offset to pattern data        (even, non-zero, non-negative)
 *   Offset  4, word D3: offset to sample info table   (even, non-zero, non-negative)
 *   Offset  6, word D4: offset to sample data / end   (even, non-zero, non-negative)
 *
 * Structural constraints (derived from assembly arithmetic):
 *   Let gap43 = D4 - D3  (must be ≥ 0)
 *   Let gap32 = D3 - D2  (must be ≥ 0)
 *   gap43 must equal gap32  (equal-sized blocks)
 *   Let gap21 = D2 - D1  (must be ≥ 0)
 *   gap21 - 2 must equal gap43  (D2-D1-2 == D4-D3)
 *
 * Terminator check:
 *   buf[D4] must equal 0xFF (terminator byte at end-of-header offset)
 *
 * Sequence table scan:
 *   From A2 = base+D1 up to (but not including) base+D4 (step 2 words):
 *     Each word must be: even (bit 0 == 0), non-negative (bit 15 == 0),
 *     and ≤ D1 (sequence entries are offsets within the header block).
 *
 * Song name suffix: [Pierre Adane]
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// We need to read at least 8 bytes of header plus follow the largest offset pointer.
// Minimum: header 8 bytes + at least one pattern byte + terminator.
const MIN_FILE_SIZE = 10;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

function safeU16(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 1 >= buf.length) return 0x8001; // negative+odd sentinel
  return u16BE(buf, off);
}

export function isPierreAdaneFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // move.l A0, A1  (save base, A1 = 0)
  // move.w (A1)+, D1   → word at 0; A1→2
  // beq.b fail         → D1 must be non-zero
  // bmi.b fail         → D1 must be non-negative (bit 15 == 0)
  // btst #0, D1; bne.b fail → D1 must be even
  const D1 = safeU16(buf, 0);
  if (D1 === 0) return false;
  if (D1 & 0x8000) return false;
  if (D1 & 1) return false;

  // move.w (A1)+, D2   → word at 2; A1→4
  const D2 = safeU16(buf, 2);
  if (D2 === 0) return false;
  if (D2 & 0x8000) return false;
  if (D2 & 1) return false;

  // move.w (A1)+, D3   → word at 4; A1→6
  const D3 = safeU16(buf, 4);
  if (D3 === 0) return false;
  if (D3 & 0x8000) return false;
  if (D3 & 1) return false;

  // move.w (A1)+, D4   → word at 6; A1→8
  const D4 = safeU16(buf, 6);
  if (D4 === 0) return false;
  if (D4 & 0x8000) return false;
  if (D4 & 1) return false;

  // move.w D4, D5      (D5 = D4)
  // sub.w D3, D4       → gap43 = D4 - D3; bmi.b fail
  const gap43 = D4 - D3;
  if (gap43 < 0) return false;

  // sub.w D2, D3       → gap32 = D3 - D2; bmi.b fail
  const gap32 = D3 - D2;
  if (gap32 < 0) return false;

  // cmp.w D3, D4       → gap43 must equal gap32; bne.b fail
  if (gap43 !== gap32) return false;

  // sub.w D1, D2       → gap21 = D2 - D1; bmi.b fail
  const gap21 = D2 - D1;
  if (gap21 < 0) return false;

  // subq.w #2, D2      → gap21 -= 2; cmp.w D2, D4 → bne.b fail
  if (gap43 !== gap21 - 2) return false;

  // add.w D4, D5       → D5 = original D4 + gap43 = D4_orig + (D4_orig - D3_orig)
  // But D4 was modified: D4 now = gap43, D5 = original D4 + gap43
  // Actually re-reading the assembly:
  //   D4 original = word at 6
  //   D5 = D4_original
  //   D4 = D4_orig - D3_orig  (gap43)
  //   D3 = D3_orig - D2_orig  (gap32)
  //   D2 = D2_orig - D1_orig - 2  (gap21-2, but already checked == gap43)
  //   add.w D4, D5  → D5 = D4_orig + gap43
  const D4_orig = safeU16(buf, 6);
  const D3_orig = safeU16(buf, 4);
  const D5_final = D4_orig + gap43;

  // lea (A0, D1.W), A2  → A2 = base + D1_orig
  // move.w (A2), D4     → read word at base+D1_orig
  const D4_new = safeU16(buf, D1);

  // lea (A0, D4.W), A3  → A3 = base + D4_new
  // cmp.b #-1, (A3)     → buf[D4_new] must be 0xFF
  if (D4_new >= buf.length) return false;
  if (buf[D4_new] !== 0xFF) return false;

  // lea (A0, D5.W), A0  → A0 = base + D5_final (end of scan range)
  // Next loop: while A2 < A0 (step word):
  //   move.w (A2)+, D2  → read word from sequence table; A2 advances
  //   bmi.b fail        → must be non-negative
  //   btst #0, D2; bne.b fail → must be even
  //   cmp.w D1, D2      → must be ≤ D1 (bgt.b fail)
  //   cmp.l A2, A0; bne.b Next
  if (D5_final > buf.length) return false;
  let scanPos = D1; // A2 starts at base+D1
  const scanEnd = D5_final; // A0 = base + D5_final
  while (scanPos < scanEnd) {
    const entry = safeU16(buf, scanPos);
    if (entry & 0x8000) return false;          // bmi.b fail
    if (entry & 1) return false;               // btst #0, D2; bne.b fail
    if (entry > D1) return false;              // cmp.w D1, D2; bgt.b fail
    scanPos += 2;
  }

  return true;
}

export function parsePierreAdaneFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isPierreAdaneFormat(buf)) throw new Error('Not a Pierre Adane Packer module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^pap\./i, '') || baseName;

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
    name: `${moduleName} [Pierre Adane]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
