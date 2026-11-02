/**
 * Convert a per-frame SID register trace (SIDParser `traceSid`) into a
 * GoatTracker song (`GTSongData`): wave, pulse and filter tables, instruments,
 * patterns and orderlists.
 *
 * Reuses the trace decoders of sidTraceDecode.ts (gate segmentation, tuning,
 * instrument signatures, row grid) and the GT file model of GoatTrackerSid.ts.
 * The note segmentation, gate-per-frame wave program and pulse-run ideas follow
 * the register-trace approach of MagPlaySID-style SID-to-tracker converters;
 * the code here is written for this project.
 *
 * What the builder can express: a note per gate rise, the control byte of every
 * frame (waveform, ring, sync, test, gate fall), semitone arpeggio offsets
 * (upward), the pulse width (set plus constant-delta runs), a single global
 * filter program (chip 0), AD/SR at the note start. It cannot express vibrato
 * or slides between semitones, downward arpeggio offsets, AD/SR or master
 * volume changes inside a note, or filter changes before the first routed
 * note. Those are the frames the future raw override track must carry.
 */
import {
  type GTInstrument, type GTPlaySettings, type GTSongData,
  emptyGTInstrument, GT_FIRSTNOTE, GT_REST, GT_LOOPSONG,
} from './GoatTrackerSid';
import type { SidTrace } from './SIDParser';
import {
  segmentNotes, inferInstruments, fitGrid, rowOfFrame, MAX_INFERRED_INSTRUMENTS,
  type DecodedNote, type RowGrid,
} from './sidTraceDecode';

const TABLE_LIMIT = 255;
/** Pattern note byte that clears the gate (GoatTracker key-off). */
const GT_KEYOFF = 0xbe;
const PATTERN_ROWS = 32;
const MAX_PATTERNS = 208;
const MAX_ORDERLIST = 254;
const CMD_SETTEMPO = 0x0f;
const MAX_PROGRAM_FRAMES = [64, 32, 16, 8, 4, 2, 1];

export interface SidTraceGoatTracker {
  song: GTSongData;
  settings: GTPlaySettings;
  framesPerRow: number;
  /** Trace frame that GT frame 0 reproduces. */
  frameOffset: number;
  rows: number;
  noteCount: number;
  instrumentCount: number;
  /** Longest program length (frames) that fit the tables, and whether instruments fell back to one program per inferred instrument. */
  programFrames: number;
  sharedPrograms: boolean;
  warnings: string[];
}

interface NoteProgram {
  wave: Array<[number, number]>;
  pulse: Array<[number, number]>;
  firstwave: number;
}

interface Tables {
  left: number[];
  right: number[];
  index: Map<string, number>;
}

function newTable(): Tables { return { left: [], right: [], index: new Map() }; }

/** Append rows once; returns the 1-based pointer, 0 when the table would overflow. */
function addRows(t: Tables, rows: Array<[number, number]>): number {
  if (rows.length === 0) return 0;
  const key = rows.map((r) => `${r[0]}.${r[1]}`).join(',');
  const known = t.index.get(key);
  if (known !== undefined) return known;
  if (t.left.length + rows.length > TABLE_LIMIT) return -1;
  const ptr = t.left.length + 1;
  for (const [l, r] of rows) { t.left.push(l); t.right.push(r); }
  t.index.set(key, ptr);
  return ptr;
}

function gtNoteIndex(note: number): number { return note - 12; }

function waveLeft(control: number): number {
  if (control < 0x10) return 0xe0 | control;
  if (control >= 0xe0) return 0xd0 | (control & 0x0f);
  return control;
}

/** Wave rows: one per frame, trailing frames that repeat the last row dropped. */
function waveRows(trace: SidTrace, n: DecodedNote, last: number): Array<[number, number]> {
  const frames = trace.voices[n.voice];
  const base = n.frame.freq;
  const rows: Array<[number, number]> = [];
  let cur = 0;
  for (let f = n.start; f < last; f++) {
    const fr = frames[f];
    let right = 0x80;
    if (fr.freq > 0 && base > 0) {
      const semis = 12 * Math.log2(fr.freq / base);
      const off = Math.round(semis);
      if (Math.abs(semis - off) < 0.3 && off !== cur && off >= 0 && gtNoteIndex(n.note) + off <= 95) {
        right = off;
        cur = off;
      }
    }
    rows.push([waveLeft(fr.control), right]);
  }
  while (rows.length > 1) {
    const a = rows[rows.length - 1], b = rows[rows.length - 2];
    if (a[0] === b[0] && a[1] === 0x80) rows.pop(); else break;
  }
  return rows;
}

/** Pulse rows: a set row, then constant-delta runs; trailing constant frames dropped. */
function pulseRows(trace: SidTrace, n: DecodedNote, last: number): Array<[number, number]> {
  const frames = trace.voices[n.voice];
  const p: number[] = [];
  for (let f = n.start; f < last; f++) p.push(frames[f].pulse & 0xfff);
  let end = p.length;
  while (end > 1 && p[end - 1] === p[end - 2]) end--;
  const rows: Array<[number, number]> = [[0x80 | (p[0] >> 8), p[0] & 0xff]];
  let i = 0;
  while (i < end - 1) {
    const d = p[i + 1] - p[i];
    if (d < -128 || d > 127) {
      rows.push([0x80 | (p[i + 1] >> 8), p[i + 1] & 0xff]);
      i++;
      continue;
    }
    let run = 1;
    while (i + run < end - 1 && run < 0x7f && p[i + run + 1] - p[i + run] === d) run++;
    rows.push([run, d & 0xff]);
    i += run;
  }
  rows.push([0xff, 0]);
  return rows;
}

function programOf(trace: SidTrace, n: DecodedNote, nextStart: number, maxLen: number): NoteProgram {
  const frames = trace.voices[n.voice];
  let last = Math.min(nextStart, frames.length, n.start + maxLen);
  // A gate fall beyond the program is written as a key-off pattern row.
  if (last <= n.start) last = n.start + 1;
  const wave = waveRows(trace, n, last);
  wave.push([0xff, 0]);
  return { wave, pulse: pulseRows(trace, n, last), firstwave: frames[n.start].control };
}

/** Global filter program of chip 0, started by one chosen note. */
function filterProgram(trace: SidTrace, notes: DecodedNote[]): { rows: Array<[number, number]>; owner: DecodedNote } | null {
  const v = trace.voices[0];
  if (!v) return null;
  let fs = -1;
  for (let f = 0; f < v.length; f++) if ((v[f].resRoute & 7) !== 0) { fs = f; break; }
  if (fs < 0) return null;
  let owner: DecodedNote | null = null;
  for (const n of notes) {
    if (n.voice >= 3 || (v[Math.min(n.start, v.length - 1)].resRoute & (1 << n.voice)) === 0) continue;
    if (!owner || Math.abs(n.start - fs) < Math.abs(owner.start - fs)) owner = n;
  }
  if (!owner || Math.abs(owner.start - fs) > 8) return null;
  const rows: Array<[number, number]> = [];
  let f = Math.max(fs, owner.start);
  if (owner.start < fs) {
    let lead = fs - owner.start;
    while (lead > 0) { const k = Math.min(lead, 0x7f); rows.push([k, 0]); lead -= k; }
  }
  let curType = -1, curCtrl = -1;
  while (f < v.length && rows.length < TABLE_LIMIT - 3) {
    const typ = v[f].modeVol & 0x70, ctrl = v[f].resRoute;
    if (typ !== curType || ctrl !== curCtrl) {
      rows.push([0x80 | typ, ctrl], [0, v[f].cutoff]);
      curType = typ; curCtrl = ctrl;
      f++;
      continue;
    }
    const d = v[Math.min(f + 1, v.length - 1)].cutoff - v[f].cutoff;
    const sameMode = (g: number) => (v[g].modeVol & 0x70) === curType && v[g].resRoute === curCtrl;
    if (f + 1 >= v.length || !sameMode(f + 1)) { f++; continue; }
    if (d < -128 || d > 127) { rows.push([0, v[f + 1].cutoff]); f++; continue; }
    let run = 1;
    while (f + run + 1 < v.length && run < 0x7f && sameMode(f + run + 1) && v[f + run + 1].cutoff - v[f + run].cutoff === d) run++;
    rows.push([run, d & 0xff]);
    f += run;
  }
  // Trailing zero-delta modulation rows hold the last state: drop them.
  while (rows.length > 0 && rows[rows.length - 1][1] === 0 && rows[rows.length - 1][0] > 0 && rows[rows.length - 1][0] < 0x80) rows.pop();
  rows.push([0xff, 0]);
  return { rows, owner };
}

export function sidTraceToGoatTracker(trace: SidTrace, name = 'Imported SID'): SidTraceGoatTracker {
  const warnings: string[] = [];
  const notes = segmentNotes(trace.voices, trace.clock).filter((n) => gtNoteIndex(n.note) >= 0 && gtNoteIndex(n.note) <= 95);
  inferInstruments(notes);
  const grid: RowGrid = fitGrid(notes);
  let fpr = grid.framesPerRow;
  if (fpr < 3) {
    warnings.push(`row length ${fpr} frames is below the GT minimum tempo 3; tempo clamped to 3`);
    fpr = 3;
  }
  const g: RowGrid = { framesPerRow: fpr, origin: grid.origin };
  const frameOffset = g.origin;

  // Next note start per note on the same voice.
  const nextStart = new Map<DecodedNote, number>();
  for (let v = 0; v < trace.voices.length; v++) {
    const vn = notes.filter((n) => n.voice === v).sort((a, b) => a.start - b.start);
    vn.forEach((n, i) => nextStart.set(n, vn[i + 1]?.start ?? trace.frames));
  }
  const filter = filterProgram(trace, notes);

  // Representative note of every inferred instrument (shared-program fallback).
  const repOf = new Map<number, DecodedNote>();
  for (const n of notes) if (!repOf.has(n.instrument)) repOf.set(n.instrument, n);

  let built: { tables: Tables[]; instruments: GTInstrument[]; assign: Map<DecodedNote, number>; maxLen: number; shared: boolean } | null = null;
  let why = '';
  outer:
  for (const maxLen of MAX_PROGRAM_FRAMES) {
    for (const shared of [false, true]) {
      const wtbl = newTable(), ptbl = newTable(), ftbl = newTable(), stbl = newTable();
      const instruments: GTInstrument[] = [emptyGTInstrument()];
      const keyIndex = new Map<string, number>();
      const assign = new Map<DecodedNote, number>();
      let ok = true;
      if (filter && addRows(ftbl, filter.rows) < 0) { ok = false; why = `filter ${filter.rows.length}`; }
      for (const n of notes) {
        const src = shared ? repOf.get(n.instrument)! : n;
        const prog = programOf(trace, src, nextStart.get(src) ?? trace.frames, maxLen);
        const wp = addRows(wtbl, prog.wave), pp = addRows(ptbl, prog.pulse);
        if (wp < 0 || pp < 0) { ok = false; why = `${maxLen}/${shared} wave ${wtbl.left.length}+${prog.wave.length} pulse ${ptbl.left.length}+${prog.pulse.length}`; break; }
        const isFilterOwner = filter !== null && filter.owner === n;
        const fp = isFilterOwner ? ftbl.index.get(filter!.rows.map((r) => `${r[0]}.${r[1]}`).join(',')) ?? 0 : 0;
        const key = `${src.frame.ad}.${src.frame.sr}.${prog.firstwave}.${wp}.${pp}.${fp}`;
        let idx = keyIndex.get(key);
        if (idx === undefined) {
          idx = instruments.length;
          if (idx > MAX_INFERRED_INSTRUMENTS) { ok = false; why = `instruments ${idx}`; break; }
          const ins = emptyGTInstrument();
          ins.ad = src.frame.ad; ins.sr = src.frame.sr;
          ins.ptr = [wp, pp, fp, 0];
          ins.gatetimer = 0x40;
          ins.firstwave = prog.firstwave >= 0xfe ? 0x09 : prog.firstwave;
          ins.name = `SID ${idx}`.slice(0, 16);
          instruments.push(ins);
          keyIndex.set(key, idx);
        }
        assign.set(n, idx);
      }
      if (ok) { built = { tables: [wtbl, ptbl, ftbl, stbl], instruments, assign, maxLen, shared }; break outer; }
    }
  }
  if (!built) throw new Error(`sidTraceToGoatTracker: no program length fits the GoatTracker tables (${why})`);
  if (built.shared) warnings.push('more than 63 distinct programs: notes of one inferred instrument share one program');
  if (filter === null && trace.voices[0]?.some((fr) => (fr.resRoute & 7) !== 0)) warnings.push('filter used but no note starts it: filter program dropped');

  // Rows
  const lastFrame = trace.frames;
  const totalRows = Math.max(1, Math.ceil((lastFrame - frameOffset) / fpr));
  const channels = trace.voices.length;
  const grids: number[][][] = [];
  for (let c = 0; c < channels; c++) {
    grids.push(Array.from({ length: totalRows }, () => [GT_REST, 0, 0, 0]));
  }
  for (const n of notes) {
    const row = Math.min(totalRows - 1, rowOfFrame(g, n.start));
    grids[n.voice][row] = [GT_FIRSTNOTE + gtNoteIndex(n.note), built.assign.get(n)!, 0, 0];
  }
  for (const n of notes) {
    if (n.end === null) continue;
    const row = Math.min(totalRows - 1, rowOfFrame(g, n.end));
    if (row > rowOfFrame(g, n.start) && grids[n.voice][row][0] === GT_REST) grids[n.voice][row][0] = GT_KEYOFF;
  }
  grids[0][0] = [grids[0][0][0], grids[0][0][1], CMD_SETTEMPO, fpr];

  const patterns: number[][][] = [];
  const patIndex = new Map<string, number>();
  const orderlists: number[][] = [];
  for (let c = 0; c < channels; c++) {
    const order: number[] = [];
    for (let r = 0; r < totalRows; r += PATTERN_ROWS) {
      const chunk = grids[c].slice(r, r + PATTERN_ROWS);
      while (chunk.length < PATTERN_ROWS) chunk.push([GT_REST, 0, 0, 0]);
      const key = chunk.map((x) => x.join('.')).join('|');
      let idx = patIndex.get(key);
      if (idx === undefined) {
        if (patterns.length >= MAX_PATTERNS) { warnings.push('pattern limit reached: song truncated'); break; }
        idx = patterns.length;
        patterns.push(chunk);
        patIndex.set(key, idx);
      }
      if (order.length >= MAX_ORDERLIST - 2) { warnings.push('orderlist limit reached: song truncated'); break; }
      order.push(idx);
    }
    orderlists.push([...order, GT_LOOPSONG, 0]);
  }

  const instruments = built.instruments;
  const song: GTSongData = {
    name: name.slice(0, 31), author: '', copyright: '',
    orderlists: [orderlists],
    instruments,
    tables: built.tables.map((t) => ({ left: t.left, right: t.right })),
    patterns,
  };
  return {
    song,
    settings: { ntsc: trace.clock > 1_000_000, multiplier: 1, adparam: 0x0f00 },
    framesPerRow: fpr, frameOffset, rows: totalRows, noteCount: notes.length,
    instrumentCount: built.instruments.filter((i) => i.ad || i.sr || i.ptr.some((p) => p)).length,
    programFrames: built.maxLen, sharedPrograms: built.shared, warnings,
  };
}
