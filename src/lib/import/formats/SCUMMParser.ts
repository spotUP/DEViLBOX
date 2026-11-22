/**
 * SCUMMParser.ts - LucasArts SCUMM Amiga music (scumm.* / .scumm), a 68k executable: replay code, then its song.
 * Playback is the nuade port (third-party/nuade/players/scumm); this parser only reads the song.
 *
 * Grammar (scumm.c, scm_module.c): the version is named by an FNV-1a 64 hash of the code with its operand bytes zeroed
 * (SCUMM_VERSIONS below, the `sizeof`/operand offsets from scm_internal.h). The operands give the record table, the
 * envelope table and four event lists. An event is 16 bytes: time (ticks), period, duration, Paula channel, record
 * number, 6 bytes unused; a list ends with a record whose period word is $FFFF. Only the Quad driver, measured on
 * zaktitle.scumm, is verified; any other version, or lists outside the file, keeps an empty grid with no layout.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): each event list is a file block whose `blockRows` carry its bytes;
 * the display is one pattern, a row per ROW_TICKS ticks, with `noteBytes` naming the period word of every shown event.
 * shortcut: events not on a ROW_TICKS boundary share a row with an earlier event or round down; the later one of two in
 * one row is not shown (its bytes stay in the block). Upgrade to a finer row if a song needs it.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { scummEncoder } from '@/engine/uade/encoders/SCUMMEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

export const SCUMM_ROW_TICKS = 8;
const EVENT_BYTES = 16;
const NUM_CHANNELS = 4;
const END_PERIOD = 0xffff;

interface ScummVersion { name: string; length: number; hash: bigint; bra: boolean; opBytes: 2 | 4; ops: number[] }

const SCUMM_VERSIONS: ScummVersion[] = [
  { name: 'Duo restarting', length: 0x43c, hash: 0x5ab476c2fa848124n, bra: false, opBytes: 4, ops: [10, 16, 22, 160, 246, 332] },
  { name: 'Duo rewinding', length: 0x44e, hash: 0x48b8b327d3613dc8n, bra: false, opBytes: 4, ops: [10, 16, 22, 170, 256, 342] },
  { name: 'Duo stopping', length: 0x436, hash: 0xa7ae5be0566a63c3n, bra: false, opBytes: 4, ops: [10, 16, 22, 154, 240, 326] },
  { name: 'Quad', length: 0x490, hash: 0xf020e68461d9414en, bra: false, opBytes: 4, ops: [10, 16, 22, 166, 252, 338] },
  { name: 'Quad restart', length: 0x45e, hash: 0xffc48efee2e8e3a3n, bra: true, opBytes: 2, ops: [10, 14, 18, 142, 222, 302] },
];

const s16 = (b: Uint8Array, o: number): number => ((b[o] << 8 | b[o + 1]) << 16) >> 16;
const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const s32 = (b: Uint8Array, o: number): number => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];

function fnv64(b: Uint8Array, start: number, length: number, zero: number[], opBytes: number): bigint {
  const c = b.slice(start, start + length);
  for (const o of zero) c.fill(0, o, o + opBytes);
  let x = 0xcbf29ce484222325n;
  for (const v of c) x = ((x ^ BigInt(v)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return x;
}

export function isSCUMMFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 16) return false;
  return data[4] === 0x60;
}

/** The start of each of the four event lists, or null for an unknown version or lists outside the file. */
export function scummEventLists(buf: Uint8Array): { version: string; lists: number[] } | null {
  const bra = buf.length > 8 && u16(buf, 4) === 0x6000;
  const entry = bra ? 6 + s16(buf, 6) : 4;
  for (const v of SCUMM_VERSIONS) {
    if (v.bra !== bra || entry < 0 || entry + v.length > buf.length) continue;
    if (fnv64(buf, entry, v.length, v.ops, v.opBytes) !== v.hash) continue;
    const val = v.ops.map((o) => (v.opBytes === 4 ? s32(buf, entry + o) : s16(buf, entry + o)));
    const lists = [4 + val[2]];
    for (let i = 0; i < 3; i++) lists.push(lists[i] + val[3 + i]);
    return { version: v.name, lists };
  }
  return null;
}

function carrierRows(b: Uint8Array, start: number, size: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let p = start; p < start + size;) {
    const n = Math.min(3, start + size - p);
    rows.push({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      cutoff: n, period: b[p], pan: n > 1 ? b[p + 1] : 0, resonance: n > 2 ? b[p + 2] : 0,
    } as TrackerCell);
    p += n;
  }
  return rows;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function parseSCUMMFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const name = filename.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const found = scummEventLists(buf);

  // Each list: events up to and including the end record.
  const blocks: Array<{ start: number; size: number }> = [];
  const events: Array<{ at: number; time: number; period: number; channel: number; inst: number }> = [];
  let ok = found !== null;
  if (found) {
    for (const start of found.lists) {
      let p = start;
      while (ok) {
        if (start < 0 || p + EVENT_BYTES > buf.length) { ok = false; break; }
        const period = u16(buf, p + 2);
        if (period === END_PERIOD) { p += EVENT_BYTES; break; }
        const channel = u16(buf, p + 6);
        if (channel < NUM_CHANNELS) events.push({ at: p, time: u16(buf, p), period, channel, inst: u16(buf, p + 8) });
        p += EVENT_BYTES;
      }
      blocks.push({ start, size: p - start });
    }
    blocks.sort((a, c) => a.start - c.start);
    for (let i = 1; i < blocks.length && ok; i++) ok = blocks[i - 1].start + blocks[i - 1].size <= blocks[i].start;
  }

  const rowCount = ok ? Math.max(1, Math.ceil((Math.max(0, ...events.map((e) => e.time)) + 1) / SCUMM_ROW_TICKS)) : 64;
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: rowCount,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: Array.from({ length: rowCount }, emptyCell),
    })),
  };

  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const usedInstruments = new Set<number>();
  if (ok) {
    for (const e of events) {
      const row = Math.floor(e.time / SCUMM_ROW_TICKS);
      const cell = pattern.channels[e.channel].rows[row];
      const note = periodToGridNote(e.period);
      if (cell.note !== 0 || note === 0) continue;
      cell.note = note;
      cell.instrument = e.inst + 1;
      usedInstruments.add(e.inst + 1);
      noteBytes.push({ pattern: 0, channel: e.channel, row, offset: e.at + 2, note });
    }
  }

  const layout: UADEVariablePatternLayout | undefined = ok && blocks.length ? {
    formatId: 'scumm',
    numChannels: NUM_CHANNELS,
    numFilePatterns: blocks.length,
    rowsPerPattern: rowCount,
    moduleSize: buf.length,
    encoder: scummEncoder,
    filePatternAddrs: blocks.map((b) => b.start),
    filePatternSizes: blocks.map((b) => b.size),
    // The display is a tick grid, not the file streams: no display pattern maps to a block.
    trackMap: [Array.from({ length: NUM_CHANNELS }, () => -1)],
    blockRows: blocks.map((b) => carrierRows(buf, b.start, b.size)),
    noteBytes,
  } : undefined;

  const instruments: InstrumentConfig[] = [...usedInstruments].sort((a, c) => a - c).map((id) => ({
    id, name: `Record ${id - 1}`, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  return {
    name: `${name} [SCUMM]`,
    format: 'MOD' as TrackerFormat,
    patterns: layout ? [pattern] : [{ ...pattern, channels: pattern.channels.map((c) => ({ ...c, rows: c.rows.map(emptyCell) })) }],
    instruments: layout ? instruments : [],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: SCUMM_ROW_TICKS,
    initialBPM: 125,
    linearPeriods: false,
    uadePlayerTickGrid: true,
    ...(layout ? { uadeVariableLayout: layout } : {}),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
