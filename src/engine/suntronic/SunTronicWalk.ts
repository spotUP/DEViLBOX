/**
 * SunTronicWalk.ts - the replayer's own walk of a SunTronic V1.3 song.
 *
 * Runs the SunTronicPlayer sequencer (tempo counters, GETNEXTNOTE, position loads; no
 * EFFECTS) for one pass of a subsong and returns, per voice, every row the replayer
 * decoded: its position and row, the player step it was decoded on, every pitch byte
 * with the select staged for it, and every control opcode with its operands.
 *
 * This is the oracle the editable grid is held to (sunTronicGridMatchesPlayer.test.ts):
 * the grid must show, per voice per row, what this walk shows. Nothing here reads the
 * grid, and the grid code does not call this (it decodes the stream itself), so the
 * two are independent decoders of the same bytes with the player's state machine in
 * between them.
 */
import type { SunV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicPlayer, type SunWalkGroup } from './SunTronicPlayer';

export interface SunSongWalk {
  /** Rows per voice in the order the replayer decoded them (one pass of the sequence). */
  voices: SunWalkGroup[][];
  /** Per voice: the pass ended because the sequence stopped (true) or restarted (false). */
  stopped: boolean[];
  /** Per voice: the pass ended within the step budget. */
  finished: boolean[];
  /** Player steps (PAL vblanks) run. */
  steps: number;
}

export interface SunWalkOptions {
  subsong?: number;
  /** Step budget (default 600000, about 3.3 hours of song). */
  maxSteps?: number;
}

export function walkSunTronic(score: SunV13Score, opts: SunWalkOptions = {}): SunSongWalk {
  const player = new SunTronicPlayer(score, { subsong: opts.subsong ?? 0, walkOnly: true });
  const voices: SunWalkGroup[][] = [[], [], [], []];
  const finished = [false, false, false, false];
  const stopped = [false, false, false, false];
  player.groupRecorder = (g) => { if (!finished[g.channel]) voices[g.channel].push(g); };
  player.passRecorder = (ch, stop) => { if (!finished[ch]) { finished[ch] = true; stopped[ch] = stop; } };
  const budget = opts.maxSteps ?? 600000;
  let steps = 0;
  while (steps < budget && !finished.every(Boolean)) {
    player.stepVblankOnce();
    steps++;
  }
  return { voices, stopped, finished, steps };
}

export interface SunClockSkew {
  /** Every voice's row r starts inside voice 0's row r (the grid's rows are then the same row on every voice). */
  aligned: boolean;
  /** Largest start offset of any voice's row behind voice 0's, in player steps (vblanks). */
  maxOffset: number;
  /** Why the rows are not shared, or null. */
  reason: string | null;
}

/**
 * The grid shows row r of every voice side by side, so it can only be the replayer's walk when
 * row r of each voice is (nearly) the same moment. Two things move voices apart. A speed
 * opcode (0x98) in voice 0's stream is applied to the other voices after they have already
 * counted the step, so they decode that row (new speed - old speed) steps late for the rest
 * of the pass: a sub-row offset the tracker cannot show, kept as is. A voice speed opcode
 * (0x8f) gives voices their own row clocks: row r is then a different moment on each voice
 * and no row-aligned grid can show it.
 */
export function sunWalkClockSkew(walk: SunSongWalk): SunClockSkew {
  const lens = walk.voices.map((v) => v.length);
  if (new Set(lens).size > 1) {
    return { aligned: false, maxOffset: 0, reason: `the voices play different numbers of rows (${lens.join(', ')})` };
  }
  const base = walk.voices[0];
  let maxOffset = 0;
  for (let r = 0; r < base.length; r++) {
    const len = r + 1 < base.length ? base[r + 1].step - base[r].step : (r > 0 ? base[r].step - base[r - 1].step : 1);
    for (let v = 1; v < walk.voices.length; v++) {
      const off = walk.voices[v][r].step - base[r].step;
      if (Math.abs(off) > maxOffset) maxOffset = Math.abs(off);
      if (Math.abs(off) >= len) {
        return {
          aligned: false, maxOffset: Math.max(maxOffset, Math.abs(off)),
          reason: `the voices run on different row clocks (per-voice speed): row ${r} starts ${off} steps apart on voice ${v + 1} against a row of ${len}`,
        };
      }
    }
  }
  return { aligned: true, maxOffset, reason: null };
}
