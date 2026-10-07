/**
 * robHubbardGrid.ts - the Rob Hubbard tracker grid, drawn from the player's own walk.
 *
 * A Rob Hubbard song is a per-voice command stream; the grid is the walk of rhWalk.ts (the
 * player's reader, held to UADE's Paula by robHubbardGridIsPlayersWalk.test.ts): one row per
 * `speed` interrupts (every command lands on such a tick), a note named by the period it starts
 * with (the table entry scaled by its sample's `relative`, which is why a note's name is not its
 * table index) and the sample it plays with, a note-off only where a rest stops a sounding voice,
 * every other command in the effect columns on the row it ran, a silent voice empty. Nothing here
 * reads the module: the walk is the oracle, the byte-exact export lives in the block carriers.
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToPitch } from '@/lib/amiga/periodNotes';
import { RH_FX } from './robHubbardEffectGlyphs';
import { RH_WALK, type RhWalk, type RhWalkEvent } from './rhWalk';

const ROWS_PER_PATTERN = 64;
const EFFECT_SLOTS = 5;

/** The tracker note (1..96) a Paula period plays; 0 when the period names none. */
export function rhPeriodToNote(period: number): number {
  if (!(period > 0)) return 0;
  const n = periodToPitch(period);
  return n >= 1 && n <= 96 ? n : 0;
}

/** The Paula period a note byte plays with sample `relative` (the player's own formula). */
export function rhNotePeriod(buf: Uint8Array, periodsAddr: number, noteByte: number, relative: number): number {
  const entry = (buf[periodsAddr + noteByte * 2] ?? 0) * 256 + (buf[periodsAddr + noteByte * 2 + 1] ?? 0);
  return (entry * relative) >> 10;
}

/** How many note bytes the period table has: the run of entries that fall (the table ends at a zero or a rise). */
export function rhTableLength(buf: Uint8Array, periodsAddr: number): number {
  let prev = Infinity;
  let n = 0;
  for (; n < 128; n++) {
    const e = (buf[periodsAddr + n * 2] ?? 0) * 256 + (buf[periodsAddr + n * 2 + 1] ?? 0);
    if (e === 0 || e >= prev) break;
    prev = e;
  }
  return n;
}

type Fx = [effTyp: number, eff: number];

/** The effect-column entries a walk event shows, in the player's own terms; none for notes, rests and sample changes (those are the note, note-off and instrument columns). */
export function rhEventEffects(e: RhWalkEvent): Fx[] {
  const b8 = (v: number): number => v & 0xff;
  switch (e.kind) {
    case RH_WALK.portamento: return [[RH_FX.portamento, b8(e.a)]];
    case RH_WALK.sustain: return [[RH_FX.sustain, 0]];
    case RH_WALK.volume: return [[RH_FX.volume, b8(e.a)]];
    case RH_WALK.songEnd: return [[RH_FX.songEnd, 0]];
    case RH_WALK.blockEnd: return e.a === 1 ? [[RH_FX.listRestart, 0]] : [];
    case RH_WALK.unknown: return [[RH_FX.unknown, b8(e.b)]];
    default: return [];
  }
}

const SLOT_KEYS = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'],
] as const;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** The block command a grid cell is drawn from (robHubbardEdits.ts writes edits to it) and the sample the voice played it with. */
export interface RHCellSource { fp: number; cmd: number; sample: number }

/** Where a walk event's command sits in the file's blocks; null for a command outside every block. */
export type RhCommandLocator = (block: number, off: number) => { fp: number; cmd: number } | null;

export interface RhGrid {
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  /** Per pattern, voice and row: the block command the cell shows; null where the cell is blank or a command has no note-on or note-off cell. */
  cellSources: Array<Array<Array<RHCellSource | null>>>;
  /** For each pattern and voice, the block playing on the pattern's first row (-1: none yet). */
  blockAtStart: number[][];
  /** Notes whose period names no tracker note (the grid would show nothing for a note the player plays). */
  unnamedNotes: number;
  /** Rows where more commands ran on one voice than the cell has effect columns. */
  overflowRows: number;
}

/** Draw the walk as 64-row patterns, one row per `speed` interrupts. */
export function buildRHGridFromWalk(walk: RhWalk, locate: RhCommandLocator): RhGrid {
  const channels = Math.max(1, walk.voices);
  const speed = Math.max(1, walk.speed);
  const rows = Math.max(1, Math.ceil(walk.ticks / speed));
  const grid: TrackerCell[][] = Array.from({ length: channels }, () => Array.from({ length: rows }, emptyCell));
  const src: Array<Array<RHCellSource | null>> = Array.from({ length: channels }, () => new Array<RHCellSource | null>(rows).fill(null));
  const slots: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(0));
  const blockAt: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(-1));
  const sounding = new Array<boolean>(channels).fill(false);
  const curBlock = new Array<number>(channels).fill(-1);
  let overflowRows = 0;
  let unnamedNotes = 0;

  const ev = walk.events;
  let ei = 0;
  for (let r = 0; r < rows; r++) {
    const tickEnd = r * speed + speed;               // ticks 1 + r*speed .. (r+1)*speed fall on this row
    for (; ei < ev.length && ev[ei].tick <= tickEnd; ei++) {
      const e = ev[ei];
      if (e.voice >= channels) continue;
      curBlock[e.voice] = e.block;
      const cell = grid[e.voice][r];
      const at = locate(e.block, e.off);
      if (e.kind === RH_WALK.note) {
        const n = rhPeriodToNote(e.period);
        if (n === 0) unnamedNotes++;
        cell.note = n;
        cell.instrument = (e.a < 0 ? 0 : e.a) + 1;
        sounding[e.voice] = true;
        if (at) src[e.voice][r] = { ...at, sample: e.a < 0 ? 0 : e.a };
      } else if (e.kind === RH_WALK.rest) {
        // a rest is a note-off only where it stops a sounding voice
        if (sounding[e.voice]) {
          cell.note = 97;
          if (at) src[e.voice][r] = { ...at, sample: e.sample < 0 ? 0 : e.sample };
        }
        sounding[e.voice] = false;
      } else {
        for (const [typ, val] of rhEventEffects(e)) {
          const s = slots[e.voice][r];
          if (s >= EFFECT_SLOTS) { overflowRows++; break; }
          const [kt, kv] = SLOT_KEYS[s];
          (cell as unknown as Record<string, number>)[kt] = typ;
          (cell as unknown as Record<string, number>)[kv] = val;
          slots[e.voice][r] = s + 1;
        }
      }
    }
    for (let ch = 0; ch < channels; ch++) blockAt[ch][r] = curBlock[ch];
  }

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const cellSources: RhGrid['cellSources'] = [];
  const blockAtStart: number[][] = [];
  for (let start = 0, p = 0; start < rows; start += ROWS_PER_PATTERN, p++) {
    const len = Math.min(ROWS_PER_PATTERN, rows - start);
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    cellSources.push(src.map((s) => s.slice(start, start + len)));
    blockAtStart.push(blockAt.map((b) => b[start]));
  }
  return { patterns, songPositions, rows, cellSources, blockAtStart, unnamedNotes, overflowRows };
}
