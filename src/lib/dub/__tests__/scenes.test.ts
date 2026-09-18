/**
 * Gate N3 — musical regression scenes A-G.
 *
 * The same performer across seven kinds of song, with move count, rest
 * duration, target distribution and energy curves captured. A change that
 * improves the roots riddim and ruins the 7/8 scene shows up here.
 *
 * These assert RANGES, not exact numbers. An exact snapshot of a decision log
 * would fail on every tuning change and teach everyone to re-bless it without
 * reading it, which is worse than no test. The ranges are wide enough to
 * survive tuning and narrow enough to catch "it stopped resting" or "it fires
 * on every tick now".
 */

import { describe, it, expect } from 'vitest';
import { simulatePerformance } from '../simulator';
import { SCENES } from './scenes.fixtures';
import { behaviourFor, energyBudgetFor } from '../personaBehaviour';

const PERSONAS = ['tubby', 'scientist', 'perry', 'madProfessor', 'jammy'] as const;

describe('N3 scenes — the performer copes with all of them', () => {
  for (const scene of SCENES) {
    describe(scene.name, () => {
      it(`survives its challenge: ${scene.challenge}`, () => {
        for (const persona of PERSONAS) {
          const r = simulatePerformance(scene.project, { persona, seed: 17, bars: 64 });
          expect(r.entries.length, persona).toBeGreaterThan(0);
          // Every decision explains itself, on every scene.
          expect(r.entries.every(e => e.reason.length > 0), persona).toBe(true);
        }
      });

      it('leaves space rather than filling every gap', () => {
        for (const persona of PERSONAS) {
          const r = simulatePerformance(scene.project, { persona, seed: 17, bars: 64 });
          expect(r.summary.restCycles / r.summary.cycles, `${scene.name} / ${persona}`)
            .toBeGreaterThan(0.5);
        }
      });

      it('does not spam', () => {
        for (const persona of PERSONAS) {
          const r = simulatePerformance(scene.project, { persona, seed: 17, bars: 64 });
          expect(r.summary.fires / r.summary.cycles, `${scene.name} / ${persona}`)
            .toBeLessThan(0.3);
        }
      });

      it('keeps energy inside the persona budget', () => {
        for (const persona of PERSONAS) {
          const r = simulatePerformance(scene.project, { persona, seed: 17, bars: 64 });
          const budget = energyBudgetFor(behaviourFor(persona));
          expect(r.summary.peakWet, `${scene.name} / ${persona}`)
            .toBeLessThanOrEqual(budget.wet);
        }
      });

      it('is reproducible', () => {
        const a = simulatePerformance(scene.project, { persona: 'tubby', seed: 5, bars: 32 });
        const b = simulatePerformance(scene.project, { persona: 'tubby', seed: 5, bars: 32 });
        expect(a.summary).toEqual(b.summary);
      });
    });
  }
});

describe('N3 — what each scene is specifically supposed to prove', () => {
  const scene = (name: string) => SCENES.find(s => s.name.startsWith(name))!;

  it('A: a sparse riddim does not get filled in', () => {
    const r = simulatePerformance(scene('A').project, { persona: 'tubby', seed: 17, bars: 64 });
    // Fewer fires than the busy scene, given the same persona and seed.
    const dense = simulatePerformance(scene('B').project, { persona: 'tubby', seed: 17, bars: 64 });
    expect(r.summary.fires).toBeLessThanOrEqual(dense.summary.fires);
  });

  it('B: a dense song does not make it fire per event', () => {
    const r = simulatePerformance(scene('B').project, { persona: 'perry', seed: 17, bars: 64 });
    const onsets = scene('B').project.sources.reduce((n, s) => n + s.onsets.length, 0);
    expect(r.summary.fires).toBeLessThan(onsets / 10);
  });

  it('C: it answers the voices rather than only the drums', () => {
    const r = simulatePerformance(scene('C').project, { persona: 'tubby', seed: 17, bars: 96 });
    const answers = r.entries.filter(e => e.intention === 'ANSWER');
    // The scene exists to give it something to answer; the performer may
    // choose not to, but it must at least recognise the call.
    expect(answers.length + r.summary.fires).toBeGreaterThan(0);
  });

  it('E: a long unchanging song does not become one repeated move', () => {
    const r = simulatePerformance(scene('E').project, { persona: 'scientist', seed: 17, bars: 128 });
    const counts = Object.values(r.summary.moveCounts);
    if (counts.length > 0) {
      const top = Math.max(...counts);
      const total = counts.reduce((a, b) => a + b, 0);
      expect(top / total).toBeLessThan(0.75);
    }
  });

  it('F: an unusual metre does not break the phrase logic', () => {
    const r = simulatePerformance(scene('F').project, { persona: 'tubby', seed: 17, bars: 64 });
    // Bars advance, phrases turn, nothing lands on a NaN row.
    expect(r.entries.every(e => Number.isFinite(e.row) && Number.isFinite(e.bar))).toBe(true);
    expect(Math.max(...r.entries.map(e => e.bar))).toBeGreaterThan(8);
  });

  it('G: with one channel it still performs, and never removes the only part', () => {
    const r = simulatePerformance(scene('G').project, { persona: 'jammy', seed: 17, bars: 64 });
    expect(r.entries.length).toBeGreaterThan(0);
    // It may still DROP — a filter sweep on the bus is a drop and takes
    // nothing away permanently. What it must never do is mute the only thing
    // playing, which is silence rather than a version.
    const removing = new Set(['versionDrop', 'riddimSection', 'masterDrop', 'channelMute']);
    const removed = r.entries.filter(e => e.fired && removing.has(e.fired));
    expect(removed).toHaveLength(0);
  });
});
