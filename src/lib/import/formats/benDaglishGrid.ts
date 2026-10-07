/**
 * benDaglishGrid.ts - the Ben Daglish tracker grid, drawn from the replayer's own walk.
 *
 * A Ben Daglish song is a per-voice position list of tracks, each a byte command stream; the grid is
 * the replayer's tick timeline (row === 50 Hz tick, docs/FORMAT_COMMAND_STREAM_GRID.md) of what
 * ben_daglish.c's track reader executed: a note named by the period it plays, with the sample it
 * plays with, every other command in the effect columns on the tick it ran, a voice that has reached
 * the end of its position list empty. Nothing here reads the module: the walk is the oracle
 * (BenDaglishWasmExtractor), the byte-exact export lives in the layout's track carriers.
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { BD_FX } from './benDaglishEffectGlyphs';
import { BD_WALK, type BdWalk, type BdWalkEvent } from './BenDaglishWasmExtractor';

const ROWS_PER_PATTERN = 64;
const EFFECT_SLOTS = 5;

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

export interface BdGrid {
  patterns: Pattern[];
  songPositions: number[];
  /** Rows of the timeline (ticks until every voice reached the end of its position list). */
  rows: number;
  /** For each pattern and voice, the track playing on the pattern's first tick (-1: none yet). */
  trackAtStart: number[][];
  /** Rows where more commands ran on one voice than the cell has effect columns (the walk is then not fully shown). */
  overflowRows: number;
}

/** Draw the walk as 64-row patterns on the 50 Hz tick timeline. */
export function buildBDGridFromWalk(walk: BdWalk): BdGrid {
  const channels = 4;
  const rows = Math.max(1, walk.ticks);
  const grid: TrackerCell[][] = Array.from({ length: channels }, () => Array.from({ length: rows }, emptyCell));
  const slots: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(0));
  const trackAt: number[][] = Array.from({ length: channels }, () => new Array<number>(rows).fill(-1));
  let overflowRows = 0;

  const curTrack = new Array<number>(channels).fill(-1);
  let ei = 0;
  const ev = walk.events;
  for (let t = 0; t < rows; t++) {
    for (; ei < ev.length && ev[ei].tick === t; ei++) {
      const e = ev[ei];
      if (e.voice >= channels) continue;
      const cell = grid[e.voice][t];
      if (e.kind === BD_WALK.nextTrack) curTrack[e.voice] = e.a;
      else if (e.kind === BD_WALK.note) {
        // a note with no sample sounds nothing; a period of 0 is a note the replayer cannot play
        if (e.a >= 0 && e.c > 0) {
          cell.note = periodToNote(e.c);
          cell.instrument = e.a + 1;
        }
      } else {
        for (const [typ, val] of bdEventEffects(e)) {
          const s = slots[e.voice][t];
          if (s >= EFFECT_SLOTS) { overflowRows++; break; }
          const [kt, kv] = SLOT_KEYS[s];
          (cell as unknown as Record<string, number>)[kt] = typ;
          (cell as unknown as Record<string, number>)[kv] = val;
          slots[e.voice][t] = s + 1;
        }
      }
    }
    for (let ch = 0; ch < channels; ch++) trackAt[ch][t] = curTrack[ch];
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
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    trackAtStart.push(trackAt.map((b) => b[start]));
  }
  return { patterns, songPositions, rows, trackAtStart, overflowRows };
}
