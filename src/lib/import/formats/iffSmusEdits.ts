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
 * A note added on a rest's first row and a note removed rewrite that event in place, rest <-> note, keeping the duration.
 * A note added inside a note's tail or a rest splits that event: the part before the new note keeps its type, the new note
 * runs to the next event, each part a note of the longest duration that fits plus rests (durations come from DURATION_TABLE,
 * so a part of 1 row cannot be written). The TRAK chunk grows by 2 bytes per added event; its size and the FORM size follow.
 *
 * Not written, and named in `warnings`, never half-applied: a note moved to another row, a split with a 1-row part, a note
 * leaving 0-127, an instrument edit that does not cover its whole event or names an instrument
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

interface NoteEv { row: number; at: number; insAt: number; dur: number; rest?: boolean }

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
    out.push({ row, at: at + i, insAt, dur: Math.max(1, dur), rest: type === EVENT_REST });
    row += Math.max(1, dur);
  }
  return out;
}

/** Durations a TRAK event can hold, longest first, with their data (DURATION_TABLE index). */
const DURS = DURATION_TABLE.map((d, i) => ({ d, i })).filter((x) => x.d > 0).sort((a, b) => b.d - a.d);

/** `n` rows as table durations, longest first (null when it cannot be made, e.g. 1 row). */
function durations(n: number, memo = new Map<number, number[] | null>()): number[] | null {
  if (n === 0) return [];
  if (memo.has(n)) return memo.get(n) ?? null;
  let got: number[] | null = null;
  for (const { d, i } of DURS) {
    if (d > n) continue;
    const restOf = durations(n - d, memo);
    if (restOf) { got = [i, ...restOf]; break; }
  }
  memo.set(n, got);
  return got;
}

/** One `len`-row part of a split event: `type` (a note or a rest) for the first duration, rests for the remainder. */
function encodePart(type: number, len: number, highBits: number): number[] | null {
  const ds = durations(len);
  if (!ds) return null;
  return ds.flatMap((i, k) => (k === 0 ? [type, i | highBits] : [EVENT_REST, i]));
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
  // Events split by a note added inside them: replaced after every in-place edit, so the parts read the edited type byte.
  const splits: { ch: number; ev: NoteEv; adds: { k: number; type: number }[] }[] = [];

  for (let ch = 0; ch < blockRows.length; ch++) {
    const base = blockRows[ch];
    const now: TrackerCell[] = [];
    for (const p of songPositions) {
      const rows = edited[p]?.channels[ch]?.rows;
      if (rows) for (let r = 0; r < edited[p].length; r++) now.push(rows[r]);
    }
    const events = walkTrack(source, trackAddrs[ch], trackSizes[ch]);
    const notes = events.filter((n) => !n.rest);
    const restAt = new Map(events.filter((n) => n.rest).map((n) => [n.row, n]));
    const noteRows = new Set(notes.map((n) => n.row));
    const label = `voice ${ch + 1}`;

    for (let r = 0; r < Math.min(base.length, now.length); r++) {
      const add = now[r]?.note ?? 0;
      const rest = restAt.get(r);
      if (!noteRows.has(r) && add > 0 && add < 97 && rest) {
        // A rest event becomes a note event of the same duration: same length, stream stays as loaded.
        const gov = rest.insAt < 0 ? 0 : regs[source[rest.insAt + 1]] ?? 0;
        if (now[r].instrument !== 0 && now[r].instrument !== gov) warnings.push(`${label} row ${r}: the new note's instrument differs from the track's current instrument; not written`);
        else if (add + 11 > 127) warnings.push(`${label} row ${r}: note outside 0-127; not written`);
        else { poke(rest.at, add + 11); poke(rest.at + 1, source[rest.at + 1] & 0x0f); }
      } else if (!noteRows.has(r) && add > 0 && add < 97) {
        const ev = events.find((e) => e.row < r && r < e.row + e.dur);
        const gov = !ev || ev.insAt < 0 ? 0 : regs[source[ev.insAt + 1]] ?? 0;
        if (!ev) warnings.push(`${label} row ${r}: a note added past the end of the track changes its length; not written`);
        else if (now[r].instrument !== 0 && now[r].instrument !== gov) warnings.push(`${label} row ${r}: the new note's instrument differs from the track's current instrument; not written`);
        else if (add + 11 > 127) warnings.push(`${label} row ${r}: note outside 0-127; not written`);
        else {
          const sp = splits.find((x) => x.ev === ev) ?? splits[splits.push({ ch, ev, adds: [] }) - 1];
          sp.adds.push({ k: r - ev.row, type: add + 11 });
        }
      } else if (!noteRows.has(r) && add !== 0) warnings.push(`${label} row ${r}: a note-off where the track has no note is not written`);
    }

    const groups = new Map<number, { notes: NoteEv[]; want: Set<number> }>();
    for (const n of notes) {
      const was = base[n.row];
      const cell = now[n.row];
      if (!was || !cell) continue;
      if (cell.note === 0 || cell.note === 97) { poke(n.at, EVENT_REST); poke(n.at + 1, source[n.at + 1] & 0x0f); continue; }
      const type = source[n.at] + (cell.note - was.note);
      if (cell.note !== was.note) {
        // The import clamps MIDI-11 to 1-96; a delta on a clamped cell would land on the wrong pitch.
        if (was.note !== source[n.at] - 11) { warnings.push(`${label} row ${n.row}: the source note is outside the 1-96 range the grid shows; not written`); continue; }
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
  if (splits.length === 0) return { data: out, patched, warnings };

  // Encode each split, then grow the chunks: size fields first (in place), then the event bytes from the end of the file down,
  // so every offset still to be used sits below the bytes already moved.
  const grow: { at: number; bytes: number[] }[] = [];
  const delta = new Array<number>(trackAddrs.length).fill(0);
  for (const { ch, ev, adds } of splits) {
    const cuts = [0, ...adds.map((a) => a.k), ev.dur];
    const types = [out[ev.at], ...adds.map((a) => a.type)];
    const high = out[ev.at + 1] & 0xf0;
    const parts = types.map((t, q) => encodePart(t, cuts[q + 1] - cuts[q], q === 0 ? high : 0));
    if (parts.some((x) => !x)) {
      warnings.push(`voice ${ch + 1} row ${ev.row + adds[0].k}: a 1-row part has no SMUS duration; not written`);
      continue;
    }
    const bytes = parts.flat() as number[];
    grow.push({ at: ev.at, bytes });
    delta[ch] += bytes.length - 2;
    patched += bytes.length;
  }
  const put32 = (b: Uint8Array, o: number, v: number) => { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 0xff; b[o + 2] = (v >>> 8) & 0xff; b[o + 3] = v & 0xff; };
  for (let ch = 0; ch < trackAddrs.length; ch++) if (delta[ch]) put32(out, trackAddrs[ch] - 4, u32(out, trackAddrs[ch] - 4) + delta[ch]);
  const total = delta.reduce((a, b) => a + b, 0);
  if (total) put32(out, 4, u32(out, 4) + total);
  let data = out;
  for (const g of grow.sort((a, b) => b.at - a.at)) {
    const next = new Uint8Array(data.length + g.bytes.length - 2);
    next.set(data.subarray(0, g.at));
    next.set(g.bytes, g.at);
    next.set(data.subarray(g.at + 2), g.at + g.bytes.length);
    data = next;
  }
  return { data, patched, warnings };
}
