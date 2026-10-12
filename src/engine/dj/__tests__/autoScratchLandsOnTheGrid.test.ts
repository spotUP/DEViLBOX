/**
 * Reachability (ledger SCR-P4.R4; owner scratch plan sections 7, 8, 21, 35): the Auto Scratch
 * controller's public entry `DJScratchDJ.tick()` (what `DJAutoDJ`'s poll calls from P7.7 on)
 * plans phrases with `planPhrase` and every planned event reaches the real `ScratchExecutor`,
 * landing on the master deck's grid: fire time - grid beat time = the event's humanize offset,
 * inside [-8, +10] ms, offsets not all equal.
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ, scratchDJStats } from '../scratch/DJScratchDJ';
import { ScratchExecutor, scratchExecutorStats } from '../scratch/ScratchExecutor';
import { scratchPlacementStats } from '../scratch/scratchPlacement';
import { fractionalBeatAt } from '../autodj/beatGrid';
import type { ExecutorTimers } from '../autodj/executorTimers';
import type { ScratchEvent } from '../scratch/scratchTypes';
import { fixtureAnalysis, fixturePerf } from '../scratch/__tests__/fixtures/analysisFixture';

describe('Auto Scratch lands on the grid (SCR-P4.R4)', () => {
  it('MUSICAL boom bap over 24 bars of an instrumental and a breakdown: every planned event is executed within [-8, +10] ms of its grid beat', () => {
    const track = fixtureAnalysis();
    // an instrumental section (the demo's showcase state, capped to medium by MUSICAL): its phrase-end bars always scratch
    track.sections[1]!.kind = 'instrumental';
    track.vocalActivity = { ...track.vocalActivity, values: track.vocalActivity.values.map(() => 0) };
    let sec = 0.18 + 15 * 2 + 0.05; // bar 15, the bar before the chorus
    const intervals: Array<() => void> = [];
    const timers: ExecutorTimers = {
      now: () => sec * 1000,
      setInterval: (fn) => { intervals.push(fn); return fn; },
      clearInterval: (h) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); },
      setTimeout: () => null, clearTimeout: () => undefined,
    };
    const fires: Array<{ id: string; at: number }> = [];
    const scheduled: ScratchEvent[] = [];
    const ctrl = new DJScratchDJ({
      seed: 7,
      executorFor: (_deck, t) => new ScratchExecutor({
        // the juggling executor's `analysisClock` shape, without its module graph
        clock: { beatNow: () => fractionalBeatAt(t.beatGrid, sec), beatSec: () => 60 / t.bpm }, contextTime: () => sec,
        fire: (id, o) => { fires.push({ id, at: o.at ?? sec }); return true; },
        release: () => undefined,
        probe: { capture: () => ({ rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 }), restore: () => undefined },
        recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
        timers, tickMs: 5, lookaheadSec: 0.1,
      }),
      onPlan: (_p, events) => scheduled.push(...events),
    });
    const before = { phrase: scratchPlacementStats.planPhrase, started: scratchExecutorStats.started, plans: scratchDJStats.plans };

    const endTick = 0.18 + 39 * 2; // poll the controller until bar 39 ...
    const endRun = 0.18 + 42 * 2; // ... then let the executor drain what is planned
    let nextPoll = sec;
    while (sec < endRun) {
      if (sec >= nextPoll && sec < endTick) {
        ctrl.tick({ perf: fixturePerf(track, sec), deck: 'A', mode: 'MUSICAL', style: 'boomBap', scratchPermission: 1 });
        nextPoll += 0.02;
      }
      sec += 0.005;
      for (const fn of [...intervals]) fn();
    }

    // sentinels: the planner drew bars, the controller planned, every planned event executed
    expect(scratchPlacementStats.planPhrase - before.phrase).toBeGreaterThanOrEqual(1);
    expect(scratchDJStats.plans - before.plans).toBeGreaterThanOrEqual(3);
    expect(scheduled.length).toBeGreaterThanOrEqual(4);
    expect(scratchExecutorStats.started - before.started).toBe(scheduled.length);
    expect(fires).toHaveLength(scheduled.length);

    const gridSec = (beat: number) => track.beatGrid.firstBeat + beat * 0.5;
    const byTime = [...scheduled].sort((a, b) => (gridSec(a.executeAtBeat) + a.humanizeMs / 1000) - (gridSec(b.executeAtBeat) + b.humanizeMs / 1000));
    const offsetsMs = byTime.map((e, i) => (fires[i]!.at - gridSec(e.executeAtBeat)) * 1000);
    byTime.forEach((e, i) => {
      expect(fires[i]!.id).toBe(`fx_scratch_${e.gesture}`);
      expect(offsetsMs[i]!).toBeGreaterThanOrEqual(-8 - 1e-6);
      expect(offsetsMs[i]!).toBeLessThanOrEqual(10 + 1e-6);
      expect(offsetsMs[i]!).toBeCloseTo(e.humanizeMs, 3);
    });
    // every event sits on a 1/16 step of a bar's downbeat on the deck clock
    for (const e of scheduled) expect(Math.abs(e.executeAtBeat * 4 - Math.round(e.executeAtBeat * 4))).toBeLessThan(1e-9);
    expect(new Set(offsetsMs.map((o) => o.toFixed(3))).size).toBeGreaterThan(1);
  });
});
