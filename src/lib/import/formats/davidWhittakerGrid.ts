/**
 * davidWhittakerGrid.ts - the David Whittaker tracker grid, drawn from the replayer's own walk.
 *
 * A DW song is a per-channel command stream; the grid is the replayer's timeline of what
 * davidwhittaker.c's track reader executed, one row per song step (`speed` processed ticks, through
 * stepRowClock.ts; frames the player skips are not counted):
 * a note with the sample it plays with, a note-off only where a mute stops a sounding voice, every
 * other command in the effect columns on the tick it ran, a silent voice empty. Nothing here reads
 * the module: the walk is the oracle (DavidWhittakerWasmExtractor), the byte-exact export lives in
 * the layout's block carriers.
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { DW_FX } from './davidWhittakerEffectGlyphs';
import { DW_WALK, type DwWalk, type DwWalkEvent } from './DavidWhittakerWasmExtractor';
import { dwByteToNote, dwWalkTransposes } from './davidWhittakerPitch';
import { makeRowClock, type RowClock } from './stepRowClock';

const ROWS_PER_PATTERN = 64;
const EFFECT_SLOTS = 5;
/** The most effect columns a cell holds (effTyp..effTyp8); the grid uses 5, or 6 when a song needs one more. */
const MAX_EFFECT_SLOTS = 8;
/** Tracker speed effect (Fxx below 32). */
export const FX_SPEED = 0xf;

/** The row clock of a walk: its subsong speed, changed by every speed command at the processed tick it ran on. */
export function dwRowClock(walk: DwWalk): RowClock {
  const changes = [{ tick: 0, speed: walk.speed }];
  for (const e of walk.events) if (e.kind === DW_WALK.speed) changes.push({ tick: e.ptick, speed: e.a });
  return makeRowClock(changes);
}

type Fx = [effTyp: number, eff: number];

/** The effect-column entries a walk event shows, in the player's own terms; none for timing and block changes. */
export function dwEventEffects(e: DwWalkEvent): Fx[] {
  const b8 = (v: number): number => v & 0xff;
  switch (e.kind) {
    case DW_WALK.envelope: return [[DW_FX.envelope, b8(e.a)]];
    case DW_WALK.arpeggio: return [[DW_FX.arpeggio, b8(e.a)]];
    case DW_WALK.slide: return [[DW_FX.slideSpeed, b8(e.a)], [DW_FX.slideDelay, b8(e.b)]];
    case DW_WALK.waitRow: return [[DW_FX.waitRow, 0]];
    case DW_WALK.stopSong: return [[DW_FX.stopSong, 0]];
    case DW_WALK.globalTranspose: return [[DW_FX.globalTranspose, b8(e.a)]];
    case DW_WALK.vibrato: return [[DW_FX.vibratoSpeed, b8(e.a)], [DW_FX.vibratoDepth, b8(e.b)]];
    case DW_WALK.vibratoOff: return [[DW_FX.vibratoOff, 0]];
    case DW_WALK.volumeFade: return [[DW_FX.volumeFade, b8(e.a)]];
    case DW_WALK.channelTranspose: return [[DW_FX.channelTranspose, b8(e.a)]];
    case DW_WALK.halfVolumeOn: return [[DW_FX.halfVolumeOn, 0]];
    case DW_WALK.halfVolumeOff: return [[DW_FX.halfVolumeOff, 0]];
    case DW_WALK.restart: return [[DW_FX.restart, 0]];
    // the tracker's own speed effect: the scheduler follows it. A speed of 32 or more would read as a tempo.
    case DW_WALK.speed:
      if (e.a < 1 || e.a > 31) throw new Error(`the song sets speed ${e.a}, which the tracker's speed effect cannot hold`);
      return [[FX_SPEED, e.a]];
    case DW_WALK.delaySpeed: return [[DW_FX.delaySpeed, b8(e.a)]];
    case DW_WALK.globalFade: return [[DW_FX.globalVolumeFade, b8(e.a)]];
    case DW_WALK.globalVolume: return [[DW_FX.globalVolume, b8(e.a)]];
    case DW_WALK.soundEffect: return [[DW_FX.soundEffect, b8(e.a)]];
    // a voice reaching the end of its position list and restarting
    case DW_WALK.endOfTrack: return e.b === 1 ? [[DW_FX.loop, b8(e.a)]] : [];
    default: return [];
  }
}

export const SLOT_KEYS = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'],
  ['effTyp6', 'eff6'], ['effTyp7', 'eff7'], ['effTyp8', 'eff8'],
] as const;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** Commands that set a state the next command of the same kind sets again: the later one wins. */
const STATE_SETTING: ReadonlySet<number> = new Set([DW_FX.envelope, DW_FX.arpeggio, DW_FX.vibratoSpeed, DW_FX.vibratoDepth]);

/**
 * The effect-column entries a tick of one voice can show. A voice that wraps its position list on
 * the tick the walk ends runs the end of one pass and the start of the next in one tick (a loop,
 * then its vibrato and envelope again): six entries for five columns. Only then are the entries a
 * later command of the same kind sets again dropped - they were in force for no time at all - and
 * what still does not fit is counted by the caller (the song then opens without a grid).
 */
export function fitEffectColumns(list: Fx[], slots = EFFECT_SLOTS): { shown: Fx[]; overflow: boolean } {
  if (list.length <= slots) return { shown: list, overflow: false };
  const kept = list.filter(([typ], i) => !(STATE_SETTING.has(typ) && list.some(([t2], j) => j > i && t2 === typ)));
  return { shown: kept.slice(0, slots), overflow: kept.length > slots };
}

export interface DwGrid {
  patterns: Pattern[];
  songPositions: number[];
  /** Rows of the timeline (song steps of the longest voice's first pass). */
  rows: number;
  /** Effect columns the song uses: 5, or 6 when a row needed one more (R3 of the step-grid plan). */
  effectColumns: number;
  /** For each pattern and voice, the file offset of the block playing on the pattern's first tick (-1: none yet). */
  blockAtStart: number[][];
  /** Rows where more commands ran on one voice than the cell has effect columns (the walk is then not fully shown). */
  overflowRows: number;
}

/** Draw the walk as 64-row patterns, one row per song step. */
export function buildDWGridFromWalk(walk: DwWalk): DwGrid {
  const channels = Math.max(1, walk.channels);
  const clock = dwRowClock(walk);
  const rows = Math.max(1, clock.rowsForTicks(walk.processedTicks));
  const grid: TrackerCell[][] = Array.from({ length: channels }, () => Array.from({ length: rows }, emptyCell));
  // The effects each cell shows, in the order the replayer ran them; placed into the columns once the row is complete.
  const pending = new Map<number, Fx[]>();
  // Ticks into the row the cell's commands ran: one value per cell, or the cell cannot show them.
  const offsets = new Map<number, number>();
  const blockAt: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(-1));

  const curBlock = new Array<number>(channels).fill(-1);
  let ei = 0;
  const ev = walk.events;
  const transposes = dwWalkTransposes(walk);
  for (let r = 0; r < rows; r++) {
    for (; ei < ev.length && clock.tickToRow(ev[ei].ptick).row === r; ei++) {
      const e = ev[ei];
      if (e.channel >= channels) continue;
      curBlock[e.channel] = e.block === 0xffffffff ? -1 : e.block;
      const cell = grid[e.channel][r];
      const key = e.channel * rows + r;
      const { offset } = clock.tickToRow(e.ptick);
      const seen = offsets.get(key);
      if (seen === undefined) offsets.set(key, offset);
      else if (seen !== offset) throw new Error(`voice ${e.channel + 1} runs commands at ticks ${seen} and ${offset} of row ${r}; one row cannot show both`);
      if (e.kind === DW_WALK.note) {
        // named by the pitch the replayer plays it at: the byte through the period table, the sample's tuning, the transposes
        cell.note = dwByteToNote(walk.layout.pitch, e.b, e.a, transposes.get(e));
        cell.instrument = e.a >= 0 ? e.a + 1 : 0;
      } else if (e.kind === DW_WALK.mute) {
        // a mute is a note-off only where it stops a sounding voice
        if (e.a === 1 && cell.note === 0) cell.note = 97;
      } else {
        const fx = dwEventEffects(e);
        if (fx.length > 0) {
          const list = pending.get(key);
          if (list) list.push(...fx); else pending.set(key, [...fx]);
        }
      }
    }
    for (let ch = 0; ch < channels; ch++) blockAt[ch][r] = curBlock[ch];
  }
  // Events on or after the wrap tick belong to the next pass, which the order loop plays from row 0: none is drawn.
  // The loop command itself ran at the end of this pass, so it shows on the last row (no row offset: it is no
  // command of that row's own tick).
  for (; ei < ev.length; ei++) {
    const e = ev[ei];
    if (e.kind !== DW_WALK.endOfTrack || e.channel >= channels || e.ptick < walk.processedTicks) continue;
    const fx = dwEventEffects(e);
    if (fx.length === 0) continue;
    const key = e.channel * rows + (rows - 1);
    const list = pending.get(key);
    if (list) list.push(...fx); else pending.set(key, [...fx]);
  }

  // The row offset leads the effect list: it takes the first slot, so the edit layer finds the rest behind it.
  for (const [key, offset] of offsets) {
    if (offset === 0) continue;
    const list = pending.get(key);
    if (list) list.unshift([DW_FX.rowOffset, offset]); else pending.set(key, [[DW_FX.rowOffset, offset]]);
  }
  let effectColumns = EFFECT_SLOTS;
  for (const list of pending.values()) if (fitEffectColumns(list).overflow) { effectColumns = EFFECT_SLOTS + 1; break; }
  let overflowRows = 0;
  for (const [key, list] of pending) {
    const { shown, overflow } = fitEffectColumns(list, effectColumns);
    if (overflow) overflowRows++;
    const cell = grid[Math.floor(key / rows)][key % rows] as unknown as Record<string, number>;
    shown.slice(0, MAX_EFFECT_SLOTS).forEach(([typ, val], i) => { cell[SLOT_KEYS[i][0]] = typ; cell[SLOT_KEYS[i][1]] = val; });
  }

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const blockAtStart: number[][] = [];
  for (let start = 0, p = 0; start < rows; start += ROWS_PER_PATTERN, p++) {
    const len = Math.min(ROWS_PER_PATTERN, rows - start);
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      // The editor draws channelMeta.effectCols columns (default 2); without it slots 3-6 stay hidden.
      channelMeta: { importedFromMOD: false, effectCols: effectColumns },
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    blockAtStart.push(blockAt.map((b) => b[start]));
  }
  return { patterns, songPositions, rows, effectColumns, blockAtStart, overflowRows };
}
