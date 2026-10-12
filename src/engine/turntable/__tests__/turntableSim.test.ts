/**
 * The ported two-body turntable model replays the Up Rough reference (scratch ledger SCR-PG-B1,
 * owner decision O1). Fixture: `fixtures/turntableSim.json`, written by
 * `tools/scratch-fixtures/gen_turntable_sim_fixture.py` from `Up_Rough_Demo_System/tools/turntable.simulate`:
 *   /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_turntable_sim_fixture.py \
 *     /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/turntable/__tests__/fixtures/turntableSim.json
 * Cases: the baby `render_gesture` builds (A x amp(0.7), 2 steps at 92 BPM, warp 0.4, eccentricity
 * 0.3, seed 0 on classic_sl1200 / thin_battle / light_battle / tight_battle), the reference
 * self-check baby, and a release on a worn deck. Record and platter velocity within 1e-3 at 64
 * audio-rate points; the platter stays forward (> 0) through the baby (the demo self-check).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NumpyRandomState, simulate, audioRateSample, validateMotion, deckMotionAt, type TtHandPoint, type TtSimOptions } from '../turntableSim';

interface Case { name: string; hand: number[][]; dur: number; opts: Record<string, unknown>; n: number; idx: number[]; record_vel: number[]; platter_vel: number[]; issues: string[] }
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'turntableSim.json'), 'utf8')) as { rand: number[]; cases: Case[] };

function optsOf(o: Record<string, unknown>): TtSimOptions {
  return { deck: o.deck as TtSimOptions['deck'], slipmat: o.slipmat as TtSimOptions['slipmat'], record: o.record as TtSimOptions['record'], performer: o.performer as TtSimOptions['performer'], warp: o.warp as number | undefined, eccentricity: o.eccentricity as number | undefined, seed: o.seed as number | undefined };
}

describe('the ported turntable model replays the reference (SCR-PG-B1)', () => {
  it('numpy RandomState(0).rand() - the reference generator - to the last bit', () => {
    const r = new NumpyRandomState(0);
    for (const x of fixture.rand) expect(r.rand()).toBe(x);
  });

  for (const c of fixture.cases) {
    it(`${c.name}: record and platter velocity within 1e-3 of turntable.simulate`, () => {
      const sim = simulate(c.hand.map((p) => [p[0]!, p[1]!, p[2]!] as TtHandPoint), c.dur, 22050, optsOf(c.opts));
      c.idx.forEach((i, k) => {
        expect(Math.abs(audioRateSample(sim, sim.recordVel, i, c.n) - c.record_vel[k]!), `record_vel[${i}]`).toBeLessThan(1e-3);
        expect(Math.abs(audioRateSample(sim, sim.platterVel, i, c.n) - c.platter_vel[k]!), `platter_vel[${i}]`).toBeLessThan(1e-3);
      });
      expect(validateMotion(sim)).toEqual(c.issues);
    });
  }

  it('through the baby the record reverses while the platter keeps going forward (> 0)', () => {
    const c = fixture.cases.find((x) => x.name === 'baby_render_gesture')!;
    const sim = simulate(c.hand.map((p) => [p[0]!, p[1]!, p[2]!] as TtHandPoint), c.dur, 22050, optsOf(c.opts));
    expect(Math.min(...sim.recordVel)).toBeLessThan(-0.3);
    expect(Math.min(...sim.platterVel)).toBeGreaterThan(0);
  });

  it('simulateGesture(baby) at velocity 0.7, 2 steps at 92 BPM, on the default turntable is the render_gesture fixture (SCR-PG-BR)', async () => {
    const { simulateGesture } = await import('@/engine/dj/scratch/scratchPhysics');
    const { getGesture } = await import('@/engine/dj/scratch/scratchGestureCatalog');
    const c = fixture.cases.find((x) => x.name === 'baby_render_gesture')!;
    const { sim } = simulateGesture(getGesture('baby'), c.dur, { velocity: 0.7, seed: 0 });
    c.idx.forEach((i, k) => expect(Math.abs(audioRateSample(sim, sim.recordVel, i, c.n) - c.record_vel[k]!), `record_vel[${i}]`).toBeLessThan(1e-3));
    expect(Math.min(...sim.platterVel)).toBeGreaterThan(0);
  });

  it('deck motion: brake exp(-3 t), start 1 - exp(-5 t) on the classic deck', () => {
    expect(deckMotionAt('brake', 1)).toBeCloseTo(Math.exp(-3), 12);
    expect(deckMotionAt('start', 1)).toBeCloseTo(1 - Math.exp(-5), 12);
  });
});
