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
  segmentNotes, inferInstruments, fitGrid, rowOfFrame, programControl, MAX_INFERRED_INSTRUMENTS,
  type DecodedNote, type RowGrid,
} from './sidTraceDecode';

const TABLE_LIMIT = 255;
/** Pattern note byte that clears the gate (GoatTracker key-off). */
const GT_KEYOFF = 0xbe;
/** Pattern note byte that sets the gate again without a note init (GoatTracker key-on). */
const GT_KEYON = 0xbf;
/** Pattern lengths tried in order; the first that fits the pattern and orderlist limits wins (32 is the GT default). */
const PATTERN_ROWS_CANDIDATES = [32, 16, 64, 8];
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
  /** Row index the closing 0xFF row jumps back to; -1 stops the table. */
  waveLoop: number;
  pulseLoop: number;
  firstwave: number;
}

interface Tables {
  left: number[];
  right: number[];
  index: Map<string, number>;
}

function newTable(): Tables { return { left: [], right: [], index: new Map() }; }

/**
 * Append rows once; returns the 1-based pointer, -1 when the table would
 * overflow. With `loop` >= 0 the last row is a 0xFF jump whose target is the
 * row `loop` of this block (GT table pointers are absolute and 1-based).
 */
function addRows(t: Tables, rows: Array<[number, number]>, loop = -1): number {
  if (rows.length === 0) return 0;
  const key = rows.map((r) => `${r[0]}.${r[1]}`).join(',') + (loop >= 0 ? `@${loop}` : '');
  const known = t.index.get(key);
  if (known !== undefined) return known;
  if (t.left.length + rows.length > TABLE_LIMIT) return -1;
  const ptr = t.left.length + 1;
  for (const [l, r] of rows) { t.left.push(l); t.right.push(r); }
  if (loop >= 0) t.right[t.right.length - 1] = ptr + loop;
  t.index.set(key, ptr);
  return ptr;
}

function cloneTable(t: Tables): Tables { return { left: [...t.left], right: [...t.right], index: new Map(t.index) }; }

/** Frames scanned past the program length to find a repeating tail. */
const LOOP_SCAN_FRAMES = 512;

/**
 * Best loop of `s`: rows [0, start + period) played once, then
 * [start, start + period) repeated. A loop is kept when it reproduces more of
 * `s` than a cut at `maxSpan` would (`end`: the first entry the loop gets
 * wrong), holds for at least two periods, and fits `maxSpan` rows. Among
 * equal ends the shortest loop wins. The entries after `end` (gate fall,
 * release) are left to the pattern's key-off and the next note.
 */
function periodicLoop(s: string[], maxSpan: number): { start: number; period: number; end: number } | null {
  let best: { start: number; period: number; end: number } | null = null;
  for (let p = 1; p <= maxSpan && 2 * p <= s.length; p++) {
    let i = 0;
    while (i + p < s.length) {
      if (s[i] !== s[i + p]) { i++; continue; }
      const a = i;
      while (i + p < s.length && s[i] === s[i + p]) i++;
      const e = i + p;
      if (a + p > maxSpan || e - a < 2 * p || e <= maxSpan) continue;
      if (!best || e > best.end || (e === best.end && a + p < best.start + best.period)) best = { start: a, period: p, end: e };
    }
  }
  return best;
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

/** Frequency tracking of a wave program: exact per-pitch deltas, or note-relative speeds that serve every pitch. */
type FreqMode = 'exact' | 'relative';

/** Largest right shift tried for a note-relative speed (gplay.c `speed >>= rtable[STBL]`). */
const MAX_REL_SHIFT = 8;

/**
 * Wave rows: one per frame, trailing frames that repeat the last row dropped.
 * With a speed table, the GT channel frequency is modelled frame by frame
 * (note init writes freqtbl[note]; a note row writes freqtbl[note + offset])
 * and every frame whose traced frequency differs from the model, while the
 * waveform holds, becomes a wavetable portamento row (0xF1 up / 0xF2 down).
 *
 * 'exact': the 16-bit speed-table entry is the exact delta (gplay.c WAVEEXEC
 * adds the speed to the frequency on that frame). This carries vibrato,
 * slides, non-semitone arpeggios and the source player's tuning, for one pitch.
 *
 * 'relative': the entry is [0x80, shift]; gplay.c then uses
 * (freqtbl[lastnote + 1] - freqtbl[lastnote]) >> shift, a fraction of the
 * semitone step at the playing note, so one program serves every pitch. The
 * traced frequency is scaled to GT tuning (freq * freqtbl[note] / note freq)
 * and the move whose result is nearest is chosen. lastnote is only set by a
 * wavetable note row (gplay.c WAVEEXEC), so frame 1 is a note row (offset 0).
 */
function waveRows(trace: SidTrace, n: DecodedNote, last: number, stbl: Tables | null, mode: FreqMode = 'exact', trim = true): Array<[number, number]> {
  const frames = trace.voices[n.voice];
  const base = n.frame.freq;
  const gtNote = gtNoteIndex(n.note);
  const rows: Array<[number, number]> = [];
  let cur = 0;
  let model = gtFreq(gtNote);
  let lastnote = gtNote;
  let wave = frames[n.start].control;
  const scale = base > 0 ? gtFreq(gtNote) / base : 1;
  // GT skips the wave and pulse tables on the note-init frame (gplay.c NEXTCHN
  // after note init): row 0 runs one frame after the gate rise.
  for (let f = n.start + 1; f < last; f++) {
    const fr = frames[f];
    const control = programControl(n, frames, f);
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
    if (mode === 'relative' && f === n.start + 1 && right === 0x80) right = cur;
    const noteFreq = right === 0x80 ? model : gtFreq(gtNote + right);
    if (stbl && mode === 'exact' && control === wave && fr.freq !== noteFreq) {
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
    if (stbl && mode === 'relative' && right === 0x80 && control === wave && fr.freq > 0 && lastnote < 95) {
      const target = Math.round(fr.freq * scale);
      const step = gtFreq(lastnote + 1) - gtFreq(lastnote);
      let best = Math.abs(target - model), bestShift = -1, bestUp = true;
      for (let sh = 0; sh <= MAX_REL_SHIFT; sh++) {
        const sp = step >> sh;
        if (sp === 0) break;
        for (const up of [true, false]) {
          const err = Math.abs(target - (up ? model + sp : model - sp));
          if (err < best) { best = err; bestShift = sh; bestUp = up; }
        }
      }
      const idx = bestShift >= 0 ? addRows(stbl, [[0x80, bestShift]]) : -1;
      if (idx > 0) {
        rows.push([bestUp ? WAVE_CMD_PORTAUP : WAVE_CMD_PORTADOWN, idx]);
        model = (model + (bestUp ? 1 : -1) * (step >> bestShift)) & 0xffff;
        continue;
      }
    }
    if (right !== 0x80) { cur = off; model = noteFreq; lastnote = gtNote + right; }
    wave = control;
    rows.push([waveLeft(control), right]);
  }
  while (trim && rows.length > 1) {
    const a = rows[rows.length - 1], b = rows[rows.length - 2];
    if (a[0] < 0xf0 && a[0] === b[0] && a[1] === 0x80) rows.pop(); else break;
  }
  return rows;
}

/** GT pulse modulation wraps at 12 bits (gplay.c PULSEEXEC: pulse &= 0xfff). */
function pulseDelta(p: number[], i: number): number { return ((p[i + 1] - p[i] + 0x800) & 0xfff) - 0x800; }

/** Rows taking the pulse from p[from] to p[to], one frame per step. */
function pushPulseSteps(rows: Array<[number, number]>, p: number[], from: number, to: number): void {
  let i = from;
  while (i < to) {
    const d = pulseDelta(p, i);
    if (d < -128 || d > 127) {
      rows.push([0x80 | (p[i + 1] >> 8), p[i + 1] & 0xff]);
      i++;
      continue;
    }
    let run = 1;
    while (i + run < to && run < 0x7f && pulseDelta(p, i + run) === d) run++;
    rows.push([run, d & 0xff]);
    i += run;
  }
}

function pulseValues(trace: SidTrace, n: DecodedNote, last: number): number[] {
  const frames = trace.voices[n.voice];
  const p: number[] = [];
  for (let f = n.start + 1; f < last; f++) p.push(frames[f].pulse & 0xfff);
  return p;
}

/** Pulse rows: a set row, then constant-delta runs; trailing constant frames dropped. */
function pulseRows(trace: SidTrace, n: DecodedNote, last: number): Array<[number, number]> {
  const p = pulseValues(trace, n, last);
  if (p.length === 0) return [[0xff, 0]];
  let end = p.length;
  while (end > 1 && p[end - 1] === p[end - 2]) end--;
  const rows: Array<[number, number]> = [[0x80 | (p[0] >> 8), p[0] & 0xff]];
  pushPulseSteps(rows, p, 0, end - 1);
  rows.push([0xff, 0]);
  return rows;
}

/**
 * Looping pulse rows when the pulse steps repeat: the set row, the steps up
 * to the repeat, one period of steps, then a jump back to the period's first
 * row. Every step of the period must be a modulation row (a set row would
 * break the wrap-around), and the period must move the pulse.
 */
function pulseLoopRows(trace: SidTrace, n: DecodedNote, scanEnd: number, maxLen: number): { rows: Array<[number, number]>; loop: number } | null {
  const p = pulseValues(trace, n, scanEnd);
  if (p.length < 3) return null;
  const steps = Array.from({ length: p.length - 1 }, (_, i) => pulseDelta(p, i));
  const tail = periodicLoop(steps.map(String), maxLen - 1);
  if (!tail) return null;
  const period = steps.slice(tail.start, tail.start + tail.period);
  if (period.every((d) => d === 0) || period.some((d) => d < -128 || d > 127)) return null;
  const rows: Array<[number, number]> = [[0x80 | (p[0] >> 8), p[0] & 0xff]];
  pushPulseSteps(rows, p, 0, tail.start);
  const loop = rows.length;
  pushPulseSteps(rows, p, tail.start, tail.start + tail.period);
  rows.push([0xff, 0]);
  return { rows, loop };
}

/**
 * Looping wave rows when the per-frame rows repeat (vibrato, arpeggio, slide).
 * The scan runs on a copy of the speed table; the kept rows are then rebuilt
 * against the real one (waveRows is causal, so the indices match).
 */
function waveLoopRows(trace: SidTrace, n: DecodedNote, scanEnd: number, maxLen: number, stbl: Tables | null, mode: FreqMode): { rows: Array<[number, number]>; loop: number } | null {
  const scan = waveRows(trace, n, scanEnd, stbl ? cloneTable(stbl) : null, mode, false);
  const tail = periodicLoop(scan.map((r) => `${r[0]}.${r[1]}`), maxLen);
  if (!tail) return null;
  const period = scan.slice(tail.start, tail.start + tail.period);
  const still = period.every((r) => r[0] < 0xf0 && r[1] === 0x80 && r[0] === period[0][0]);
  if (still) return null;
  const rows = waveRows(trace, n, n.start + 1 + tail.start + tail.period, stbl, mode, false);
  rows.push([0xff, 0]);
  return { rows, loop: tail.start };
}

function programOf(trace: SidTrace, n: DecodedNote, nextStart: number, maxLen: number, stbl: Tables | null, mode: FreqMode = 'exact'): NoteProgram {
  const frames = trace.voices[n.voice];
  let last = Math.min(nextStart, frames.length, n.start + maxLen);
  // A gate fall beyond the program is written as a key-off pattern row.
  if (last <= n.start) last = n.start + 1;
  const scanEnd = Math.min(nextStart, frames.length, n.start + 1 + LOOP_SCAN_FRAMES);
  const firstwave = frames[n.start].control;
  // A repeating tail loops with a 0xFF jump row instead of stopping at maxLen.
  const wl = waveLoopRows(trace, n, scanEnd, maxLen, stbl, mode);
  const pl = pulseLoopRows(trace, n, scanEnd, maxLen);
  let wave: Array<[number, number]>;
  if (wl) wave = wl.rows;
  else { wave = waveRows(trace, n, last, stbl, mode); wave.push([0xff, 0]); }
  return {
    wave, waveLoop: wl ? wl.loop : -1,
    pulse: pl ? pl.rows : pulseRows(trace, n, last), pulseLoop: pl ? pl.loop : -1,
    firstwave,
  };
}

/** Content key of a program as the tables store it (rows plus loop target). */
function programKey(src: DecodedNote, prog: NoteProgram): string {
  const rows = (r: Array<[number, number]>) => r.map((x) => `${x[0]}.${x[1]}`).join(',');
  return `${src.frame.ad}.${src.frame.sr}.${prog.firstwave}|${rows(prog.wave)}@${prog.waveLoop}|${rows(prog.pulse)}@${prog.pulseLoop}`;
}

/** Append rows; on a later failure `undo` takes them out again. */
function addRowsUndoable(t: Tables, rows: Array<[number, number]>, loop: number): { ptr: number; undo: () => void } {
  const before = t.left.length;
  const key = rows.map((r) => `${r[0]}.${r[1]}`).join(',') + (loop >= 0 ? `@${loop}` : '');
  const fresh = !t.index.has(key);
  const ptr = addRows(t, rows, loop);
  return {
    ptr,
    undo: () => {
      if (!fresh || ptr <= 0) return;
      t.left.length = before; t.right.length = before; t.index.delete(key);
    },
  };
}

/**
 * Register changes a row makes: a pulse modulation row one per frame of its
 * run (none with a zero delta), a pulse set row one; a wave command row
 * (portamento) one, a wave row one when it differs from the row before. The
 * end row none.
 */
function rowChanges(rows: Array<[number, number]>, i: number, pulse: boolean): number {
  const r = rows[i];
  if (r[0] === 0xff) return 0;
  if (pulse) return r[0] > 0 && r[0] < 0x80 ? (r[1] === 0 ? 0 : r[0]) : 1;
  if (r[0] >= 0xf0) return 1;
  return i === 0 || rows[i - 1][0] !== r[0] || rows[i - 1][1] !== r[1] ? 1 : 0;
}

/** Register changes from the start where two row lists agree. */
function agreedChanges(a: Array<[number, number]>, b: Array<[number, number]>, pulse: boolean): number {
  let n = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) break;
    n += rowChanges(a, i, pulse);
  }
  return n;
}

/** Register changes of `own` that `other` makes the same way from the note start (ADSR and first waveform must match). */
function programAgreement(own: { src: DecodedNote; prog: NoteProgram }, other: { src: DecodedNote; prog: NoteProgram }): number {
  if (own.src.frame.ad !== other.src.frame.ad || own.src.frame.sr !== other.src.frame.sr || own.prog.firstwave !== other.prog.firstwave) return 0;
  return agreedChanges(own.prog.wave, other.prog.wave, false) + agreedChanges(own.prog.pulse, other.prog.pulse, true);
}

/** Clusters of one instrument tried as its fallback, by note count. */
const FALLBACK_CANDIDATES = 16;

/**
 * Shared programs, grouped by content: every note's note-relative program is
 * built, notes with the same program form a cluster, and each inferred
 * instrument starts with the cluster that reproduces most register changes
 * of its notes (its fallback). Further clusters are admitted by the register
 * changes they win over the fallback while the wave and pulse tables and the 63
 * instruments hold; a note whose cluster is not
 * admitted plays its instrument's fallback. Returns the program each note
 * plays and the note whose ADSR it uses, or null when the fallbacks alone do
 * not fit.
 */
function clusterPrograms(
  trace: SidTrace, notes: DecodedNote[], nextStart: Map<DecodedNote, number>, maxLen: number,
  wtbl: Tables, ptbl: Tables, stbl: Tables, instrKeyOf: (n: DecodedNote) => string,
): { play: Map<DecodedNote, { src: DecodedNote; prog: NoteProgram }>; clusters: number; distinct: number } | null {
  const clusters = new Map<string, { src: DecodedNote; prog: NoteProgram; notes: DecodedNote[]; instrument: number }>();
  const clusterOf = new Map<DecodedNote, string>();
  for (const n of notes) {
    const prog = programOf(trace, n, nextStart.get(n) ?? trace.frames, maxLen, stbl, 'relative');
    // The cluster is per inferred instrument: its fallback must cover every note of it.
    const key = `${n.instrument}#${programKey(n, prog)}`;
    let c = clusters.get(key);
    if (!c) { c = { src: n, prog, notes: [], instrument: n.instrument }; clusters.set(key, c); }
    c.notes.push(n);
    clusterOf.set(n, key);
  }
  // Fallback of an instrument: the program that reproduces most register changes of its notes.
  const byInstrument = new Map<number, string[]>();
  for (const [key, c] of clusters) {
    const l = byInstrument.get(c.instrument);
    if (l) l.push(key); else byInstrument.set(c.instrument, [key]);
  }
  const fallback = new Map<number, string>();
  for (const [instrument, keys] of byInstrument) {
    const candidates = [...keys].sort((a, b) => clusters.get(b)!.notes.length - clusters.get(a)!.notes.length).slice(0, FALLBACK_CANDIDATES);
    let best = candidates[0], bestFrames = -1;
    for (const cand of candidates) {
      let frames = 0;
      for (const k of keys) frames += clusters.get(k)!.notes.length * programAgreement(clusters.get(k)!, clusters.get(cand)!);
      if (frames > bestFrames) { bestFrames = frames; best = cand; }
    }
    fallback.set(instrument, best);
  }
  // Instrument keys in use (program content, gate timer, filter pointer) and their note counts.
  const used = new Map<string, number>();
  const ikey = (n: DecodedNote, cluster: string) => `${programKey(clusters.get(cluster)!.src, clusters.get(cluster)!.prog)}|${instrKeyOf(n)}`;
  const move = (n: DecodedNote, from: string | null, to: string) => {
    if (from !== null) { const k = ikey(n, from); const c = used.get(k)! - 1; if (c === 0) used.delete(k); else used.set(k, c); }
    const k = ikey(n, to); used.set(k, (used.get(k) ?? 0) + 1);
  };
  const playing = new Map<DecodedNote, string>();
  const admit = (key: string): boolean => {
    const c = clusters.get(key)!;
    const w = addRowsUndoable(wtbl, c.prog.wave, c.prog.waveLoop);
    const p = addRowsUndoable(ptbl, c.prog.pulse, c.prog.pulseLoop);
    if (w.ptr < 0 || p.ptr < 0) { p.undo(); w.undo(); return false; }
    return true;
  };
  for (const key of fallback.values()) {
    if (!admit(key)) return null;
  }
  for (const n of notes) { const f = fallback.get(n.instrument)!; playing.set(n, f); move(n, null, f); }
  if (used.size > MAX_INFERRED_INSTRUMENTS) return null;
  let admitted = fallback.size;
  // Further clusters by the register changes they win over their fallback.
  const gain = (k: string): number => {
    const c = clusters.get(k)!;
    return c.notes.length * (programAgreement(c, c) - programAgreement(c, clusters.get(fallback.get(c.instrument)!)!));
  };
  const rest = [...clusters.keys()].filter((k) => fallback.get(clusters.get(k)!.instrument) !== k)
    .map((k) => ({ k, g: gain(k) })).sort((a, b) => b.g - a.g).map((x) => x.k);
  for (const key of rest) {
    const c = clusters.get(key)!;
    for (const n of c.notes) move(n, playing.get(n)!, key);
    if (used.size > MAX_INFERRED_INSTRUMENTS || !admit(key)) {
      for (const n of c.notes) move(n, key, playing.get(n)!);
      continue;
    }
    for (const n of c.notes) playing.set(n, key);
    admitted++;
  }
  const play = new Map<DecodedNote, { src: DecodedNote; prog: NoteProgram }>();
  for (const n of notes) { const c = clusters.get(playing.get(n)!)!; play.set(n, { src: c.src, prog: c.prog }); }
  return { play, clusters: admitted, distinct: clusters.size };
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

/**
 * Chunk every channel's row grid into patterns of `rows` rows and dedupe them.
 * Reports whether the GT limits (208 patterns, 254 orderlist bytes) were exceeded.
 */
function packPatterns(grids: number[][][], totalRows: number, rows: number): { patterns: number[][][]; orders: number[][]; overflow: 'pattern' | 'orderlist' | null } {
  const patterns: number[][][] = [];
  const patIndex = new Map<string, number>();
  const orders: number[][] = [];
  let overflow: 'pattern' | 'orderlist' | null = null;
  for (const grid of grids) {
    const order: number[] = [];
    for (let r = 0; r < totalRows; r += rows) {
      const chunk = grid.slice(r, r + rows);
      while (chunk.length < rows) chunk.push([GT_REST, 0, 0, 0]);
      const key = chunk.map((x) => x.join('.')).join('|');
      let idx = patIndex.get(key);
      if (idx === undefined) {
        if (patterns.length >= MAX_PATTERNS) { overflow = overflow ?? 'pattern'; break; }
        idx = patterns.length;
        patterns.push(chunk);
        patIndex.set(key, idx);
      }
      if (order.length >= MAX_ORDERLIST - 2) { overflow = overflow ?? 'orderlist'; break; }
      order.push(idx);
    }
    orders.push(order);
  }
  return { patterns, orders, overflow };
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

  const filterPtrOf = (n: DecodedNote, ftbl: Tables): number =>
    filter !== null && filter.owner === n ? ftbl.index.get(filter.rows.map((r) => `${r[0]}.${r[1]}`).join(',')) ?? 0 : 0;

  let built: { tables: Tables[]; instruments: GTInstrument[]; assign: Map<DecodedNote, number>; maxLen: number; shared: boolean; clusters: number; distinct: number } | null = null;
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
      // Exact frequency tracking is per pitch, so shared programs use note-relative speeds,
      // grouped by content.
      const clustered = ok && shared
        ? clusterPrograms(trace, notes, nextStart, maxLen, wtbl, ptbl, stbl, (n) => `${filterPtrOf(n, ftbl)}.${gatetimerOf(n)}`)
        : null;
      if (ok && shared && !clustered) { ok = false; why = `${maxLen}/shared: fallback programs do not fit`; }
      for (const n of ok ? notes : []) {
        const { src, prog } = clustered
          ? clustered.play.get(n)!
          : { src: n, prog: programOf(trace, n, nextStart.get(n) ?? trace.frames, maxLen, stbl, 'exact') };
        const wp = addRows(wtbl, prog.wave, prog.waveLoop), pp = addRows(ptbl, prog.pulse, prog.pulseLoop);
        if (wp < 0 || pp < 0) { ok = false; why = `${maxLen}/${shared} wave ${wtbl.left.length}+${prog.wave.length} pulse ${ptbl.left.length}+${prog.pulse.length}`; break; }
        const fp = filterPtrOf(n, ftbl);
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
      if (ok) {
        built = { tables: [wtbl, ptbl, ftbl, stbl], instruments, assign, maxLen, shared, clusters: clustered?.clusters ?? 0, distinct: clustered?.distinct ?? 0 };
        break outer;
      }
    }
  }
  if (!built) throw new Error(`sidTraceToGoatTracker: no program length fits the GoatTracker tables (${why})`);
  if (built.shared && built.clusters < built.distinct) {
    warnings.push(`more than 63 distinct programs: ${built.clusters} of ${built.distinct} note-relative programs kept, other notes play their instrument's closest one`);
  }
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
  // A re-gate inside a note: KEYOFF then KEYON, read at the same tick as a key-off.
  for (const n of notes) {
    for (const { off, on } of n.regates) {
      const offRow = Math.min(totalRows - 1, rowOfFrame(g, off + gateFrames));
      const onRow = Math.min(totalRows - 1, rowOfFrame(g, on + gateFrames));
      if (offRow <= rowOfFrame(g, n.start) || onRow <= offRow) continue;
      if (grids[n.voice][offRow][0] !== GT_REST || grids[n.voice][onRow][0] !== GT_REST) continue;
      grids[n.voice][offRow][0] = GT_KEYOFF;
      grids[n.voice][onRow][0] = GT_KEYON;
    }
  }
  grids[0][0] = [grids[0][0][0], grids[0][0][1], CMD_SETTEMPO, fpr];

  // Pattern length is a free choice: a tune whose repeats do not align to 32 rows
  // can exceed the 208-pattern limit at 32 and fit at 16 or 8.
  let packed = packPatterns(grids, totalRows, PATTERN_ROWS_CANDIDATES[0]);
  for (const rows of PATTERN_ROWS_CANDIDATES) {
    const trial = packPatterns(grids, totalRows, rows);
    if (trial.overflow === null) { packed = trial; break; }
  }
  if (packed.overflow === 'pattern') warnings.push('pattern limit reached: song truncated');
  if (packed.overflow === 'orderlist') warnings.push('orderlist limit reached: song truncated');
  const patterns = packed.patterns;
  const orderlists = packed.orders.map((order) => [...order, GT_LOOPSONG, 0]);

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
