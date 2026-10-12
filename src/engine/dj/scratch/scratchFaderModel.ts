/**
 * Fader model (owner plan sections 19, 20; ledger SCR-P1.4, P1.5).
 *
 * Pure functions from a gesture's fader windows to a gain, the one source
 * the pattern player (`ScratchPlayback`) reads for every pattern, both for
 * the tick's channel-gain step and the AudioParam cut schedules. Numbers:
 * - open/cut windows: the gesture's `faderWindows` (section 19);
 * - cut lead: `cutLeadMs` shifts every window in time (reference `off`,
 *   chirp/flare timing);
 * - ramp (deck pattern path): DEViLBOX's 3 ms anti-click ramp at rest, growing
 *   to 8 ms at a 4x stroke; the record voice uses the reference ramp
 *   `cutRampSec` (1 + 2 (1 - v) ms, sharper as the velocity rises, O7);
 * - battle response: reference `turntable.py fader_curve` - exponents
 *   smooth 2, sharp 6, battle 12, cut-in 0.03 (closed zone of a battle fader);
 *   the record voice's worklet shapes every cut with it (`faderCurveShape`).
 * - section 20: a window's `curve` names the fader it is performed on;
 *   `applyFaderGain` routes to that sink only, never to the other.
 */

import type { ScratchFaderWindow, ScratchGesture } from './scratchTypes';

/** Reachability sentinel: how many times the model was asked for a gain. */
export const scratchFaderModelStats = { faderGainAtCalls: 0, faderCurveCalls: 0 };

export const FADER_RAMP_MS = { rest: 3, max: 8 } as const;
export const FADER_CURVES = { smooth: 2, sharp: 6, battle: 12 } as const;
export type FaderCurveMode = keyof typeof FADER_CURVES;
export const BATTLE_CUT_IN = 0.03;

export function cycleMs(gesture: Pick<ScratchGesture, 'cycleBeats'>, bpm: number): number {
  return (60000 / Math.max(1, bpm)) * gesture.cycleBeats;
}

/** The gesture's open windows in cycle fractions with the cut lead applied
 *  (a negative lead moves every window earlier). */
export function leadShiftedWindows(gesture: Pick<ScratchGesture, 'faderWindows' | 'cutLeadMs' | 'cycleBeats'>, bpm: number): ScratchFaderWindow[] {
  const lead = (gesture.cutLeadMs ?? 0) / cycleMs(gesture, bpm);
  return gesture.faderWindows.map((w) => ({ open: [w.open[0] + lead, w.open[1] + lead], curve: w.curve }));
}

/** The same windows in milliseconds from the cycle start. */
export function faderWindowsMs(gesture: Pick<ScratchGesture, 'faderWindows' | 'cutLeadMs' | 'cycleBeats'>, bpm: number): Array<{ open: [number, number]; curve: ScratchFaderWindow['curve'] }> {
  const ms = cycleMs(gesture, bpm);
  return leadShiftedWindows(gesture, bpm).map((w) => ({ open: [w.open[0] * ms, w.open[1] * ms], curve: w.curve }));
}

/**
 * 0 or 1: is the fader open at `fraction` of the cycle. Windows are half-open
 * [start, end); a looping cycle wraps the fraction into [0, 1).
 */
export function faderGainAt(gesture: Pick<ScratchGesture, 'faderWindows' | 'cutLeadMs' | 'cycleBeats'>, fraction: number, bpm: number, curve: ScratchFaderWindow['curve'] = 'deck'): 0 | 1 {
  scratchFaderModelStats.faderGainAtCalls++;
  const f = ((fraction % 1) + 1) % 1;
  for (const w of leadShiftedWindows(gesture, bpm)) {
    if (w.curve !== curve) continue;
    if (f >= w.open[0] && f < w.open[1]) return 1;
    // a lead can push a window across the cycle seam
    if (f + 1 >= w.open[0] && f + 1 < w.open[1]) return 1;
    if (f - 1 >= w.open[0] && f - 1 < w.open[1]) return 1;
  }
  return 0;
}

/** Number of cuts (closed spans between open windows) per beat. */
export function cutsPerBeat(gesture: Pick<ScratchGesture, 'faderWindows' | 'cycleBeats'>): number {
  const sorted = [...gesture.faderWindows].sort((a, b) => a.open[0] - b.open[0]);
  let cuts = 0;
  for (let i = 0; i < sorted.length; i++) {
    const end = sorted[i]!.open[1];
    const nextStart = i + 1 < sorted.length ? sorted[i + 1]!.open[0] : sorted[0]!.open[0] + 1;
    if (nextStart - end > 1e-9) cuts++;
  }
  return cuts / gesture.cycleBeats;
}

/** Anti-click ramp in seconds for the current stroke velocity. */
export function faderRampSec(velocity = 1): number {
  const k = Math.max(0, Math.min(1, (Math.abs(velocity) - 1) / 3));
  return (FADER_RAMP_MS.rest + (FADER_RAMP_MS.max - FADER_RAMP_MS.rest) * k) / 1000;
}

/** Reference transfer curve: fader position 0..1 -> gain (section 19
 *  "battle-style response"): below `cutIn` silent, then concave to full. */
export function faderCurve(position: number, mode: FaderCurveMode = 'battle', cutIn = BATTLE_CUT_IN): number {
  const p = Math.max(0, Math.min(1, (position - cutIn) / Math.max(1e-6, 1 - cutIn)));
  return 1 - Math.pow(1 - p, FADER_CURVES[mode]);
}

/**
 * The transfer curve a record-voice cut is performed with (reference `render_gesture`, scratch.py
 * :300-302: every gesture's `curve` defaults to battle, the envelope shaped with cut_in 0): the
 * worklet raises the window gain through `1 - (1 - g)^exponent`. Counted (reachability sentinel).
 */
export function faderCurveShape(mode: FaderCurveMode = 'battle'): { exponent: number; cutIn: number } {
  scratchFaderModelStats.faderCurveCalls++;
  return { exponent: FADER_CURVES[mode], cutIn: 0 };
}

/** Reference cut ramp (scratch.py :299, owner decision O7): 1 + 2 (1 - v) ms - harder hits cut sharper. */
export function cutRampSec(velocity: number): number {
  const v = Math.max(0, Math.min(1, velocity));
  return (1 + 2 * (1 - v)) / 1000;
}

/** Crossfader position that opens (`gain` 1) or closes (0) the given deck:
 *  deck A lives at 0, deck B at 1 (DJMixerEngine convention). */
export function crossfaderPositionFor(deck: 'A' | 'B', gain: 0 | 1): number {
  return deck === 'A' ? 1 - gain : gain;
}

export interface FaderSinks {
  /** The deck's channel fader (section 20 "deck scratch fader"). */
  deck: (gain: 0 | 1) => void;
  /** The mixer crossfader (section 20 "mixer crossfader"), fed a position. */
  crossfader: (position: number) => void;
}

/** Section 20: route a window gain to the fader it names and only that one. */
export function applyFaderGain(window: Pick<ScratchFaderWindow, 'curve'>, gain: 0 | 1, deck: 'A' | 'B', sinks: FaderSinks): void {
  if (window.curve === 'crossfader') sinks.crossfader(crossfaderPositionFor(deck, gain));
  else sinks.deck(gain);
}

/** The fader curves a gesture performs on (one entry per distinct curve). */
export function faderCurvesOf(gesture: Pick<ScratchGesture, 'faderWindows'>): Array<ScratchFaderWindow['curve']> {
  return [...new Set(gesture.faderWindows.map((w) => w.curve))];
}
