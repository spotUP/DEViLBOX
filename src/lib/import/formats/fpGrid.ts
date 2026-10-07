/**
 * fpGrid.ts - the Future Player tracker grid, drawn from the player's own walk.
 *
 * A Future Player song is a call graph of command streams; the grid is the walk of fpWalk.ts
 * (held to the original 68k player in UADE by futurePlayerWalkMatchesPlayer.test.ts): one row per
 * `speed` interrupts, a note named by the table period the voice plays it with (sample base note +
 * note byte + both transposes + the arpeggio's first step, which is why the name is not the note
 * byte), the instrument only on a note that restarts the sample, a note-off only where a rest
 * releases a sounding voice whose instrument releases, every other command in the effect columns on
 * the row it ran in the player's own terms, a voice that never sounds empty. Nothing here reads the
 * module: the walk is the oracle; the byte-exact export lives in the block carriers and the edit
 * writer (fpGridEdits.ts).
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToPitch } from '@/lib/amiga/periodNotes';
import { FP_FX } from './fpEffectGlyphs';
import { WALK_ROWS_PER_PATTERN, walkLayout, walkTickPosition, type WalkLayout } from './walkLayout';
import { FP_PERIODS, FP_WALK, fpReleaseRate, type FpWalk, type FpWalkEvent } from './fpWalk';

export const FP_ROWS_PER_PATTERN = WALK_ROWS_PER_PATTERN;
const EFFECT_SLOTS = 5;

/**
 * The pitch (periodNotes naming, 428 = 25) a table period plays; null when it names none. The player's table
 * reaches below C-0 (its lowest entry plays 24 semitones under it), so the pitch can be 0 or negative:
 * fpOctaveBias lifts a whole song into the grid's notes 1..96.
 */
export function fpPeriodPitch(period: number): number | null {
  return period > 0 ? periodToPitch(period) : null;
}

/**
 * The octaves (a multiple of 12) a song's notes are shown above the pitch they play, because the player
 * plays below C-0 (note 1): every note of the song moves together, so intervals and the pitch an edit sets
 * stay exact. 0 when the song stays inside the grid.
 */
export function fpOctaveBias(walk: Pick<FpWalk, 'events'>): number {
  let min = Infinity;
  for (const e of walk.events) {
    if (e.kind !== FP_WALK.note && e.kind !== FP_WALK.legato) continue;
    const n = fpPeriodPitch(e.period);
    if (n !== null && n < min) min = n;
  }
  return min >= 1 || min === Infinity ? 0 : 12 * Math.ceil((1 - min) / 12);
}

/** The index of the player's period table that plays pitch `pitch` (periodNotes naming), or -1. */
export function fpTableIndexOfPitch(pitch: number): number {
  for (let i = 0; i < FP_PERIODS.length; i++) if (fpPeriodPitch(FP_PERIODS[i]) === pitch) return i;
  return -1;
}

/**
 * The period table index a typed grid note stands for in a song shifted up by `bias`: what the keyboard
 * preview plays (fp_note_on takes a table index, the sample's own base note is the replayer's to subtract).
 * The nearest entry when the note is outside the table.
 */
export function fpKeyToTableIndex(gridNote: number, bias: number): number {
  const i = fpTableIndexOfPitch(gridNote - bias);
  if (i >= 0) return i;
  const pitch0 = fpPeriodPitch(FP_PERIODS[0]) ?? 0;
  return Math.max(0, Math.min(FP_PERIODS.length - 1, gridNote - bias - pitch0));
}

/** The tracker note (1..96) a table period plays in a song shifted up by `bias`; 0 when the period names none. */
export function fpPeriodToNote(period: number, bias = 0): number {
  const n = fpPeriodPitch(period);
  if (n === null) return 0;
  const shown = n + bias;
  return shown >= 1 && shown <= 96 ? shown : 0;
}

/** The Future Player grid's layout and playhead mapping are the shared walk ones (walkLayout.ts). */
export type FpLayout = WalkLayout;
export const fpLayout = walkLayout;
export const fpTickPosition = walkTickPosition;

type Fx = [effTyp: number, eff: number];

const SLOT_KEYS = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'],
] as const;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** What a grid cell was drawn from, for the edit writer (fpGridEdits.ts). */
export interface FPCellSource {
  /** Code offset of the note command (note byte at +0, duration at +1). */
  off: number;
  /** Sample base note + both transposes + the arpeggio step: the note byte is the table index minus this (mod 128). */
  delta: number;
  /** Instrument pointer the note plays with. */
  instr: number;
  /** Code offset of the set-instrument command in force at the note (its pointer at +2); -1 when none ran on the voice yet. */
  instrCmd: number;
  /** A note that restarts the sample (false: a legato note). */
  retrigger: boolean;
}

export interface FpGrid {
  patterns: Pattern[];
  songPositions: number[];
  layout: FpLayout;
  /** Per pattern, voice and row: what the cell was drawn from (null for cells that show no note). */
  cellSources: Array<Array<Array<FPCellSource | null>>>;
  /** Octaves (a multiple of 12) every note is shown above the pitch it plays (fpOctaveBias). */
  bias: number;
  /** Notes whose period names no tracker note. */
  unnamedNotes: number;
  /** Rows where more commands ran on one voice than the cell has effect columns. */
  overflowRows: number;
}

export interface FpGridContext {
  code: Uint8Array;
  /** 1-based instrument id of an instrument pointer. */
  instrId: (ptr: number) => number;
  /** 1-based number of an arpeggio table pointer. */
  arpId: (ptr: number) => number;
}

/** The effect-column entries a command event shows, in the player's own terms; none for notes, rests, instrument changes. */
export function fpEventEffects(e: FpWalkEvent, ctx: Pick<FpGridContext, 'arpId'>): Fx[] {
  switch (e.kind) {
    case FP_WALK.portamento: return [[FP_FX.portamento, Math.min(e.a, 0xff)]];
    case FP_WALK.arpTable: return [[FP_FX.arpTable, ctx.arpId(e.a) & 0xff]];
    case FP_WALK.arpReset: return [[FP_FX.arpReset, 0]];
    case FP_WALK.transpose1: return [[FP_FX.transpose1, e.a & 0xff]];
    case FP_WALK.transpose2: return [[FP_FX.transpose2, e.a & 0xff]];
    case FP_WALK.end: return [[FP_FX.end, 0]];
    case FP_WALK.unknown: return [[FP_FX.unknown, e.a & 0xff]];
    default: return [];
  }
}

/** Draw the walk as patterns of the layout's lengths, one row per `speed` interrupts. */
export function buildFpGridFromWalk(walk: FpWalk, ctx: FpGridContext): FpGrid {
  const layout = fpLayout(walk);
  const channels = Math.max(1, walk.voices);
  const speed = Math.max(1, walk.speed);
  const rows = layout.rows;
  const grid: TrackerCell[][] = Array.from({ length: channels }, () => Array.from({ length: rows }, emptyCell));
  const src: Array<Array<FPCellSource | null>> = Array.from({ length: channels }, () => new Array<FPCellSource | null>(rows).fill(null));
  const slots: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(0));
  const sounding = new Array<boolean>(channels).fill(false);
  const instrCmd = new Array<number>(channels).fill(-1);
  let overflowRows = 0;
  let unnamedNotes = 0;
  const bias = fpOctaveBias(walk);

  for (const e of walk.events) {
    if (e.voice >= channels) continue;
    const r = (e.tick - 1) / speed;
    if (r >= rows) break;
    const cell = grid[e.voice][r];
    const put = (typ: number, val: number): void => {
      const s = slots[e.voice][r];
      if (s >= EFFECT_SLOTS) { overflowRows++; return; }
      const [kt, kv] = SLOT_KEYS[s];
      (cell as unknown as Record<string, number>)[kt] = typ;
      (cell as unknown as Record<string, number>)[kv] = val;
      slots[e.voice][r] = s + 1;
    };
    if (e.kind === FP_WALK.instrument) { instrCmd[e.voice] = e.off; continue; }
    if (e.kind === FP_WALK.note || e.kind === FP_WALK.legato) {
      const n = fpPeriodToNote(e.period, bias);
      if (n === 0) unnamedNotes++;
      cell.note = n;
      const retrigger = e.kind === FP_WALK.note;
      if (retrigger) cell.instrument = ctx.instrId(e.b);
      else put(FP_FX.legato, 0);
      sounding[e.voice] = true;
      src[e.voice][r] = { off: e.off, delta: e.delta, instr: e.b, instrCmd: instrCmd[e.voice], retrigger };
    } else if (e.kind === FP_WALK.rest) {
      // a rest releases the envelope: the voice stops only where the instrument's release rate is not zero
      if (sounding[e.voice] && fpReleaseRate(ctx.code, e.b) > 0) cell.note = 97;
      sounding[e.voice] = false;
    } else {
      if (e.kind === FP_WALK.end) {
        if (sounding[e.voice]) cell.note = 97;
        sounding[e.voice] = false;
      }
      for (const [typ, val] of fpEventEffects(e, ctx)) put(typ, val);
    }
  }

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const cellSources: FpGrid['cellSources'] = [];
  let start = 0;
  layout.patternLengths.forEach((len, p) => {
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    cellSources.push(src.map((s) => s.slice(start, start + len)));
    start += len;
  });
  return { patterns, songPositions, layout, cellSources, bias, unnamedNotes, overflowRows };
}
