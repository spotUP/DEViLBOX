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
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodePierreAdaneCell, encodePierreAdaneCell } from '@/engine/uade/encoders/PierreAdaneEncoder';

// We need to read at least 8 bytes of header plus follow the largest offset pointer.
// Minimum: header 8 bytes + at least one pattern byte + terminator.
const MIN_FILE_SIZE = 10;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
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

const NUM_CH = 4;
const ROWS = 64;
const TRACK_LENGTH_MARKER = 0xff;

/**
 * Walk the four voice lists (grammar: third-party/nuade/players/pierreadane/pa_internal.h). One grid pattern per list
 * position; each voice's track gives 64 rows. A track entry (optionally behind a 0xFF,n length marker) sits on its first
 * row and lasts n rows, the following rows are empty and have no file place. Tracks shared by several positions map to
 * the same file bytes, so an edit reaches every use.
 */
function walkTracks(buf: Uint8Array): number[][][] {
  const list = [0, 2, 4, 6].map((o) => u16BE(buf, o));
  let count = 0;
  for (let o = list[0]; o + 1 < list[1] && o + 1 < buf.length && u16BE(buf, o) !== 0; o += 2) count++;
  const offsets: number[][][] = [];
  const entryLen = [1, 1, 1, 1]; // rows per entry; carries over between tracks like the player's row_length
  for (let p = 0; p < count; p++) {
    const rows: number[][] = Array.from({ length: ROWS }, () => [-1, -1, -1, -1]);
    for (let c = 0; c < NUM_CH; c++) {
      let pos = safeU16(buf, list[c] + 2 * p);
      let row = 0;
      while (row < ROWS && pos < buf.length) {
        if (buf[pos] === TRACK_LENGTH_MARKER) { entryLen[c] = Math.max(1, buf[pos + 1]); pos += 2; }
        if (pos + 4 > buf.length) break;
        rows[row][c] = pos;
        pos += 4;
        row += entryLen[c];
      }
    }
    offsets.push(rows);
  }
  return offsets;
}

export function parsePierreAdaneFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const _base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (!_base.startsWith('pap.') && !_base.endsWith('.mok') && !isPierreAdaneFormat(buf)) throw new Error('Not a Pierre Adane Packer module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^pap\./i, '') || baseName;

  const streams = walkTracks(buf);
  if (streams.length === 0) throw new Error('Pierre Adane: no track list');

  // Instrument records: 8 bytes at 8 * n, n = 1..15, ended by a record starting 0xFF.
  const instruments: InstrumentConfig[] = [];
  for (let n = 1; n <= 15 && 8 * n + 8 <= buf.length && buf[8 * n] !== 0xff; n++) {
    instruments.push({
      id: n, name: `Pierre Adane ${n}`, type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }
  if (instruments.length === 0) {
    instruments.push({ id: 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig);
  }

  const empty = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const patterns = streams.map((rows, k) => ({
    id: `pattern-${k}`, name: `Pattern ${k}`, length: ROWS,
    channels: Array.from({ length: NUM_CH }, (_, c) => ({
      id: `channel-${c}`, name: `Channel ${c + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: c === 0 || c === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: rows.map((r) => (r[c] < 0 ? empty : decodePierreAdaneCell(buf.subarray(r[c], r[c] + 4)))),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CH, originalPatternCount: streams.length, originalInstrumentCount: instruments.length,
    },
  }));

  return {
    name: `${moduleName} [Pierre Adane]`, format: 'MOD' as TrackerFormat,
    patterns, instruments, songPositions: patterns.map((_, k) => k),
    songLength: patterns.length, restartPosition: 0, numChannels: NUM_CH,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'pierreAdane',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: ROWS,
      numChannels: NUM_CH,
      numPatterns: streams.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodePierreAdaneCell,
      encodeOverStored: true,
      decodeCell: decodePierreAdaneCell,
      getCellFileOffset: (p, r, c) => streams[p]?.[r]?.[c] ?? -1,
    } satisfies UADEPatternLayout,
  };
}
