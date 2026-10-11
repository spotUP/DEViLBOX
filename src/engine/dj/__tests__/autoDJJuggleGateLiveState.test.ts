/**
 * The juggle gate on the state the owner's set showed (2026-10-11): two
 * tracker songs at 125 BPM whose GLOBAL keys read F minor (4A) and C major
 * (8B) while the local key at the mix is F major on both (the transition
 * planner said "same, clash risk 0.00"), moderate beat grids (0.72 / 0.76),
 * Auto Juggle AGGRESSIVE at a configured 0.85 in a CRUISING set. Juggling never
 * happened: the gate called the keys incompatible with its own Camelot rule,
 * blamed "unstable sync" for a cued deck, clamped the configured intensity to
 * the set phase's cap and kept publishing a pre-transition decision while the
 * transition ran. Driven through the real controller and planner.
 */
import { describe, it, expect } from 'vitest';
import { VirtualTimers } from '../autodj/testing/setSimulator';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { parseMusicalKey } from '../autodj/trackAnalysis';
import { DJJuggleController, analysisClock, type TickInput } from '../autodj/juggle/juggleController';
import { conditions, intensityFor, planJuggle } from '../autodj/juggle/jugglePlanner';
import type { JuggleActionSink } from '../autodj/juggle/juggleExecutor';
import type { DJTrackAnalysis } from '../autodj/types';

const seg = (start: number, end: number, key: string, confidence: number) => ({ start, end, key: parseMusicalKey(key), confidence });

function liveLike(base: DJTrackAnalysis, over: { key: string; keyConfidence: number; timeline: ReturnType<typeof seg>[]; grid: number; phrase: number }): DJTrackAnalysis {
  return {
    ...base,
    key: parseMusicalKey(over.key),
    keyConfidence: over.keyConfidence,
    keyTimeline: over.timeline,
    beatGrid: { ...base.beatGrid, confidence: over.grid },
    phrases: base.phrases.map((p) => ({ ...p, confidence: over.phrase })),
  };
}

// cloudwalker 777: global F minor (4A) 0.82, local F major 0.97 the whole song, grid 0.72, phrase 0.3.
const cloudwalker = () => liveLike(corpusAnalysis('steady'), { key: 'F minor', keyConfidence: 0.82, timeline: [seg(0, 999, 'F major', 0.97)], grid: 0.72, phrase: 0.3 });
// ben dover: global C major (8B) 0.84, local C major 0.35 for 8 s then F major 0.97, grid 0.76, phrase 0.67.
const benDover = () => liveLike(corpusAnalysis('compatibleKey'), { key: 'C major', keyConfidence: 0.84, timeline: [seg(0, 8, 'C major', 0.35), seg(8, 999, 'F major', 0.97)], grid: 0.76, phrase: 0.67 });

function nullSink(): JuggleActionSink {
  return {
    state: () => ({ crossfader: 0, playing: { A: true, B: true }, audible: { A: true, B: true }, loops: { A: false, B: false } }),
    apply: () => { /* recorded elsewhere */ },
  };
}

function setup(playingA = true) {
  const timers = new VirtualTimers();
  const a = benDover(), b = cloudwalker();
  const c = new DJJuggleController({
    sink: nullSink(), timers, now: () => timers.now(), seed: 3,
    positionOf: (d) => (d === 'A' ? 40 : 30) + timers.now() / 1000,
    clockFor: (_d, analysis, position) => analysisClock(analysis, position),
  });
  c.setMode('AGGRESSIVE');
  c.setIntensity(0.85);
  const input = (over: Partial<TickInput> = {}): TickInput => ({
    masterDeck: 'A', setPhase: 'CRUISING', energy: 0.41, targetEnergy: 0.45, performanceMode: 'JUGGLE', transitionApproachingSec: null,
    decks: {
      A: { trackId: 'ben dover.mod', analysis: a, positionSec: 40 + timers.now() / 1000, playing: playingA, bpm: 125.01 },
      B: { trackId: 'cloudwalker 777.mod', analysis: b, positionSec: 30 + timers.now() / 1000, playing: true, bpm: 125.01 },
    },
    ...over,
  });
  return { c, input, timers };
}

describe('Auto Juggle gate on the live 4A / 8B pair', () => {
  it('two decks both heard in F major are not blocked as incompatible keys by their global Camelot labels', () => {
    const { c, input } = setup();
    const ctx = c.buildContext(input());
    expect(ctx.deckA.key).toBe('F major');
    expect(ctx.deckB.key).toBe('F major');
    const { bad, good } = conditions(ctx);
    expect(bad.filter((r) => /key/.test(r))).toEqual([]);
    expect(good).toContain('keys same');
  });

  it('a configured juggle intensity of 0.85 is performed at 0.85 in a CRUISING set, not clamped to the phase cap', () => {
    const { c, input } = setup();
    const ctx = c.buildContext(input());
    expect(intensityFor(ctx, 'AGGRESSIVE', 0.85)).toBeCloseTo(0.85, 6);
    expect(planJuggle(ctx, { mode: 'AGGRESSIVE', intensityOverride: 0.85 }).intensity).toBeCloseTo(0.85, 6);
    // The mode's own cap still bounds it.
    expect(intensityFor(ctx, 'SAFE', 0.85)).toBeCloseTo(0.4, 6);
  });

  it('a cued incoming deck blocks with "both decks must play", never with a sync reading of a stopped deck', () => {
    const { c, input } = setup(false);
    const d = planJuggle(c.buildContext(input()), { mode: 'AGGRESSIVE', intensityOverride: 0.85 });
    expect(d.blocked).toContain('both decks must play');
    expect(d.blocked).not.toContain('unstable sync');
  });

  it('while the transition owns the decks the telemetry says so instead of a decision made before it started', () => {
    const { c, input } = setup(false);
    c.tick(input());
    expect(c.telemetry().reason).toMatch(/both decks must play/);
    c.tick(input({ performanceMode: 'NORMAL_MIX', decks: { ...input().decks, A: { ...input().decks.A, playing: true } } }));
    const t = c.telemetry();
    expect(t.reason).toMatch(/NORMAL_MIX: the transition owns the decks/);
    expect(t.reason).not.toMatch(/both decks must play|unstable sync|incompatible keys/);
    expect(t.intensity).toBeCloseTo(0.85, 6);
  });

  it('with both decks playing, the controller starts a juggle on this pair (reachability through tick)', () => {
    const { c, input } = setup();
    const r = c.tick(input());
    expect(r.decision?.blocked ?? [], r.decision?.reason).toEqual([]);
    expect(r.started).toBe(true);
    expect(c.counts.started).toBe(1);
    expect(r.decision?.intensity).toBeCloseTo(0.85, 6);
  });

  it('a juggle transition prelude 15 s before the mix is not blocked as "transition imminent"', () => {
    const { c, input } = setup();
    const ctx = c.buildContext(input({ performanceMode: 'JUGGLE_TRANSITION', transitionApproachingSec: 15 }));
    expect(conditions(ctx).bad).not.toContain('transition imminent');
    // A standalone juggle that close to a transition still is.
    expect(conditions({ ...ctx, performanceMode: 'JUGGLE' }).bad).toContain('transition imminent');
  });
});
