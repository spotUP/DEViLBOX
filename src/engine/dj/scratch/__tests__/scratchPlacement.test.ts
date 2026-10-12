/**
 * The placement brain (owner scratch plan sections 21-24, 35; ledger SCR-P4.4 - P4.9): density
 * states, the calm -> busy vocabulary (ranked as the demo ranks it), one bar of `plan_phrase` (the
 * demo's own output over whole tracks is `scratchPhrasingParity.test.ts`), validation, humanize and
 * vocal awareness.
 */
import { describe, it, expect } from 'vitest';
import {
  sectionDensity, DENSITY_RATE, vocabulary, pickGesture, planVocabulary, planPhrase, validatePhrase,
  humanizeMs, pyRound, referenceName, type PlacedScratch,
} from '../scratchPlacement';
import { planScratch } from '../scratchPlanner';
import { lfsr } from '../scratchRandom';
import { getGesture } from '../scratchGestureCatalog';
import { scenarioContext } from './fixtures/scenarioContext';
import type { ScratchGestureId } from '../scratchTypes';

const ev = (bar: number, step: number, gesture: ScratchGestureId = 'baby'): PlacedScratch => ({
  bar, step, beat: bar * 4 + step / 4, gesture, velocity: 0.7, placementRole: 'accent', role: 'ACCENT',
});

describe('density states and vocabulary (sections 21, 22, SCR-P4.4)', () => {
  it('battle in a showcase is a showcase; lo-fi in a verse is none', () => {
    expect(sectionDensity('battle', 'showcase')).toBe('showcase');
    expect(sectionDensity('loFi', 'verse')).toBe('none');
    expect(sectionDensity('boomBap', 'hook')).toBe('low');
    expect(sectionDensity('electro', 'call')).toBe('high'); // medium + round(0.75) = +1
    expect(DENSITY_RATE.showcase).toBe(1.4);
  });

  it('rounds halves to even like the reference (python round(-0.5) is 0, round(2.5) is 2)', () => {
    expect(pyRound(-0.5)).toBeCloseTo(0); expect(pyRound(0.5)).toBe(0); expect(pyRound(1.5)).toBe(2); expect(pyRound(2.5)).toBe(2);
  });

  it('the vocabulary ranks calm to busy as the demo does (activity, then the demo name) and thins to evenly spaced entries', () => {
    const all = planVocabulary('battle', 'BATTLE');
    const v = vocabulary(all);
    for (let i = 1; i < v.length; i++) {
      const [a, b] = [v[i - 1]!, v[i]!];
      expect(getGesture(b).activity > getGesture(a).activity || (getGesture(b).activity === getGesture(a).activity && referenceName(b) > referenceName(a))).toBe(true);
    }
    // the demo's own order of the electro profile (scratch.vocabulary): glide-heavy hydroplane is the busiest
    expect(vocabulary(['transformer4', 'transformer8', 'chirp', 'flare1', 'flare2', 'orbit', 'crab', 'hydroplane']))
      .toEqual(['flare1', 'chirp', 'flare2', 'transformer4', 'crab', 'orbit', 'transformer8', 'hydroplane']);
    const three = vocabulary(all, 3);
    expect(three).toHaveLength(3);
    expect(three[0]).toBe(v[0]);
    expect(three[2]).toBe(v[v.length - 1]);
  });

  it('energy 1.0 picks from the busy band; energy 0.2 never picks a level 4 gesture; 50 picks never repeat', () => {
    const vocab = vocabulary(planVocabulary('battle', 'BATTLE'));
    const rnd = lfsr(42);
    const busy = new Set(vocab.slice(-3));
    for (let i = 0; i < 200; i++) expect(busy.has(pickGesture(vocab, 1.0, 'accent', rnd, null))).toBe(true);
    for (let i = 0; i < 500; i++) expect(getGesture(pickGesture(vocab, 0.2, 'accent', rnd, null)).difficulty).toBeLessThan(4);
    let last: ScratchGestureId | null = null;
    for (let i = 0; i < 50; i++) {
      const g = pickGesture(vocab, 0.6, 'accent', rnd, last);
      expect(g).not.toBe(last);
      last = g;
    }
  });

  it('a vocabulary follows the mode: safe plays three gestures at most, musical stays inside level 2', () => {
    expect(planVocabulary('boomBap', 'SAFE').sort()).toEqual(['baby', 'chirp', 'forwardStab']);
    for (const g of planVocabulary('boomBap', 'MUSICAL')) expect(getGesture(g).difficulty).toBeLessThanOrEqual(2);
    expect(planVocabulary('boomBap', 'OFF')).toEqual([]);
  });
});

describe('planPhrase (section 21, SCR-P4.5)', () => {
  it("a section's bars 3, 7, 15 and its last carry at least 3x the events of a mid bar; a long section has no 16-bar cycle", () => {
    let endEvents = 0, endBars = 0, midEvents = 0, midBars = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (let bar = 0; bar < 64; bar++) {
        const n = planPhrase({ style: 'boomBap', section: 'call', bar, bars: 64, seed, gestures: planVocabulary('boomBap', 'MUSICAL') }).length;
        if ([3, 7, 15, 63].includes(bar)) { endEvents += n; endBars++; } else { midEvents += n; midBars++; }
      }
    }
    expect(endEvents / endBars).toBeGreaterThanOrEqual(3 * (midEvents / midBars));
  });

  it('never more than 4 in a bar, beats follow bar x 4 + step / 4, velocity within 0..1', () => {
    for (let bar = 0; bar < 32; bar++) {
      const got = planPhrase({ style: 'battle', section: 'showcase', bar, bars: 32, seed: 4, gestures: planVocabulary('battle', 'BATTLE') });
      expect(got.length).toBeLessThanOrEqual(4);
      for (const e of got) { expect(e.beat).toBe(bar * 4 + e.step / 4); expect(e.velocity).toBeGreaterThan(0.5); expect(e.velocity).toBeLessThanOrEqual(1); }
    }
  });
});

describe('validate (section 21, SCR-P4.7)', () => {
  const varied: ScratchGestureId[] = ['baby', 'chirp', 'forwardStab', 'tearForward', 'drag'];

  it('scratching every bar fails validation', () => {
    expect(validatePhrase([0, 1, 2, 3].map((b) => [ev(b, 15, varied[b]!)]))).toContain('scratches every bar (placement s.30)');
  });

  it('a five-event bar is rejected', () => {
    expect(validatePhrase([[0, 1, 2, 3, 4].map((s) => ev(0, s * 3, varied[s]!)), [], []])).toContain('too busy (>4 gestures/bar)');
  });

  it('one gesture over more than three events is rejected', () => {
    expect(validatePhrase([[ev(0, 0), ev(0, 4)], [ev(1, 0), ev(1, 4)], []])).toContain('every scratch uses the same gesture (s.30)');
  });
});

describe('humanize (section 35, SCR-P4.8)', () => {
  it('10 000 draws stay in [-8, +10] ms, never repeat, and never leave the beat', () => {
    const rnd = lfsr(99);
    let prev: number | null = null;
    for (let i = 0; i < 10000; i++) {
      const beat = (i % 16) / 4; // every step of a bar
      const bpm = 92;
      const off = humanizeMs({ beat, gesture: 'chirp' }, rnd, bpm, prev);
      expect(off).toBeGreaterThanOrEqual(-8); expect(off).toBeLessThanOrEqual(10);
      if (prev !== null) expect(off).not.toBe(prev);
      const into = (beat % 1) * (60000 / bpm);
      expect(into + off).toBeGreaterThanOrEqual(0); expect(into + off).toBeLessThan(60000 / bpm);
      prev = off;
    }
  });

  it('a one-step stroke at 174 BPM (drum and bass) stays exactly on the grid', () => {
    expect(getGesture('laser').durationSteps).toBeLessThanOrEqual(1);
    for (let i = 0; i < 50; i++) expect(humanizeMs({ beat: 8.5, gesture: 'laser' }, lfsr(i + 1), 174, null)).toBe(0);
    expect(humanizeMs({ beat: 8.5, gesture: 'baby' }, lfsr(3), 174, null)).not.toBe(0);
  });
});

describe('vocal awareness (section 24, SCR-P4.9): the DEViLBOX extras on top of the demo (P13)', () => {
  const plan = (seed: number, vocalByBar: number[]) => planScratch(scenarioContext({ style: 'boomBap', kind: 'verse', bpm: 92, energy: 0.5, permission: 4 }), {
    mode: 'PERFORMER', seed, fromBar: 16, bars: vocalByBar.length, vocalByBar, densityShift: 1, sectionAt: () => ({ name: 'verse', startBar: 16, bars: 16 }),
  });
  const extras = (p: ReturnType<typeof plan>) => p.events.filter((e) => e.layer === 'extra');
  const demo = (p: ReturnType<typeof plan>) => p.events.filter((e) => e.layer === 'demo').map((e) => `${e.bar}:${e.step}:${e.gesture}`);

  it('a bar over 0.7 vocal activity keeps only the extras\' answers; the demo\'s strokes stay', () => {
    for (let seed = 0; seed < 30; seed++) {
      const p = plan(seed, Array(8).fill(0.9));
      expect(demo(p), `seed ${seed}`).toEqual(demo(plan(seed, Array(8).fill(0))));
      for (const e of extras(p)) expect(e.role, `seed ${seed}`).toBe('ANSWER');
    }
  });

  it('the extras\' density follows the vocal: a bar at 0.9 adds far fewer than a bar at 0', () => {
    let quiet = 0, vocal = 0;
    for (let seed = 0; seed < 60; seed++) {
      quiet += extras(plan(seed, Array(8).fill(0))).length;
      vocal += extras(plan(seed, Array(8).fill(0.9))).length;
    }
    expect(quiet).toBeGreaterThan(0);
    expect(vocal).toBeLessThan(quiet * 0.4);
  });

  it('a vocal call is answered in the following bar', () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(plan(seed, [0, 0.9, 0.9, 0.1, 0, 0, 0, 0]).bars[3]!.some((e) => e.role === 'ANSWER'), `seed ${seed}`).toBe(true);
    }
  });
});
