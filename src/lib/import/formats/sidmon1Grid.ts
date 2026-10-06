/**
 * SidMon 1.0 grid: the rows each voice walks, as the replayer walks them.
 *
 * A SidMon 1 module is not a grid. Each voice has its own track list
 * (`tracksPtr[v] + step`), a track names a pattern (a run of 5-byte rows) and
 * a transpose, and a row lasts `speed + 1` global rows: the voice consumes its
 * next row only when its note timer has run out. Every `patternLen` global
 * rows all voices step to their next track; a note row carrying effect 3 sets
 * the pattern length for the rest of the song. This walk replays exactly that
 * (sidmon1-wasm/src/sidmon1/sidmon1.c, voice_process / sm1r_tick) without
 * audio, and says for every grid cell which module row (if any) the player
 * consumes there. A cell inside a long row has no row of its own: nothing is
 * played there and nothing can be written there.
 */

export interface Sm1RawRow { note: number; sample: number; effect: number; param: number; speed: number }
export interface Sm1Track { pattern: number; transpose: number }

export interface Sm1WalkInput {
  /** Pattern rows as the player holds them (version remaps applied). */
  rows: readonly Sm1RawRow[];
  tracks: readonly Sm1Track[];
  /** Per-voice first track index. */
  tracksPtr: readonly number[];
  /** Start row of each pattern; index 0 is the empty first entry, as in the player. */
  patternPtrs: readonly number[];
  /** Header: default pattern length in global rows. */
  patternDef: number;
  /** Header: track count + 1 (the player's trackPos starts at 1). */
  trackLen: number;
  /** Versions that restart note timers at every pattern boundary. */
  doReset: boolean;
}

export interface Sm1Cell {
  /** Absolute index of the module row consumed here, or -1 when none is. */
  row: number;
  /** Index into `tracks` of the voice's track at this step (its transpose applies). */
  track: number;
}

export interface Sm1Step {
  /** Global rows in this step. */
  length: number;
  /** cells[voice][globalRow] */
  cells: Sm1Cell[][];
}

const VOICES = 4;
const MAX_LENGTH = 256;

export function walkSidMon1(input: Sm1WalkInput): Sm1Step[] {
  const { rows, tracks, tracksPtr, patternPtrs, doReset } = input;
  if (rows.length === 0 || tracks.length === 0) return [];
  let patternLen = input.patternDef > 0 ? input.patternDef : 16;
  const stepCount = Math.max(1, input.trackLen - 1);

  const startRow = (track: number): number => {
    let pat = tracks[track].pattern;
    if (pat < 0 || pat >= patternPtrs.length) pat = 0;
    const r = patternPtrs[pat];
    return r >= 0 && r < rows.length ? r : 0;
  };

  const track: number[] = [];
  const row: number[] = [];
  const timer: number[] = [0, 0, 0, 0];
  for (let v = 0; v < VOICES; v++) {
    let t = tracksPtr[v] ?? 0;
    if (t < 0 || t >= tracks.length) t = 0;
    track.push(t);
    row.push(startRow(t));
  }

  const steps: Sm1Step[] = [];
  for (let s = 0; s < stepCount; s++) {
    if (s > 0) {
      for (let v = 0; v < VOICES; v++) {
        track[v] = Math.min(track[v] + 1, tracks.length - 1);
        row[v] = startRow(track[v]);
        if (doReset) timer[v] = 0;
      }
    }
    const cells: Sm1Cell[][] = [[], [], [], []];
    for (let g = 0; g < MAX_LENGTH; g++) {
      for (let v = 0; v < VOICES; v++) {
        if (timer[v] !== 0) {
          timer[v]--;
          cells[v].push({ row: -1, track: track[v] });
          continue;
        }
        if (row[v] < 0 || row[v] >= rows.length) row[v] = 0;
        const r = rows[row[v]];
        cells[v].push({ row: row[v], track: track[v] });
        // The note timer: a row with neither sample nor note leaves it at 0.
        if (r.sample !== 0 || r.note !== 0) timer[v] = r.speed;
        if (r.note !== 0 && r.note !== 0xff && r.effect === 3) patternLen = r.param;
        row[v]++;
      }
      if (g + 1 >= patternLen) break;
    }
    steps.push({ length: cells[0].length, cells });
  }
  return steps;
}
