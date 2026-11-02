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

/** GT frequency table (gtultra-wasm/src/gplay.c freqtbllo/freqtblhi), 96 notes. */
const GT_FREQ_LO = [
  0x17, 0x27, 0x39, 0x4b, 0x5f, 0x74, 0x8a, 0xa1, 0xba, 0xd4, 0xf0, 0x0e,
  0x2d, 0x4e, 0x71, 0x96, 0xbe, 0xe8, 0x14, 0x43, 0x74, 0xa9, 0xe1, 0x1c,
  0x5a, 0x9c, 0xe2, 0x2d, 0x7c, 0xcf, 0x28, 0x85, 0xe8, 0x52, 0xc1, 0x37,
  0xb4, 0x39, 0xc5, 0x5a, 0xf7, 0x9e, 0x4f, 0x0a, 0xd1, 0xa3, 0x82, 0x6e,
  0x68, 0x71, 0x8a, 0xb3, 0xee, 0x3c, 0x9e, 0x15, 0xa2, 0x46, 0x04, 0xdc,
  0xd0, 0xe2, 0x14, 0x67, 0xdd, 0x79, 0x3c, 0x29, 0x44, 0x8d, 0x08, 0xb8,
  0xa1, 0xc5, 0x28, 0xcd, 0xba, 0xf1, 0x78, 0x53, 0x87, 0x1a, 0x10, 0x71,
  0x42, 0x89, 0x4f, 0x9b, 0x74, 0xe2, 0xf0, 0xa6, 0x0e, 0x33, 0x20, 0xff,
];
const GT_FREQ_HI = [
  0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x02,
  0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x03, 0x03, 0x03, 0x03, 0x03, 0x04,
  0x04, 0x04, 0x04, 0x05, 0x05, 0x05, 0x06, 0x06, 0x06, 0x07, 0x07, 0x08,
  0x08, 0x09, 0x09, 0x0a, 0x0a, 0x0b, 0x0c, 0x0d, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x13, 0x14, 0x15, 0x17, 0x18, 0x1a, 0x1b, 0x1d, 0x1f, 0x20,
  0x22, 0x24, 0x27, 0x29, 0x2b, 0x2e, 0x31, 0x34, 0x37, 0x3a, 0x3e, 0x41,
  0x45, 0x49, 0x4e, 0x52, 0x57, 0x5c, 0x62, 0x68, 0x6e, 0x75, 0x7c, 0x83,
  0x8b, 0x93, 0x9c, 0xa5, 0xaf, 0xb9, 0xc4, 0xd0, 0xdd, 0xea, 0xf8, 0xff,
];
export function gtFreq(index: number): number { return GT_FREQ_LO[index] | (GT_FREQ_HI[index] << 8); }

const WAVE_CMD_PORTAUP = 0xf1;
const WAVE_CMD_PORTADOWN = 0xf2;

/**
 * Wave rows: one per frame, trailing frames that repeat the last row dropped.
 * With a speed table, the GT channel frequency is modelled frame by frame
 * (note init writes freqtbl[note]; a note row writes freqtbl[note + offset])
 * and every frame whose traced frequency differs from the model, while the
 * waveform holds, becomes a wavetable portamento row (0xF1 up / 0xF2 down)
 * whose 16-bit speed-table entry is the exact delta (gplay.c WAVEEXEC adds
 * the speed to the frequency on that frame). This carries vibrato, slides,
 * non-semitone arpeggios and the source player's tuning.
 */
function waveRows(trace: SidTrace, n: DecodedNote, last: number, stbl: Tables | null): Array<[number, number]> {
  const frames = trace.voices[n.voice];
  const base = n.frame.freq;
  const gtNote = gtNoteIndex(n.note);
  const rows: Array<[number, number]> = [];
  let cur = 0;
  let model = gtFreq(gtNote);
  let wave = frames[n.start].control;
  // GT skips the wave and pulse tables on the note-init frame (gplay.c NEXTCHN
  // after note init): row 0 runs one frame after the gate rise.
  for (let f = n.start + 1; f < last; f++) {
    const fr = frames[f];
    let right = 0x80;
    let off = cur;
    if (fr.freq > 0 && base > 0) {
      const semis = 12 * Math.log2(fr.freq / base);
      const r = Math.round(semis);
      if (Math.abs(semis - r) < 0.3 && r !== cur && r >= 0 && gtNote + r <= 95) {
        right = r;
        off = r;
      }
    }
    const noteFreq = right === 0x80 ? model : gtFreq(gtNote + right);
    if (stbl && fr.control === wave && fr.freq !== noteFreq) {
      const d = (fr.freq - model) & 0xffff;
      const up = d < 0x8000;
      const speed = up ? d : 0x10000 - d;
      const idx = speed > 0 && speed < 0x8000 ? addRows(stbl, [[speed >> 8, speed & 0xff]]) : -1;
      if (idx > 0) {
        rows.push([up ? WAVE_CMD_PORTAUP : WAVE_CMD_PORTADOWN, idx]);
        model = fr.freq;
        continue;
      }
    }
    if (right !== 0x80) { cur = off; model = noteFreq; }
    wave = fr.control;
    rows.push([waveLeft(fr.control), right]);
  }
  while (rows.length > 1) {
    const a = rows[rows.length - 1], b = rows[rows.length - 2];
    if (a[0] < 0xf0 && a[0] === b[0] && a[1] === 0x80) rows.pop(); else break;
  }
  return rows;
}

/** Pulse rows: a set row, then constant-delta runs; trailing constant frames dropped. */
function pulseRows(trace: SidTrace, n: DecodedNote, last: number): Array<[number, number]> {
  const frames = trace.voices[n.voice];
  const p: number[] = [];
  for (let f = n.start + 1; f < last; f++) p.push(frames[f].pulse & 0xfff);
  if (p.length === 0) return [[0xff, 0]];
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

function programOf(trace: SidTrace, n: DecodedNote, nextStart: number, maxLen: number, stbl: Tables | null): NoteProgram {
  const frames = trace.voices[n.voice];
  let last = Math.min(nextStart, frames.length, n.start + maxLen);
  // A gate fall beyond the program is written as a key-off pattern row.
  if (last <= n.start) last = n.start + 1;
  const wave = waveRows(trace, n, last, stbl);
  wave.push([0xff, 0]);
  return { wave, pulse: pulseRows(trace, n, last), firstwave: frames[n.start].control };
}

/**
 * Global filter program of chip 0, started by one chosen note. The GT filter
 * table runs before the channel loop (gplay.c), so row 0 executes one frame
 * after the owner's note-init frame. Each set row pair ([0x80|type, route] +
 * [0, cutoff]) or modulation step consumes one frame; the GT cutoff is an
 * unsigned byte, so deltas wrap mod 256.
 */
function filterProgram(trace: SidTrace, notes: DecodedNote[]): { rows: Array<[number, number]>; owner: DecodedNote } | null {
  const v = trace.voices[0];
  if (!v) return null;
  let fs = -1;
  for (let f = 0; f < v.length; f++) if ((v[f].resRoute & 7) !== 0) { fs = f; break; }
  if (fs < 0) return null;
  let owner: DecodedNote | null = null;
  for (const n of notes) {
    // Routing is checked where the filter starts: a player may route a frame after the gate rise.
    if (n.voice >= 3 || n.start + 1 > fs || (v[fs].resRoute & (1 << n.voice)) === 0) continue;
    if (!owner || n.start > owner.start) owner = n;
  }
  if (!owner || fs - owner.start > 8) return null;
  const rows: Array<[number, number]> = [];
  let lead = fs - (owner.start + 1);
  while (lead > 0) { const k = Math.min(lead, 0x7f); rows.push([k, 0]); lead -= k; }
  let curType = -1, curCtrl = -1, cutoff = 0;
  const sameMode = (g: number) => (v[g].modeVol & 0x70) === curType && v[g].resRoute === curCtrl;
  let f = fs;
  while (f < v.length && rows.length < TABLE_LIMIT - 3) {
    if (!sameMode(f)) {
      curType = v[f].modeVol & 0x70; curCtrl = v[f].resRoute; cutoff = v[f].cutoff;
      rows.push([0x80 | curType, curCtrl], [0, cutoff]);
      f++;
      continue;
    }
    const d = (v[f].cutoff - cutoff) & 0xff;
    let k = 1;
    while (f + k < v.length && k < 0x7f && sameMode(f + k) && ((v[f + k].cutoff - v[f + k - 1].cutoff) & 0xff) === d) k++;
    rows.push([k, d]);
    cutoff = v[f + k - 1].cutoff;
    f += k;
  }
  // Trailing zero-delta modulation rows hold the last state: drop them.
  while (rows.length > 0 && rows[rows.length - 1][1] === 0 && rows[rows.length - 1][0] > 0 && rows[rows.length - 1][0] < 0x80) rows.pop();
  rows.push([0xff, 0]);
  return { rows, owner };
}

/**
 * Frame of the first row's note init in a GT replay: the play routine's first
 * call only initialises the song, and the channel tick starts at 6 - 1
 * (gplay.c song init, multiplier 1), so row 0 starts at the 6th call (index 5).
 */
export const GT_FIRST_ROW_FRAME = 5;

/** Hard restart before one note: frames of gate-off with a fixed ADSR before the gate rise. */
interface HardRestart { frames: number; adsr: number; gateOn: boolean }

function hardRestartOf(trace: SidTrace, n: DecodedNote, maxFrames: number): HardRestart {
  const v = trace.voices[n.voice];
  if (n.start === 0) return { frames: 0, adsr: -1, gateOn: false };
  const prev = v[n.start - 1];
  if (prev.control & 1) return { frames: 0, adsr: -1, gateOn: true };
  const adsr = (prev.ad << 8) | prev.sr;
  let k = 0;
  while (k < maxFrames && n.start - 1 - k >= 0) {
    const fr = v[n.start - 1 - k];
    if ((fr.control & 1) || ((fr.ad << 8) | fr.sr) !== adsr) break;
    k++;
  }
  // The ADSR must have been written k frames before the note (a change, not a held value).
  const before = n.start - 1 - k >= 0 ? v[n.start - 1 - k] : null;
  const written = before !== null && ((before.ad << 8) | before.sr) !== adsr;
  return { frames: written ? k : 0, adsr: written ? adsr : -1, gateOn: false };
}

function mostCommon(values: number[]): number | null {
  const count = new Map<number, number>();
  let best: number | null = null, bestN = 0;
  for (const x of values) {
    const c = (count.get(x) ?? 0) + 1;
    count.set(x, c);
    if (c > bestN) { bestN = c; best = x; }
  }
  return best;
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
  // Trace frame of GT replay snapshot 0: row 0 (trace frame origin) plays at GT_FIRST_ROW_FRAME.
  const frameOffset = g.origin - GT_FIRST_ROW_FRAME;

  // Hard restart: GT reads a row `gatetimer` frames before its note init and
  // then (gplay.c GETNEWNOTES) gates off and writes adparam, unless the
  // instrument's gatetimer has 0x40 (no hard restart) or 0x80 (gate off only).
  // The gatetimer must not exceed tempo - 1, or GT stops the song.
  const hr = new Map<DecodedNote, HardRestart>();
  for (const n of notes) hr.set(n, hardRestartOf(trace, n, Math.max(1, fpr - 1)));
  const hrNotes = notes.filter((n) => hr.get(n)!.frames > 0);
  const gateFrames = mostCommon(hrNotes.map((n) => hr.get(n)!.frames)) ?? 1;
  const adparam = mostCommon(hrNotes.filter((n) => hr.get(n)!.frames === gateFrames).map((n) => hr.get(n)!.adsr)) ?? 0x0f00;
  const gatetimerOf = (n: DecodedNote): number => {
    const h = hr.get(n)!;
    if (h.gateOn) return 0x40 | gateFrames;
    return (h.frames > 0 && h.adsr === adparam ? 0 : 0x80) | gateFrames;
  };

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
        // Exact frequency tracking is per pitch, so shared programs keep relative notes only.
        const prog = programOf(trace, src, nextStart.get(src) ?? trace.frames, maxLen, shared ? null : stbl);
        const wp = addRows(wtbl, prog.wave), pp = addRows(ptbl, prog.pulse);
        if (wp < 0 || pp < 0) { ok = false; why = `${maxLen}/${shared} wave ${wtbl.left.length}+${prog.wave.length} pulse ${ptbl.left.length}+${prog.pulse.length}`; break; }
        const isFilterOwner = filter !== null && filter.owner === n;
        const fp = isFilterOwner ? ftbl.index.get(filter!.rows.map((r) => `${r[0]}.${r[1]}`).join(',')) ?? 0 : 0;
        const gate = gatetimerOf(n);
        const key = `${src.frame.ad}.${src.frame.sr}.${prog.firstwave}.${wp}.${pp}.${fp}.${gate}`;
        let idx = keyIndex.get(key);
        if (idx === undefined) {
          idx = instruments.length;
          if (idx > MAX_INFERRED_INSTRUMENTS) { ok = false; why = `instruments ${idx}`; break; }
          const ins = emptyGTInstrument();
          ins.ad = src.frame.ad; ins.sr = src.frame.sr;
          ins.ptr = [wp, pp, fp, 0];
          ins.gatetimer = gate;
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
  const totalRows = Math.max(1, Math.ceil((lastFrame - g.origin) / fpr));
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
    // A gate fall that is the next note's hard restart is not a key-off.
    if (n.end >= (nextStart.get(n) ?? trace.frames) - gateFrames) continue;
    // GT reads a key-off row `gateFrames` frames before the row frame.
    const row = Math.min(totalRows - 1, rowOfFrame(g, n.end + gateFrames));
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
    settings: { ntsc: trace.clock > 1_000_000, multiplier: 1, adparam },
    framesPerRow: fpr, frameOffset, rows: totalRows, noteCount: notes.length,
    instrumentCount: built.instruments.filter((i) => i.ad || i.sr || i.ptr.some((p) => p)).length,
    programFrames: built.maxLen, sharedPrograms: built.shared, warnings,
  };
}
