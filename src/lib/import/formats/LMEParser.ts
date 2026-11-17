/**
 * LMEParser.ts — Leggless Music Editor (LME) Amiga format native parser
 *
 * LME is an Amiga tracker created by Leggless. Files are typically named
 * with a "LME." prefix (e.g. LME.songname) or a ".lme" extension.
 *
 * Detection (from UADE LMEv3.asm Check2 routine):
 *   bytes[0..2]  = "LME" (0x4C, 0x4D, 0x45)
 *   bytes[3]     = any (format version byte, typically 1, 2, or 3)
 *   u32BE at offset 36 (bytes[36..39]) must be 0
 *
 *   In the 68k Check2 code: D1 is loaded with the first 4 bytes, then
 *   clr.b D1 clears the lowest byte (index 3), then compared against
 *   #'LME'<<8 = 0x4C4D4500. The separate tst.l 9*4(A0) checks offset 36.
 *
 * Single-file format: all player and music data in one file.
 * 4 channels (standard Amiga Paula).
 * The grid is the nuade player's position lists and event streams (third-party/nuade/players/legglessmusiceditor/lme_module.c):
 * one grid pattern per distinct event stream, one row per event, the note word is the editable cell.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/LME/src/LMEv3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeLMECell, decodeLMECell } from '@/engine/uade/encoders/LMEEncoder';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Leggless Music Editor (LME) format module.
 *
 * Checks:
 *   1. bytes[0..2] == "LME" (0x4C, 0x4D, 0x45)
 *   2. u32BE at offset 36 == 0
 *
 * Detection logic mirrors UADE's LMEv3.asm Check2 routine.
 * bytes[3] (format version) is intentionally not checked.
 */
export function isLMEFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 40) return false;

  return (
    buf[0] === 0x4C && // 'L'
    buf[1] === 0x4D && // 'M'
    buf[2] === 0x45 && // 'E'
    u32BE(buf, 36) === 0
  );
}

// ── Main parser ────────────────────────────────────────────────────────────

const NUM_CH = 4;
const TABLE_BASE = 0x28;
const MAX_EVENTS = 200000;

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

/** One event stream: `notes[r]` is the file offset of row r's note word, or -1 (stop event: no note). */
interface Stream { start: number; notes: number[]; transpose: number; voice: number }

/** Walk one pattern's events (lme_read_event); null when it runs out of the file. */
function readStream(buf: Uint8Array, start: number, transpose: number, voice: number, budget: { left: number }): Stream | null {
  const notes: number[] = [];
  let pos = start;
  for (let first = true; ; first = false) {
    if (pos + 2 > buf.length || budget.left-- <= 0) return null;
    const flags = u16BE(buf, pos);
    pos += 2;
    if ((flags & 0x8000) && !first) return { start, notes, transpose, voice };
    if (flags & 0x01) { pos += 2; notes.push(-1); continue; }
    if (flags & 0x02) pos += 2;
    if (flags & 0x10) {
      if (pos + 4 > buf.length) return null;
      const count = u16BE(buf, pos);
      if (count < 2 || count > 8) return null;
      pos += 4 + (count - 1) * 2;
    }
    if (flags & 0x04) pos += 6;
    pos += 2; // duration
    if (pos + 2 > buf.length) return null;
    notes.push(pos);
    pos += 2;
  }
}

/**
 * Parse a Leggless Music Editor (LME) module file into a TrackerSong with an editable event grid.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseLMEFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isLMEFormat(buf)) {
    throw new Error('Not a Leggless Music Editor (LME) module');
  }

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName =
    baseName.replace(/^lme\./i, '').replace(/\.lme$/i, '') || baseName;

  // Header tables (lme_module_parse).
  const instrumentsAt = u32BE(buf, TABLE_BASE);
  const patternsAt = u32BE(buf, TABLE_BASE + 4);
  const dataAt = u32BE(buf, TABLE_BASE + 8);
  const subsongCount = Math.max(0, Math.floor(instrumentsAt / 16) - 1);
  const patternTable = TABLE_BASE + patternsAt;
  const patternData = TABLE_BASE + dataAt;
  const patternCount = Math.min(0x2000, Math.floor((dataAt - patternsAt) / 4));

  const streams: Stream[] = [];
  const seen = new Set<number>();
  const budget = { left: MAX_EVENTS };
  walk: for (let sub = 0; sub < subsongCount; sub++) {
    for (let voice = 0; voice < NUM_CH; voice++) {
      let lp = TABLE_BASE + u32BE(buf, TABLE_BASE + 16 * (sub + 1) + 4 * voice);
      for (;;) {
        if (lp + 2 > buf.length) break walk;
        let word = u16BE(buf, lp);
        lp += 2;
        if (word === 0xFFFF) break;
        let transpose = 0;
        if (word & 0x8000) {
          if (lp + 2 > buf.length) break walk;
          transpose = (u16BE(buf, lp) << 16) >> 16;
          lp += 2;
          word &= 0x7FFF;
        }
        if (word >= patternCount) break walk;
        const start = patternData + u32BE(buf, patternTable + 4 * word);
        if (seen.has(start)) continue;
        seen.add(start);
        const s = readStream(buf, start, transpose, voice, budget);
        if (!s) break walk;
        streams.push(s);
      }
    }
  }
  if (streams.length === 0) throw new Error('LME: no readable patterns');

  const empty = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const patterns: Pattern[] = streams.map((s, k) => {
    const len = Math.max(1, s.notes.length);
    return {
      id: `pattern-${k}`,
      name: `Pattern ${k}`,
      length: len,
      channels: Array.from({ length: NUM_CH }, (_, c) => ({
        id: `channel-${c}`, name: `Voice ${c + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
        pan: (c === 0 || c === 3) ? -50 : 50, instrumentId: null, color: null,
        rows: Array.from({ length: len }, (_, r) => {
          const off = c === s.voice ? (s.notes[r] ?? -1) : -1;
          return off < 0 ? empty : decodeLMECell(buf.subarray(off, off + 2), s.transpose);
        }),
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CH, originalPatternCount: streams.length, originalInstrumentCount: 0,
      },
    };
  });

  const instruments: InstrumentConfig[] = [{
    id: 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  return {
    name: `${moduleName} [LME]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, k) => k),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: NUM_CH,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'lme',
      patternDataFileOffset: 0,
      bytesPerCell: 2,
      rowsPerPattern: Math.max(1, ...streams.map((s) => s.notes.length)),
      numChannels: NUM_CH,
      numPatterns: streams.length,
      moduleSize: buffer.byteLength,
      encodeCell: encodeLMECell,
      encodeOverStored: true,
      decodeCell: (b) => decodeLMECell(b, 0),
      getCellFileOffset: (p, r, c) => {
        const s = streams[p];
        return s && c === s.voice ? (s.notes[r] ?? -1) : -1;
      },
      propagateSharedCells: true,
    } satisfies UADEPatternLayout,
  };
}
