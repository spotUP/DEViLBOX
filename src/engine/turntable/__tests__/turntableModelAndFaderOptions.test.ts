/**
 * PG-K (scratch ledger): the demo's model and fader options, each replayed against the demo's own output.
 * Fixture `fixtures/pg_k.json`, written by tools/scratch-fixtures/gen_pg_k.py from Up_Rough_Demo_System/tools/turntable.py:
 *   /opt/homebrew/bin/python3.11 -I tools/scratch-fixtures/gen_pg_k.py \
 *     /Users/spot/Code/Up_Rough_Demo_System/tools src/engine/turntable/__tests__/fixtures/pg_k.json
 *
 * T6 `cartridge_response` + `_lp`, T8 `GRIP_STATES`, T10 the needle skip in `simulate`, F5 `fader_curve` (cut_in, the
 * hamster flip), F6 `fader_from_pattern`'s contact bounce, lag and left-deck assignment + `FADER_ASSIGN`.
 * The demo's renders apply none of them except the gesture's `hamster` (render_gesture) - here too (owner T6
 * decision: available, applied nowhere); every option moves its function's output (checked against off).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { simulate, audioRateSample, cartridgeResponse, TT_GRIP_STATES, turntableSimStats, type TtCartridge, type TtHandPoint } from '../turntableSim';
import { faderCurve, faderFromPattern, FADER_ASSIGN } from '@/engine/dj/scratch/scratchRender';

interface SkipCase { seed: number; skip: number; hand: TtHandPoint[]; dur: number; n: number; idx: number[]; record_vel: number[]; record_angle: number[] }
interface FaderCase { name: string; pattern: Array<[number, number]>; n: number; opts: Record<string, unknown>; out: number[] }
interface CurveCase { mode: string; cut_in: number; hamster: boolean; pos: number[]; out: number[] }
const F = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'pg_k.json'), 'utf8')) as {
  grip_states: Record<string, number>; skip: SkipCase[]; fader: FaderCase[]; curve: CurveCase[];
  cartridge_in: number[]; cartridge: Array<{ name: TtCartridge; out: number[] }>;
};

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};

describe('PG-K: the demo\'s model and fader options', () => {
  it('T8: GRIP_STATES is the demo\'s table; F6: FADER_ASSIGN is three_deck\'s', () => {
    expect(TT_GRIP_STATES).toEqual(F.grip_states);
    expect(FADER_ASSIGN).toEqual({ A: 'XFADER_LEFT', B: 'XFADER_RIGHT', C: 'SCRATCH_CUT' });
  });

  it('T10: simulate with the needle skip on (seeds 0..3) and off replays the demo\'s record velocity and angle', () => {
    for (const c of F.skip) {
      const sim = simulate(c.hand, c.dur, 22050, { skip: c.skip, seed: c.seed, warp: 0.4, eccentricity: 0.3 });
      const vel = c.idx.map((i) => audioRateSample(sim, sim.recordVel, i, c.n));
      const ang = c.idx.map((i) => audioRateSample(sim, sim.recordAngle, i, c.n));
      expect(maxDiff(vel, c.record_vel), `seed ${c.seed} skip ${c.skip} record_vel`).toBeLessThan(1e-9);
      // the angle runs to ~9000 samples: 1e-9 relative
      expect(maxDiff(ang, c.record_angle) / 1e4, `seed ${c.seed} skip ${c.skip} record_angle`).toBeLessThan(1e-9);
    }
    // the option moves the output: a skipped groove leaves the record further along
    for (let seed = 0; seed < 4; seed++) {
      const on = F.skip.find((c) => c.seed === seed && c.skip === 1)!, off = F.skip.find((c) => c.seed === seed && c.skip === 0)!;
      expect(Math.abs(on.record_angle.at(-1)! - off.record_angle.at(-1)!)).toBeGreaterThan(10);
    }
  });

  it('F5: fader_curve (battle / sharp / smooth / an unknown curve, cut_in, hamster) is the demo\'s', () => {
    for (const c of F.curve) {
      const out = c.pos.map((p) => faderCurve(p, c.mode, c.cut_in, c.hamster));
      expect(maxDiff(out, c.out), `${c.mode} cut_in ${c.cut_in} hamster ${c.hamster}`).toBeLessThan(1e-12);
    }
  });

  it('F6: fader_from_pattern with contact bounce (seeds 0..3), lag, the left deck, the hamster flip and all of them is the demo\'s', () => {
    const plain: Record<string, Float64Array> = {};
    for (const c of F.fader) {
      const o = c.opts as { contact_bounce?: number; seed?: number; lag_ms?: number; deck?: 'left' | 'right'; hamster?: boolean; ramp_ms?: number; offset_ms?: number; curve?: string };
      const out = faderFromPattern(c.pattern, c.n, 22050, {
        contactBounce: o.contact_bounce, seed: o.seed, lagMs: o.lag_ms, deck: o.deck, hamster: o.hamster, rampMs: o.ramp_ms, offsetMs: o.offset_ms, curve: o.curve,
      });
      expect(maxDiff(out, c.out), `${c.name} ${JSON.stringify(c.opts)}`).toBeLessThan(1e-9);
      plain[c.name] ??= faderFromPattern(c.pattern, c.n, 22050);
      // every option moves the envelope; the hamster flip on the left deck flips twice (the demo's `hamster = not hamster`)
      const cancels = o.hamster === true && o.deck === 'left' && Object.keys(o).length === 2;
      if (cancels) expect(maxDiff(out, plain[c.name]!)).toBe(0);
      else expect(maxDiff(out, plain[c.name]!), `${c.name} ${JSON.stringify(c.opts)} moves the output`).toBeGreaterThan(0);
    }
  });

  it('T6: cartridge_response for the four cartridges is the demo\'s (sentinel: one call each)', () => {
    const before = turntableSimStats.cartridgeResponses;
    for (const c of F.cartridge) expect(maxDiff(cartridgeResponse(F.cartridge_in, 22050, c.name), c.out), c.name).toBeLessThan(1e-12);
    expect(turntableSimStats.cartridgeResponses - before).toBe(F.cartridge.length);
  });
});
