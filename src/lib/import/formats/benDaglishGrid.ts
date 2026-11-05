/**
 * benDaglishGrid.ts - the Ben Daglish tracker grid, drawn from the replayer's own walk.
 *
 * A Ben Daglish song is a per-voice position list of tracks, each a byte command stream; the grid is
 * the replayer's processed-tick timeline on one fixed clock (docs/FORMAT_COMMAND_STREAM_GRID.md; the step is the
 * GCD of the two most common onset gaps, stepRowClock.mainStepFromOnsets) of what
 * ben_daglish.c's track reader executed: a note named by the period it plays, with the sample it
 * plays with, every other command in the effect columns on the tick it ran, a voice that has reached
 * the end of its position list empty. Nothing here reads the module: the walk is the oracle
 * (BenDaglishWasmExtractor), the byte-exact export lives in the layout's track carriers.
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { makeRowClock, mainStepFromOnsets, type RowClock } from './stepRowClock';
import { BD_FX } from './benDaglishEffectGlyphs';
import { BD_WALK, type BdWalk, type BdWalkEvent } from './BenDaglishWasmExtractor';

const ROWS_PER_PATTERN = 64;
const EFFECT_SLOTS = 5;
/** Note columns a voice can hold: the second holds the second onset of a row. */
const MAX_NOTE_COLS = 2;

type Fx = [effTyp: number, eff: number];

const b8 = (v: number): number => v & 0xff;

/** The effect-column entries a walk event shows, in the player's own terms; none for timing and track changes. */
export function bdEventEffects(e: BdWalkEvent): Fx[] {
  switch (e.kind) {
    case BD_WALK.sampleMap: return [[BD_FX.sampleMap, b8(e.a)]];
    case BD_WALK.portaOn: return [[BD_FX.portaDelay, b8(e.a)], [BD_FX.portaDuration, b8(e.b)], [BD_FX.portaDelta, b8(e.c)]];
    case BD_WALK.portaOff: return [[BD_FX.portaOff, 0]];
    case BD_WALK.fadeOn: return [[BD_FX.fadeSpeed, b8(e.a)], [BD_FX.fadeDuration, b8(e.b)], [BD_FX.fadeAdd, b8(e.c)]];
    case BD_WALK.fadeOff: return [[BD_FX.fadeOff, 0]];
    case BD_WALK.porta2On: return [[BD_FX.porta2Duration, b8(e.a)]];
    case BD_WALK.porta2Off: return [[BD_FX.porta2Off, 0]];
    case BD_WALK.channelVolume: {
      const fx: Fx[] = [[BD_FX.channelVolume, b8(e.a)]];
      if (e.b >= 0) fx.push([BD_FX.volSlideSpeed, b8(e.b)], [BD_FX.volSlideAdd, b8(e.c)]);
      return fx;
    }
    case BD_WALK.volSlideOff: return [[BD_FX.volSlideOff, 0]];
    case BD_WALK.transpose: return [[BD_FX.transpose, b8(e.a)]];
    case BD_WALK.loopCount: return [[BD_FX.trackRepeat, b8(e.a)]];
    case BD_WALK.masterFade: return [[BD_FX.masterFade, b8(e.a)]];
    case BD_WALK.mapSet: return [[BD_FX.mapSetIndex, b8(e.a)], [BD_FX.mapSetSample, b8(e.b)]];
    case BD_WALK.end: return [[BD_FX.end, 0]];
    default: return [];
  }
}

const SLOT_KEYS = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'],
] as const;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** A walk event that sounds a grid note: a sample and a period the replayer can play. */
export const bdIsVisibleNote = (e: BdWalkEvent): boolean => e.kind === BD_WALK.note && e.a >= 0 && e.c > 0;

/** The song's main step in processed ticks: the GCD of the two most common gaps between a voice's note onsets. */
export function bdMainStep(walk: BdWalk): number {
  const per: number[][] = [[], [], [], []];
  for (const e of walk.events) if (bdIsVisibleNote(e) && e.voice < 4) per[e.voice].push(e.ptick);
  return mainStepFromOnsets(per);
}

/** The fixed row clock of a walk: one speed, the main step, for the whole song. */
export function bdRowClock(walk: BdWalk): RowClock {
  return makeRowClock([{ tick: 0, speed: bdMainStep(walk) }]);
}

export interface BdNotePlacement {
  event: BdWalkEvent;
  voice: number;
  row: number;
  /** 0: the first note column, 1: the second (a second onset in the same row of the same voice). */
  col: number;
  /** Ticks into the row the note starts. */
  offset: number;
}

/**
 * Where every note of the walk sits in the grid: its row and ticks into the row on the fixed clock, and which note
 * column of that voice and row. The grid builder and the edit layer both read this, so they cannot disagree.
 * `unplaced` lists notes that are a third onset in one row of one voice (no column left).
 */
export function bdNotePlacements(walk: BdWalk, clock: RowClock = bdRowClock(walk)): { placed: BdNotePlacement[]; unplaced: BdWalkEvent[] } {
  const placed: BdNotePlacement[] = [];
  const unplaced: BdWalkEvent[] = [];
  const used = new Map<string, number>();
  for (const e of walk.events) {
    if (!bdIsVisibleNote(e) || e.voice >= 4) continue;
    const { row, offset } = clock.tickToRow(e.ptick);
    const key = `${e.voice}:${row}`;
    const col = used.get(key) ?? 0;
    if (col >= MAX_NOTE_COLS) { unplaced.push(e); continue; }
    used.set(key, col + 1);
    placed.push({ event: e, voice: e.voice, row, col, offset });
  }
  return { placed, unplaced };
}

export interface BdGrid {
  patterns: Pattern[];
  songPositions: number[];
  /** Rows of the timeline: the pass, in steps. */
  rows: number;
  /** Processed ticks per row. */
  step: number;
  clock: RowClock;
  /** Notes starting inside their row (a delay in the first effect slot, or `delay2` in note column 2). */
  delayedNotes: number;
  /** Rows where a voice starts two notes (the second is in note column 2). */
  clashRows: number;
  /** For each pattern and voice, the track playing on the pattern's first row (-1: none yet). */
  trackAtStart: number[][];
  /** Rows where more commands ran on one voice than the cell has effect columns, and notes with no note column left (the walk is then not fully shown). */
  overflowRows: number;
}

/**
 * Draw the walk as 64-row patterns on the fixed step clock. The pass is the walk's processed ticks plus the one
 * tick the replayer spends restarting the song (ben_daglish.c bd_player_tick: the tick after every voice has
 * ended only re-initialises), so a tracker loop returns to row 0 when the player does.
 */
export function buildBDGridFromWalk(walk: BdWalk): BdGrid {
  const channels = 4;
  const clock = bdRowClock(walk);
  const step = clock.speedAtTick(0);
  const rows = Math.max(1, clock.rowsForTicks(walk.processedTicks + 1));
  const grid: TrackerCell[][] = Array.from({ length: channels }, () => Array.from({ length: rows }, emptyCell));
  const slots: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(0));
  const trackAt: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(-1));
  let overflowRows = 0;

  const { placed, unplaced } = bdNotePlacements(walk, clock);
  overflowRows += unplaced.length;
  const placeOf = new Map<BdWalkEvent, BdNotePlacement>();
  for (const pl of placed) placeOf.set(pl.event, pl);
  const noteCols = new Array<number>(channels).fill(1);
  let delayedNotes = 0, clashRows = 0;
  const addFx = (voice: number, row: number, typ: number, val: number, front = false): void => {
    const cell = grid[voice][row] as unknown as Record<string, number>;
    const s = slots[voice][row];
    if (s >= EFFECT_SLOTS) { overflowRows++; return; }
    if (front) {
      // the row offset leads: the edit layer finds the other commands behind it
      for (let i = s; i > 0; i--) { cell[SLOT_KEYS[i][0]] = cell[SLOT_KEYS[i - 1][0]]; cell[SLOT_KEYS[i][1]] = cell[SLOT_KEYS[i - 1][1]]; }
      cell[SLOT_KEYS[0][0]] = typ; cell[SLOT_KEYS[0][1]] = val;
    } else { cell[SLOT_KEYS[s][0]] = typ; cell[SLOT_KEYS[s][1]] = val; }
    slots[voice][row] = s + 1;
  };

  const curTrack = new Array<number>(channels).fill(-1);
  for (const e of walk.events) {
    if (e.voice >= channels) continue;
    const { row } = clock.tickToRow(e.ptick);
    if (row >= rows) continue;
    const cell = grid[e.voice][row];
    if (e.kind === BD_WALK.nextTrack) continue;
    if (e.kind === BD_WALK.note) {
      // a note with no sample sounds nothing; a period of 0 is a note the replayer cannot play
      const pl = placeOf.get(e);
      if (!pl) continue;
      const c = cell as unknown as Record<string, number>;
      const note = periodToNote(e.c);
      if (pl.col === 0) {
        c.note = note; c.instrument = e.a + 1;
        if (pl.offset > 0) { addFx(e.voice, row, BD_FX.rowOffset, pl.offset, true); delayedNotes++; }
      } else {
        c.note2 = note; c.instrument2 = e.a + 1;
        c.delay2 = pl.offset;
        noteCols[e.voice] = MAX_NOTE_COLS;
        clashRows++;
        if (pl.offset > 0) delayedNotes++;
      }
    } else {
      for (const [typ, val] of bdEventEffects(e)) addFx(e.voice, row, typ, val);
    }
  }
  // the track playing at each row: the last nextTrack at or before it
  {
    let ei = 0;
    const ev = walk.events;
    for (let r = 0; r < rows; r++) {
      for (; ei < ev.length && clock.tickToRow(ev[ei].ptick).row <= r; ei++) {
        const e = ev[ei];
        if (e.kind === BD_WALK.nextTrack && e.voice < channels) curTrack[e.voice] = e.a;
      }
      for (let ch = 0; ch < channels; ch++) trackAt[ch][r] = curTrack[ch];
    }
  }

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const trackAtStart: number[][] = [];
  for (let start = 0, p = 0; start < rows; start += ROWS_PER_PATTERN, p++) {
    const len = Math.min(ROWS_PER_PATTERN, rows - start);
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      channelMeta: { importedFromMOD: false, effectCols: EFFECT_SLOTS, noteCols: noteCols[ch], noteColDelay: true },
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    trackAtStart.push(trackAt.map((b) => b[start]));
  }
  return { patterns, songPositions, rows, step, clock, delayedNotes, clashRows, trackAtStart, overflowRows };
}
