/**
 * The shared hands budget (owner scratch plan section 27, ledger D7 / SCR-P7.11): one budget of 6
 * for everything the Auto DJ performs at once. The scratch gets what the juggle, the transition and
 * the FX leave; the juggle planner (`budgetFor`, through the controller's own context builder) gets
 * what the scratch, the transition and the FX leave. Same module both ways.
 */
import { describe, it, expect } from 'vitest';
import { HAND_COSTS, checkHands, juggleCost, juggleIntensityCap, juggleLevelForIntensity, scratchCost, scratchPermission, transitionCost } from '../performanceBudget';
import { budgetFor, intensityFor } from '../juggle/jugglePlanner';
import { DJJuggleController, type TickInput } from '../juggle/juggleController';
import { corpusAnalysis } from '../testing/corpus';
import { DJScratchDJ } from '../../scratch/DJScratchDJ';
import { timeAtBeat, barStartBeat } from '../beatGrid';
import type { DJPerformanceContext } from '../types';

function jugglerContext(otherHands: number) {
  const a = corpusAnalysis('drops');
  const controller = new DJJuggleController({
    sink: { apply: () => {}, state: () => ({ crossfader: 0, playing: { A: true, B: true }, audible: { A: true, B: true }, loops: { A: false, B: false } }), restore: () => {} },
    clockFor: () => ({ beatNow: () => 0, beatSec: () => 0.5 }),
    positionOf: () => 50,
    now: () => 1_000_000,
  });
  const input: TickInput = {
    masterDeck: 'A',
    decks: { A: { trackId: 'a.wav', analysis: a, positionSec: 50, playing: true, bpm: a.bpm }, B: { trackId: 'b.wav', analysis: a, positionSec: 50, playing: true, bpm: a.bpm } },
    setPhase: 'PEAK', energy: 0.8, targetEnergy: 0.9, performanceMode: 'JUGGLE', transitionApproachingSec: 400, otherHands,
  };
  return controller.buildContext(input);
}

describe('hands budget (SCR-P7.11)', () => {
  it('section 27 numbers: juggle 3 + filter 1 -> scratch <= 2; aggressive juggle 4 + bass swap 1 + echo 1 -> scratch 0', () => {
    expect(scratchPermission({ juggleCost: HAND_COSTS.beatJuggle, transitionCost: transitionCost('filterBuild') })).toBe(2);
    expect(scratchPermission({ juggleCost: HAND_COSTS.aggressiveJuggle, transitionCost: transitionCost('bassSwap'), fxCost: transitionCost('echoOut') })).toBe(0);
    expect(scratchPermission({})).toBe(4);
  });

  it('the owner pile-up (beat juggle + crab + transformer + filter sweep + echo throw + bass swap) is rejected', () => {
    const r = checkHands(['beatJuggle', 'complexScratch', 'shortScratch', 'filterMove', 'filterMove', 'eqMove']);
    expect(r.ok).toBe(false);
    expect(r.used).toBe(9);
    expect(r.reason).toContain('of 6');
  });

  it('juggle levels: intensity -> level -> cost, and the inverse cap from the hands left', () => {
    expect([0, 0.3, 0.65, 0.9].map(juggleLevelForIntensity)).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3].map(juggleCost)).toEqual([0, 2, 3, 4]);
    expect([6, 4, 3, 2, 1].map(juggleIntensityCap)).toEqual([1, 1, 0.75, 0.4, 0]);
    // a battle scratch takes 4 hands: what is left fits a phrase juggle at most
    expect(juggleIntensityCap(6 - scratchCost({ maxLevel: 4, feature: true, battle: true }))).toBe(0.4);
  });

  it('the juggle planner reads the same budget: a battle scratch (4) caps the juggle at a phrase juggle, 5 busy hands block it', () => {
    const free = budgetFor(jugglerContext(0), 'AGGRESSIVE');
    expect(free.allowed).toBe(true);
    expect(free.maxIntensity).toBe(1);
    const battle = budgetFor(jugglerContext(4), 'AGGRESSIVE');
    expect(battle.maxIntensity).toBe(0.4);
    const busy = budgetFor(jugglerContext(5), 'AGGRESSIVE');
    expect(busy.allowed).toBe(false);
    expect(busy.reasons.join('; ')).toMatch(/hands budget: 5 of 6/);
    // Juggle Now skips timing, never the hands; the user's intensity override is bound too
    expect(budgetFor(jugglerContext(5), 'AGGRESSIVE', { skipTiming: true }).allowed).toBe(false);
    expect(intensityFor(jugglerContext(3), 'AGGRESSIVE', 1)).toBe(0.75);
  });

  it('the scratch performer reports the hands it holds while it performs, 0 when idle', () => {
    const track = corpusAnalysis('steady');
    const ctrl = new DJScratchDJ({ seed: 4, executorFor: () => ({ schedule: () => {}, cancel: () => {}, active: 0 }) });
    expect(ctrl.handsInUse()).toBe(0);
    let held = 0;
    for (let b = 0; b < track.downbeats.bars.length - 1; b++) {
      const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + 0.1;
      ctrl.tick({
        perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'PEAK', setEnergy: 0.8, targetEnergy: 0.9 } as unknown as DJPerformanceContext,
        deck: 'A', mode: 'PERFORMER', style: 'electro', genreHint: 'house', scratchPermission: 4,
      });
      held = Math.max(held, ctrl.handsInUse());
    }
    expect(held).toBeGreaterThanOrEqual(1);
    expect(held).toBeLessThanOrEqual(4);
    ctrl.reset('end');
    expect(ctrl.handsInUse()).toBe(0);
  });
});
