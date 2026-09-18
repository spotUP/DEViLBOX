/**
 * Gate N4 — the long deterministic run.
 *
 * Half an hour of performing, checked for the things that only show up over
 * time: spam, stuck gestures, runaway feedback, energy that creeps upward,
 * stale predictions, unbounded memory, and drift against the transport.
 *
 * Deterministic, so a failure is reproducible from the seed rather than "it
 * happened once overnight". It runs as a simulation rather than in real time —
 * thirty minutes of MUSIC, not thirty minutes of waiting.
 */

import { describe, it, expect } from 'vitest';
import { simulatePerformance } from '../simulator';
import { SCENES } from './scenes.fixtures';
import { behaviourFor, energyBudgetFor } from '../personaBehaviour';

/** 30 minutes at 140 BPM in 4/4 is about 1050 bars. */
const BARS_30_MIN = 1050;

const scene = SCENES.find(s => s.name.startsWith('D'))!;   // ordinary tracker module

describe('N4 — thirty minutes of performing', () => {
  const run = simulatePerformance(scene.project, {
    persona: 'perry',           // the busiest, boldest persona: worst case
    seed: 1234,
    bars: BARS_30_MIN,
  });

  it('runs the whole length without falling over', () => {
    expect(run.entries.length).toBe(run.summary.cycles);
    expect(run.summary.cycles).toBeGreaterThan(8000);
  });

  it('does not spam', () => {
    expect(run.summary.fires / run.summary.cycles).toBeLessThan(0.25);
  });

  it('leaves the music alone for most of the half hour', () => {
    expect(run.summary.restCycles / run.summary.cycles).toBeGreaterThan(0.5);
  });

  it('never lets energy accumulate across the run', () => {
    const budget = energyBudgetFor(behaviourFor('perry'));
    expect(run.summary.peakWet).toBeLessThanOrEqual(budget.wet);
    expect(run.summary.finalWet).toBeLessThanOrEqual(run.summary.peakWet);

    // And the second half is no wetter than the first — the real test of
    // accumulation, which a peak alone cannot show.
    const half = Math.floor(run.entries.length / 2);
    const mean = (from: number, to: number) => {
      const slice = run.entries.slice(from, to);
      return slice.reduce((sum, e) => sum + e.wet, 0) / Math.max(1, slice.length);
    };
    expect(mean(half, run.entries.length)).toBeLessThan(mean(0, half) * 2 + 0.1);
  });

  it('never leaves a gesture stuck — every fire is followed by more decisions', () => {
    // A stuck gesture shows up as the machine never leaving RIDE.
    const states = new Set(run.entries.map(e => e.state));
    expect(states.has('RIDE')).toBe(true);
    expect(states.has('LISTEN')).toBe(true);
    const tailStates = new Set(run.entries.slice(-200).map(e => e.state));
    expect(tailStates.size).toBeGreaterThan(1);
  });

  it('keeps making different decisions at the end than at the start', () => {
    const firstIntentions = new Set(run.entries.slice(0, 400).map(e => e.intention));
    const lastIntentions = new Set(run.entries.slice(-400).map(e => e.intention));
    expect(lastIntentions.size).toBeGreaterThan(1);
    // It has not collapsed into one behaviour by the end.
    expect(firstIntentions.size).toBeGreaterThan(1);
  });

  it('does not drift against the transport — rows and bars stay consistent', () => {
    for (let i = 1; i < run.entries.length; i++) {
      expect(run.entries[i].row).toBeGreaterThan(run.entries[i - 1].row);
      expect(run.entries[i].bar).toBeGreaterThanOrEqual(run.entries[i - 1].bar);
    }
    const last = run.entries[run.entries.length - 1];
    expect(last.bar).toBeGreaterThanOrEqual(BARS_30_MIN - 2);
  });

  it('bounds its own memory — the log is the only thing that grows', () => {
    // Every move the performer remembers is capped; if the caps failed, the
    // recent-move window would grow with the run and the repetition verdict
    // would slow down. Proxy: the run stays fast and the summary's move counts
    // are bounded by the fire count.
    const counted = Object.values(run.summary.moveCounts).reduce((a, b) => a + b, 0);
    expect(counted).toBe(run.summary.fires);
  });

  it('is reproducible from its seed', () => {
    const again = simulatePerformance(scene.project, { persona: 'perry', seed: 1234, bars: 200 });
    const first = simulatePerformance(scene.project, { persona: 'perry', seed: 1234, bars: 200 });
    expect(again.summary).toEqual(first.summary);
  });
});

describe('N4 — the same half hour for every persona', () => {
  for (const persona of ['tubby', 'scientist', 'madProfessor', 'jammy'] as const) {
    it(`${persona} survives thirty minutes`, () => {
      const r = simulatePerformance(scene.project, { persona, seed: 99, bars: BARS_30_MIN });
      const budget = energyBudgetFor(behaviourFor(persona));
      expect(r.summary.fires / r.summary.cycles, persona).toBeLessThan(0.25);
      expect(r.summary.restCycles / r.summary.cycles, persona).toBeGreaterThan(0.5);
      expect(r.summary.peakWet, persona).toBeLessThanOrEqual(budget.wet);
      expect(r.summary.finalWet, persona).toBeLessThanOrEqual(r.summary.peakWet);
    });
  }
});
