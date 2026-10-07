/**
 * maGrid.ts - the Music Assembler tracker grid, drawn from the player's own walk.
 *
 * A Music Assembler song is four voices, each a position list of (track, transpose, repeat) over
 * shared tracks of events; the grid is the walk of maWalk.ts (held to the original 68k player in UADE by
 * musicAssemblerWalkMatchesPlayer.test.ts): one row per `speed` ticks, a note named by the table period
 * the voice plays it with (the player's note + the position's transpose + the instrument's wave rate for a
 * sampled wave), the instrument only on a note that restarts the voice, a legato note without one, a
 * note-off only where a release event stops a sounding voice whose instrument releases, the portamento
 * byte and the position's transpose in the effect columns, a silent voice empty. Nothing here reads the
 * module's bytes: the walk is the oracle, the byte-exact export lives in the track carriers and the edit
 * writer (maGridEdits.ts).
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { MA_FX } from './maEffectGlyphs';
import { MA_WALK, type MaWalk } from './maWalk';
import { walkLayout, type WalkLayout } from './walkLayout';
import type { MaModuleData } from './maModule';

const EFFECT_SLOTS = 5;

const SLOT_KEYS = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'],
] as const;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** What a grid cell was drawn from, for the edit writer (maGridEdits.ts). */
export interface MACellSource {
  track: number;
  /** Byte offset of the event in the track. */
  trackOffset: number;
  instr: number;
  transpose: number;
  synth: boolean;
}

export interface MaGrid {
  patterns: Pattern[];
  songPositions: number[];
  layout: WalkLayout;
  /** Per pattern, voice and row: what a note cell was drawn from (null where the cell shows no note). */
  cellSources: Array<Array<Array<MACellSource | null>>>;
  /** Rows where more commands ran on one voice than the cell has effect columns. */
  overflowRows: number;
}

/** The tracker note a table index plays: the table starts at C-0 (periodNotes naming: 1712 = note 1). */
export function maTableIndexToNote(tableIndex: number): number {
  return tableIndex + 1;
}

/** Draw the walk as patterns, one row per `speed` ticks. */
export function buildMaGridFromWalk(walk: MaWalk, m: MaModuleData): MaGrid {
  const layout = walkLayout(walk);
  const channels = 4;
  const speed = Math.max(1, walk.speed);
  const rows = layout.rows;
  const grid: TrackerCell[][] = Array.from({ length: channels }, () => Array.from({ length: rows }, emptyCell));
  const src: Array<Array<MACellSource | null>> = Array.from({ length: channels }, () => new Array<MACellSource | null>(rows).fill(null));
  const slots: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(0));
  const transpose = new Array<number>(channels).fill(0);
  let overflowRows = 0;

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
    if (e.kind === MA_WALK.trackStart) {
      // the position's transpose, shown where it changes
      if (e.played !== transpose[e.voice]) { put(MA_FX.transpose, e.played & 0xff); transpose[e.voice] = e.played; }
      continue;
    }
    if (e.kind === MA_WALK.note || e.kind === MA_WALK.legato) {
      cell.note = maTableIndexToNote(e.tableIndex);
      if (e.kind === MA_WALK.note) {
        cell.instrument = e.instr + 1;
        if (!e.envelope) put(MA_FX.keepEnvelope, 0);
      } else put(MA_FX.legato, 0);
      if (e.pv !== 0) put(MA_FX.portamento, e.pv & 0xff);
      src[e.voice][r] = { track: e.track, trackOffset: e.trackOffset, instr: e.instr, transpose: e.transpose, synth: e.synth };
    } else if (e.kind === MA_WALK.release) {
      // a release event stops a sounding voice only where the instrument's release is not zero
      const ins = m.instruments[e.instr];
      if (e.level > 0 && ins && ins.release > 0) cell.note = 97;
    }
  }

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const cellSources: MaGrid['cellSources'] = [];
  let start = 0;
  layout.patternLengths.forEach((len, p) => {
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      // Paula channels 0 and 3 are left, 1 and 2 right; voice v plays on channel [0, 2, 3, 1][v]
      volume: 100, pan: ch === 0 || ch === 2 ? -50 : 50, instrumentId: null, color: null,
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    cellSources.push(src.map((s) => s.slice(start, start + len)));
    start += len;
  });
  return { patterns, songPositions, layout, cellSources, overflowRows };
}
