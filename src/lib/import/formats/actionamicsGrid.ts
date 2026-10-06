/**
 * actionamicsGrid.ts - the Actionamics song as the replayer walks it.
 *
 * The replayer (actionamics-wasm, act_play_tick) reads one row per `speed`
 * ticks from all four voices at once:
 *   - a position gives each voice a track plus a note transpose and an
 *     instrument transpose; a track is read from its first row at every new
 *     position;
 *   - a position is `number_of_rows` rows (64 at the start of the song). The
 *     row counter is checked right after the rows are read, BEFORE the row's
 *     effects run, so
 *       set rows (0x75) takes effect at the check of the NEXT row, and stays
 *       for every later position;
 *       break (0x7B) sets the counter to rows-1: the position ends after the
 *       next row is read. The counter is not reset by a position change, so
 *       a break on the last row of a position makes the next position one
 *       row long;
 *   - a note row plays act_periods[note + position note transpose +
 *     instrument note transpose + the first arpeggio value of the sample];
 *     the instrument is the last instrument byte any row of the voice named
 *     (+ the position's instrument transpose, taken when the byte is read),
 *     held across rows and positions; its sample is the first entry of its
 *     sample list.
 * A grid pattern is one visit of one position, in song order, `rows` rows
 * long. Notes are ProTracker named from the table period (856 = C-1 = 13).
 */
import type { TrackerCell } from '@/types';
import {
  astTrackRows, decodeActionamicsModule, encodeActionamicsModule, type ActionamicsModule, type AstTrackEvent,
} from './ActionamicsModule';
import { AST_FX_MAX, AST_FX_MIN, astEffectByte, astEffectType } from './actionamicsEffectGlyphs';

/** act_periods: index = the note index the replayer looks up (0 = none). */
export const AST_PERIODS: readonly number[] = [
  0,
  5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840, 3816,
  3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1808,
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 904,
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  107, 101, 95,
];

/** Table index 22 (period 1712) is note 1 (C-0): 856 = 13 = C-1. */
export const AST_NOTE_OFFSET = 21;

export interface AstGridCell {
  /** The cell the grid shows. */
  cell: TrackerCell;
  /** The event the row starts, or null (an empty row). */
  event: AstTrackEvent | null;
  /** The table index the row plays (0 when it starts no note). */
  index: number;
  /** The sample the row starts (-1 when it starts no note). */
  sample: number;
  /** The instrument (0-based) the voice held entering the row, -1 for none yet. */
  heldBefore: number;
}

export interface AstStep {
  /** The song position this visit plays. */
  position: number;
  /** Rows played. */
  rows: number;
  /** Per voice, per row. */
  voices: AstGridCell[][];
  /** The track each voice reads. */
  tracks: number[];
  /** Each voice's note and instrument transpose at this position. */
  transposes: Array<{ note: number; instrument: number }>;
}

export interface AstWalk {
  steps: AstStep[];
  /** Positions reached again with different rows-state than their first visit (the first visit is shown). */
  conflicts: number[];
  /** Note rows whose table index is outside the table (the replayer reads past it). */
  outOfTable: number;
  /** Rows read past the end of a track's data. */
  overrun: number;
}

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

const MAX_ROWS = 256;
const MAX_VISITS = 512;

/** The song the replayer plays from sub-song `subsong`'s start, one step per position. */
export function walkActionamicsSong(m: ActionamicsModule, subsong = 0): AstWalk {
  const info = m.songs[subsong];
  const walk: AstWalk = { steps: [], conflicts: [], outOfTable: 0, overrun: 0 };
  if (!info) return walk;

  let rowsN = 64;       // number_of_rows
  let crp = 0;          // current_row_position (u8)
  let speed = info.speed;
  const held: number[] = [-1, -1, -1, -1];   // the instrument each voice holds
  const firstVisit = new Map<number, string>();
  let pos = info.start;

  for (let visit = 0; visit < MAX_VISITS; visit++) {
    const state = `${rowsN}:${crp}`;
    const seen = firstVisit.get(pos);
    if (seen !== undefined) {
      if (seen !== state) walk.conflicts.push(pos);
      break;
    }
    firstVisit.set(pos, state);

    const posInfo = m.positions.map((v) => v[pos]);
    if (posInfo.some((p) => !p)) break;
    const trackRows = posInfo.map((p) => astTrackRows(m.tracks[p.track] ?? { events: [], tail: [] }));
    const voices: AstGridCell[][] = [[], [], [], []];

    for (let k = 0; k < MAX_ROWS; k++) {
      const events: Array<AstTrackEvent | null> = [];
      for (let v = 0; v < 4; v++) {
        if (k >= trackRows[v].length) walk.overrun++;
        const ev = trackRows[v][k] ?? null;
        events.push(ev);
        voices[v].push(cellOf(m, ev, posInfo[v], held, v, walk));
      }
      crp = (crp + 1) & 0xff;
      const ends = crp === (rowsN & 0xff);
      if (ends) crp = 0;
      // The row's effects run after the check: they act on the next row, or on
      // the next position when this row ended it.
      let breaks = false;
      for (const ev of events) {
        const fx = ev && ev.effect !== null && ev.effect >= 0x70 ? ev.effect : 0;
        if (fx === 0x75) rowsN = ev!.arg;
        else if (fx === 0x7b) { crp = (rowsN - 1) & 0xff; breaks = true; }
        else if (fx === 0x7f && ev!.arg < 31) speed = ev!.arg;
      }
      // The row's later ticks run the effects again: a break sees the final row count.
      if (breaks && speed > 1) crp = (rowsN - 1) & 0xff;
      if (ends) {
        walk.steps.push({
          position: pos, rows: k + 1, voices, tracks: posInfo.map((p) => p.track),
          transposes: posInfo.map((p) => ({ note: p.noteTranspose, instrument: p.instrumentTranspose })),
        });
        break;
      }
    }
    if (walk.steps[walk.steps.length - 1]?.position !== pos) break;
    pos = pos === info.end ? info.loop : pos + 1;
    if (pos < info.start) break;   // a loop target before the start is not in the grid
  }
  return walk;
}

function cellOf(
  m: ActionamicsModule, ev: AstTrackEvent | null,
  posInfo: { noteTranspose: number; instrumentTranspose: number },
  held: number[], voice: number, walk: AstWalk,
): AstGridCell {
  const cell = emptyCell();
  const heldBefore = held[voice];
  if (!ev) return { cell, event: null, index: 0, sample: -1, heldBefore };
  let index = 0;
  let sample = -1;
  if (ev.form === 'note' && ev.note !== 0) {
    if (ev.instrument) held[voice] = ev.instrument - 1 + posInfo.instrumentTranspose;
    const inst = m.instruments[held[voice]];
    const sampleNo = inst ? m.sampleLists[inst.sampleList]?.[0] : undefined;
    const smp = sampleNo !== undefined ? m.samples[sampleNo] : undefined;
    if (inst && smp) {
      sample = sampleNo!;
      index = ev.note + posInfo.noteTranspose + inst.noteTranspose + (m.arpeggioLists[smp.arpeggioList]?.[0] ?? 0);
      const note = index - AST_NOTE_OFFSET;
      if (index >= 1 && index < AST_PERIODS.length && note >= 1) {
        cell.note = note;
        cell.period = AST_PERIODS[index];
      } else walk.outOfTable++;
      cell.instrument = held[voice] + 1;
    } else walk.outOfTable++;
  }
  if (ev.effect !== null && ev.effect >= 0x70) {
    cell.effTyp = astEffectType(ev.effect);
    cell.eff = ev.arg;
  }
  return { cell, event: ev, index, sample, heldBefore };
}

// ---------------------------------------------------------------------------
// Grid edits
// ---------------------------------------------------------------------------

export interface AstGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

const MAX_DELAY = 127;

/** Whether two cells show the same thing in the fields the grid decodes. */
export function astCellsEqual(a: TrackerCell, b: TrackerCell): boolean {
  return (a.note ?? 0) === (b.note ?? 0) && (a.instrument ?? 0) === (b.instrument ?? 0)
    && (a.effTyp ?? 0) === (b.effTyp ?? 0) && (a.eff ?? 0) === (b.eff ?? 0);
}

/**
 * The event a cell is on a voice at a step: null for an empty cell, undefined
 * when the cell cannot be written there (a note the track byte cannot hold, an
 * instrument the module does not have). The note byte is the shown note less
 * what the replayer adds (position and instrument transpose, the sample's
 * first arpeggio value); an instrument byte is kept when the row had one, and
 * written when the cell names an instrument other than the one the voice holds.
 */
export function cellToAstEvent(
  m: ActionamicsModule, step: AstStep, voice: number, at: AstGridCell, cell: TrackerCell,
): AstTrackEvent | null | undefined {
  const tr = step.transposes[voice];
  const effTyp = cell.effTyp ?? 0;
  const hasEffect = effTyp >= AST_FX_MIN && effTyp <= AST_FX_MAX;
  const effect = hasEffect ? astEffectByte(effTyp) : null;
  const arg = hasEffect ? (cell.eff ?? 0) & 0xff : 0;
  if (!cell.note) {
    return hasEffect ? { form: 'effect', note: 0, instrument: null, effect, arg, delay: null } : null;
  }
  const idx = cell.instrument ? cell.instrument - 1 : at.heldBefore;
  const inst = m.instruments[idx];
  const smp = inst ? m.samples[m.sampleLists[inst.sampleList]?.[0]] : undefined;
  if (!inst || !smp) return undefined;
  const raw = cell.note + AST_NOTE_OFFSET - tr.note - inst.noteTranspose - (m.arpeggioLists[smp.arpeggioList]?.[0] ?? 0);
  if (raw < 1 || raw > 0x6f) return undefined;
  let instrument: number | null = null;
  if (cell.instrument) {
    const byte = cell.instrument - tr.instrument;
    if (byte < 1 || byte > 0x6f) return undefined;
    // The byte stays out when the row had none and the voice already holds the instrument.
    if (at.event?.instrument != null || idx !== at.heldBefore) instrument = byte;
  }
  return { form: 'note', note: raw, instrument, effect, arg, delay: effect === null ? 0 : null };
}

/** Events back from per-row slots (an event, or null for an empty row it does not cover). */
function recompress(rows: Array<AstTrackEvent | null>): AstTrackEvent[] {
  const out: AstTrackEvent[] = [];
  let i = 0;
  while (i < rows.length) {
    const e = rows[i];
    let j = i + 1;
    while (j < rows.length && rows[j] === null) j++;
    const empties = j - i - 1;
    if (e === null) {
      // Empty rows with no event to carry them: a delay byte covers the row and the next `delay`.
      const take = Math.min(j - i, MAX_DELAY + 1);
      out.push({ form: 'delay', note: 0, instrument: null, effect: null, arg: 0, delay: take - 1 });
      i += take;
    } else if (e.form === 'note' && e.effect === null) {
      const take = Math.min(empties, MAX_DELAY);
      out.push({ ...e, delay: take });
      i += 1 + take;
    } else {
      out.push({ ...e, delay: null });
      i += 1;
    }
  }
  return out;
}

/**
 * The module with grid edits written into its tracks (the bytes themselves,
 * byte-exact where nothing changes). A cell is compared with the cell the
 * module shows there; tracks no edited cell reads are carried untouched.
 * Returns the same bytes when no cell differs.
 */
export function applyActionamicsGridEdits(bytes: Uint8Array, edits: readonly AstGridEdit[], subsong = 0): Uint8Array {
  const m = decodeActionamicsModule(bytes);
  if (!m) return bytes;
  const walk = walkActionamicsSong(m, subsong);
  const slots = new Map<number, Array<AstTrackEvent | null>>();
  for (const e of edits) {
    const step = walk.steps[e.pattern];
    const at = step?.voices[e.channel]?.[e.row];
    if (!step || !at || astCellsEqual(at.cell, e.cell)) continue;
    const event = cellToAstEvent(m, step, e.channel, at, e.cell);
    if (event === undefined) continue;
    const t = step.tracks[e.channel];
    let rows = slots.get(t);
    if (!rows) { rows = astTrackRows(m.tracks[t]); slots.set(t, rows); }
    while (rows.length <= e.row) rows.push(null);
    rows[e.row] = event;
  }
  if (slots.size === 0) return bytes;
  for (const [t, rows] of slots) m.tracks[t] = { events: recompress(rows), tail: m.tracks[t].tail };
  return encodeActionamicsModule(m);
}
