/**
 * Drum hit placement against tools/hiphop.py performance_profile / drum_bar_context / drum_hit_placement and
 * synth_common.lfsr (plan 2026-10-19 O6c). fixtures/hit_placement.json holds all 19 profiles, lfsr streams and whole
 * bars run in render_drum_bar's order (tools/softsynth-fixtures/gen_hit_placement.py). Offsets, gains and the humanize
 * draw are compared exactly: the TypeScript keeps the host's float64 operation order and Math.trunc for int().
 */
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/hit_placement.json';
import {
  Lfsr, drumBarContext, drumHitPlacement, performanceProfile, type DrumEvent,
} from '../hitPlacement';
import type { HipHopStyle } from '../drumBank';
import type { HitHumanize } from '../humanize';

interface Bar {
  name: string; style: HipHopStyle; seed: number; bpm: number; rate: number; as_notes: boolean;
  events: { voice: string; step: number; vel: number; role: string; micro_ms: number }[];
  swing_amt: number; kick_steps: number[]; hits: { o: number; gain: number; h: HitHumanize | null }[];
}
const ref = fixture as unknown as {
  profiles: { style: HipHopStyle; perf: Record<string, number> }[];
  lfsr: { seed: number; out: number[] }[];
  bars: Bar[];
};

const FIELDS: Record<string, keyof ReturnType<typeof performanceProfile>> = {
  groove_offset: 'grooveOffset', swing: 'swing', velocity_variance: 'velocityVariance',
  snare_lateness: 'snareLateness', hat_looseness: 'hatLooseness', ghost_note_strength: 'ghostNoteStrength',
  accent_strength: 'accentStrength',
};

describe('performanceProfile', () => {
  it('has all 19 styles', () => expect(ref.profiles.length).toBe(19));
  for (const p of ref.profiles) {
    it(p.style, () => {
      const got = performanceProfile(p.style);
      for (const [k, v] of Object.entries(p.perf)) expect(got[FIELDS[k]!]).toBe(v);
    });
  }
});

describe('lfsr', () => {
  for (const c of ref.lfsr) {
    it('seed ' + c.seed, () => {
      const g = new Lfsr(c.seed);
      expect(c.out.map(() => g.next())).toEqual(c.out);
    });
  }
});

describe('drum bars in render order', () => {
  for (const bar of ref.bars) {
    it(bar.name, () => {
      const events: DrumEvent[] = bar.events.map((e) => ({
        voice: e.voice, step: e.step, vel: e.vel, role: e.role, microMs: e.micro_ms, isNote: bar.as_notes,
      }));
      const ctx = drumBarContext(bar.style, events, bar.seed);
      expect(ctx.swingAmt).toBe(bar.swing_amt);
      expect([...ctx.kickSteps].sort((a, b) => a - b)).toEqual(bar.kick_steps);
      const stepSamp = Math.trunc(bar.rate * 60.0 / (bar.bpm * 4));
      events.forEach((e, i) => {
        const want = bar.hits[i]!;
        const got = drumHitPlacement(
          bar.style, e.voice, e.step, e.vel, e.role, e.microMs ?? 0, e.isNote ?? false, stepSamp, bar.rate,
          ctx.kickSteps, ctx.swingAmt, ctx.rnd, bar.seed,
        );
        expect(got.offset).toBe(want.o);
        expect(got.gain).toBe(want.gain);
        expect(got.h).toEqual(want.h);
      });
    });
  }
});
