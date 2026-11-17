/**
 * EarAcheParser - parser for EarAche format (.ea)
 *
 * eagleplayer.conf: EarAche  prefixes=ea  Magic: "EASO". Layout from third-party/nuade/players/earache/ea_module.c:
 * six u32 offsets after the mark (rows 0x18, positions, instruments, samples, volumes, pitches), relative to byte 4.
 * Rows are 8 bytes (4 voices x [note, instrument]); a position entry is two words [first row, last row | speed << 12]
 * and 0xFFFF as first word is a jump to the entry named by the second word. Grid = one pattern per non-jump entry
 * (rows first..last), song order = the sequencer walk from entry 0. Entries that share rows share stored cells, so an
 * edit is carried to every grid cell on the same bytes (propagateSharedCells). Speed per entry is not shown.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeEarAcheCell, decodeEarAcheCell } from '@/engine/uade/encoders/EarAcheEncoder';

const BASE = 4;
const ROW_BYTES = 8;
const JUMP = 0xffff;
const MAX_ROW = 0xfff;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

export function isEarAcheFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 4) return false;
  return data[0] === 0x45 && data[1] === 0x41 && data[2] === 0x53 && data[3] === 0x4F;
}

/** The position table as [first, second] entries and the row count, or null when the header is not a module's. */
function readTables(buf: Uint8Array): { positionAt: number; entries: Array<[number, number]>; rowCount: number } | null {
  if (buf.length < BASE + 24 || u32BE(buf, BASE) !== 0x18) return null;
  const rows = u32BE(buf, BASE);
  const positions = u32BE(buf, BASE + 4);
  const instruments = u32BE(buf, BASE + 8);
  if (positions <= rows || (positions - rows) % ROW_BYTES !== 0 || instruments <= positions || BASE + instruments > buf.length) return null;
  const entries: Array<[number, number]> = [];
  for (let at = BASE + positions; at + 4 <= BASE + instruments; at += 4) entries.push([u16BE(buf, at), u16BE(buf, at + 2)]);
  return { positionAt: BASE + positions, entries, rowCount: (positions - rows) / ROW_BYTES };
}

/** Sequencer walk (ea_pattern_at): entry indices in play order, following jump marks, until an entry repeats. */
function walk(entries: Array<[number, number]>): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  let index = 0;
  while (index < entries.length && !seen.has(index) && order.length < 256) {
    seen.add(index);
    let at = index;
    for (let hop = 0; hop < 16 && entries[at] && entries[at][0] === JUMP; hop++) at = entries[at][1] & MAX_ROW;
    if (!entries[at] || entries[at][0] === JUMP || order.includes(at)) break;
    order.push(at);
    index = at + 1;
  }
  return order;
}

export function parseEarAcheFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const tables = readTables(buf);

  const rowsAt = BASE + 0x18;
  const used = tables ? walk(tables.entries) : [];
  const entryIndexes = used.length > 0 ? [...new Set(used)] : [];
  const ranges = entryIndexes.map((e) => {
    const [first, second] = tables!.entries[e];
    return { first: first & MAX_ROW, length: Math.max(first & MAX_ROW, second & MAX_ROW) - (first & MAX_ROW) + 1 };
  });
  if (ranges.length === 0) ranges.push({ first: 0, length: 64 });

  const cellOffset = (p: number, row: number, ch: number): number => {
    const range = ranges[p];
    if (!tables || !range || row < 0 || row >= range.length || ch < 0 || ch >= 4) return -1;
    const r = range.first + row;
    return r < tables.rowCount ? rowsAt + r * ROW_BYTES + ch * 2 : -1;
  };
  const cellAt = (p: number, row: number, ch: number) => {
    const off = cellOffset(p, row, ch);
    return decodeEarAcheCell(off < 0 ? [0, 0] : buf.subarray(off, off + 2));
  };

  const patterns: Pattern[] = ranges.map((range, p) => ({
    id: `pattern-${p}`,
    name: `Position ${p}`,
    length: range.length,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: range.length }, (_, r) => cellAt(p, r, ch)),
    })),
  }));

  const instruments: InstrumentConfig[] = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    name: `EarAche ${i + 1}`,
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig));

  const songPositions = used.length > 0 ? used.map((e) => entryIndexes.indexOf(e)) : [0];
  const speed = tables && used.length > 0 ? tables.entries[used[0]][1] >> 12 : 0;

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'earAche',
    patternDataFileOffset: 0,
    bytesPerCell: 2,
    rowsPerPattern: Math.max(...ranges.map((r) => r.length)),
    numChannels: 4,
    numPatterns: patterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeEarAcheCell,
    decodeCell: decodeEarAcheCell,
    getCellFileOffset: cellOffset,
    propagateSharedCells: true,
  };

  return {
    name,
    format: 'MOD' as TrackerSong['format'],
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: speed > 0 ? speed : 6,
    initialBPM: 125,
    uadePatternLayout,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
