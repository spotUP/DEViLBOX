/**
 * Section 60 "restore everything it changes, to previous values" through the REAL probe
 * (`createScratchStateProbe`) and the REAL `DeckEngine.restoreScratchSnapshot`
 * (scratch audit SA-M4, SA-M5a, SA-m6; thoughts/shared/research/2026-10-12_scratch-work-audit.md).
 *
 * Before the fix the executor snapshotted {rate, channelGain, captureFrozen, suppressNotes,
 * crossfader, busLevel} at the first start of a run and wrote back every field that differed at
 * the last release, whoever moved it: a run of record-voice accents over an Auto DJ crossfade
 * snapped the crossfader back, a pitch move made during a deck scratch was undone, and a tracker
 * restore under key lock set the pitch to the tempo multiplier. Every executor test used a fake
 * probe, so removing the probe's deck restore went unnoticed.
 */
import { describe, it, expect } from 'vitest';
import { DeckEngine } from '../DeckEngine';
import { ScratchExecutor, type ScratchExecutorDeps } from '../scratch/ScratchExecutor';
import { createScratchStateProbe } from '../scratch/scratchSnapshot';
import { deckAnchor } from '../scratch/scratchAnchor';
import type { ExecutorTimers } from '../autodj/transitionExecutor';
import type { ScratchEvent } from '../scratch/scratchTypes';

interface DeckState {
  mode: 'audio' | 'tracker';
  rate: number; tempo: number; pitch: number;
  gain: number; frozen: boolean;
  rest: number; keyLock: boolean;
  unfreezes: number;
}

/** A DeckEngine with its real scratch snapshot methods over plain fields. */
function deckOver(st: DeckState): DeckEngine {
  const e = Object.create(DeckEngine.prototype) as Record<string, unknown>;
  e._playbackMode = st.mode;
  e.audioPlayer = { getPlaybackRate: () => st.rate, setPlaybackRate: (r: number) => { st.rate = r; } };
  e.replayer = {
    getTempoMultiplier: () => st.tempo, setTempoMultiplier: (r: number) => { st.tempo = r; },
    setPitchMultiplier: (r: number) => { st.pitch = r; }, get isSuppressNotes() { return false; },
  };
  e.channelGain = { gain: { get value() { return st.gain; }, set value(v: number) { st.gain = v; } } };
  e.scratchBuffer = { get captureFrozen() { return st.frozen; }, freezeCapture: () => { st.frozen = true; }, unfreezeCapture: () => { st.frozen = false; st.unfreezes++; } };
  Object.defineProperty(e, 'restMultiplier', { get: () => st.rest });
  Object.defineProperty(e, 'keyLockEnabled', { get: () => st.keyLock });
  return e as unknown as DeckEngine;
}

function rig(st: DeckState) {
  let sec = 0;
  const intervals: Array<() => void> = [];
  const timers: ExecutorTimers = {
    now: () => sec * 1000,
    setInterval: (fn) => { intervals.push(fn); return fn; },
    clearInterval: (h) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); },
    setTimeout: () => null, clearTimeout: () => undefined,
  };
  const mixer = { x: 0.2, getCrossfader() { return this.x; }, setCrossfader(p: number) { this.x = p; } };
  const deck = deckOver(st);
  const deps: ScratchExecutorDeps = {
    clock: { beatNow: () => sec / 0.5, beatSec: () => 0.5 },
    contextTime: () => sec,
    // the engine: a deck gesture drives its deck's rate, scratch fader and ring; a record gesture its own voice
    fire: (_id, o) => {
      if (!o.record) { st.rate = 0.4; st.tempo = 0.4; st.pitch = 0.4; st.gain = 0; st.frozen = true; }
      return true;
    },
    release: () => {},
    probe: createScratchStateProbe(deck, mixer, null),
    recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
    timers, tickMs: 5, lookaheadSec: 0.1,
  };
  const advance = (to: number) => { while (sec < to - 1e-9) { sec = Math.min(to, sec + 0.005); for (const f of [...intervals]) f(); } };
  return { deps, mixer, advance };
}

const fresh = (over: Partial<DeckState> = {}): DeckState => ({ mode: 'audio', rate: 1, tempo: 1, pitch: 1, gain: 1, frozen: false, rest: 1, keyLock: false, unfreezes: 0, ...over });

const anchor = deckAnchor(10, 20, 'downbeat', 120);
const deckEvent = (beat: number): ScratchEvent => ({
  executeAtBeat: beat, durationBeats: 1, role: 'ACCENT', source: { type: 'DECK', deck: 'A', anchor }, anchor,
  gesture: 'baby', velocity: 0.8, humanizeMs: 0, intensity: 0.5, deck: 'A', returnToAnchor: false,
});
const recordEvent = (beat: number): ScratchEvent => {
  const a = { position: 0.15, safe: [0, 1] as [number, number], safeForward: [0, 1] as [number, number], safeReverse: [0, 1] as [number, number] };
  return {
    executeAtBeat: beat, durationBeats: 1, role: 'ACCENT', source: { type: 'CRATE', recordId: 'ONE', anchor: a }, anchor: a,
    gesture: 'forwardStab', velocity: 0.8, humanizeMs: 0, intensity: 0.5, returnToAnchor: true,
  };
};

describe('a scratch gives back what it changed, nothing else (section 60)', () => {
  it('record-voice accents over an Auto DJ crossfade leave the crossfader where the crossfade put it', () => {
    const st = fresh();
    const r = rig(st);
    const ex = new ScratchExecutor(r.deps);
    ex.schedule(recordEvent(8));
    ex.schedule(recordEvent(12));
    r.advance(4.2);
    r.mixer.setCrossfader(0.55); // the Auto DJ's crossfade moves on
    r.advance(4.8);
    r.mixer.setCrossfader(0.8);
    r.advance(7.0);
    expect(ex.active).toBe(0);
    expect(r.mixer.x).toBe(0.8);
    expect(ex.lastRestoredFields).toEqual([]);
  });

  it('a deck scratch gives back its scratch fader and its ring through the real probe and DeckEngine', () => {
    const st = fresh();
    const r = rig(st);
    const ex = new ScratchExecutor(r.deps);
    ex.schedule(deckEvent(8));
    r.advance(4.1);
    expect(st.gain).toBe(0);
    expect(st.frozen).toBe(true);
    r.mixer.setCrossfader(0.6); // someone else's move during the scratch
    r.advance(4.7);
    expect(ex.active).toBe(0);
    expect(st.gain).toBe(1);
    expect(st.frozen).toBe(false);
    expect(st.unfreezes).toBe(1);
    expect(st.rate).toBe(1);
    expect(r.mixer.x).toBe(0.6); // a deck gesture with deck fader windows never touched the crossfader
  });

  it('a pitch move made during the scratch is kept: the rate returns to the pitch fader, not to the captured rate', () => {
    const st = fresh();
    const r = rig(st);
    const ex = new ScratchExecutor(r.deps);
    ex.schedule(deckEvent(8));
    r.advance(4.1);
    st.rest = 1.06; // the user (or sync) moves the pitch fader mid-scratch
    r.advance(4.7);
    expect(st.rate).toBeCloseTo(1.06, 9);
  });

  it('a tracker deck under key lock gets its tempo back and keeps its pitch at 1', () => {
    const st = fresh({ mode: 'tracker', rest: 1.05, tempo: 1.05, pitch: 1, keyLock: true });
    const r = rig(st);
    const ex = new ScratchExecutor(r.deps);
    ex.schedule(deckEvent(8));
    r.advance(4.7);
    expect(st.tempo).toBeCloseTo(1.05, 9);
    expect(st.pitch).toBe(1);
  });
});
