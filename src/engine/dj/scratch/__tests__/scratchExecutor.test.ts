/**
 * Scratch executor core (owner scratch plan sections 8, 18, 60, 83; ledger
 * SCR-P3.5): a planned event fires on the deck's beat clock - a record
 * gesture is handed to the engine ahead of its beat with the beat's context
 * time (`at`), a deck gesture starts on the tick that reaches its beat after
 * a true re-cue - and when the run ends the state it touched is exactly
 * what it was (suppressNotes true and false: the 2026-09-30 regression shape).
 */
import { describe, it, expect } from 'vitest';
import { ScratchExecutor, type ScratchExecutorDeps, type ScratchExecutorEvent } from '../ScratchExecutor';
import type { ScratchSnapshot } from '../scratchSnapshot';
import { snapshotDiff } from '../scratchSnapshot';
import type { ScratchEvent, ScratchSource } from '../scratchTypes';
import { deckAnchor } from '../scratchAnchor';
import type { ExecutorTimers } from '../../autodj/transitionExecutor';
import { analysisClock } from '../../autodj/juggle/juggleController';
import { fixtureAnalysis } from './fixtures/analysisFixture';
import { stepToBeat } from '../scratchAnchor';

/** A manual clock: time in seconds, 120 BPM (0.5 s per beat), beat = seconds / 0.5. */
function rig(opts: { suppressNotes?: boolean } = {}) {
  let sec = 0;
  const intervals: Array<{ fn: () => void; ms: number }> = [];
  const timers: ExecutorTimers = {
    now: () => sec * 1000,
    setInterval: (fn, ms) => { const h = { fn, ms }; intervals.push(h); return h; },
    clearInterval: (h) => { const i = intervals.indexOf(h as never); if (i >= 0) intervals.splice(i, 1); },
    setTimeout: () => null, clearTimeout: () => undefined,
  };
  const state: ScratchSnapshot = { rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: opts.suppressNotes ?? false, crossfader: 0.3, busLevel: 0.8 };
  const fires: Array<{ id: string; at?: number; beat: number; record?: string; role?: string }> = [];
  const releases: string[] = [];
  const releaseAt: Array<number | undefined> = [];
  const events: ScratchExecutorEvent[] = [];
  const recues: Array<[string, number]> = [];
  const deps: ScratchExecutorDeps = {
    clock: { beatNow: () => sec / 0.5, beatSec: () => 0.5 },
    contextTime: () => sec,
    fire: (id, o) => {
      fires.push({ id, at: o.at, beat: sec / 0.5, record: o.record, role: o.role });
      // a scratch dirties the state it touches
      state.rate = 0.4; state.channelGain = 0; state.captureFrozen = true; state.crossfader = 0.9; state.busLevel = 0.5;
      return true;
    },
    release: (id, o) => { releases.push(id); releaseAt.push(o.at); },
    probe: { capture: () => ({ ...state }), restore: (s) => { Object.assign(state, s); } },
    recueDeck: (deck, a) => { recues.push([deck, a]); return { recued: true, mode: 'audio', returnsToAnchor: true }; },
    timers, tickMs: 5, lookaheadSec: 0.1,
    onEvent: (e) => events.push(e),
  };
  const advance = (toSec: number) => {
    while (sec < toSec - 1e-9) { sec = Math.min(toSec, sec + 0.005); for (const i of [...intervals]) i.fn(); }
  };
  return { deps, state, fires, releases, releaseAt, events, recues, advance, now: () => sec, intervals };
}

const crate = (recordId: string): ScratchSource => ({ type: 'CRATE', recordId, anchor: { position: 0.15, safe: [0, 1], safeForward: [0, 1], safeReverse: [0, 1] } });

function recordEvent(beat: number, over: Partial<ScratchEvent> = {}): ScratchEvent {
  const source = crate('ONE');
  return {
    executeAtBeat: beat, durationBeats: 1, role: 'ACCENT', source, anchor: (source as { anchor: ScratchEvent['anchor'] }).anchor,
    gesture: 'forwardStab', velocity: 0.8, humanizeMs: 0, intensity: 0.5, returnToAnchor: true, ...over,
  };
}

describe('the executor fires an event on the deck beat clock (SCR-P3.5)', () => {
  it('a record event at beat 8 is handed to the engine with the context time of beat 8 (+-5 ms)', () => {
    const r = rig();
    const ex = new ScratchExecutor(r.deps);
    ex.schedule(recordEvent(8));
    r.advance(3.9); // beat 7.8: 0.1 s before beat 8 is the lookahead edge
    r.advance(4.0);
    expect(r.fires).toHaveLength(1);
    expect(r.fires[0]!.id).toBe('fx_scratch_forwardStab');
    expect(r.fires[0]!.record).toBe('ONE');
    expect(Math.abs(r.fires[0]!.at! - 4.0)).toBeLessThan(0.005); // beat 8 at 0.5 s per beat
    expect(r.fires[0]!.beat).toBeLessThan(8); // scheduled ahead, not on the beat
  });

  it('a record gesture stops sample-accurately: the release carries the context time of the end beat', () => {
    const r = rig();
    new ScratchExecutor(r.deps).schedule(recordEvent(8, { durationBeats: 1 }));
    r.advance(4.6);
    expect(r.releases).toHaveLength(1);
    expect(Math.abs(r.releaseAt[0]! - 4.5)).toBeLessThan(0.005);
  });

  it('is not early: nothing before the lookahead window', () => {
    const r = rig();
    new ScratchExecutor(r.deps).schedule(recordEvent(8));
    r.advance(3.8);
    expect(r.fires).toHaveLength(0);
  });

  it('humanize moves the scheduled time, not the planned beat', () => {
    const r = rig();
    new ScratchExecutor(r.deps).schedule(recordEvent(8, { humanizeMs: 12 }));
    r.advance(4.0);
    expect(r.fires[0]!.at!).toBeCloseTo(4.012, 3);
  });

  it('a deck event re-cues to its anchor, then starts on the tick that reaches its beat', () => {
    const r = rig();
    const anchor = deckAnchor(31.5, 63, 'downbeat', 120);
    const ex = new ScratchExecutor(r.deps);
    ex.schedule({
      executeAtBeat: 64, durationBeats: 1, role: 'ACCENT', source: { type: 'DECK', deck: 'A', anchor }, anchor,
      gesture: 'baby', velocity: 1, humanizeMs: 0, intensity: 0.5, deck: 'A', returnToAnchor: true,
    });
    r.advance(31.9);
    expect(r.fires).toHaveLength(0);
    r.advance(32.0);
    expect(r.recues).toEqual([['A', 31.5]]);
    expect(r.fires).toHaveLength(1);
    expect(Math.abs(r.fires[0]!.beat - 64)).toBeLessThanOrEqual(0.01);
    expect(r.fires[0]!.at).toBeUndefined();
  });

  it('a refused re-cue is reported and does not block the stroke', () => {
    const r = rig();
    r.deps.recueDeck = () => ({ recued: false, mode: 'ring-only', returnsToAnchor: false, reason: 'the fader window is open' });
    const anchor = deckAnchor(10, 20, 'snare', 120);
    new ScratchExecutor(r.deps).schedule({
      executeAtBeat: 4, durationBeats: 1, role: 'ACCENT', source: { type: 'DECK', deck: 'B', anchor }, anchor,
      gesture: 'forwardStab', velocity: 1, humanizeMs: 0, intensity: 0.5, deck: 'B', returnToAnchor: true,
    });
    r.advance(2.0);
    expect(r.events.some((e) => e.kind === 'recueUnavailable')).toBe(true);
    expect(r.fires).toHaveLength(1);
  });
});

describe('release restores exactly the state the run started from (section 60)', () => {
  for (const suppressNotes of [true, false]) {
    it(`snapshot after release equals the state before (suppressNotes ${suppressNotes})`, () => {
      const r = rig({ suppressNotes });
      const before = { ...r.state };
      const ex = new ScratchExecutor(r.deps);
      ex.schedule(recordEvent(8));
      r.advance(4.0);
      expect(snapshotDiff(before, r.state)).not.toEqual([]); // the scratch really changed things
      r.advance(4.6); // end beat 9
      expect(r.releases).toEqual(['fx_scratch_forwardStab']);
      expect(r.state).toEqual(before);
      expect(r.state.suppressNotes).toBe(suppressNotes);
      expect(ex.active).toBe(0);
      expect(r.intervals).toHaveLength(0); // the ticker stops with the last event
    });
  }

  it('overlapping events share one snapshot; the last one out restores', () => {
    const r = rig();
    const before = { ...r.state };
    const ex = new ScratchExecutor(r.deps);
    ex.schedule(recordEvent(8, { durationBeats: 1, role: 'THEME' }));
    ex.schedule(recordEvent(8.5, { durationBeats: 2, role: 'ANSWER', gesture: 'chirp' }));
    r.advance(4.6); // first released
    expect(r.releases).toHaveLength(1);
    expect(r.state.crossfader).toBe(0.9); // still dirty: the second is running
    r.advance(5.4);
    expect(r.state).toEqual(before);
  });

  it('cancel releases what runs, drops what waits, and restores', () => {
    const r = rig();
    const before = { ...r.state };
    const ex = new ScratchExecutor(r.deps);
    ex.schedule(recordEvent(8));
    ex.schedule(recordEvent(40));
    r.advance(4.1);
    ex.cancel();
    expect(r.releases).toHaveLength(1);
    expect(r.state).toEqual(before);
    expect(ex.active).toBe(0);
    r.advance(20);
    expect(r.fires).toHaveLength(1);
  });
});

describe('the musical clock is the master deck grid (section 7, SCR-P4.2)', () => {
  it('an event planned on bar 4 step 0 fires at the grid downbeat of bar 4 (+-5 ms), not where elapsed time modulo a cycle says', () => {
    const track = fixtureAnalysis(); // first beat at 0.18 s: bar 4 starts at 0.18 + 8 s
    const r = rig();
    // the same executor, but its beat source is the analysis grid fed with the deck position
    const clock = analysisClock(track, () => r.now());
    const deps: ScratchExecutorDeps = { ...r.deps, clock };
    const beat = stepToBeat({ bar: 4, step: 0 });
    expect(beat).toBe(16);
    new ScratchExecutor(deps).schedule(recordEvent(beat));
    r.advance(8.4);
    expect(r.fires).toHaveLength(1);
    expect(Math.abs(r.fires[0]!.at! - 8.18)).toBeLessThan(0.005);
    // the legacy phase (elapsed ms modulo a 2 s cycle) would put the bar start at a multiple of 2 s, 180 ms earlier
    expect(Math.abs(r.fires[0]!.at! - 8.0)).toBeGreaterThan(0.1);
  });
});
