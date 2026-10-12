/**
 * Fader model (owner scratch plan sections 19, 20; ledger SCR-P1.4, P1.5):
 * gain from open/cut windows, the cut lead, the ramp, the battle response,
 * and the rule that a crossfader window is never applied to the channel fader.
 */
import { describe, it, expect } from 'vitest';
import {
  faderGainAt, faderWindowsMs, cutsPerBeat, faderRampSec, faderCurve, applyFaderGain,
  crossfaderPositionFor, cycleMs, BATTLE_CUT_IN, FADER_RAMP_MS,
} from '../scratchFaderModel';
import { getGesture } from '../scratchGestureCatalog';

describe('faderGainAt (SCR-P1.4)', () => {
  it('chirp is open at 0.2 and cut at 0.5 of its cycle', () => {
    const chirp = getGesture('chirp');
    expect(faderGainAt(chirp, 0.2, 120)).toBe(1);
    expect(faderGainAt(chirp, 0.5, 120)).toBe(0);
    expect(faderGainAt(chirp, 0.75, 120)).toBe(1);
    expect(faderGainAt(chirp, 0.0, 120)).toBe(0);
    expect(faderGainAt(chirp, 1.2, 120)).toBe(1); // wraps into the cycle
  });

  it('transformer8 at 120 BPM has 8 cuts per beat, transformer4 4 cuts in its 2 steps (8 per beat), crab 5 taps = 4 cuts in 2 steps (8), eight-finger crab 8', () => {
    expect(cutsPerBeat(getGesture('transformer8'))).toBe(8);
    expect(cutsPerBeat(getGesture('transformer4'))).toBe(8);
    expect(cutsPerBeat(getGesture('crab'))).toBe(8);
    expect(cutsPerBeat(getGesture('eightFingerCrab'))).toBe(8);
    // count the gain edges over one beat directly
    const t8 = getGesture('transformer8');
    let edges = 0;
    let last = faderGainAt(t8, 0, 120);
    for (let i = 1; i <= 1000; i++) {
      const g = faderGainAt(t8, i / 1000, 120);
      if (g !== last) { edges++; last = g; }
    }
    expect(edges).toBe(16); // 8 opens + 8 closes
  });

  it('a -2 ms cut lead shifts a window by -2 ms at any tempo', () => {
    const chirp = getGesture('chirp');
    const ms = cycleMs(chirp, 120); // the reference 2 steps = 0.5 beat = 250 ms
    expect(ms).toBeCloseTo(250, 6);
    const [first] = faderWindowsMs(chirp, 120);
    expect(first!.open[0]).toBeCloseTo(0.06 * ms - 2, 6);
    expect(first!.open[1]).toBeCloseTo(0.44 * ms - 2, 6);
    const [slow] = faderWindowsMs(chirp, 60);
    expect(slow!.open[0]).toBeCloseTo(0.06 * 500 - 2, 6);
    // without a lead the window sits where the gesture says
    const [stab] = faderWindowsMs(getGesture('forwardStab'), 120);
    expect(stab!.open).toEqual([0, 0.42 * cycleMs(getGesture('forwardStab'), 120)]);
  });

  it('ramp is 3 ms at rest and grows to 8 ms at a 4x stroke', () => {
    expect(faderRampSec(1)).toBeCloseTo(FADER_RAMP_MS.rest / 1000, 9);
    expect(faderRampSec(0)).toBeCloseTo(0.003, 9);
    expect(faderRampSec(4)).toBeCloseTo(FADER_RAMP_MS.max / 1000, 9);
    expect(faderRampSec(-2.5)).toBeGreaterThan(0.003);
    expect(faderRampSec(-2.5)).toBeLessThan(0.008);
  });

  it('battle response: silent below the cut-in, near full after a tiny move; smooth is gradual', () => {
    expect(BATTLE_CUT_IN).toBe(0.03);
    expect(faderCurve(0.02, 'battle')).toBe(0);
    expect(faderCurve(0.25, 'battle')).toBeGreaterThan(0.9);
    expect(faderCurve(1, 'battle')).toBe(1);
    expect(faderCurve(0.25, 'smooth')).toBeLessThan(0.5);
    expect(faderCurve(0.5, 'smooth')).toBeGreaterThan(faderCurve(0.25, 'smooth'));
  });
});

describe('deck fader vs crossfader (section 20, SCR-P1.5)', () => {
  it('crossfader windows are not applied to the channel gain, deck windows never move the crossfader', () => {
    const deckCalls: number[] = [];
    const crossfaderCalls: number[] = [];
    const sinks = { deck: (g: 0 | 1) => { deckCalls.push(g); }, crossfader: (p: number) => { crossfaderCalls.push(p); } };

    applyFaderGain({ curve: 'crossfader' }, 1, 'A', sinks);
    applyFaderGain({ curve: 'crossfader' }, 0, 'A', sinks);
    expect(deckCalls).toEqual([]);
    expect(crossfaderCalls).toEqual([0, 1]); // deck A open = crossfader at 0, closed = 1

    applyFaderGain({ curve: 'deck' }, 0, 'B', sinks);
    applyFaderGain({ curve: 'deck' }, 1, 'B', sinks);
    expect(crossfaderCalls).toEqual([0, 1]);
    expect(deckCalls).toEqual([0, 1]);

    expect(crossfaderPositionFor('B', 1)).toBe(1);
    expect(crossfaderPositionFor('B', 0)).toBe(0);
  });

  it('faderGainAt answers per curve: a deck-only gesture is closed on the crossfader', () => {
    const chirp = getGesture('chirp');
    expect(faderGainAt(chirp, 0.2, 120, 'deck')).toBe(1);
    expect(faderGainAt(chirp, 0.2, 120, 'crossfader')).toBe(0);
    const trade = { faderWindows: [{ open: [0, 0.5] as const, curve: 'crossfader' as const }], cycleBeats: 1, cutLeadMs: 0 };
    expect(faderGainAt(trade, 0.25, 120, 'crossfader')).toBe(1);
    expect(faderGainAt(trade, 0.25, 120, 'deck')).toBe(0);
  });
});
