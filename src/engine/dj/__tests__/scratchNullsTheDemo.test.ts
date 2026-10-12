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
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';
import fixture from '@/engine/dj/scratch/__tests__/fixtures/scratch_null.json';
import overlayFixture from '@/engine/dj/scratch/__tests__/fixtures/scratch_overlay_null.json';

const holder = vi.hoisted(() => ({ ctx: null as unknown, samplerInput: null as unknown }));
// the registry's entry points (pads, MCP, a transition's preset, a tracker sample, the loop) on an offline context;
// the app graph a record stroke never touches is stubbed (scratchRegistryStubs.ts)
vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
vi.mock('@/stores/useTransportStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useTransportStore']());
vi.mock('@/stores/useDJStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useDJStore']());
vi.mock('@/engine/dj/DJActions', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJActions']());
vi.mock('@/engine/dj/DJQuantizedFX', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJQuantizedFX']());
vi.mock('@/engine/dj/DJBeatJump', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJBeatJump']());
vi.mock('@/engine/dj/DJAutoSync', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJAutoSync']());
vi.mock('@/hooks/drumpad/useMIDIPadRouting', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/hooks/drumpad/useMIDIPadRouting']());
vi.mock('@engine/ToneEngine', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@engine/ToneEngine']());
vi.mock('@/engine/dj/DJEngine', () => {
  const deck = { id: 'A', setScratchVelocity() {}, playPattern() {}, stopPattern() {}, finishPatternCycle() {}, getEffectiveBPM: () => 92 };
  const engine = () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } });
  return { getDJEngine: engine, getDJEngineIfActive: engine };
});

interface FixtureEvent { record: string; gesture: string; velocity: number; seed: number; steps: number; start: number; n: number; out: number[] }
const F = fixture as unknown as { rate: number; keep: number; stepSec: number; events: FixtureEvent[]; busN: number; threeDeck: number[]; scratchDj: number[]; level: number; duck: number[] };

const O = overlayFixture as unknown as {
  rate: number; keep: number; bpm: number; bars: number; seed: number; record: string; plan: Array<{ bar: number; step: number; gesture: string; velocity: number }>;
  overlayN: number; overlay: number[]; routineSeed: number; routineRecord: string; routineN: number; routine: number[];
  profiles: Record<string, { n: number; out: number[] }>;
  denseBars: number; denseSeed: number; denseRecord: string; densePlan: Array<{ bar: number; step: number; gesture: string; velocity: number }>; denseN: number; dense: number[];
  versionKeep: number; versions: Record<'RoutineDry' | 'RoutineDark' | 'RoutineDelay' | 'RoutinePhraseEnd', { n: number; out: number[] }>;
};

/** A pack record's WAV bytes from the public directory (the pool's record reader). */
async function packBytes(record: { file: string }): Promise<ArrayBuffer> {
  const b = readFileSync(join(process.cwd(), 'public', 'data', 'samples', 'packs', 'scratch-originals', record.file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}

/** Residual after the one least-squares gain (a whole-render normalisation the demo applies and DEViLBOX levels). */
function fittedResidualDb(ref: readonly number[], x: ArrayLike<number>, keep: number): number {
  let xy = 0, xx = 0;
  for (let i = 0; i < ref.length; i++) { const v = x[i * keep] ?? 0; xy += ref[i]! * v; xx += v * v; }
  const g = xx > 0 ? xy / xx : 0;
  let e = 0, r = 0;
  for (let i = 0; i < ref.length; i++) { const d = ref[i]! - g * (x[i * keep] ?? 0); e += d * d; r += ref[i]! * ref[i]!; }
  return 10 * Math.log10(e / r + 1e-300);
}

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

  it('three_deck\'s level (0.60 x the beat\'s RMS) and its duck on the beat\'s transients are the demo\'s', async () => {
    const { deckCDuck, deckCLevel } = await import('@/engine/dj/scratch/scratchDeckC');
    const { NumpyRandomState } = await import('@/engine/turntable/turntableSim');
    // the fixture's beat, drawn again: RandomState(5).uniform(-1, 1) x exp(-12 x beat phase) x 0.5 at 130 BPM
    const rng = new NumpyRandomState(5);
    const beat = new Float64Array(F.busN);
    for (let i = 0; i < F.busN; i++) { const t = i / F.rate; beat[i] = rng.uniform(-1, 1) * Math.exp(-((t * 130 / 60) % 1.0) * 12) * 0.5; }
    // the three_deck layer whole (the RMS needs every sample), from the same strokes on the same bus
    const { renderGesture, DEMO_DECK_PROFILES } = await import('@/engine/dj/scratch/scratchRender');
    const { createDeckCBus, DECK_C_TAPS } = await import('@/engine/dj/scratch/scratchDeckC');
    const ctx = new OfflineAudioContext(1, F.busN, F.rate);
    const bus = await createDeckCBus(ctx, ctx.destination, { chain: 'threeDeck', tap: DECK_C_TAPS.tail, planned: true });
    for (const e of F.events) {
      const src = await recordPcm(e.record);
      bus.stroke(e.start, renderGesture(src, e.gesture, e.steps * F.stepSec, F.rate, { velocity: e.velocity, profile: DEMO_DECK_PROFILES.boombap, seed: e.seed }).out);
    }
    await new Promise((r) => setTimeout(r, 20));
    const layer = (await ctx.startRendering()).getChannelData(0);
    expect(Math.abs(deckCLevel(layer, beat) / F.level - 1)).toBeLessThan(1e-6);
    expect(residualDb(F.duck, deckCDuck(beat), F.keep)).toBeLessThan(-130);
  }, 120_000);

  it('the overlay is render_scratch_section: the planner\'s strokes and routine through the pool onto the overlay bus (golden_era hook, routine auto)', async () => {
    const { planScratch } = await import('@/engine/dj/scratch/scratchPlanner');
    const { ScratchVoicePool, scratchPoolStats } = await import('@/engine/dj/scratch/scratchVoicePool');
    const { getGesture, REFERENCE_GESTURE_IDS } = await import('@/engine/dj/scratch/scratchGestureCatalog');
    const { scratchRenderStats, demoStepSamples } = await import('@/engine/dj/scratch/scratchRender');
    const { deckCStats } = await import('@/engine/dj/scratch/scratchDeckC');
    const ctx = { beatConfidence: 1, scratchPermission: 1, style: 'boomBap', meter: 4, sectionName: 'hook', vocalActivity: 0 } as unknown as import('@/engine/dj/scratch/scratchContext').ScratchPerformanceContext;
    const plan = planScratch(ctx, {
      mode: 'MUSICAL', seed: O.seed, fromBar: 0, bars: O.bars, sectionAt: () => ({ name: 'hook', startBar: 0, bars: O.bars }),
      profile: 'boomBap', routine: 'auto', records: true, vocalByBar: Array(O.bars).fill(0),
    });
    // the DJ brain's strokes are the demo's plan, on the section's record (pick_source)
    // (hook_call_response takes the closing two bars)
    const brain = plan.events.filter((e) => e.bar < O.bars - 2);
    expect(brain.map((e) => [e.bar, e.step, e.gesture, e.velocity])).toEqual(O.plan.map((p) => [p.bar, p.step, REFERENCE_GESTURE_IDS[p.gesture], p.velocity]));
    expect(new Set(brain.map((e) => e.record))).toEqual(new Set([O.record]));
    expect(plan.events.every((e) => e.render?.chain === 'overlay' && e.render.section?.key === '0:hook')).toBe(true);
    const off = new OfflineAudioContext(1, O.overlayN, O.rate);
    const pool = new ScratchVoicePool(off, off.destination, { bytes: packBytes });
    const step = demoStepSamples(O.bpm);
    const before = { rendered: scratchPoolStats.rendered, gestures: scratchRenderStats.gestures, strokes: deckCStats.strokes };
    for (const e of plan.events) {
      pool.perform(getGesture(e.gesture), { record: e.record, bpm: O.bpm, velocity: e.velocity, at: ((e.bar * 16 + e.step) * step + 0.25) / O.rate, render: e.render });
    }
    await pool.settled();
    await new Promise((r) => setTimeout(r, 20));
    // every stroke rendered by the demo's renderer and handed to the bus: the sentinels count each one
    expect(scratchPoolStats.rendered - before.rendered).toBe(plan.events.length);
    expect(scratchRenderStats.gestures - before.gestures).toBe(plan.events.length);
    expect(deckCStats.strokes - before.strokes).toBe(plan.events.length);
    const out = (await off.startRendering()).getChannelData(0);
    expect(residualDb(O.overlay, out, O.keep)).toBeLessThan(-120);
  }, 180_000);

  // P13: the demo's plan, all of it - two strokes on step 15 of a bar (plan_phrase clamps its 16) and strokes
  // inside sounding ones, summed - in MUSICAL under a strong vocal: no mode cap, vocal rule or one-hand rule thins it
  it('a dense overlay (golden_era showcase) nulls render_scratch_section with both step-15 strokes summed, MUSICAL under a vocal', async () => {
    const { planScratch } = await import('@/engine/dj/scratch/scratchPlanner');
    const { ScratchVoicePool, scratchPoolStats } = await import('@/engine/dj/scratch/scratchVoicePool');
    const { getGesture, REFERENCE_GESTURE_IDS } = await import('@/engine/dj/scratch/scratchGestureCatalog');
    const { demoStepSamples } = await import('@/engine/dj/scratch/scratchRender');
    const ctx = { beatConfidence: 1, scratchPermission: 1, style: 'boomBap', meter: 4, sectionName: 'showcase', vocalActivity: 0.95 } as unknown as import('@/engine/dj/scratch/scratchContext').ScratchPerformanceContext;
    const plan = planScratch(ctx, {
      mode: 'MUSICAL', seed: O.denseSeed, fromBar: 0, bars: O.denseBars, sectionAt: () => ({ name: 'showcase', startBar: 0, bars: O.denseBars }),
      profile: 'boomBap', records: true, vocalByBar: Array(O.denseBars).fill(0.95),
    });
    const demo = plan.events.filter((e) => e.layer === 'demo');
    const inTime = [...O.densePlan].sort((a, b) => (a.bar * 16 + a.step) - (b.bar * 16 + b.step));
    expect(demo.map((e) => [e.bar, e.step, e.gesture, e.velocity])).toEqual(inTime.map((p) => [p.bar, p.step, REFERENCE_GESTURE_IDS[p.gesture], p.velocity]));
    expect(demo.filter((e) => e.step === 15).length).toBeGreaterThan(O.denseBars);
    expect(new Set(demo.map((e) => e.record))).toEqual(new Set([O.denseRecord]));
    const off = new OfflineAudioContext(1, O.denseN, O.rate);
    const pool = new ScratchVoicePool(off, off.destination, { bytes: packBytes });
    const step = demoStepSamples(O.bpm);
    const before = scratchPoolStats.rendered;
    for (const e of demo) pool.perform(getGesture(e.gesture), { record: e.record, bpm: O.bpm, velocity: e.velocity, at: ((e.bar * 16 + e.step) * step + 0.25) / O.rate, render: e.render });
    await pool.settled();
    await new Promise((r) => setTimeout(r, 20));
    expect(scratchPoolStats.rendered - before).toBe(O.densePlan.length);
    const out = (await off.startRendering()).getChannelData(0);
    expect(residualDb(O.dense, out, O.keep)).toBeLessThan(-120);
  }, 180_000);

  it('a phrase_end routine alone is render_routine(channel=False): its strokes, seeds and the ending\'s tape-delay tail', async () => {
    const out = await routineDry();
    expect(residualDb(O.routine, out, O.keep)).toBeLessThan(-200);
  }, 120_000);

  it('each of the nine profiles\' deck physics (P7) renders render_gesture to rounding', async () => {
    const { renderGesture, DEMO_PROFILES, DEMO_DECK_PROFILES } = await import('@/engine/dj/scratch/scratchRender');
    const src = await recordPcm('ALRIGHT_STOP');
    expect(Object.keys(O.profiles).sort()).toEqual(Object.keys(DEMO_PROFILES).sort());
    for (const [name, ref] of Object.entries(O.profiles)) {
      const out = renderGesture(src, 'baby', 2 * 3595 / O.rate, O.rate, { velocity: 0.8, profile: DEMO_DECK_PROFILES[DEMO_PROFILES[name as keyof typeof DEMO_PROFILES].deck], seed: 9 }).out;
      expect(out.length, name).toBe(ref.n);
      expect(residualDb(ref.out, out, O.keep), name).toBeLessThan(-200);
    }
  }, 120_000);

  it.each([['dry', 'RoutineDry'], ['dark', 'RoutineDark'], ['delay', 'RoutineDelay'], ['phraseEnd', 'RoutinePhraseEnd']] as const)('the %s preset plays render_versions\' %s chain (C3, after its one normalisation gain)', async (preset, version) => {
    const { createDeckCBus, PRESET_CHAIN } = await import('@/engine/dj/scratch/scratchDeckC');
    const { DEMO_RATE } = await import('@/engine/dj/scratch/scratchRender');
    const ref = O.versions[version];
    const ctx = new OfflineAudioContext(1, ref.n, DEMO_RATE);
    const bus = await createDeckCBus(ctx, ctx.destination, { chain: PRESET_CHAIN[preset] });
    // the dry routine (the fixture's render_routine(channel=False), every sample) summed from bus sample 0
    const dry = await routineDry();
    bus.stroke(0, dry);
    await new Promise((r) => setTimeout(r, 20));
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(fittedResidualDb(ref.out, out, O.versionKeep)).toBeLessThan(-120);
  }, 120_000);
});

/** A live-like app pool on an offline context at the bus rate: the registry's strokes land on its buses. */
async function appPool(seconds: number) {
  const ctx = new OfflineAudioContext(1, Math.round(seconds * 22050), 22050);
  holder.ctx = ctx;
  const samplerInput = ctx.createGain();
  samplerInput.connect(ctx.destination);
  holder.samplerInput = samplerInput;
  const { resetScratchVoicePool, getScratchVoicePool } = await import('@/engine/dj/scratch/scratchVoicePool');
  resetScratchVoicePool();
  return { ctx, pool: getScratchVoicePool() };
}

/** The same stroke posted straight onto a fresh bus of `chain` (the reference the entry point must equal). */
async function referenceBus(seconds: number, chain: import('@/engine/dj/scratch/scratchDeckC').DeckCChainName, start: number, stroke: Float64Array): Promise<Float32Array> {
  const { createDeckCBus } = await import('@/engine/dj/scratch/scratchDeckC');
  const ctx = new OfflineAudioContext(1, Math.round(seconds * 22050), 22050);
  const bus = await createDeckCBus(ctx, ctx.destination, { chain });
  bus.stroke(start, stroke);
  await new Promise((r) => setTimeout(r, 20));
  return (await ctx.startRendering()).getChannelData(0);
}

function sameDb(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let e = 0, r = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i]! - b[i]!; e += d * d; r += a[i]! * a[i]!; }
  return 10 * Math.log10(e / (r + 1e-300) + 1e-300);
}

describe('every entry point plays the demo\'s render on a Deck C bus (PG-J: one stroke renderer, no voice path)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });
  const AT = 0.1;
  const START = Math.trunc(AT * 22050);

  it.each([
    ['a pad', 'pad', 'chirp', 'BOY', 0.8, undefined, 'threeDeck'],
    ['MCP', 'mcp', 'tearForward', 'A_YEAH', undefined, undefined, 'threeDeck'],
    ['a transition (its Delay preset)', 'autodj', 'baby', 'AH_YEAH', 0.6, 'delay', 'routineDelay'],
    ['a transition (its Dark preset)', 'autodj', 'chirp', 'AH_YEAH', 0.6, 'dark', 'routineDark'],
  ] as const)('%s: render_gesture on the record, summed on its chain - sentinels 1, the bus = the demo stroke on that chain', async (_name, source, gesture, record, amount, preset, chain) => {
    const { fireDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { scratchRenderStats, renderGesture, demoGestureName, demoGestureSteps, DEMO_DECK_PROFILES } = await import('@/engine/dj/scratch/scratchRender');
    const { deckCStats } = await import('@/engine/dj/scratch/scratchDeckC');
    const { scratchPoolStats } = await import('@/engine/dj/scratch/scratchVoicePool');
    const { ctx, pool } = await appPool(1.2);
    const before = { g: scratchRenderStats.gestures, s: deckCStats.strokes, r: scratchPoolStats.rendered };
    expect(fireDjFx(`fx_scratch_${gesture}`, { source, record, amount, bpm: 92, at: AT, ...(preset ? { scratchFx: { preset } } : {}) })).toBe(true);
    await pool.settled();
    expect(scratchPoolStats.rendered - before.r).toBe(1);
    expect(scratchRenderStats.gestures - before.g).toBe(1);
    expect(deckCStats.strokes - before.s).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    const out = (await ctx.startRendering()).getChannelData(0);
    // the demo's stroke (three_deck's step, the boom-bap deck, velocity 1.0 when none is given)
    const name = demoGestureName(gesture)!;
    const rec = (await import('@/engine/dj/scratch/scratchCatalogue')).getScratchRecord(record)!;
    const src = await recordPcm(record);
    const stepSec = chain === 'threeDeck' ? 60 / (92 * 4) : Math.trunc(22050 * 60 / (92 * 4)) / 22050;
    const stroke = renderGesture(src, name, demoGestureSteps(name) * stepSec, 22050, { velocity: amount ?? 1.0, profile: DEMO_DECK_PROFILES.boombap, seed: 0 }).out;
    expect(rec.demoCue.anchor).toBe(src.anchor);
    const ref = await referenceBus(1.2, chain, START, stroke);
    expect(sameDb(ref, out)).toBeLessThan(-200);
  }, 120_000);

  // G11: the MCP fires the demo's macro language through the registry: render_macro on the record (proven = the
  // demo's in scratchMacroIsTheDemos), one stroke on the one-off Deck C bus
  it('a scratch macro (MCP): render_macro on the record, one stroke on Deck C - sentinels 1, the bus = the macro on its chain', async () => {
    const { fireDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { scratchMacroStats, renderMacro } = await import('@/engine/dj/scratch/scratchRender');
    const { scratchPoolStats } = await import('@/engine/dj/scratch/scratchVoicePool');
    const { ctx, pool } = await appPool(1.2);
    const macro = 'ANCHOR 440\nMOVE_FWD 1 2\nMOVE_REV 1 2\nCUT 4 2';
    const before = { m: scratchMacroStats.rendered, r: scratchPoolStats.rendered };
    expect(fireDjFx('fx_scratch_macro', { source: 'mcp', record: 'AH_YEAH', macro, bpm: 92, at: AT })).toBe(true);
    await pool.settled();
    expect(scratchMacroStats.rendered - before.m).toBe(1);
    expect(scratchPoolStats.rendered - before.r).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    const out = (await ctx.startRendering()).getChannelData(0);
    const src = await recordPcm('AH_YEAH');
    const ref = await referenceBus(1.2, 'threeDeck', START, renderMacro(src, macro, 22050, { tempo: 92 }));
    expect(sameDb(ref, out)).toBeLessThan(-200);
  }, 120_000);

  it('a DEViLBOX gesture the demo lacks (twiddle) renders on the same renderer from its catalogue definition', async () => {
    const { fireDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { scratchRenderStats, renderGesture, catalogueDemoGesture, DEMO_DECK_PROFILES } = await import('@/engine/dj/scratch/scratchRender');
    const { getGesture } = await import('@/engine/dj/scratch/scratchGestureCatalog');
    const { ctx, pool } = await appPool(1.2);
    const before = scratchRenderStats.gestures;
    expect(fireDjFx('fx_scratch_twiddle', { source: 'mcp', record: 'BOY', bpm: 92, at: AT })).toBe(true);
    await pool.settled();
    expect(scratchRenderStats.gestures - before).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    const out = (await ctx.startRendering()).getChannelData(0);
    const g = getGesture('twiddle');
    const stroke = renderGesture(await recordPcm('BOY'), catalogueDemoGesture(g), g.durationSteps * 60 / (92 * 4), 22050, { velocity: 1.0, profile: DEMO_DECK_PROFILES.boombap, seed: 0 }).out;
    expect(sameDb(await referenceBus(1.2, 'threeDeck', START, stroke), out)).toBeLessThan(-200);
  }, 120_000);

  it('a tracker deck\'s sample is read at 22,050 Hz without the grit and its stroke is the same render', async () => {
    const { fireDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { loadTrackerSample, trackerSampleRecordId } = await import('@/engine/dj/scratch/trackerSampleSource');
    const { demoRecordPcm } = await import('@/engine/dj/scratch/scratchGrit');
    const { getScratchRecord } = await import('@/engine/dj/scratch/scratchCatalogue');
    const { scratchRenderStats, renderGesture, DEMO_DECK_PROFILES } = await import('@/engine/dj/scratch/scratchRender');
    const { ctx, pool } = await appPool(1.2);
    const bytes = await packBytes(getScratchRecord('ONE')!);
    const rec = (await loadTrackerSample(pool, ctx, 'A', { id: 3, name: 'vox one', sample: { audioBuffer: bytes } }))!;
    expect(rec.id).toBe(trackerSampleRecordId('A', '3'));
    const before = scratchRenderStats.gestures;
    expect(fireDjFx('fx_scratch_forwardStab', { source: 'pad', record: rec.id, bpm: 92, at: AT })).toBe(true);
    await pool.settled();
    expect(scratchRenderStats.gestures - before).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    const out = (await ctx.startRendering()).getChannelData(0);
    const sig = demoRecordPcm(bytes, 22050, { grit: false });
    const stroke = renderGesture({ sig, anchor: rec.demoCue.anchor, safe: rec.demoCue.safe }, 'forward_stab', 60 / (92 * 4), 22050, { velocity: 1.0, profile: DEMO_DECK_PROFILES.boombap, seed: 0 }).out;
    expect(sameDb(await referenceBus(1.2, 'threeDeck', START, stroke), out)).toBeLessThan(-200);
  }, 120_000);

  it('Scratch Loop lays the record\'s safe region end to end on Deck C until released, then stops', async () => {
    const { fireDjFx, releaseDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { deckCStats } = await import('@/engine/dj/scratch/scratchDeckC');
    const { scratchPoolStats } = await import('@/engine/dj/scratch/scratchVoicePool');
    const { pool } = await appPool(1.2);
    const before = { s: deckCStats.strokes, l: scratchPoolStats.loops };
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      expect(fireDjFx('fx_scratch_loop', { source: 'pad', record: 'AH_LONG', at: 0 })).toBe(true);
      await pool.settled();
      expect(scratchPoolStats.loops - before.l).toBe(1);
      const laid = deckCStats.strokes - before.s;
      expect(laid).toBeGreaterThanOrEqual(1);
      releaseDjFx('fx_scratch_loop', { source: 'pad' });
      vi.advanceTimersByTime(1000);
      expect(deckCStats.strokes - before.s).toBe(laid);
    } finally { vi.useRealTimers(); }
  }, 60_000);
});

/** The phrase_end routine's dry render through DEViLBOX (the routine null above), every sample. */
async function routineDry(): Promise<Float64Array> {
  const { SCRATCH_ROUTINES } = await import('@/engine/dj/scratch/scratchRoutines');
  const { overlayRender } = await import('@/engine/dj/scratch/scratchPlanner');
  const { ScratchVoicePool } = await import('@/engine/dj/scratch/scratchVoicePool');
  const { getGesture } = await import('@/engine/dj/scratch/scratchGestureCatalog');
  const { getScratchRecord } = await import('@/engine/dj/scratch/scratchCatalogue');
  const { demoStepSamples } = await import('@/engine/dj/scratch/scratchRender');
  const ctx = new OfflineAudioContext(1, 128, O.rate);
  const pool = new ScratchVoicePool(ctx, ctx.destination, { bytes: packBytes });
  const r = overlayRender({ key: 'routine', bars: 1, seed: O.routineSeed, profile: 'boombap', demoSteps: () => [] });
  const rec = getScratchRecord(O.routineRecord)!;
  const step = demoStepSamples(O.bpm);
  const out = new Float64Array(O.routineN);
  for (const ev of SCRATCH_ROUTINES.phraseEnd.events) {
    const { section: _section, ...spec } = r.routine(ev.bar, ev.step, 0, ev.tail);
    const g = (await pool.renderStroke(getGesture(ev.gesture), rec, spec, O.bpm, ev.velocity))!;
    const o = ev.bar * 16 * step + ev.step * step;
    for (let i = 0; i < g.length && o + i < out.length; i++) out[o + i] = out[o + i]! + g[i]!;
  }
  return out;
}