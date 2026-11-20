/**
 * iffSmusEdits.ts - write the grid's note and instrument edits back into the SMUS module's own TRAK bytes.
 *
 * A TRAK chunk is 2-byte events (type, data): type 0-127 a note (the MIDI note) with a duration index in data, 128 a rest,
 * 129 an instrument register that governs every later note on the track. The grid is that stream laid on a row timeline:
 * a note cell then dur-1 empty rows, a rest dur empty rows (IffSmusParser). So a note edit is the note event's type byte
 * moved by the cell's semitone change, written in place; the stream keeps its length and every other byte stays as loaded
 * (the from-scratch exporter re-quantises durations and drops unknown events).
 *
 * An instrument is the register of the last 129 event before the note. It is written as that event's data byte when every
 * note the event governs was edited to the same instrument and an INS1 register holds that instrument; one note of a shared
 * event cannot change without changing the others.
 *
 * Not written, and named in `warnings`, never half-applied: a note added, removed or moved to another row (each changes
 * the stream length), a note leaving 0-127, an instrument edit that does not cover its whole event or names an instrument
 * with no register, and volume or effect cells (SMUS tracks carry no per-note volume or effect).
 */
import type { Pattern, TrackerCell } from '@/types';

const DURATION_TABLE = [32, 16, 8, 4, 2, -1, -1, -1, 48, 24, 12, 6, 3, -1, -1, -1];
const EVENT_REST = 128;
const EVENT_INSTRUMENT = 129;
const EVENT_MARK = 255;

export interface IffSmusEditResult {
  data: Uint8Array;
  /** Bytes changed in the module. */
  patched: number;
  warnings: string[];
}

interface NoteEv { row: number; at: number; insAt: number }

function u32(b: Uint8Array, o: number): number { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }

/** INS1 register -> 1-based instrument, as the parser maps them (first sampled INS1 with a name wins). */
function registerMap(src: Uint8Array): number[] {
  const map = new Array<number>(256).fill(0);
  let n = 0;
  for (let pos = 12; pos + 8 <= src.length;) {
    const id = String.fromCharCode(src[pos], src[pos + 1], src[pos + 2], src[pos + 3]);
    const size = u32(src, pos + 4);
    const start = pos + 8;
    if (id === 'INS1' && start + 4 <= src.length && src[start + 1] === 0 && map[src[start]] === 0 && size > 4 && start + size <= src.length) {
      const named = src.subarray(start + 4, start + size).some((c) => c !== 0);
      if (named) map[src[start]] = ++n;
    }
    pos = start + size + (size & 1);
  }
  return map;
}

/** The note events of one TRAK chunk at file offset `at`, with the row each sits on. */
function walkTrack(src: Uint8Array, at: number, size: number): NoteEv[] {
  const out: NoteEv[] = [];
  let row = 0;
  let insAt = -1;
  for (let i = 0; i + 2 <= size; i += 2) {
    const type = src[at + i];
    if (type === EVENT_MARK) break;
    if (type === EVENT_INSTRUMENT) { insAt = at + i; continue; }
    if (type > EVENT_REST) continue;
    const dur = DURATION_TABLE[src[at + i + 1] & 0x0f];
    if (dur < 0) continue;
    if (type < EVENT_REST) out.push({ row, at: at + i, insAt });
    row += Math.max(1, dur);
  }
  return out;
}

/**
 * `blockRows[ch]` is the channel's timeline as loaded (the parser's carrier); `edited` the patterns as they are now, in song order.
 * `trackAddrs[ch]` / `trackSizes[ch]` locate each TRAK chunk's event bytes in `source`.
 */
export function applyIffSmusGridEdits(
  source: Uint8Array, blockRows: readonly (readonly TrackerCell[])[], trackAddrs: readonly number[], trackSizes: readonly number[],
  edited: Pattern[], songPositions: readonly number[],
): IffSmusEditResult {
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  const regs = registerMap(source);
  let patched = 0;
  const poke = (o: number, v: number) => { if (out[o] !== v) { out[o] = v; patched++; } };

  for (let ch = 0; ch < blockRows.length; ch++) {
    const base = blockRows[ch];
    const now: TrackerCell[] = [];
    for (const p of songPositions) {
      const rows = edited[p]?.channels[ch]?.rows;
      if (rows) for (let r = 0; r < edited[p].length; r++) now.push(rows[r]);
    }
    const notes = walkTrack(source, trackAddrs[ch], trackSizes[ch]);
    const noteRows = new Set(notes.map((n) => n.row));
    const label = `voice ${ch + 1}`;

    for (let r = 0; r < Math.min(base.length, now.length); r++) {
      if (!noteRows.has(r) && (now[r]?.note ?? 0) !== 0) warnings.push(`${label} row ${r}: a note added where the track has none changes its length; not written`);
    }

    const groups = new Map<number, { notes: NoteEv[]; want: Set<number> }>();
    for (const n of notes) {
      const was = base[n.row];
      const cell = now[n.row];
      if (!was || !cell) continue;
      if (cell.note === 0 || cell.note === 97) { warnings.push(`${label} row ${n.row}: a note removed changes the track's length; not written`); continue; }
      const type = source[n.at] + (cell.note - was.note);
      if (cell.note !== was.note) {
        if (type < 0 || type > 127) warnings.push(`${label} row ${n.row}: note outside 0-127; not written`);
        else poke(n.at, type);
      }
      const g = groups.get(n.insAt) ?? { notes: [], want: new Set<number>() };
      g.notes.push(n); g.want.add(cell.instrument);
      groups.set(n.insAt, g);
    }
    for (const [insAt, g] of groups) {
      const was = new Set(g.notes.map((n) => base[n.row].instrument));
      if (g.want.size === 1 && was.size === 1 && [...g.want][0] === [...was][0]) continue;
      const want = [...g.want][0];
      const reg = regs.indexOf(want);
      if (insAt < 0) warnings.push(`${label}: an instrument set on notes before any instrument event cannot be written; not written`);
      else if (g.want.size !== 1) warnings.push(`${label}: notes sharing one instrument event were given different instruments; not written`);
      else if (want <= 0 || reg < 0) warnings.push(`${label}: instrument ${want} has no register; not written`);
      else poke(insAt + 1, reg);
    }
    for (let r = 0; r < Math.min(base.length, now.length); r++) {
      const a = base[r]; const b = now[r];
      if (a && b && (a.volume !== b.volume || a.effTyp !== b.effTyp || a.eff !== b.eff) && !warnings.some((w) => w.startsWith(`${label} volume`))) {
        warnings.push(`${label} volume and effect cells are not written: SMUS tracks carry none`);
      }
    }
  }
  return { data: out, patched, warnings };
}
