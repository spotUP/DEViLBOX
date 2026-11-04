/**
 * tonyWilliamsGrid.ts - the Tony Williams tracker grid, drawn from the tick walk.
 * Row === 50 Hz tick (docs/FORMAT_COMMAND_STREAM_GRID.md). The byte-exact export lives in the
 * layout's block carriers; each grid cell that came from a stream byte is recorded in `sources`
 * so a cell edit can be written back (tonyWilliamsEdits.ts).
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { TW_FX } from './tonyWilliamsEffectGlyphs';
import { TW_VOICES, type TwEvent, type TwWalk } from './tonyWilliamsWalk';

export const TW_ROWS_PER_PATTERN = 64;
const EFFECT_SLOTS = 5;
/** Tracker note of table index 0 (ProTracker naming: 13 = C-1 = period 856, the table's first entry). */
export const TW_NOTE_BASE = 13;

type Fx = [effTyp: number, eff: number];

/** The effect-column entry a command shows, or null (notes, instrument and end-of-block are not effects). */
export function twCommandEffect(e: TwEvent): Fx | null {
  const { op, args } = e.cmd;
  const a0 = args[0] ?? 0;
  if (op >= 0xe0) return [TW_FX.duration, op - 0xdf];
  if (op >= 0xb0 && op <= 0xbf) return [TW_FX.volume, op & 15];
  if (op >= 0xc0 && op <= 0xcf) return [TW_FX.envelope, op & 15];
  if (op >= 0xa0 && op <= 0xaf) return [TW_FX.arpeggio, op & 15];
  switch (op) {
    case 0x81: return [TW_FX.tie, 0];
    case 0x84: return [TW_FX.envelopeParams, a0];
    case 0x85: case 0x86: return [TW_FX.rest, op & 15];
    case 0x87: return [TW_FX.transpose, a0];
    case 0x88: return [TW_FX.slide, a0];
    case 0x89: return [TW_FX.vibrato, a0];
    case 0x8a: return [TW_FX.vibratoOff, 0];
    case 0x8b: case 0x8c: case 0x8d: case 0x8e: case 0x8f: case 0x90: return [TW_FX.flag, op];
    case 0x91: case 0x92: return [TW_FX.volumeStep, op];
    case 0x93: return [TW_FX.fade, 0];
    case 0x82: case 0x83: case 0x94: return [TW_FX.stop, op];
    default: return null;
  }
}

/** A grid cell backed by a stream byte. */
export interface TwSource {
  pattern: number;
  channel: number;
  row: number;
  kind: 'note' | 'instrument' | 'effect';
  /** file offset of the command byte (note byte, D0 byte, or effect command byte) */
  offset: number;
  op: number;
  /** effect: slot and effTyp shown; note: transpose in force */
  slot: number;
  effTyp: number;
  transpose: number;
  /** baseline value shown (note, instrument or eff) */
  value: number;
}

export interface TwGrid {
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  /** per pattern and voice, the block playing on the pattern's first tick (-1: none yet) */
  blockAtStart: number[][];
  sources: TwSource[];
}

const SLOT_KEYS = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5'],
] as const;

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

export function buildTwGrid(walk: TwWalk): TwGrid {
  const rows = walk.ticks;
  const grid: TrackerCell[][] = Array.from({ length: TW_VOICES }, () => Array.from({ length: rows }, emptyCell));
  const used: number[][] = Array.from({ length: TW_VOICES }, () => new Array<number>(rows).fill(0));
  const blockAt: number[][] = Array.from({ length: TW_VOICES }, () => new Array<number>(rows).fill(-1));
  const raw: Array<Omit<TwSource, 'pattern' | 'row'> & { tick: number }> = [];
  const pendingInstr: Array<{ offset: number; value: number } | null> = new Array(TW_VOICES).fill(null);
  const curBlock = new Array<number>(TW_VOICES).fill(-1);
  const ev = walk.events;
  let ei = 0;
  for (let t = 0; t < rows; t++) {
    for (; ei < ev.length && (ev[ei]?.tick ?? 0) <= t; ei++) {
      const e = ev[ei];
      if (!e) break;
      const ch = e.channel;
      curBlock[ch] = e.block;
      const cell = grid[ch]?.[e.tick];
      if (!cell) continue;
      const op = e.cmd.op;
      if (op < 0x80) {
        cell.note = Math.min(96, TW_NOTE_BASE + e.pitch);
        raw.push({ tick: e.tick, channel: ch, kind: 'note', offset: e.cmd.offset, op, slot: -1, effTyp: 0, transpose: e.transpose, value: cell.note });
        const pi = pendingInstr[ch];
        if (pi) {
          cell.instrument = pi.value;
          raw.push({ tick: e.tick, channel: ch, kind: 'instrument', offset: pi.offset, op: 0xd0, slot: -1, effTyp: 0, transpose: 0, value: pi.value });
          pendingInstr[ch] = null;
        }
      } else if (op >= 0xd0 && op <= 0xdf) {
        pendingInstr[ch] = { offset: e.cmd.offset, value: (op & 15) + 1 };
      } else {
        const fx = twCommandEffect(e);
        const slot = used[ch]?.[e.tick] ?? 0;
        if (fx && slot < EFFECT_SLOTS) {
          const c = cell as unknown as Record<string, number>;
          c[SLOT_KEYS[slot]![0]] = fx[0];
          c[SLOT_KEYS[slot]![1]] = fx[1];
          used[ch]![e.tick] = slot + 1;
          raw.push({ tick: e.tick, channel: ch, kind: 'effect', offset: e.cmd.offset, op, slot, effTyp: fx[0], transpose: 0, value: fx[1] });
        }
      }
    }
    for (let ch = 0; ch < TW_VOICES; ch++) blockAt[ch]![t] = curBlock[ch] ?? -1;
  }
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const blockAtStart: number[][] = [];
  const sources: TwSource[] = [];
  for (let start = 0, p = 0; start < rows; start += TW_ROWS_PER_PATTERN, p++) {
    const len = Math.min(TW_ROWS_PER_PATTERN, rows - start);
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    blockAtStart.push(blockAt.map((bl) => bl[start] ?? -1));
    for (const r of raw) {
      if (r.tick >= start && r.tick < start + len) sources.push({ ...r, pattern: p, row: r.tick - start });
    }
  }
  return { patterns, songPositions, rows, blockAtStart, sources };
}
