/**
 * soundFactoryGrid.ts - the Sound Factory step grid: 1 grid row = 1 song step.
 *
 * A Sound Factory voice is a stream of notes and pauses with authored tick durations (50 Hz CIA ticks), no
 * speed command. The grid is one fixed clock (thoughts/shared/plans/2026-11-05-step-grid.md, "Ben Daglish
 * decision"): the main step is the GCD of the two most common gaps between a voice's note onsets
 * (stepRowClock.mainStepFromOnsets, shared with Ben Daglish). A note that starts inside its row sits on that
 * row with a delay (0xD7 in the first effect slot); a second note in the same row of the same voice goes in
 * note column 2 with its own delay (its column delay). A tick is always 20 ms, so a row of `step` ticks plays at
 * speed = step and 125 BPM.
 */
import type { TrackerCell } from '@/types';
import { makeRowClock, mainStepFromOnsets, makeOnsetPlacer, setNoteColumn, type RowClock } from './stepRowClock';
import { BD_FX } from './benDaglishEffectGlyphs';

/** One effect operand byte: its effect id (soundFactoryEffects.ts), the byte's value and its file offset. */
export interface SfEffect { id: number; value: number; fileOffset: number; }

/** One opcode of a voice's stream: a note (`isNote`) or a pause, lasting `duration` ticks. */
export interface SfGridEvent {
  isNote: boolean;
  note: number;
  instrId: number;
  duration: number;
  fileOffset: number;
  /** Effect operands that take effect at this event (the opcodes sat in the stream just before it). */
  effects?: SfEffect[];
}

/** Effect slots a cell holds (the cell type's effTyp..effTyp8). */
export const SF_MAX_EFFECT_SLOTS = 8;
/** A voice always shows this many effect columns (slot 1 holds the delay). */
export const SF_MIN_EFFECT_COLS = 2;

/** Sound Factory shares the Ben Daglish "ticks into the row" effect id (one global effect id space). */
export const SF_FX_ROW_OFFSET = BD_FX.rowOffset;

/** Note columns a voice can hold: the second holds the second onset of a row. */

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
  /** Per voice and row: index (in the voice's event list) of the event `offsets` names, -1 none. */
  anchors: number[][];
  /** Per voice: row -> event index of each further note column's onset (index 0 = note column 2). */
  colAnchors: Array<Map<number, number[]>>;
  step: number;
  clock: RowClock;
  /** Per voice: note columns, 1 plus the largest same-row clash (plan rule R5). */
  noteCols: number[];
  delayedNotes: number;
  clashRows: number;
  /** Onsets deeper than the cell's 4 note columns (plan rule R5 grows the columns, the cell model stops at 4). */
  unplaced: number;
  /** Effect columns per voice: SF_MIN_EFFECT_COLS, grown to fit the busiest row (never above 8). */
  effectCols: number[];
  /** Per voice, row -> file offset of each effect slot (index 0 = slot 1), -1 for a slot without a file byte. */
  effectOffsets: Array<Map<number, number[]>>;
  /** Effect operands in the voices' events vs. operands placed in a cell slot. */
  effectsSeen: number;
  effectsPlaced: number;
  /** Effect operands of events past the last grid row (not in the grid, same as their notes). */
  effectsBeyondGrid: number;
  /** Per effect id: operands seen and operands placed (the count check reads these). */
  effectCounts: Map<number, { seen: number; placed: number }>;
}

const SLOT_TYP = ['effTyp', 'effTyp2', 'effTyp3', 'effTyp4', 'effTyp5', 'effTyp6', 'effTyp7', 'effTyp8'] as const;
const SLOT_VAL = ['eff', 'eff2', 'eff3', 'eff4', 'eff5', 'eff6', 'eff7', 'eff8'] as const;

/** Lay the voices' events out on the fixed step clock. `maxRows` caps each voice. */
export function buildSfGrid(voices: readonly (readonly SfGridEvent[])[], maxRows: number): SfGrid {
  const step = sfMainStep(voices);
  const clock = makeRowClock([{ tick: 0, speed: step }]);
  const total = Math.max(1, ...voices.map((ev) => ev.reduce((a, e) => a + e.duration, 0)));
  const rowCount = Math.max(1, Math.min(maxRows, clock.rowsForTicks(total)));
  const rows = voices.map(() => Array.from({ length: rowCount }, emptyCell));
  const offsets = voices.map(() => new Array<number>(rowCount).fill(-1));
  const anchors = voices.map(() => new Array<number>(rowCount).fill(-1));
  const colAnchors = voices.map(() => new Map<number, number[]>());
  const noteCols = voices.map(() => 1);
  const effectCols = voices.map(() => SF_MIN_EFFECT_COLS);
  const effectOffsets = voices.map(() => new Map<number, number[]>());
  const effectCounts = new Map<number, { seen: number; placed: number }>();
  const unplaced = 0; // the cell holds any number of note columns: no onset is left out (plan R5)
  let delayedNotes = 0, clashRows = 0, effectsSeen = 0, effectsPlaced = 0, effectsBeyondGrid = 0;

  voices.forEach((events, v) => {
    const on = onsetsOf(events);
    const place = makeOnsetPlacer(clock);
    events.forEach((e, i) => {
      const { row } = clock.tickToRow(on[i]);
      if (row >= rowCount) return;
      const cell = rows[v][row] as TrackerCell & Record<string, number>;
      if (!e.isNote) {
        if (offsets[v][row] < 0) { offsets[v][row] = e.fileOffset; anchors[v][row] = i; }
        return;
      }
      const pl = place(v, on[i]);
      const offset = pl.offset;
      if (pl.col === 0) {
        cell.note = e.note; cell.instrument = e.instrId;
        offsets[v][row] = e.fileOffset; anchors[v][row] = i;
        if (offset > 0) { cell.effTyp = SF_FX_ROW_OFFSET; cell.eff = offset; delayedNotes++; }
      } else {
        setNoteColumn(cell, pl.col, e.note, e.instrId, offset);
        const list = colAnchors[v].get(row) ?? [];
        list[pl.col - 1] = i;
        colAnchors[v].set(row, list);
        clashRows++;
        if (offset > 0) delayedNotes++;
      }
    });

    noteCols[v] = place.columnsOf(v);

    // Effects go in the first free slot of their row, after the notes are placed (slot 1 may hold the delay).
    events.forEach((e, i) => {
      if (!e.effects?.length) return;
      // An event past the last grid row is outside the grid like its notes (the song outruns the row cap);
      // only the zero-length trailing event (commands after the last note) rides the last row.
      const rawRow = clock.tickToRow(on[i]).row;
      if (rawRow >= rowCount && e.duration > 0) { effectsBeyondGrid += e.effects.length; return; }
      const row = Math.min(rowCount - 1, rawRow);
      const cell = rows[v][row] as unknown as Record<string, number>;
      for (const fx of e.effects) {
        const c = effectCounts.get(fx.id) ?? { seen: 0, placed: 0 };
        effectCounts.set(fx.id, c);
        c.seen++; effectsSeen++;
        let slot = 0;
        while (slot < SF_MAX_EFFECT_SLOTS && (cell[SLOT_TYP[slot]] ?? 0) !== 0) slot++;
        if (slot >= SF_MAX_EFFECT_SLOTS) continue;
        cell[SLOT_TYP[slot]] = fx.id; cell[SLOT_VAL[slot]] = fx.value;
        c.placed++; effectsPlaced++;
        effectCols[v] = Math.max(effectCols[v], slot + 1);
        const offs = effectOffsets[v].get(row) ?? new Array<number>(SF_MAX_EFFECT_SLOTS).fill(-1);
        offs[slot] = fx.fileOffset;
        effectOffsets[v].set(row, offs);
      }
    });
  });
  return { rows, offsets, anchors, colAnchors, step, clock, noteCols, delayedNotes, clashRows, unplaced, effectCols, effectOffsets, effectsSeen, effectsPlaced, effectsBeyondGrid, effectCounts };
}
