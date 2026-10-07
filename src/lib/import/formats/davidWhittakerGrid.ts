/**
 * davidWhittakerGrid.ts - the David Whittaker tracker grid, drawn from the replayer's own walk.
 *
 * A DW song is a per-channel command stream; the grid is the replayer's tick timeline (row ===
 * 50 Hz tick, docs/FORMAT_COMMAND_STREAM_GRID.md) of what davidwhittaker.c's track reader executed:
 * a note with the sample it plays with, a note-off only where a mute stops a sounding voice, every
 * other command in the effect columns on the tick it ran, a silent voice empty. Nothing here reads
 * the module: the walk is the oracle (DavidWhittakerWasmExtractor), the byte-exact export lives in
 * the layout's block carriers.
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { DW_FX } from './davidWhittakerEffectGlyphs';
import { DW_WALK, type DwWalk, type DwWalkEvent } from './DavidWhittakerWasmExtractor';

const ROWS_PER_PATTERN = 64;
const EFFECT_SLOTS = 5;

/** The tracker note a DW track byte plays: an index into the 60-entry period table, C-1 = 25. */
export function dwTrackByteToNote(byte: number): number {
  const n = byte + 25;
  return n >= 1 && n <= 96 ? n : 0;
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
    case DW_WALK.speed: return [[DW_FX.speed, b8(e.a)]];
    case DW_WALK.delaySpeed: return [[DW_FX.delaySpeed, b8(e.a)]];
    case DW_WALK.globalFade: return [[DW_FX.globalVolumeFade, b8(e.a)]];
    case DW_WALK.globalVolume: return [[DW_FX.globalVolume, b8(e.a)]];
    case DW_WALK.soundEffect: return [[DW_FX.soundEffect, b8(e.a)]];
    // a voice reaching the end of its position list and restarting
    case DW_WALK.endOfTrack: return e.b === 1 ? [[DW_FX.loop, b8(e.a)]] : [];
    default: return [];
  }
}

const SLOT_KEYS = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'],
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
export function fitEffectColumns(list: Fx[]): { shown: Fx[]; overflow: boolean } {
  if (list.length <= EFFECT_SLOTS) return { shown: list, overflow: false };
  const kept = list.filter(([typ], i) => !(STATE_SETTING.has(typ) && list.some(([t2], j) => j > i && t2 === typ)));
  return { shown: kept.slice(0, EFFECT_SLOTS), overflow: kept.length > EFFECT_SLOTS };
}

export interface DwGrid {
  patterns: Pattern[];
  songPositions: number[];
  /** Rows of the timeline (ticks of the longest voice's first pass). */
  rows: number;
  /** For each pattern and voice, the file offset of the block playing on the pattern's first tick (-1: none yet). */
  blockAtStart: number[][];
  /** Rows where more commands ran on one voice than the cell has effect columns (the walk is then not fully shown). */
  overflowRows: number;
}

/** Draw the walk as 64-row patterns on the 50 Hz tick timeline. */
export function buildDWGridFromWalk(walk: DwWalk): DwGrid {
  const channels = Math.max(1, walk.channels);
  const rows = Math.max(1, walk.ticks);
  const grid: TrackerCell[][] = Array.from({ length: channels }, () => Array.from({ length: rows }, emptyCell));
  // The effects each cell shows, in the order the replayer ran them; placed into the columns once the tick is complete.
  const pending = new Map<number, Fx[]>();
  const blockAt: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(-1));
  let overflowRows = 0;

  const curBlock = new Array<number>(channels).fill(-1);
  let ei = 0;
  const ev = walk.events;
  for (let t = 0; t < rows; t++) {
    for (; ei < ev.length && ev[ei].tick === t; ei++) {
      const e = ev[ei];
      if (e.channel >= channels) continue;
      curBlock[e.channel] = e.block === 0xffffffff ? -1 : e.block;
      const cell = grid[e.channel][t];
      if (e.kind === DW_WALK.note) {
        cell.note = dwTrackByteToNote(e.b);
        cell.instrument = e.a >= 0 ? e.a + 1 : 0;
      } else if (e.kind === DW_WALK.mute) {
        // a mute is a note-off only where it stops a sounding voice
        if (e.a === 1 && cell.note === 0) cell.note = 97;
      } else {
        const fx = dwEventEffects(e);
        if (fx.length > 0) {
          const key = e.channel * rows + t;
          const list = pending.get(key);
          if (list) list.push(...fx); else pending.set(key, [...fx]);
        }
      }
    }
    for (let ch = 0; ch < channels; ch++) blockAt[ch][t] = curBlock[ch];
  }

  for (const [key, list] of pending) {
    const { shown, overflow } = fitEffectColumns(list);
    if (overflow) overflowRows++;
    const cell = grid[Math.floor(key / rows)][key % rows] as unknown as Record<string, number>;
    shown.forEach(([typ, val], i) => { cell[SLOT_KEYS[i][0]] = typ; cell[SLOT_KEYS[i][1]] = val; });
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
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    blockAtStart.push(blockAt.map((b) => b[start]));
  }
  return { patterns, songPositions, rows, blockAtStart, overflowRows };
}
