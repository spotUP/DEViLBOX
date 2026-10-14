/**
 * Reachability (ledger SCR-P6.R6; owner scratch plan sections 29, 30, 50-56, 74): the Auto
 * Scratch controller `DJScratchDJ.tick()`, driven by a fake clock at the set's PEAK in PERFORMER
 * mode on the corpus `drops` track, performs a 32-bar feature from the drop - the demo's own
 * three-deck routine (SCR-PHRASING-PARITY D8, sentinel `demoRoutineStats.threeDeck`): the arc's phase
 * is read once per set bar (sentinel `scratchArcStats.phaseAt` +32 x the tempo fold: half-time over the 130 BPM track), the telemetry shows the routine's
 * nine section labels in order, its silent sections stay empty (at least 4 bars), the memory ring is full (16 entries), and when
 * Auto Scratch is switched off the performer ends IDLE with the deck state it touched restored.
 */
import { scratchTempoFold } from '../scratch/scratchTempo';
import { describe, it, expect } from 'vitest';
import { DJScratchDJ, scratchDJStats } from '../scratch/DJScratchDJ';
import { ScratchExecutor } from '../scratch/ScratchExecutor';
import { scratchArcStats } from '../scratch/scratchArc';
import { demoRoutineStats } from '../scratch/scratchDemoRoutines';
import { deckAnchor } from '../scratch/scratchAnchor';
import { corpusAnalysisTwice } from '../autodj/testing/corpus';
import { fractionalBeatAt, timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import type { ExecutorTimers } from '../autodj/executorTimers';
import type { DJPerformanceContext, DJTrackAnalysis } from '../autodj/types';
import type { ScratchSnapshot } from '../scratch/scratchSnapshot';
import type { ScratchEvent } from '../scratch/scratchTypes';

const perfAt = (track: DJTrackAnalysis, t: number): DJPerformanceContext => ({
  currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, currentBeat: 0, currentBar: 0,
  timeRemainingSec: 100, setEnergy: 0.9, targetEnergy: 0.95, setPhase: 'PEAK', candidateTracks: [], creativeRisk: 0.6, confidence: 0.8,
} as unknown as DJPerformanceContext);

describe('Auto Scratch performs the arc (SCR-P6.R6)', () => {
  it('a 32-bar feature at the PEAK: one phase read per bar, nine phases in order, rests, a full memory, IDLE and restored at the end', () => {
    // the drops arrangement twice: the routine plays half-time over its 130 BPM (scratchTempoFold), 64 of its bars
    const track = corpusAnalysisTwice('drops');
    const drop = track.sections.find((s) => s.kind === 'drop')!;
    const barT = (b: number) => timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b));
    let sec = barT(drop.startBar - 1) + 0.05;

    const intervals: Array<() => void> = [];
    const timers: ExecutorTimers = {
      now: () => sec * 1000,
      setInterval: (fn) => { intervals.push(fn); return fn; },
      clearInterval: (h) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); },
      setTimeout: () => null, clearTimeout: () => undefined,
    };
    const deckState: ScratchSnapshot = { rate: 1.02, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 };
    const before = { ...deckState };
    let restores = 0;
    const scheduled: ScratchEvent[] = [];
    const ctrl = new DJScratchDJ({
      seed: 5,
      // the live deck as the source: its strokes dirty the deck, so the run has something to give back
      chooseSource: (ctx) => {
        const a = deckAnchor(barT(ctx.masterBar + 1), barStartBeat(track.downbeats, ctx.masterBar + 1), 'downbeat', track.bpm);
        return { source: { type: 'DECK', deck: 'A', anchor: a }, anchor: a };
      },
      executorFor: (_deck, t) => new ScratchExecutor({
        clock: { beatNow: () => fractionalBeatAt(t.beatGrid, sec), beatSec: () => 60 / t.bpm }, contextTime: () => sec,
        fire: () => { deckState.rate = 0.3; deckState.channelGain = 0; deckState.captureFrozen = true; return true; },
        release: () => undefined,
        probe: {
          capture: () => ({ ...deckState }),
          restore: (s, fields) => { restores++; for (const f of fields) (deckState as unknown as Record<string, unknown>)[f] = s[f]; },
        },
        recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
        timers, tickMs: 5, lookaheadSec: 0.1,
      }),
      onPlan: (_p, events) => scheduled.push(...events),
    });

    const phaseReadsBefore = scratchArcStats.phaseAt;
    const threeDeckBefore = demoRoutineStats.threeDeck;
    const bookendsBefore = scratchDJStats.bookends;
    // to the routine's last moment: the next one (Render three_deck, back to back) is planned a bar ahead; the
    // routine plays half-time over the set's tempo (scratchTempoFold), its 32 bars `fold` x 32 of the set's
    const fold = scratchTempoFold(track.bpm);
    const end = barT(drop.startBar + 32 * fold) - 0.01;
    let nextPoll = sec;
    const runTo = (until: number): void => {
      while (sec < until) {
        if (sec >= nextPoll) { ctrl.tick({ perf: perfAt(track, sec), deck: 'A', mode: 'PERFORMER', style: 'electro', scratchPermission: 1, render: 'three_deck' }); nextPoll += 0.02; }
        sec += 0.005;
        for (const fn of [...intervals]) fn();
      }
    };
    runTo(end);

    expect(scratchArcStats.phaseAt - phaseReadsBefore).toBe(32 * fold);
    const t = ctrl.telemetry();
    // S2: the Render mode plays the routine back to back - the next one is already planned from bar 32
    expect(demoRoutineStats.threeDeck - threeDeckBefore).toBe(2);
    expect([...new Set(t.arcPhases)]).toEqual(['establish', 'build', 'half_bar', 'reorder', 'scratch_feat', 'juggle_feat', 'combined', 'final_burst', 'resolution']);
    expect(t.arcPhases).toHaveLength(32 * fold);
    const featureEvents = scheduled.filter((e) => e.executeAtBeat >= barStartBeat(track.downbeats, drop.startBar) && e.executeAtBeat < barStartBeat(track.downbeats, drop.startBar + 32 * fold));
    // genuine rests: bars with no scratch (the needle's drop / lift bookends are not scratches)
    const scratches = featureEvents.filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift');
    const busyBars = new Set(scratches.map((e) => Math.floor((e.executeAtBeat - barStartBeat(track.downbeats, drop.startBar)) / 4 / fold)));
    expect(32 - busyBars.size).toBeGreaterThanOrEqual(4);
    expect(featureEvents.some((e) => e.role === 'OUTRO')).toBe(true);
    // SCR-PG-CR (C8): the routine opens with the needle drop on its first downbeat and closes with the lift
    expect(scratchDJStats.bookends - bookendsBefore).toBe(2);
    const sorted = [...featureEvents].sort((a, b) => a.executeAtBeat - b.executeAtBeat);
    expect(sorted[0]!.gesture).toBe('needleDrop');
    expect(sorted[0]!.executeAtBeat).toBe(barStartBeat(track.downbeats, drop.startBar));
    expect(sorted[sorted.length - 1]!.gesture).toBe('needleLift');
    expect(ctrl.memory.entries).toHaveLength(16);
    // the performer walked the section 51 states into the feature and out to a rest, then into the next routine
    runTo(barT(drop.startBar + 32 * fold) + 0.05);
    const path = ctrl.states.history.map((h) => h.to);
    expect(path).toEqual(expect.arrayContaining(['LISTENING', 'SETUP', 'FEATURE', 'REST']));
    expect(path.indexOf('SETUP')).toBeLessThan(path.indexOf('FEATURE'));
    // (section 55's decay after a feature no longer shows here: Render three_deck lifts the budget again for the
    // next routine, back to back)

    // switch Auto Scratch off: IDLE, and what the strokes changed is back
    ctrl.tick({ perf: perfAt(track, sec), deck: 'A', mode: 'OFF', style: 'electro', scratchPermission: 1 });
    expect(ctrl.state).toBe('IDLE');
    expect(restores).toBeGreaterThanOrEqual(1);
    expect(deckState).toEqual(before);
  }, 120_000);
});
