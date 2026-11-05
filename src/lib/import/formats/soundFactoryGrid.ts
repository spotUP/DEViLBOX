/**
 * soundFactoryGrid.ts - the Sound Factory step grid: 1 grid row = 1 song step.
 *
 * A Sound Factory voice is a stream of notes and pauses with authored tick durations (50 Hz CIA ticks), no
 * speed command. The grid is one fixed clock (thoughts/shared/plans/2026-11-05-step-grid.md, "Ben Daglish
 * decision"): the main step is the GCD of the two most common gaps between a voice's note onsets
 * (stepRowClock.mainStepFromOnsets, shared with Ben Daglish). A note that starts inside its row sits on that
 * row with a delay (0xD7 in the first effect slot); a second note in the same row of the same voice goes in
 * note column 2 with its own delay (`delay2`). A tick is always 20 ms, so a row of `step` ticks plays at
 * speed = step and 125 BPM.
 */
import type { TrackerCell } from '@/types';
import { makeRowClock, mainStepFromOnsets, type RowClock } from './stepRowClock';
import { BD_FX } from './benDaglishEffectGlyphs';

/** One opcode of a voice's stream: a note (`isNote`) or a pause, lasting `duration` ticks. */
export interface SfGridEvent {
  isNote: boolean;
  note: number;
  instrId: number;
  duration: number;
  fileOffset: number;
}

/** Sound Factory shares the Ben Daglish "ticks into the row" effect id (one global effect id space). */
export const SF_FX_ROW_OFFSET = BD_FX.rowOffset;

/** Note columns a voice can hold: the second holds the second onset of a row. */
const MAX_NOTE_COLS = 2;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** Each event's onset tick: the sum of the durations before it. */
function onsetsOf(events: readonly SfGridEvent[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const e of events) { out.push(t); t += e.duration; }
  return out;
}

/** The song's main step in ticks: GCD of the two most common gaps between a voice's note onsets. */
export function sfMainStep(voices: readonly (readonly SfGridEvent[])[]): number {
  return mainStepFromOnsets(voices.map((ev) => {
    const on = onsetsOf(ev);
    return on.filter((_, i) => ev[i].isNote);
  }));
}

export interface SfGrid {
  /** Cells per voice, one per row. */
  rows: TrackerCell[][];
  /** Per voice and row: file offset of the opcode that row edits (note first, else a pause), -1 none. */
  offsets: number[][];
  step: number;
  clock: RowClock;
  /** Voices that hold a second note column. */
  noteCols: number[];
  delayedNotes: number;
  clashRows: number;
  /** Notes that are a third onset in one row of one voice (no note column left). */
  unplaced: number;
}

/** Lay the voices' events out on the fixed step clock. `maxRows` caps each voice. */
export function buildSfGrid(voices: readonly (readonly SfGridEvent[])[], maxRows: number): SfGrid {
  const step = sfMainStep(voices);
  const clock = makeRowClock([{ tick: 0, speed: step }]);
  const total = Math.max(1, ...voices.map((ev) => ev.reduce((a, e) => a + e.duration, 0)));
  const rowCount = Math.max(1, Math.min(maxRows, clock.rowsForTicks(total)));
  const rows = voices.map(() => Array.from({ length: rowCount }, emptyCell));
  const offsets = voices.map(() => new Array<number>(rowCount).fill(-1));
  const noteCols = voices.map(() => 1);
  let delayedNotes = 0, clashRows = 0, unplaced = 0;

  voices.forEach((events, v) => {
    const on = onsetsOf(events);
    const hasNote = new Array<boolean>(rowCount).fill(false);
    events.forEach((e, i) => {
      const { row, offset } = clock.tickToRow(on[i]);
      if (row >= rowCount) return;
      const cell = rows[v][row] as TrackerCell & Record<string, number>;
      if (!e.isNote) {
        if (offsets[v][row] < 0) offsets[v][row] = e.fileOffset;
        return;
      }
      if (!hasNote[row]) {
        hasNote[row] = true;
        cell.note = e.note; cell.instrument = e.instrId;
        offsets[v][row] = e.fileOffset;
        if (offset > 0) { cell.effTyp = SF_FX_ROW_OFFSET; cell.eff = offset; delayedNotes++; }
      } else if (cell.note2 === undefined) {
        cell.note2 = e.note; cell.instrument2 = e.instrId; cell.delay2 = offset;
        noteCols[v] = MAX_NOTE_COLS;
        clashRows++;
        if (offset > 0) delayedNotes++;
      } else {
        unplaced++;
      }
    });
  });
  return { rows, offsets, step, clock, noteCols, delayedNotes, clashRows, unplaced };
}
