/**
 * P13 (owner 2026-10-12): DEViLBOX's live extras sit on top of the demo's overlay and never change what the
 * demo plans. Through the controller's entry `DJScratchDJ.tick()` on a track whose vocal is strong in every
 * bar: the governor's vocal rule and the evaluation's planned rest (a phrase that collided with the vocal)
 * hold only DEViLBOX's extras - every stroke of the demo's overlay is handed to the executor.
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import type { DJPerformanceContext } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

describe('a strong vocal never thins the demo\'s overlay (P13)', () => {
  it('MUSICAL over a vocal at 0.95 in every bar: every demo stroke reaches the executor; the rest and the governor hold the extras only', () => {
    const track = corpusAnalysis('steady');
    track.vocalActivity = { ...track.vocalActivity, values: track.vocalActivity.values.map(() => 0.95) };
    const events: ScratchEvent[] = [];
    const ctrl = new DJScratchDJ({ seed: 4, executorFor: () => ({ schedule: (e) => { events.push(e); }, cancel: () => {}, active: 0 }) });
    const plans: NonNullable<DJScratchDJ['lastPlan']>[] = [];
    for (let b = 0; b < track.downbeats.bars.length - 1; b++) for (const f of [0.1, 0.6]) {
      const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + f;
      ctrl.tick({
        perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'BUILD', setEnergy: 0.6, targetEnergy: 0.7 } as unknown as DJPerformanceContext,
        deck: 'A', mode: 'MUSICAL', style: 'boomBap', genreHint: 'hipHop', scratchPermission: 2, decksPlaying: { A: true, B: false },
      });
      if (ctrl.lastPlan && !plans.includes(ctrl.lastPlan)) plans.push(ctrl.lastPlan);
    }
    const demo = plans.flatMap((p) => p.events).filter((e) => e.layer === 'demo');
    expect(demo.length).toBeGreaterThan(4);
    // a stroke is identified by its beat on the deck clock and its gesture
    const key = (beat: number, gesture: string) => `${beat.toFixed(6)}:${gesture}`;
    const scheduled = events.map((e) => key(e.executeAtBeat, e.gesture));
    for (const e of demo) expect(scheduled, `bar ${e.bar} step ${e.step} ${e.gesture}`).toContain(key(barStartBeat(track.downbeats, e.bar) + e.step / 4, e.gesture));
    // the vocal collided: the evaluation asked for a rest at least once, and the demo still played through it
    expect(plans.some((p) => p.reasons.some((r) => r.startsWith('rest (extras)')) && p.events.some((e) => e.layer === 'demo'))).toBe(true);
  });
});
