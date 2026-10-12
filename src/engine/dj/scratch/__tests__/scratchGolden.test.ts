/**
 * Golden performances (owner scratch plan section 69; ledger SCR-P4.14): eight fixed-seed
 * scenarios, each asserting the shape the owner plan names, plus the exact event list of seed 1
 * stored in `fixtures/golden/<scenario>.json`.
 *
 * Regenerate the fixtures (only after a deliberate planner change, review the diff):
 *   SCRATCH_GOLDEN_UPDATE=1 VITEST_MAX_WORKERS=2 npx vitest run src/engine/dj/scratch/__tests__/scratchGolden.test.ts
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { planScratch, type ScratchPlan, type ScratchPlanOptions } from '../scratchPlanner';
import { genreToScratchStyle } from '../scratchStyles';
import { getGesture } from '../scratchGestureCatalog';
import { scenarioContext, type ScenarioInput } from './fixtures/scenarioContext';
import type { ScratchGestureId } from '../scratchTypes';

const GOLDEN_DIR = join(__dirname, 'fixtures', 'golden');
const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);

interface Scenario { ctx: ScenarioInput; opts: Omit<ScratchPlanOptions, 'seed'> }

const house = genreToScratchStyle('house');
const dnb = genreToScratchStyle('drumAndBass');
const VOCAL_CALLS = [0.9, 0.9, 0.2, 0.2, 0.9, 0.9, 0.2, 0.2, 0.9, 0.9, 0.2, 0.2, 0.9, 0.9, 0.2, 0.2];

const SCENARIOS = {
  boomBap: { ctx: { style: 'boomBap', kind: 'chorus', bpm: 92, energy: 0.5 }, opts: { mode: 'MUSICAL', fromBar: 16, bars: 16, routine: 'auto' } },
  peakBattle: { ctx: { style: 'battle', kind: 'drop', bpm: 100, energy: 0.9 }, opts: { mode: 'BATTLE', fromBar: 16, bars: 32 } },
  house: { ctx: { style: house.style, kind: 'groove', bpm: 124, energy: 0.6 }, opts: { mode: 'MUSICAL', fromBar: 16, bars: 16, genre: house.modifiers } },
  drumAndBass: { ctx: { style: dnb.style, kind: 'groove', bpm: 174, energy: 0.7 }, opts: { mode: 'PERFORMER', fromBar: 16, bars: 16, genre: dnb.modifiers } },
  vocal: { ctx: { style: 'boomBap', kind: 'verse', bpm: 92, energy: 0.5 }, opts: { mode: 'MUSICAL', fromBar: 16, bars: 16, vocalByBar: VOCAL_CALLS } },
  breakdown: { ctx: { style: 'boomBap', kind: 'breakdown', bpm: 92, energy: 0.4 }, opts: { mode: 'MUSICAL', fromBar: 16, bars: 16, records: true } },
  drop: { ctx: { style: 'electro', kind: 'drop', bpm: 128, energy: 0.8 }, opts: { mode: 'PERFORMER', fromBar: 20, bars: 4 } },
  lowConfidence: { ctx: { style: 'battle', kind: 'drop', bpm: 100, energy: 0.9, beatConfidence: 0.4 }, opts: { mode: 'BATTLE', fromBar: 16, bars: 16 } },
} satisfies Record<string, Scenario>;
type ScenarioName = keyof typeof SCENARIOS;

const plan = (name: ScenarioName, seed: number, over: Partial<ScenarioInput> = {}): ScratchPlan => {
  const s: Scenario = SCENARIOS[name];
  return planScratch(scenarioContext({ permission: 4, ...s.ctx, ...over }), { ...s.opts, seed });
};
const gestures = (p: ScratchPlan): Set<ScratchGestureId> => new Set(p.events.map((e) => e.gesture));
const level = (id: ScratchGestureId): number => getGesture(id).difficulty;
const emptyBars = (p: ScratchPlan): number => p.bars.filter((b) => b.length === 0).length;

describe('golden performances (SCR-P4.14, section 69)', () => {
  it('the seed-1 event list of every scenario equals its stored golden fixture', () => {
    const update = process.env.SCRATCH_GOLDEN_UPDATE === '1';
    if (update) mkdirSync(GOLDEN_DIR, { recursive: true });
    for (const name of Object.keys(SCENARIOS) as ScenarioName[]) {
      const p = plan(name, 1);
      const golden = { scenario: name, seed: 1, mode: p.mode, routine: p.routine ?? null, events: p.events };
      const file = join(GOLDEN_DIR, `${name}.json`);
      if (update) writeFileSync(file, `${JSON.stringify(golden, null, 1)}\n`);
      expect(existsSync(file), `${file} missing: regenerate with SCRATCH_GOLDEN_UPDATE=1`).toBe(true);
      expect(golden, name).toEqual(JSON.parse(readFileSync(file, 'utf8')));
    }
  });

  it('Test 1 Boom Bap 92 BPM hook (routine auto): baby, stab, chirp, and the hook call answered in the next bar', () => {
    const allowed = new Set<ScratchGestureId>(['baby', 'forwardStab', 'chirp', 'chirpDouble', 'tearForward']);
    for (const seed of SEEDS) {
      const p = plan('boomBap', seed);
      for (const g of gestures(p)) expect(allowed.has(g), `seed ${seed}: ${g}`).toBe(true);
      // a THEME bar (the call) followed by an ANSWER bar: the demo's routine_for(hook) closes the section
      const pair = p.bars.some((b, i) => b.some((e) => e.role === 'THEME') && (p.bars[i + 1] ?? []).some((e) => e.role === 'ANSWER'));
      expect(pair, `seed ${seed}`).toBe(true);
    }
    const seen = new Set(SEEDS.flatMap((s) => [...gestures(plan('boomBap', s))]));
    for (const g of ['baby', 'forwardStab', 'chirp'] as const) expect(seen.has(g), g).toBe(true);
  });

  // the 32 bars of a set's PEAK are the demo's own showcase (scratch_dj, with its silent bars: the parity test);
  // the overlay of a battle drop is the demo's showcase density, every bar busy as the demo plays it
  // high energy sits at the busy end of the demo's ranking (activity: hydroplane 12, transformer8 8,
  // chirp_double 7, scribble / orbit / crab 5): the flares (activity 2-3) belong to calmer sections
  it('Test 2 Peak Battle 100 BPM, high energy: the busy end of the vocabulary - transformer and the hardest strokes', () => {
    for (const seed of SEEDS) {
      const p = plan('peakBattle', seed);
      const g = [...gestures(p)];
      expect(g.some((x) => x === 'transformer4' || x === 'transformer8'), `seed ${seed} transformer`).toBe(true);
      expect(g.some((x) => level(x) === 4), `seed ${seed} level 4`).toBe(true);
      for (const x of g) expect(getGesture(x).activity, `seed ${seed} ${x}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('Test 3 House 124 BPM: sparse, transformer accents, never a constant stream', () => {
    for (const seed of SEEDS) {
      const p = plan('house', seed);
      expect(emptyBars(p), `seed ${seed}`).toBeGreaterThanOrEqual(8);
      expect(p.events.length, `seed ${seed}`).toBeLessThanOrEqual(16);
      expect([...gestures(p)].some((x) => x === 'transformer4' || x === 'transformer8'), `seed ${seed}`).toBe(true);
      // never two busy bars running for more than a 2-bar routine
      let run = 0, longest = 0;
      for (const b of p.bars) { run = b.length ? run + 1 : 0; longest = Math.max(longest, run); }
      expect(longest, `seed ${seed}`).toBeLessThanOrEqual(2);
    }
  });

  it('Test 4 Drum & Bass 174 BPM: short gestures only (<= 2 steps), no drag', () => {
    for (const seed of SEEDS) {
      const p = plan('drumAndBass', seed);
      expect(p.events.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const e of p.events) {
        expect(getGesture(e.gesture).durationSteps, `seed ${seed} ${e.gesture}`).toBeLessThanOrEqual(2);
        expect(e.gesture).not.toBe('drag');
      }
    }
  });

  // section 69 "density reduction OR intentional vocal response": each strong vocal bar carries answers only,
  // and what is not an answer to the vocal is thinner than the same verse without it
  it('Test 5 Vocal track: bars under a strong vocal carry answers only; everything else thins out', () => {
    let withVocal = 0, without = 0;
    for (const seed of SEEDS) {
      const p = plan('vocal', seed);
      p.bars.forEach((b, i) => {
        if (VOCAL_CALLS[i]! > 0.7) for (const e of b) expect(e.role, `seed ${seed} bar ${i}`).toBe('ANSWER');
      });
      withVocal += p.events.filter((e) => e.role !== 'ANSWER').length;
      without += planScratch(scenarioContext(SCENARIOS.vocal.ctx), { ...SCENARIOS.vocal.opts, vocalByBar: undefined, seed }).events.length;
    }
    expect(withVocal).toBeLessThan(without);
  });

  it('Test 6 Breakdown: one crate record for the section, baby, chirp and rests', () => {
    const seen = new Set<ScratchGestureId>();
    for (const seed of SEEDS) {
      const p = plan('breakdown', seed);
      expect(new Set(p.events.map((e) => e.record)).size, `seed ${seed}`).toBeLessThanOrEqual(1);
      expect(emptyBars(p), `seed ${seed}`).toBeGreaterThanOrEqual(4);
      for (const g of gestures(p)) seen.add(g);
    }
    expect(seen.has('baby')).toBe(true);
    expect(seen.has('chirp')).toBe(true);
  });

  it('Test 7 Drop: electro under PERFORMER is busy (the high state), inside level 3, at most 4 a bar, one hand', () => {
    for (const seed of SEEDS) {
      const p = plan('drop', seed);
      expect(p.events.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      for (const e of p.events) expect(level(e.gesture), `seed ${seed} ${e.gesture}`).toBeLessThanOrEqual(3);
      for (const b of p.bars) expect(b.length).toBeLessThanOrEqual(4);
    }
  });

  it('Test 8 Low confidence: no level 3/4 scratch, plays as SAFE', () => {
    for (const seed of SEEDS) {
      const p = plan('lowConfidence', seed);
      expect(p.mode).toBe('SAFE');
      expect(p.routine).toBeUndefined();
      for (const e of p.events) expect(level(e.gesture), `seed ${seed} ${e.gesture}`).toBeLessThanOrEqual(2);
    }
  });
});
