/**
 * Auto Scratch survives what happens in a set (owner scratch plan sections 59, 60, 63, 72; ledger
 * SCR-P8.5, P8.6, P8.8). Through the controller's entry `DJScratchDJ.tick()` with the real
 * `ScratchExecutor` on live deck events (fake clock and timers): mid-phrase, each set event ends
 * the phrase gracefully - the run cancelled, what it touched restored, no timer left, and the
 * performer back to IDLE (or LISTENING on the next tick) - and an engine error inside a stroke
 * ends in IDLE with the deck at its rest state while the DJ goes on.
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ, type ScratchTickInput } from '../scratch/DJScratchDJ';
import { ScratchExecutor } from '../scratch/ScratchExecutor';
import { deckAnchor } from '../scratch/scratchAnchor';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { fractionalBeatAt, timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import type { ExecutorTimers } from '../autodj/executorTimers';
import type { DJPerformanceContext, DJTrackAnalysis } from '../autodj/types';
import type { ScratchSnapshot } from '../scratch/scratchSnapshot';

type SetEvent = 'bpmChange' | 'tempoSync' | 'deckChange' | 'userScratchPad' | 'transitionStarts' | 'autoDJOff' | 'deckLoad' | 'deckUnload';

function rig(opts: { throwOnFire?: boolean } = {}) {
  const track = corpusAnalysis('steady');
  const barT = (b: number) => timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b));
  let sec = barT(7) + 0.05;
  const intervals: Array<() => void> = [];
  const timers: ExecutorTimers = {
    now: () => sec * 1000,
    setInterval: (fn) => { intervals.push(fn); return fn; },
    clearInterval: (h) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); },
    setTimeout: () => null, clearTimeout: () => undefined,
  };
  const rest: ScratchSnapshot = { rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 };
  const deck = { ...rest };
  let fires = 0, restores = 0, errors = 0;
  let bpm = track.bpm;
  const ctrl = new DJScratchDJ({
    seed: 2,
    chooseSource: (ctx) => {
      const a = deckAnchor(barT(ctx.masterBar + 1), barStartBeat(track.downbeats, ctx.masterBar + 1), 'downbeat', track.bpm);
      return { source: { type: 'DECK', deck: 'A', anchor: a }, anchor: a };
    },
    executorFor: (_d, t) => new ScratchExecutor({
      clock: { beatNow: () => fractionalBeatAt(t.beatGrid, sec), beatSec: () => 60 / bpm }, contextTime: () => sec,
      fire: () => { if (opts.throwOnFire) throw new Error('stroke failed'); fires++; deck.rate = 0.3; deck.channelGain = 0; deck.captureFrozen = true; return true; },
      release: () => undefined,
      probe: { capture: () => ({ ...deck }), restore: (s, fields) => { restores++; for (const f of fields) (deck as unknown as Record<string, unknown>)[f] = s[f]; } },
      recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
      timers, tickMs: 5, lookaheadSec: 0.1,
      onError: () => { errors++; ctrl.reset('engine error'); },
    }),
  });
  const input = (over: Partial<ScratchTickInput> = {}, t: DJTrackAnalysis = track): ScratchTickInput => ({
    perf: { currentDeck: 'A', currentTrack: t, incomingTrack: null, currentPosition: sec, setPhase: 'CRUISING', setEnergy: 0.7, targetEnergy: 0.7 } as unknown as DJPerformanceContext,
    deck: 'A', mode: 'PERFORMER', style: 'boomBap', scratchPermission: 2, decksPlaying: { A: true, B: false }, ...over,
  });
  /** Run until a stroke has fired (mid-phrase). */
  const untilStroke = () => {
    for (let k = 0; k < 20000 && fires === 0 && errors === 0; k++) {
      if (k % 4 === 0) ctrl.tick(input());
      sec += 0.005;
      for (const fn of [...intervals]) fn();
    }
  };
  return { ctrl, deck, rest, intervals, input, untilStroke, track, setBpm: (b: number) => { bpm = b; }, counts: () => ({ fires, restores, errors }) };
}

describe('Auto Scratch survives set events (SCR-P8.5, P8.6)', () => {
  const EVENTS: SetEvent[] = ['bpmChange', 'tempoSync', 'deckChange', 'userScratchPad', 'transitionStarts', 'autoDJOff', 'deckLoad', 'deckUnload'];
  for (const ev of EVENTS) {
    it(`${ev} mid-phrase: the phrase ends gracefully, the deck is restored, no timer is left`, () => {
      const r = rig();
      r.untilStroke();
      expect(r.counts().fires).toBeGreaterThan(0);
      expect(r.deck.rate).toBe(0.3);
      const other = { ...r.track, id: 'other-track' } as DJTrackAnalysis;
      switch (ev) {
        // a tempo move: the executor's clock reads the deck's tempo, the plan stands (re-planned on the next window)
        case 'bpmChange': case 'tempoSync': r.setBpm(r.track.bpm * 1.04); r.ctrl.tick(r.input()); r.ctrl.reset(ev); break;
        case 'deckChange': r.ctrl.tick(r.input({ deck: 'B' })); break;
        case 'userScratchPad': r.ctrl.tick(r.input({ userControl: 'a scratch control' })); break;
        case 'transitionStarts': r.ctrl.tick(r.input({ hold: true })); r.ctrl.reset('transition cancelled'); break;
        case 'autoDJOff': r.ctrl.tick(r.input({ mode: 'OFF' })); break;
        case 'deckLoad': r.ctrl.tick(r.input({}, other)); break;
        case 'deckUnload': r.ctrl.tick(r.input({ perf: { currentDeck: 'A', currentTrack: null } as unknown as DJPerformanceContext })); break;
      }
      expect(r.counts().restores, ev).toBeGreaterThanOrEqual(1);
      expect(r.deck, ev).toEqual(r.rest);
      // a new track is re-planned at once (its own executor ticks); everything else stops ticking
      if (ev === 'deckLoad') expect(r.ctrl.lastPlan, 'replanned on the new track').not.toBeNull();
      else expect(r.intervals, `${ev}: timers left`).toHaveLength(0);
      expect(['IDLE', 'LISTENING'], ev).toContain(r.ctrl.state);
      if (ev === 'userScratchPad') {
        expect(r.ctrl.state).toBe('IDLE');
        r.ctrl.tick(r.input()); // the next tick listens again, it does not resume the phrase
        expect(r.ctrl.state).not.toBe('ABORTING');
      }
    });
  }
});

describe('emergency fallback (SCR-P8.8)', () => {
  it('a stroke that throws: the run is released, the performer IDLE, nothing left ticking, the next tick goes on', () => {
    const r = rig({ throwOnFire: true });
    r.untilStroke();
    expect(r.counts().errors).toBe(1);
    expect(r.ctrl.state).toBe('IDLE');
    expect(r.intervals).toHaveLength(0);
    expect(r.deck).toEqual(r.rest);
    expect(() => r.ctrl.tick(r.input())).not.toThrow();
  });
});
