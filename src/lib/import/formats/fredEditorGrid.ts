/**
 * fredEditorGrid.ts - the Fred Editor grid: each voice's walk through its
 * track list on one line timeline, the line <-> cell codec, and grid edits
 * written back into the module.
 *
 * Timing (replayer Lab2_StartReplay / Lab2_NewLine, FREDPLA0.2ED): every voice
 * owns a track list and walks it on its own - a note or a pause lasts one
 * line (TempoCur ticks), a hold byte n lines, $80 takes the next list entry on
 * the same tick. Voices are not in step at pattern boundaries (rebels.fred:
 * voice 1 plays sixteen-line patterns where voice 0 plays 128-line ones), so
 * the grid is not one pattern per list position: grid row = line, each
 * channel shows its own voice's line on that row, and the timeline is cut in
 * 64-row display patterns. Every cell of the grid IS one line of one pattern
 * (FredLineRef), so an edit lands in that pattern - and is heard everywhere
 * the pattern plays.
 *
 * Song length: the longest voice's pass up to its first jump back (or the
 * line where a $FFFF entry stops the music); shorter voices go on through
 * their jump, as they do in the player.
 */

import type { TrackerCell } from '@/types';
import {
  decodeFredModule, encodeFredModule, fredPatternIndex, fredTrackListStart,
  type FredLine, type FredModule,
} from './FredEditorModule';
import { FRED_FX } from './fredEffectGlyphs';

export const FRED_ROWS_PER_PATTERN = 64;
/** XM speed effect: the tempo command $82 sets ticks per line, which is XM Fxx. */
const FX_SPEED = 0x0f;
const NOTE_OFF = 97;
/**
 * Note byte n plays period PeriodTable[n] * InsPer >> 10; with InsPer 428 (every
 * corpus instrument) byte 36 plays 428 = C-2 = grid note 25 (ProTracker naming,
 * src/lib/amiga/periodNotes.ts). The grid holds notes 1..96, so bytes 12..107.
 */
const NOTE_OFFSET = 11;
/** Walk ceiling: no corpus voice passes 3100 lines. */
const MAX_LINES = 1 << 16;

/** Where a grid cell's line lives. */
export interface FredLineRef {
  /** Index into module.patterns. */
  pattern: number;
  /** Line within that pattern. */
  line: number;
}

export interface FredSongWalk {
  /** Lines on the timeline (rows of the grid). */
  lines: number;
  /** Per voice, the line each row plays (null after the music stopped). */
  voices: (FredLineRef | null)[][];
}

/**
 * One voice's lines, following its track list and jumps, until `limit` lines
 * or the stop mark. `firstJump` = lines played before the first jump.
 */
function walkVoice(m: FredModule, song: number, voice: number, limit: number, index: Map<number, number>, untilJump = false):
  { refs: FredLineRef[]; firstJump: number; stop: number } {
  const listStart = fredTrackListStart(m, song, voice);
  const word = (e: number): number => {
    const w = m.trackWords[listStart + e];
    if (w === undefined) throw new Error(`Fred Editor: voice ${voice} track list runs off the table`);
    return w;
  };
  const refs: FredLineRef[] = [];
  let firstJump = -1, stop = -1;
  let e = 0;
  let w = word(0); // Lab2_InitReplay takes entry 0 as a pattern
  let idle = 0;
  while (refs.length < limit) {
    const pi = index.get(w);
    if (pi === undefined) throw new Error(`Fred Editor: track entry ${w} is not the start of a pattern`);
    const n = m.patterns[pi].lines.length;
    for (let l = 0; l < n && refs.length < limit; l++) refs.push({ pattern: pi, line: l });
    idle = n ? 0 : idle + 1;
    if (idle > m.trackWords.length) break; // a list of empty patterns: the player would hang
    // Lab2_NextPattern: next entry; a jump re-reads at its target.
    e++;
    for (let hops = 0; ; hops++) {
      w = word(e);
      if (w === 0xffff) { stop = refs.length; return { refs, firstJump, stop }; }
      if (!(w & 0x8000)) break;
      if (firstJump < 0) firstJump = refs.length;
      if (untilJump) return { refs, firstJump, stop };
      e = (w & 0x7fff) >> 1;
      if (hops > m.trackWords.length) return { refs, firstJump, stop }; // jump onto a jump forever
    }
  }
  return { refs, firstJump, stop };
}

/** Every voice of subsong `song` on one line timeline. */
export function walkFredSong(m: FredModule, song = 0): FredSongWalk {
  const index = fredPatternIndex(m);
  const passes = [0, 1, 2, 3].map((v) => walkVoice(m, song, v, MAX_LINES, index, true));
  const stops = passes.filter((p) => p.stop >= 0).map((p) => p.stop);
  const lines = stops.length
    ? Math.min(...stops)
    : Math.max(0, ...passes.map((p) => (p.firstJump >= 0 ? p.firstJump : p.refs.length)));
  const voices = [0, 1, 2, 3].map((v) => {
    const { refs } = walkVoice(m, song, v, lines, index);
    return Array.from({ length: lines }, (_, r) => refs[r] ?? null);
  });
  return { lines, voices };
}

/**
 * What the voice holds when a line starts: the instrument the player has
 * selected (the last $83 it read; undefined before the first) and whether a
 * note is sounding (set by a note, cleared by $84).
 */
export interface FredVoiceState {
  instrument: number | undefined;
  sounding: boolean;
}

/**
 * The voice state before every row of every voice. The player keeps one
 * current instrument per voice that persists across lines, patterns and
 * track-list entries (FREDPLA0.2ED ChangeIns), so a note without a $83 plays
 * the instrument an earlier line selected.
 */
export function fredVoiceStates(m: FredModule, walk: FredSongWalk): FredVoiceState[][] {
  return walk.voices.map((refs) => {
    let instrument: number | undefined;
    let sounding = false;
    return refs.map((ref) => {
      const before: FredVoiceState = { instrument, sounding };
      const line = ref ? m.patterns[ref.pattern].lines[ref.line] : undefined;
      if (line) {
        if (line.instrument !== undefined) instrument = line.instrument;
        if (line.note !== undefined) sounding = true;
        else if (line.pause) sounding = false;
      }
      return before;
    });
  });
}

/**
 * A line as a grid cell. Every byte the line stands for is in the cell, plus
 * (with `state`) what the player does with it: a note shows the instrument the
 * player plays it with even when no $83 precedes it on that line, and an $84
 * on a voice that sounds nothing is no event, so the cell shows it empty.
 * cellToFredLine inverts it given the same state and line.
 */
export function fredLineToCell(line: FredLine | undefined, state?: FredVoiceState): TrackerCell {
  const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  if (!line) return cell;
  const fx: [number, number][] = [];
  if (line.note !== undefined) {
    const n = line.note - NOTE_OFFSET;
    if (n >= 1 && n <= 96) cell.note = n;
    else fx.push([FRED_FX.rawNote, line.note]);
  } else if (line.pause && (!state || state.sounding)) {
    cell.note = NOTE_OFF;
  }
  if (line.instrument !== undefined) {
    // A $83 that only repeats the voice's instrument on a line with no event is no change.
    const idle = state && line.note === undefined && line.instrument === state.instrument;
    if (!idle) cell.instrument = line.instrument + 1;
  } else if (state && line.note !== undefined && state.instrument !== undefined) {
    cell.instrument = state.instrument + 1;
  }
  if (line.tempo !== undefined) fx.push([FX_SPEED, line.tempo]);
  if (line.porta) {
    fx.push([FRED_FX.portaLines, line.porta.lines], [FRED_FX.portaTarget, line.porta.note]);
    if (line.porta.delay) fx.push([FRED_FX.portaDelay, line.porta.delay]);
  }
  const slots: [keyof TrackerCell, keyof TrackerCell][] = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4']];
  fx.forEach(([t, v], i) => {
    const [kt, kv] = slots[i];
    (cell as unknown as Record<string, number>)[kt] = t;
    (cell as unknown as Record<string, number>)[kv] = v & 0xff;
  });
  return cell;
}

/** Effect columns a cell uses (2 minimum, the grid's default). */
export function fredCellEffectColumns(cell: TrackerCell): number {
  return cell.effTyp4 ? 4 : cell.effTyp3 ? 3 : 2;
}

function cellsEqual(a: TrackerCell, b: TrackerCell): boolean {
  const k = Object.keys({ ...a, ...b }) as (keyof TrackerCell)[];
  return k.every((key) => (a[key] ?? 0) === (b[key] ?? 0));
}

/**
 * A grid cell as a line (the inverse of fredLineToCell; effects Fred has no
 * command for are dropped). With `ctx` (the line the cell stands on and the
 * voice state before it): a cell that is what fredLineToCell shows for that
 * line is that line, byte for byte; an instrument the player already has
 * selected is not written as a $83 unless the line already carries one.
 */
export function cellToFredLine(cell: TrackerCell, ctx?: { line: FredLine; state: FredVoiceState }): FredLine {
  if (ctx && cellsEqual(cell, fredLineToCell(ctx.line, ctx.state))) return ctx.line;
  const line: FredLine = {};
  const c = cell as unknown as Record<string, number | undefined>;
  let portaLines: number | undefined, portaTarget: number | undefined, portaDelay = 0;
  for (const [kt, kv] of [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4']] as const) {
    const t = c[kt] ?? 0, v = (c[kv] ?? 0) & 0xff;
    if (t === FX_SPEED && v > 0) line.tempo = v;
    else if (t === FRED_FX.portaLines) portaLines = v;
    else if (t === FRED_FX.portaTarget) portaTarget = v;
    else if (t === FRED_FX.portaDelay) portaDelay = v;
    else if (t === FRED_FX.rawNote) line.note = v & 0x7f;
  }
  if (cell.note >= 1 && cell.note <= 96) line.note = cell.note + NOTE_OFFSET;
  else if (cell.note === NOTE_OFF) line.pause = true;
  if (cell.instrument > 0) {
    const ins = cell.instrument - 1;
    if (!ctx || ins !== ctx.state.instrument || ctx.line.instrument !== undefined || line.note === undefined) line.instrument = ins;
  }
  if (portaLines !== undefined || portaTarget !== undefined) {
    line.porta = { lines: portaLines ?? 0, note: portaTarget ?? 0, delay: portaDelay };
  }
  return line;
}

/** True when two lines encode to the same bytes. */
export function fredLinesEqual(a: FredLine, b: FredLine): boolean {
  return a.note === b.note && !!a.pause === !!b.pause && a.instrument === b.instrument && a.tempo === b.tempo
    && (a.porta?.lines ?? -1) === (b.porta?.lines ?? -1) && (a.porta?.note ?? -1) === (b.porta?.note ?? -1)
    && (a.porta?.delay ?? -1) === (b.porta?.delay ?? -1);
}

/** A grid edit: display pattern, row, channel and the new cell. */
export interface FredGridEdit {
  pattern: number;
  row: number;
  channel: number;
  cell: TrackerCell;
}

/**
 * Write grid edits into the module: each edited cell replaces the line it
 * shows, in the pattern that line belongs to. Returns the new module bytes.
 */
export function applyFredGridEdits(bytes: Uint8Array, edits: readonly FredGridEdit[], song = 0): Uint8Array {
  const m = decodeFredModule(bytes);
  const walk = walkFredSong(m, song);
  const states = fredVoiceStates(m, walk);
  let changed = false;
  for (const { pattern, row, channel, cell } of edits) {
    const r = pattern * FRED_ROWS_PER_PATTERN + row;
    const ref = walk.voices[channel]?.[r];
    if (!ref) continue;
    const line = m.patterns[ref.pattern].lines[ref.line];
    m.patterns[ref.pattern].lines[ref.line] = cellToFredLine(cell, { line, state: states[channel][r] });
    changed = true;
  }
  return changed ? encodeFredModule(m) : bytes;
}
