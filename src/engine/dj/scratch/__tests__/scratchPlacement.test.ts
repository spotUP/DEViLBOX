/**
 * The placement brain (owner scratch plan sections 21-24, 35, 41; ledger
 * SCR-P4.4 - P4.9, P4.12): density states, the calm -> busy vocabulary, one
 * bar of the reference `plan_phrase` (byte-checked against Python output),
 * rests, validation and repair, humanize, vocal awareness and the throw.
 */
import { describe, it, expect } from 'vitest';
import planFixture from './fixtures/plan_phrase.json';
import {
  sectionDensity, DENSITY_RATE, vocabulary, pickGesture, planVocabulary, planPhrase, planBars, validatePhrase, repairPhrase,
  humanizeMs, restProbability, withThrow, pyRound, type PlacedScratch, type ScratchSection,
} from '../scratchPlacement';
import { lfsr } from '../scratchRandom';
import { getGesture } from '../scratchGestureCatalog';
import { getScratchRecord } from '../scratchCatalogue';
import type { ScratchDJStyle, ScratchGestureId } from '../scratchTypes';
import type { ScratchMode } from '../scratchStyles';

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

  it('the vocabulary ranks calm to busy and thins to evenly spaced entries', () => {
    const all = planVocabulary('battle', 'BATTLE');
    const v = vocabulary(all);
    for (let i = 1; i < v.length; i++) expect(getGesture(v[i]!).activity).toBeGreaterThanOrEqual(getGesture(v[i - 1]!).activity);
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

describe('planPhrase equals the Python reference (section 21, SCR-P4.5)', () => {
  for (const c of planFixture) {
    it(`${c.name}: ${c.bars} bars, step / gesture / role exact, velocity to 1e-12 (density ${c.density})`, () => {
      expect(sectionDensity(c.style as ScratchDJStyle, c.section)).toBe(
        ({ veryLow: 'veryLow', very_low: 'veryLow' } as Record<string, string>)[c.density] ?? c.density);
      c.plan.forEach((bar, i) => {
        const got = planPhrase({ style: c.style as ScratchDJStyle, section: c.section, bar: i, bars: c.bars, seed: c.seed, gestures: c.gestures as ScratchGestureId[] });
        expect(got.map((g) => [g.step, g.gesture, g.velocity, g.placementRole]).map(([s, g, v, r]) => [s, g, Math.round((v as number) * 1e12), r]))
          .toEqual(bar.map(([s, g, v, r]) => [s, g, Math.round((v as number) * 1e12), r]));
      });
    });
  }

  it('the fixtures are not trivially empty: showcase carries events, the quiet hook has some', () => {
    const total = (n: string) => planFixture.find((c) => c.name === n)!.plan.reduce((a, b) => a + b.length, 0);
    expect(total('boomBap-showcase')).toBeGreaterThan(30);
    expect(total('boomBap-hook')).toBeGreaterThan(0);
  });

  it('a phrase-end bar carries at least 3x the events of a mid bar (64 bars, 20 seeds)', () => {
    let endEvents = 0, endBars = 0, midEvents = 0, midBars = 0;
    for (let seed = 1; seed <= 20; seed++) {
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

describe('rests (section 23, SCR-P4.6)', () => {
  it('1000 bars of musical boom bap leave at least a quarter of the bars empty', () => {
    const r = planBars({ style: 'boomBap', section: 'call', fromBar: 0, count: 1000, bars: 1000, seed: 6, gestures: planVocabulary('boomBap', 'MUSICAL') });
    const empty = r.bars.filter((b) => b.length === 0).length;
    expect(empty / 1000).toBeGreaterThanOrEqual(0.25);
    // every 16-bar window keeps its quarter
    for (let w = 0; w + 16 <= 1000; w += 16) expect(r.bars.slice(w, w + 16).filter((b) => b.length === 0).length).toBeGreaterThanOrEqual(4);
  });

  it('a feature rests at most 10 % of its bars', () => {
    const r = planBars({ style: 'boomBap', section: 'showcase', barRole: 'FEATURE', fromBar: 0, count: 1000, bars: 1000, seed: 5, gestures: planVocabulary('boomBap', 'MUSICAL') });
    expect(r.rests.length / 1000).toBeLessThanOrEqual(0.10);
    expect(r.rests.length).toBeGreaterThan(0);
  });

  it('role probabilities: feature 0.06, theme 0.18, answer 0.20, intro 0.30; a transition takes the transition risk', () => {
    expect([restProbability('FEATURE'), restProbability('THEME'), restProbability('ANSWER'), restProbability('INTRO'), restProbability('ACCENT')]).toEqual([0.06, 0.18, 0.2, 0.3, 0.2]);
    expect(restProbability('TRANSITION', { transitionRisk: 0.45 })).toBe(0.45);
  });
});

describe('validate and repair (section 21, SCR-P4.7)', () => {
  const varied: ScratchGestureId[] = ['baby', 'chirp', 'forwardStab', 'tearForward', 'drag'];

  it('scratching every bar fails validation, and repair empties the odd bars', () => {
    const bars = [0, 1, 2, 3].map((b) => [ev(b, 15, varied[b]!)]);
    expect(validatePhrase(bars)).toContain('scratches every bar (placement s.30)');
    const fixed = repairPhrase(bars);
    expect(fixed.map((b) => b.length)).toEqual([1, 0, 1, 0]);
    expect(validatePhrase(fixed)).toEqual([]);
  });

  it('a five-event bar is rejected and cut to one', () => {
    const bars = [[0, 1, 2, 3, 4].map((s) => ev(0, s * 3, varied[s]!)), [], []];
    expect(validatePhrase(bars)).toContain('too busy (>4 gestures/bar)');
    const fixed = repairPhrase(bars);
    expect(fixed[0]).toHaveLength(1);
    expect(validatePhrase(fixed)).toEqual([]);
  });

  it('one gesture over more than three events is rejected', () => {
    expect(validatePhrase([[ev(0, 0), ev(0, 4)], [ev(1, 0), ev(1, 4)], []])).toContain('every scratch uses the same gesture (s.30)');
  });

  it('planBars output always validates', () => {
    for (let seed = 0; seed < 40; seed++) {
      const r = planBars({ style: 'battle', section: 'showcase', fromBar: 0, count: 16, bars: 16, seed, gestures: planVocabulary('battle', 'BATTLE') });
      expect(validatePhrase(r.bars)).toEqual([]);
    }
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

  it('a stab at 174 BPM (drum and bass) stays exactly on the grid', () => {
    expect(getGesture('forwardStab').durationSteps).toBeLessThanOrEqual(1);
    for (let i = 0; i < 50; i++) expect(humanizeMs({ beat: 8.5, gesture: 'forwardStab' }, lfsr(i + 1), 174, null)).toBe(0);
    expect(humanizeMs({ beat: 8.5, gesture: 'chirp' }, lfsr(3), 174, null)).not.toBe(0);
  });
});

describe('vocal awareness (section 24, SCR-P4.9)', () => {
  const base = { style: 'battle' as ScratchDJStyle, section: 'showcase' as ScratchSection, bars: 8, gestures: planVocabulary('battle', 'BATTLE' as ScratchMode), restScale: 0 };

  it('a bar over 0.7 vocal activity holds at most one event unless it is an answer', () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = planBars({ ...base, seed, fromBar: 0, count: 8, vocalByBar: Array(8).fill(0.9) });
      for (const bar of r.bars) {
        const answers = bar.filter((e) => e.role === 'ANSWER');
        if (answers.length === 0) expect(bar.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('density follows the vocal: a bar at 0.9 plans far fewer events than a bar at 0', () => {
    let quiet = 0, vocal = 0;
    for (let seed = 0; seed < 60; seed++) {
      quiet += planBars({ ...base, seed, fromBar: 0, count: 8, vocalByBar: Array(8).fill(0) }).bars.flat().length;
      vocal += planBars({ ...base, seed, fromBar: 0, count: 8, vocalByBar: Array(8).fill(0.9) }).bars.flat().length;
    }
    expect(vocal).toBeLessThan(quiet * 0.4);
  });

  it('a vocal call is answered in the following bar', () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = planBars({ ...base, seed, fromBar: 0, count: 8, vocalByBar: [0, 0.9, 0.9, 0.1, 0, 0, 0, 0] });
      expect(r.bars[3]!.some((e) => e.role === 'ANSWER'), `seed ${seed}`).toBe(true);
    }
  });
});

describe('throw then scratch (section 41, SCR-P4.12)', () => {
  const chop = [ev(4, 15, 'forwardStab')];

  it('the first phrase on a FRESH record opens with a drop in the bar before', () => {
    const fresh = getScratchRecord('FRESH_STANDARD')!;
    const out = withThrow(chop, fresh, {});
    expect(out.map((e) => e.gesture)).toEqual(['drop', 'forwardStab']);
    expect(out[0]).toMatchObject({ bar: 3, step: 0, beat: 12 });
  });

  it('a record over 1.5 s gets a dropPhrase', () => {
    const long = getScratchRecord('AH_FRESH_FULL_PHRASE')!;
    expect(long.durationSec).toBeGreaterThan(1.5);
    expect(withThrow(chop, long, {})[0]!.gesture).toBe('dropPhrase');
  });

  it('a repeat within 8 bars has no drop; after 8 bars it does', () => {
    const fresh = getScratchRecord('FRESH_STANDARD')!;
    const memory = {};
    expect(withThrow(chop, fresh, memory)).toHaveLength(2);
    expect(withThrow([ev(9, 15, 'baby')], fresh, memory)).toHaveLength(1); // 6 bars after the throw in bar 3
    expect(withThrow([ev(12, 15, 'baby')], fresh, memory)).toHaveLength(2);
  });

  it('a run that starts on the chop gets a short drop at step 0 when the chop is at least four steps in', () => {
    const fresh = getScratchRecord('FRESH_STANDARD')!;
    expect(withThrow([ev(0, 8, 'baby')], fresh, {})[0]).toMatchObject({ gesture: 'drop', bar: 0, step: 0 });
    expect(withThrow([ev(0, 2, 'baby')], fresh, {})).toHaveLength(1);
  });
});
