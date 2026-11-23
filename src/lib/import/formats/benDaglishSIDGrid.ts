/**
 * benDaglishSIDGrid.ts - Ben Daglish SID (BDS.*) tracks as an editable tick grid.
 *
 * The Rob Hubbard recipe (docs/FORMAT_COMMAND_STREAM_GRID.md):
 *  - each track (its bytes up to and including the 0xFF end) decodes to one carrier cell per command on `blockRows`:
 *    cutoff = length, period/pan/resonance/envMod = bytes 0..3. Concatenating the carriers gives the track back.
 *  - the display grid is carrier-less: one row per player tick, every voice walking its own order list.
 *
 * The grammar mirrors third-party/nuade/players/bendaglishsid/bds_driver.c (next_track, step_voice, start_note):
 * order list bytes: 0xFF ends, below 0x80 a track number, else (byte & 0x60) >> 5 picks transpose (1 byte follows),
 * repeat (the track plays byte & 0x1F times), detune (1 byte) or instrument map (1 byte). Track bytes: a note below
 * 0x80 with a length byte (length + 1 ticks), 0x80..0x8F instrument, 0xA0 rest with a length byte (length ticks),
 * 0xBF portamento off, other 0x90..0xBF arpeggio, 0xC0..0xFE portamento with 3 bytes, 0xFF end.
 * The tables come from nuade's loader through nw_bds_layout; nothing is guessed here.
 */
import type { TrackerCell } from '@/types';
import type { BdsLayout } from '@/engine/nuade/nuadeBdsLayout';
import { BDS_VOICES } from '@/engine/nuade/nuadeBdsLayout';

/** bds_driver.c NOTE_OFFSET: added to a track's note byte. */
const NOTE_OFFSET = 9;
/** A track position is a byte in the driver: a track is at most 256 bytes. */
const MAX_TRACK_BYTES = 256;
/** shortcut: one pass of each order list is capped at this many ticks; raise it if a real song is cut. */
const MAX_PASS_TICKS = 64 * 512;
export const BDS_ROWS_PER_PATTERN = 64;

const blank = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function u32(buf: Uint8Array, at: number): number {
  if (at < 0 || at + 3 >= buf.length) return -1;
  return ((buf[at] << 24) | (buf[at + 1] << 16) | (buf[at + 2] << 8) | buf[at + 3]) >>> 0;
}

/** Bytes of the track command starting with `byte`. */
export function bdsCommandBytes(byte: number): number {
  if (byte === 0xff) return 1;
  if (byte < 0x80 || byte === 0xa0) return 2;
  return byte >= 0xc0 ? 4 : 1;
}

/** The shown note of a note byte under a transpose: the played note (byte + 9 + transpose) plus 1; 0 off the grid. */
export function bdsByteToNote(byte: number, transpose: number): number {
  const note = ((byte + NOTE_OFFSET + transpose) & 0xff) + 1;
  return note <= 96 ? note : 0;
}

/** One track as carrier cells, from `start` to and including its 0xFF end. */
export function decodeBdsTrack(buf: Uint8Array, start: number): { rows: TrackerCell[]; size: number } {
  const rows: TrackerCell[] = [];
  let at = start;
  while (at < buf.length && at - start < MAX_TRACK_BYTES) {
    const len = Math.min(bdsCommandBytes(buf[at]), buf.length - at);
    const cell = blank();
    cell.cutoff = len;
    cell.period = buf[at];
    if (len >= 2) cell.pan = buf[at + 1];
    if (len >= 3) cell.resonance = buf[at + 2];
    if (len >= 4) cell.envMod = buf[at + 3];
    rows.push(cell);
    const end = buf[at] === 0xff;
    at += len;
    if (end) break;
  }
  return { rows, size: at - start };
}

export interface BdsGrid {
  filePatternAddrs: number[];
  filePatternSizes: number[];
  blockRows: TrackerCell[][];
  /** timeline[voice][tick]: the shown cell. */
  timeline: TrackerCell[][];
  /** noteAt[voice][tick]: the file offset of the note byte starting on that tick, or -1. */
  noteAt: number[][];
  ticks: number;
}

interface BdsEvent { ticks: number; note: number; instrument: number; offset: number }

/** Decode every track one subsong plays and lay the three voices on one tick timeline. */
export function buildBdsGrid(buf: Uint8Array, layout: BdsLayout, subsong: number): BdsGrid {
  const base = layout.hunkStart;
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  const blockRows: TrackerCell[][] = [];
  const known = new Set<number>();
  const track = (fileAt: number): void => {
    if (known.has(fileAt)) return;
    known.add(fileAt);
    const d = decodeBdsTrack(buf, fileAt);
    filePatternAddrs.push(fileAt);
    filePatternSizes.push(d.size);
    blockRows.push(d.rows);
  };

  const lists = layout.orderLists[subsong] ?? layout.orderLists[0];
  const passes: BdsEvent[][] = [];
  for (let voice = 0; voice < BDS_VOICES; voice++) {
    const events: BdsEvent[] = [];
    let ticks = 0;
    let transpose = 0;
    let repeat = 0;
    let instrument = 0;
    let at = base + lists[voice];
    for (let entries = 0; at >= 0 && at < buf.length && ticks < MAX_PASS_TICKS && entries < 4096; entries++) {
      const entry = buf[at++];
      if (entry === 0xff) break;
      if (entry & 0x80) {
        const command = (entry & 0x60) >> 5;
        if (command === 1) repeat = ((entry & 0x1f) - 1) & 0xff;
        else {
          if (command === 0) transpose = buf[at];
          at++;
        }
        continue;
      }
      const hunkAt = u32(buf, base + layout.tracks + 4 * entry);
      if (hunkAt < 0 || base + hunkAt >= buf.length) break;
      const start = base + hunkAt;
      track(start);
      for (let pass = 0; pass <= repeat && ticks < MAX_PASS_TICKS; pass++) {
        for (let pc = start; pc < buf.length && pc - start < MAX_TRACK_BYTES && buf[pc] !== 0xff;) {
          const byte = buf[pc];
          if (byte < 0x80 || byte === 0xa0) {
            const length = buf[pc + 1] ?? 0;
            const t = byte === 0xa0 ? (length === 0 ? 256 : length) : length + 1;
            events.push(byte === 0xa0
              ? { ticks: t, note: 97, instrument: 0, offset: -1 }
              : { ticks: t, note: bdsByteToNote(byte, transpose), instrument, offset: pc });
            ticks += t;
          } else if (byte < 0x90) {
            instrument = (byte & 0x0f) + 1;
          }
          pc += bdsCommandBytes(byte);
        }
      }
      repeat = 0;
    }
    passes.push(events);
  }

  const passTicks = passes.map((events) => events.reduce((n, e) => n + e.ticks, 0));
  const total = Math.max(1, ...passTicks);
  const timeline: TrackerCell[][] = [];
  const noteAt: number[][] = [];
  for (let voice = 0; voice < BDS_VOICES; voice++) {
    const cells = Array.from({ length: total }, blank);
    const notes = new Array<number>(total).fill(-1);
    const events = passes[voice];
    // the song loops when every voice reaches its end; a shorter voice is silent until then
    let tick = 0;
    for (const e of events) {
      if (tick >= total) break;
      if (e.note) cells[tick] = { ...blank(), note: e.note, instrument: e.instrument };
      if (e.note && e.note !== 97) notes[tick] = e.offset;
      tick += e.ticks;
    }
    timeline.push(cells);
    noteAt.push(notes);
  }
  return { filePatternAddrs, filePatternSizes, blockRows, timeline, noteAt, ticks: total };
}
