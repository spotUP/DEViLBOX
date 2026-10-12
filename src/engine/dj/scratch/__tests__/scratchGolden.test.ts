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
    // MUSICAL plays the demo's whole ladder (owner 2026-10-12): the hook's phrase ending reaches transformer8 (L3)
    const allowed = new Set<ScratchGestureId>(['baby', 'forwardStab', 'chirp', 'chirpDouble', 'tearForward', 'transformer8']);
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

  // P13 (owner 2026-10-12): the genre's modifiers, the vocal rule and the low-confidence gate govern the
  // DEViLBOX extras on top; the demo's own strokes play as the demo plans them in every scenario
  const demoKeys = (p: ScratchPlan) => p.events.filter((e) => e.layer === 'demo').map((e) => `${e.bar}:${e.step}:${e.gesture}:${e.velocity}`);
  const alone = (name: ScenarioName, seed: number) => planScratch(scenarioContext({ permission: 4, ...SCENARIOS[name].ctx }), { ...SCENARIOS[name].opts, seed, extras: false });

  it('Test 3 House 124 BPM: the demo\'s strokes as planned, the extras inside the genre\'s level cap', () => {
    for (const seed of SEEDS) {
      const p = plan('house', seed);
      expect(demoKeys(p), `seed ${seed}`).toEqual(demoKeys(alone('house', seed)));
      for (const e of p.events.filter((x) => x.layer === 'extra')) expect(level(e.gesture), `seed ${seed} ${e.gesture}`).toBeLessThanOrEqual(house.modifiers.levelCap ?? 4);
    }
  });

  it('Test 4 Drum & Bass 174 BPM: the demo\'s strokes as planned, the extras short (<= 2 steps), no drag', () => {
    let demo = 0;
    for (const seed of SEEDS) {
      const p = plan('drumAndBass', seed);
      expect(demoKeys(p), `seed ${seed}`).toEqual(demoKeys(alone('drumAndBass', seed)));
      demo += demoKeys(p).length;
      for (const e of p.events.filter((x) => x.layer === 'extra')) {
        expect(getGesture(e.gesture).durationSteps, `seed ${seed} ${e.gesture}`).toBeLessThanOrEqual(2);
        expect(e.gesture).not.toBe('drag');
      }
    }
    expect(demo).toBeGreaterThan(0);
  });

  // section 69 "density reduction OR intentional vocal response": the extras under a strong vocal are answers
  // only, and a call that ends gets one; the demo's strokes play under the vocal
  it('Test 5 Vocal track: the demo\'s strokes play; the extras under a strong vocal are answers only', () => {
    let answers = 0;
    for (const seed of SEEDS) {
      const p = plan('vocal', seed);
      expect(demoKeys(p), `seed ${seed}`).toEqual(demoKeys(alone('vocal', seed)));
      p.bars.forEach((b, i) => {
        const extras = b.filter((e) => e.layer === 'extra');
        answers += extras.filter((e) => e.role === 'ANSWER').length;
        if (VOCAL_CALLS[i]! > 0.7) for (const e of extras) expect(e.role, `seed ${seed} bar ${i}`).toBe('ANSWER');
      });
    }
    expect(answers).toBeGreaterThan(0);
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

  it('Test 7 Drop: electro under PERFORMER is busy (the high state), inside the ladder (level 4), at most 4 a bar, one hand', () => {
    for (const seed of SEEDS) {
      const p = plan('drop', seed);
      expect(p.events.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      for (const e of p.events) expect(level(e.gesture), `seed ${seed} ${e.gesture}`).toBeLessThanOrEqual(4);
      for (const b of p.bars) expect(b.length).toBeLessThanOrEqual(4);
    }
  });

  it('Test 8 Low confidence: plays as SAFE - the extras at level 1, the demo\'s strokes as planned', () => {
    for (const seed of SEEDS) {
      const p = plan('lowConfidence', seed);
      expect(p.mode).toBe('SAFE');
      expect(demoKeys(p), `seed ${seed}`).toEqual(demoKeys(plan('lowConfidence', seed, { beatConfidence: 1 })));
      for (const e of p.events.filter((x) => x.layer === 'extra')) expect(level(e.gesture), `seed ${seed} ${e.gesture}`).toBeLessThanOrEqual(1);
    }
  });
});
