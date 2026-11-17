/**
 * InfogramesParser.ts — Infogrames (RobHubbard2) Amiga music format native parser
 *
 * The Infogrames music format (also called "RobHubbard2") was used in Amiga games
 * published by Infogrames, including Gobliins, Ween, and Horror Zombies.
 * The format requires an external sample file (e.g. "Gobliins.dum.set").
 *
 * Detection (from UADE Infogrames.asm, CheckFormat routine):
 *   1. u16BE(0) != 0, even (bit 0 == 0)
 *   2. fileSize > u16BE(0)  (the word at 0 is an offset that must be within file)
 *   3. Let off = u16BE(0). At that offset: let rel = u16BE(off + 2).
 *   4. buf[off + rel] == 0  (null terminator at offset+2-relative)
 *   5. buf[off + rel + 1] == 15 (0x0F) — version or tag byte
 *
 * File extension: .dum
 *
 * Two-file format: song data (.dum) + external sample data (.dum.set).
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/infogrames/Infogrames.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeInfogramesCell, decodeInfogramesCell } from '@/engine/uade/encoders/InfogramesEncoder';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is an Infogrames DUM module.
 *
 * Detection mirrors the CheckFormat routine from Infogrames.asm.
 */
export function isInfogramesFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return false;

  // u16BE(0): non-zero, even (bit 0 clear)
  const headerOff = u16BE(buf, 0);
  if (headerOff === 0) return false;
  if (headerOff & 0x0001) return false; // must be even

  // fileSize must be strictly greater than headerOff
  if (buf.length <= headerOff) return false;

  // Need at least 4 bytes at headerOff for the relative offset read
  if (headerOff + 3 >= buf.length) return false;

  // rel = u16BE(headerOff + 2)
  const rel = u16BE(buf, headerOff + 2);

  // buf[headerOff + rel] must be 0 (null terminator)
  const nullPos = headerOff + rel;
  if (nullPos + 1 >= buf.length) return false;
  if (buf[nullPos] !== 0) return false;

  // buf[headerOff + rel + 1] must be 15 (0x0F) — version tag
  if (buf[nullPos + 1] !== 0x0f) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

const NUM_CH = 4;
const END_MARK = 0xff;

function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v & 0x8000 ? v - 0x10000 : v;
}

interface Stream { start: number; len: number }

/** The bytes of one pattern: up to the end mark, or through a stop command (0xE4-0xE7); the argument byte of 0xE0-0xE2 is a row. */
function patternStream(buf: Uint8Array, start: number): Stream {
  let at = start;
  while (at >= 0 && at < buf.length && buf[at] !== END_MARK) {
    const b = buf[at];
    if (b >= 0xe4 && b <= 0xe7) { at++; break; }
    at += b >= 0xe0 && b <= 0xe2 ? 2 : 1;
  }
  return { start, len: Math.max(0, Math.min(at, buf.length) - start) };
}

/** One grid cell per pattern byte; a command's argument byte is never a note. */
function patternCells(buf: Uint8Array, s: Stream) {
  const cells = [];
  let isArg = false;
  for (let i = 0; i < s.len; i++) {
    const b = buf[s.start + i];
    cells.push(decodeInfogramesCell(new Uint8Array([b]), isArg ? -1 : 0));
    isArg = !isArg && b >= 0xe0 && b <= 0xe2;
  }
  return cells;
}

/**
 * Parse an Infogrames DUM module (layout: third-party/nuade/players/infogrames/ig_module.c). Grid pattern k is track
 * list position k; channel c is voice c's pattern at that position, one row per pattern byte. Samples are external.
 */
export function parseInfogramesFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isInfogramesFormat(buf)) throw new Error('Not an Infogrames module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/\.dum$/i, '') || baseName;

  const songCount = Math.max(1, u16BE(buf, 0) >> 1);
  const base = s16BE(buf, (songCount - 1) * 2);
  const patternOffsets = base + 16;
  const lists: number[][] = [];
  for (let v = 0; v < NUM_CH; v++) {
    let at = base + s16BE(buf, base + 6 + 2 * v);
    const entries: number[] = [];
    while (at >= 0 && at < buf.length && buf[at] !== END_MARK && entries.length < 256) entries.push(buf[at++]);
    lists.push(entries);
  }
  const positions = Math.max(1, ...lists.map((l) => l.length));
  const streams: Stream[][] = [];
  for (let k = 0; k < positions; k++) {
    streams.push(lists.map((l) => {
      if (k >= l.length) return { start: -1, len: 0 };
      return patternStream(buf, base + s16BE(buf, patternOffsets + 2 * l[k]));
    }));
  }
  const maxRows = Math.max(1, ...streams.flat().map((s) => s.len));

  const instruments: InstrumentConfig[] = [{
    id: 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  const patterns: Pattern[] = streams.map((row, k) => {
    const rows = row.map((s) => patternCells(buf, s));
    const len = Math.max(1, ...row.map((s) => s.len));
    return {
      id: `pattern-${k}`,
      name: `Position ${k}`,
      length: len,
      channels: rows.map((cells, c) => ({
        id: `channel-${c}`, name: `Voice ${c + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
        instrumentId: null, color: null,
        rows: Array.from({ length: len }, (_, r) => cells[r] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 }),
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CH, originalPatternCount: positions, originalInstrumentCount: 0,
      },
    };
  });

  return {
    name: `${moduleName} [Infogrames]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, k) => k),
    songLength: positions,
    restartPosition: 0,
    numChannels: NUM_CH,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'infogrames',
      patternDataFileOffset: 0,
      bytesPerCell: 1,
      rowsPerPattern: maxRows,
      numChannels: NUM_CH,
      numPatterns: positions,
      moduleSize: buffer.byteLength,
      encodeCell: encodeInfogramesCell,
      encodeOverStored: true,
      decodeCell: (b) => decodeInfogramesCell(b, 0),
      getCellFileOffset: (p, r, c) => {
        const s = streams[p]?.[c];
        return s && r >= 0 && r < s.len ? s.start + r : -1;
      },
      propagateSharedCells: true,
    } satisfies UADEPatternLayout,
  };
}
