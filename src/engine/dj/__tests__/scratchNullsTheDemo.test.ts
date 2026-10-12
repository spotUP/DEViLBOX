/**
 * The scratch is the demo's, sample for sample (owner 2026-10-12: "make the demo and devilbox scratch
 * 1:1"; research thoughts/shared/research/2026-10-12_scratch-null-test.md). The demo's own strokes and
 * buses (`tools/scratch-fixtures/gen_scratch_null.py`) null against DEViLBOX's:
 *
 *   the record    the pack WAV read the demo's way (resample_poly, float32 normalise, the S950)
 *   each stroke   `renderGesture` = scratch.render_gesture (physics, Catmull-Rom reader, surface, fader, tone, FX)
 *   each bus      the Deck C worklet = three_deck's deck_c_eq + scratch_channel + tail, scratch_dj's channel
 *
 * The residual is float64 rounding against the Python render (a stroke) and the worklet's float32 output
 * (a bus); anything else - a filter coefficient, an interpolation, a random draw, a sample of onset - shows
 * as -40 dB or worse. The whole routine through the controller, the executor and the pool nulls against
 * the demo's render in the A/B harness (`scratchParityRenderAB.test.ts`, SCRATCH_AB_LAYERS=1 SCRATCH_AB_RATE=22050).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import fixture from '@/engine/dj/scratch/__tests__/fixtures/scratch_null.json';

interface FixtureEvent { record: string; gesture: string; velocity: number; seed: number; steps: number; start: number; n: number; out: number[] }
const F = fixture as unknown as { rate: number; keep: number; stepSec: number; events: FixtureEvent[]; busN: number; threeDeck: number[]; scratchDj: number[] };

/** Residual of `x` (sampled every `keep`) against `ref`, in dB below the reference's RMS. */
function residualDb(ref: readonly number[], x: ArrayLike<number>, keep: number): number {
  let e = 0, r = 0;
  for (let i = 0; i < ref.length; i++) { const d = ref[i]! - (x[i * keep] ?? 0); e += d * d; r += ref[i]! * ref[i]!; }
  return 10 * Math.log10(e / r + 1e-300);
}

async function recordPcm(id: string): Promise<{ sig: Float64Array; anchor: number; safe: readonly [number, number] }> {
  const { getScratchRecord } = await import('@/engine/dj/scratch/scratchCatalogue');
  const { demoRecordPcm } = await import('@/engine/dj/scratch/scratchGrit');
  const rec = getScratchRecord(id)!;
  const b = readFileSync(join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals', rec.file));
  return { sig: demoRecordPcm(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), anchor: rec.demoCue.anchor, safe: rec.demoCue.safe };
}

describe('the scratch nulls against the Up Rough demo', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('every stroke - throw, hand paths, glides under the fader, the echo, soft and hard hands - is render_gesture to rounding', async () => {
    const { renderGesture, DEMO_DECK_PROFILES } = await import('@/engine/dj/scratch/scratchRender');
    for (const e of F.events) {
      const src = await recordPcm(e.record);
      const out = renderGesture(src, e.gesture, e.steps * F.stepSec, F.rate, { velocity: e.velocity, profile: DEMO_DECK_PROFILES.boombap, seed: e.seed }).out;
      expect(out.length, `${e.gesture} length`).toBe(e.n);
      expect(residualDb(e.out, out, F.keep), `${e.gesture} on ${e.record}`).toBeLessThan(-200);
    }
  }, 120_000);

  it.each(['threeDeck', 'scratchDj'] as const)('the %s bus (the Deck C worklet) is the demo\'s chain to float32', async (chain) => {
    const { renderGesture, DEMO_DECK_PROFILES } = await import('@/engine/dj/scratch/scratchRender');
    const { createDeckCBus, DECK_C_TAPS } = await import('@/engine/dj/scratch/scratchDeckC');
    const ctx = new OfflineAudioContext(1, F.busN, F.rate);
    const bus = await createDeckCBus(ctx, ctx.destination, { chain, tap: chain === 'threeDeck' ? DECK_C_TAPS.tail : -1 });
    for (const e of F.events) {
      const src = await recordPcm(e.record);
      bus.stroke(e.start, renderGesture(src, e.gesture, e.steps * F.stepSec, F.rate, { velocity: e.velocity, profile: DEMO_DECK_PROFILES.boombap, seed: e.seed }).out);
    }
    await new Promise((r) => setTimeout(r, 20));
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(residualDb(F[chain], out, F.keep)).toBeLessThan(-130);
  }, 120_000);
});
