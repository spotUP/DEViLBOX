/**
 * activisionProGrid.ts - the Activision Pro song as the replayer walks it.
 *
 * The replayer (activisionpro-wasm, avp_play_tick) runs on a 50 Hz tick. On a
 * "step" tick (every tick, or fewer when the sub-song's speed variation makes
 * some ticks wait) each voice counts its current event down; at zero it reads
 * its next event. The four voices are independent: each walks its own
 * position list (a track and how many times to play it, loops, a jump marker)
 * and its events hold their own durations. A grid row is one step, so one
 * playhead tracks every voice:
 *   - an event starts on its row and lasts `duration` rows (0 lasts 256);
 *   - the event plays periods[note + instrument transpose + global transpose]
 *     (version 3 instruments carry a transpose, version 5 a global one), and
 *     starts its instrument's sample unless the event holds the playing one;
 *     naming is ProTracker's from the table period (856 = C-1 = 13);
 *   - the walk ends where the last voice reaches its position list's end
 *     marker, the replayer's own has_ended; the grid is that many steps, cut
 *     into 64-row patterns. Voices that wrapped earlier keep looping, as the
 *     replayer does.
 */
import type { TrackerCell } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';
import {
  decodeActivisionProModule, encodeActivisionProModule, encodeAvpEvent,
  type ActivisionProModule, type AvpEvent, type AvpOp, type AvpOpKind,
} from './ActivisionProModule';
import { AVP_FX_BASE, AVP_FX_MAX, AVP_FX_MIN } from './activisionProEffectGlyphs';

/** The table the replayer reads (avp_periods): index = note + transposes. */
export const AVP_PERIODS: readonly number[] = [
  1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006, 951, 895,
  1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006, 951, 895,
  1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006, 951, 1790,
  1695, 1600, 1505, 1426, 1347, 1268, 1189, 1125, 1062, 1006, 951, 895,
  848, 800, 753, 713, 674, 634, 595, 563, 531, 503, 476, 448,
  424, 400, 377, 357, 337, 317, 298, 282, 266, 252, 238, 224,
  212, 200, 189, 179, 169, 159, 149, 141, 133, 126, 119, 112,
  106,
];

export const AVP_ROWS_PER_PATTERN = 64;
/** A walk that has not ended by here is cut (a song with no end marker). */
export const AVP_MAX_STEPS = 8192;

/** Operation kind -> grid effect id (offset in the 0xB0 block). */
const KIND_FX: Partial<Record<AvpOpKind, number>> = {
  portamento: 0, envelopeReset: 2, volume: 3, addVolume: 4, mute: 5, maxSpeed: 6, speed2: 7, globalTranspose: 8, unknown: 9,
};
const HOLD_FX = 1;
const FX_KIND: AvpOpKind[] = ['portamento', 'noRetrigger', 'envelopeReset', 'volume', 'addVolume', 'mute', 'maxSpeed', 'speed2', 'globalTranspose', 'unknown'];

export interface AvpEventStart {
  voice: number;
  track: number;
  eventIndex: number;
  event: AvpEvent;
  step: number;
  /** The note the voice plays: table index before clamping, and the period. */
  index: number;
  period: number;
  /** What the replayer adds to the event's note (transposes, 8-bit wrap included). */
  added: number;
  /** The instrument (0-based, as clamped) the event plays. */
  instrument: number;
  /** The instrument the voice held before the event, -1 for none. */
  heldBefore: number;
  /** Whether the event starts its instrument's sample. */
  retrigger: boolean;
  cell: TrackerCell;
}

export interface AvpWalk {
  /** Steps in the grid. */
  rows: number;
  /** Per voice, per step: the event that starts there or null. */
  starts: (AvpEventStart | null)[][];
  /** The step each voice first reached its position list's end marker, -1 when it did not. */
  wrapStep: number[];
  /** True when the walk was cut at AVP_MAX_STEPS. */
  capped: boolean;
  /** Steps the voices stood without data (a missing track). */
  missing: number;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

const s8 = (v: number): number => (v < 128 ? v : v - 256);

interface Voice {
  list: Uint8Array;
  pos: number;
  loopOn: boolean;
  loopCount: number;
  loopStart: number;
  trackNumber: number;
  loopTrack: number;
  eventIndex: number;
  counter: number;
  instrument: number;
  transpose: number;
  done: boolean;
}

/** avp_parse_next_position, on a voice. */
function nextPosition(v: Voice): void {
  const pl = v.list;
  let position = v.pos;
  let more: boolean;
  do {
    more = false;
    position++;
    const b = pl[position] ?? 0xff;
    if (b >= 0xfe) {
      v.trackNumber = b;
      position = s8(((pl[position + 1] ?? 0) - 1) & 0xff);
    } else if (b === 0xfd) {
      position++;
      more = true;
    } else {
      if ((b & 0x40) !== 0) {
        if (v.loopOn) {
          v.loopCount = (v.loopCount - 1) & 0xff;
          if (v.loopCount === 0) { v.loopOn = false; more = true; continue; }
          position = v.loopStart;
        } else {
          v.loopOn = true;
          v.loopCount = b & 0x3f;
          v.loopStart = ++position;
        }
      }
      v.loopTrack = pl[position++] ?? 0;
      v.trackNumber = pl[position] ?? 0xff;
    }
  } while (more);
  v.pos = position;
}

/** The grid cell an event shows (effects in the 0xB0 block, the instrument it names). */
export function avpEventCell(version: number, e: AvpEvent, noteName: number): TrackerCell {
  const cell = emptyCell();
  cell.note = noteName;
  const inst = e.ops.find((o) => o.kind === 'instrument');
  if (inst) cell.instrument = inst.value + 1;
  const fx = avpDisplayedEffects(version, e);
  if (fx[0]) { cell.effTyp = fx[0].typ; cell.eff = fx[0].arg; }
  if (fx[1]) { cell.effTyp2 = fx[1].typ; cell.eff2 = fx[1].arg; }
  return cell;
}

/** The operations the two effect columns show, in id order; the rest stay in the event. */
export function avpDisplayedEffects(version: number, e: AvpEvent): { typ: number; arg: number; kind: AvpOpKind }[] {
  const out: { typ: number; arg: number; kind: AvpOpKind }[] = [];
  const hold = version <= 3 ? e.holdSample : e.ops.some((o) => o.kind === 'noRetrigger');
  for (const o of e.ops) {
    if (o.kind === 'instrument' || o.kind === 'noRetrigger') continue;
    out.push({ typ: AVP_FX_BASE + (KIND_FX[o.kind] ?? 9), arg: o.value & 0xff, kind: o.kind });
  }
  if (hold) out.push({ typ: AVP_FX_BASE + HOLD_FX, arg: 0, kind: 'noRetrigger' });
  out.sort((a, b) => a.typ - b.typ);
  return out.slice(0, 2);
}

/** The song the replayer plays from sub-song `subsong`'s start. */
export function walkActivisionPro(m: ActivisionProModule, subsong = 0, maxSteps = AVP_MAX_STEPS): AvpWalk {
  const version = m.info.parseTrackVersion;
  const song = m.subsongs[subsong];
  const walk: AvpWalk = { rows: 0, starts: [[], [], [], []], wrapStep: [-1, -1, -1, -1], capped: false, missing: 0 };
  if (!song) return walk;

  const voices: Voice[] = song.positionLists.map((list) => {
    const v: Voice = {
      list, pos: -1, loopOn: false, loopCount: 0, loopStart: 0, trackNumber: 0, loopTrack: 0, eventIndex: 0,
      counter: 1, instrument: version >= 3 ? 0 : -1, transpose: 0, done: false,
    };
    nextPosition(v);
    return v;
  });
  let globalTranspose = 0;
  let length = -1;

  for (let step = 0; step < maxSteps; step++) {
    if (length >= 0 && step >= length) break;
    for (let vi = 0; vi < 4; vi++) {
      const v = voices[vi];
      walk.starts[vi].push(null);
      if (v.done) continue;
      v.counter = (v.counter - 1) & 0xff;
      if (v.counter !== 0) continue;

      if (v.trackNumber === 0xfe) { length = step; v.done = true; continue; }
      if (v.trackNumber === 0xff) {
        v.eventIndex = 0;
        nextPosition(v);
        if (walk.wrapStep[vi] < 0) walk.wrapStep[vi] = step;
        if (v.trackNumber === 0xff) { v.done = true; continue; }
      }
      const track = m.tracks[v.trackNumber];
      const event = track?.events[v.eventIndex];
      if (!track || !event) { walk.missing++; v.done = true; if (walk.wrapStep[vi] < 0) walk.wrapStep[vi] = step; continue; }

      let setInstrument = -1;
      let hold = version <= 3 ? event.holdSample : false;
      for (const o of event.ops) {
        if (o.kind === 'instrument') setInstrument = o.value < 128 ? o.value : -1;
        else if (o.kind === 'noRetrigger') hold = true;
        else if (o.kind === 'globalTranspose') globalTranspose = s8(o.value);
      }
      const heldBefore = v.instrument;
      if (setInstrument >= 0 && setInstrument !== v.instrument) { v.instrument = setInstrument; hold = false; }
      const retrigger = !hold;
      let instIdx = v.instrument < 0 ? 0 : v.instrument;
      if (instIdx >= m.instruments.length) instIdx = 0;
      if (retrigger) v.transpose = m.instruments[instIdx]?.transpose ?? 0;

      const isMute = event.ops.some((o) => o.kind === 'mute');
      const base = isMute ? 64 : event.note;
      const added = (((base + globalTranspose) & 0xff) - base) + v.transpose;
      const index = ((base + globalTranspose) & 0xff) + v.transpose;
      const period = AVP_PERIODS[Math.max(0, Math.min(AVP_PERIODS.length - 1, index))];
      const noteName = isMute ? 97 : periodToNote(period);
      const cell = avpEventCell(version, event, noteName);
      // Version 1/2 instruments are named by the event; a held instrument is not repeated.
      walk.starts[vi][step] = {
        voice: vi, track: v.trackNumber, eventIndex: v.eventIndex, event, step, index, period, added,
        instrument: instIdx, heldBefore, retrigger, cell,
      };

      v.counter = event.duration === 0 ? 256 : event.duration;
      if (v.eventIndex + 1 >= track.events.length) {
        v.eventIndex = 0;
        v.loopTrack = (v.loopTrack - 1) & 0xff;
        if (v.loopTrack === 0) nextPosition(v);
      } else v.eventIndex++;
    }
    if (length < 0 && walk.wrapStep.every((w) => w >= 0)) length = Math.max(...walk.wrapStep);
    if (length >= 0 && step + 1 >= length) { walk.rows = length; break; }
  }
  if (walk.rows === 0) {
    walk.capped = true;
    walk.rows = walk.starts[0].length;
  }
  for (const s of walk.starts) s.length = walk.rows;
  return walk;
}

/** The 50 Hz tick on which each step happens (the replayer's speed variation). */
export function avpStepTicks(m: ActivisionProModule, subsong: number, steps: number): number[] {
  const out: number[] = [];
  const sv = m.subsongs[subsong]?.speedVariation ?? new Int8Array(8);
  let counter = 0, index = 0;
  let acc = 255, speed = m.speedVariationInit;
  for (let tick = 0; out.length < steps && tick < steps * 256 + 8; tick++) {
    if (m.info.speedVariationVersion === 2) {
      const sum = acc + speed;
      counter = sum > 255 ? 0 : -1;
      acc = sum & 0xff;
    }
    if (counter === 0) out.push(tick);
    if (m.info.speedVariationVersion === 1) {
      counter = (counter - 1);
      if (counter < 0) { index = (index - 1 + 8) % 8; counter = sv[index]; }
    }
  }
  return out;
}

/** Walk rows into 64-row grid patterns of cells: [pattern][voice][row]. */
export function avpPatternCells(walk: AvpWalk): TrackerCell[][][] {
  const n = Math.max(1, Math.ceil(walk.rows / AVP_ROWS_PER_PATTERN));
  return Array.from({ length: n }, (_, p) =>
    Array.from({ length: 4 }, (_, v) => {
      const len = Math.min(AVP_ROWS_PER_PATTERN, walk.rows - p * AVP_ROWS_PER_PATTERN);
      return Array.from({ length: Math.max(len, p === 0 ? 1 : 0) }, (_, r) => walk.starts[v][p * AVP_ROWS_PER_PATTERN + r]?.cell ?? emptyCell());
    }));
}

// ---------------------------------------------------------------------------
// Grid edits
// ---------------------------------------------------------------------------

export interface AvpGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

/** Whether two cells show the same thing in the fields the grid decodes. */
export function avpCellsEqual(a: TrackerCell, b: TrackerCell): boolean {
  return (a.note ?? 0) === (b.note ?? 0) && (a.instrument ?? 0) === (b.instrument ?? 0)
    && (a.effTyp ?? 0) === (b.effTyp ?? 0) && (a.eff ?? 0) === (b.eff ?? 0)
    && (a.effTyp2 ?? 0) === (b.effTyp2 ?? 0) && (a.eff2 ?? 0) === (b.eff2 ?? 0);
}

/** The table index a shown note is, keeping `current` when it already shows that note. */
function indexForNote(note: number, current: number): number {
  const clamped = Math.max(0, Math.min(AVP_PERIODS.length - 1, current));
  if (periodToNote(AVP_PERIODS[clamped]) === note) return current;
  for (let i = AVP_PERIODS.length - 1; i >= 0; i--) if (periodToNote(AVP_PERIODS[i]) === note) return i;
  return -1;
}

/** The event a cell turns `at.event` into, or null when the module cannot express the cell there. */
export function cellToAvpEvent(version: number, at: AvpEventStart, cell: TrackerCell): AvpEvent | null {
  const e = at.event;
  if (!cell.note || cell.note === 97) return null;
  const index = indexForNote(cell.note, at.index);
  if (index < 0) return null;
  const note = index - at.added;
  if (note < 0 || note > 127) return null;

  // Operations: the ones the columns show are the cell's, the others stay.
  const shown = new Set(avpDisplayedEffects(version, e).map((f) => f.kind));
  const wanted: { kind: AvpOpKind; value: number }[] = [];
  for (const [typ, arg] of [[cell.effTyp ?? 0, cell.eff ?? 0], [cell.effTyp2 ?? 0, cell.eff2 ?? 0]] as const) {
    if (typ < AVP_FX_MIN || typ > AVP_FX_MAX) continue;
    wanted.push({ kind: FX_KIND[typ - AVP_FX_BASE], value: arg & 0xff });
  }
  let holdSample = e.holdSample;
  const ops: AvpOp[] = [];
  let hold = version <= 3 ? holdSample : e.ops.some((o) => o.kind === 'noRetrigger');
  if (shown.has('noRetrigger') || wanted.some((w) => w.kind === 'noRetrigger')) hold = wanted.some((w) => w.kind === 'noRetrigger');
  if (version <= 3) holdSample = hold;
  for (const o of e.ops) {
    if (o.kind === 'instrument') {
      if (cell.instrument) ops.push({ ...o, value: Math.max(0, cell.instrument - 1) });
    } else if (o.kind === 'noRetrigger') {
      if (hold) ops.push(o);
    } else if (shown.has(o.kind)) {
      const w = wanted.find((x) => x.kind === o.kind);
      if (w) ops.push({ ...o, value: w.value });
    } else ops.push(o);
  }
  if (cell.instrument && !e.ops.some((o) => o.kind === 'instrument')) ops.unshift({ kind: 'instrument', value: cell.instrument - 1, code: 0 });
  for (const w of wanted) {
    if (w.kind === 'noRetrigger') { if (version >= 4 && hold && !ops.some((o) => o.kind === 'noRetrigger')) ops.push({ kind: 'noRetrigger', value: 0, code: 0 }); continue; }
    if (!ops.some((o) => o.kind === w.kind)) ops.push({ kind: w.kind, value: w.value, code: 0 });
  }
  const next: AvpEvent = { ...e, ops, note, holdSample };
  const enc = encodeAvpEvent(version, next);
  if (!enc || enc.length !== e.bytes.length) return null;   // tracks are written in place
  return next;
}

/**
 * The module with grid edits written into its tracks, byte-exact where nothing
 * changes. Only a cell on the row an event starts can be edited (the other rows
 * are that event's duration); edits the module cannot hold are dropped.
 * Returns the same bytes when no cell differs.
 */
export function applyActivisionProGridEdits(bytes: Uint8Array, edits: readonly AvpGridEdit[], subsong = 0): Uint8Array {
  const m = decodeActivisionProModule(bytes);
  if (!m) return bytes;
  const version = m.info.parseTrackVersion;
  const walk = walkActivisionPro(m, subsong);
  let changed = false;
  for (const ed of edits) {
    const at = walk.starts[ed.channel]?.[ed.pattern * AVP_ROWS_PER_PATTERN + ed.row];
    if (!at || avpCellsEqual(at.cell, ed.cell)) continue;
    const next = cellToAvpEvent(version, at, ed.cell);
    const track = m.tracks[at.track];
    if (!next || !track) continue;
    track.events[at.eventIndex] = next;
    changed = true;
  }
  return changed ? encodeActivisionProModule(m) : bytes;
}
