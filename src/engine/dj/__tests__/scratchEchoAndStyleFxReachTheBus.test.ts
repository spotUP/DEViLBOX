/**
 * Port phase PG-A reachability (scratch ledger SCR-PG-AR; gap rows R2, F1, G3, X2, X3): through the
 * one action path, rendered offline through the real ring worklet, voices, buses and pool.
 * - `fireDjFx('fx_scratch_echo', {record: 'ONE', source: 'mcp'})`: the reference echo scratch (a
 *   stab whose tail feeds the echo) sets its voice's bus delay to mix 0.35 and 0.16 s while it
 *   plays (scratch.py :175-176), and the render carries the stab again 0.16 s later, above the gap
 *   before it.
 * - `fireDjFx('fx_scratch_baby', {record: 'AH_LONG', ...})`: record 51 loads into the worklet.
 * - the cuts are shaped by the reference fader curve: `faderCurve` sentinel >= 2 (one per cut gesture).
 * - an Auto DJ event's style FX (`scratchFx`: electro at amount 0.5) sets the ELECTRO preset on the
 *   bus and lifts the tail to 0.16 + 0.19 x 0.5 (amount = the wet floor).
 * ONE (a COUNT record) takes forward_stab, so its stab variants cut and echo (SCR-PG-A4).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR = 48000;
const holder = vi.hoisted(() => ({ ctx: null as unknown, samplerInput: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
// The app graph a record gesture never touches is stubbed (SA-M7): see scratchRegistryStubs.ts.
vi.mock('@/stores/useTransportStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useTransportStore']());
vi.mock('@/stores/useDJStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useDJStore']());
vi.mock('@/engine/dj/DJActions', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJActions']());
vi.mock('@/engine/dj/DJQuantizedFX', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJQuantizedFX']());
vi.mock('@/engine/dj/DJBeatJump', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJBeatJump']());
vi.mock('@/engine/dj/DJAutoSync', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJAutoSync']());
vi.mock('@/hooks/drumpad/useMIDIPadRouting', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/hooks/drumpad/useMIDIPadRouting']());
vi.mock('@engine/ToneEngine', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@engine/ToneEngine']());
vi.mock('@/engine/dj/DJEngine', () => {
  const deck = { id: 'A', setScratchVelocity() {}, playPattern() {}, stopPattern() {}, finishPatternCycle() {}, getEffectiveBPM: () => 125 };
  return {
    getDJEngine: () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } }),
    getDJEngineIfActive: () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } }),
  };
});

async function setup(seconds: number) {
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  holder.ctx = ctx;
  const samplerInput = ctx.createGain();
  samplerInput.connect(ctx.destination);
  holder.samplerInput = samplerInput;
  const registry = await import('@/engine/drumpad/DjFxActions');
  const pool = await import('../scratch/scratchVoicePool');
  pool.resetScratchVoicePool();
  registry.clearDjFxFireLog();
  return { ctx, ...registry, ...pool };
}

/** RMS of the render over [a, b) seconds. */
function rms(x: Float32Array, a: number, b: number): number {
  let s = 0; const from = Math.round(a * SR), to = Math.round(b * SR);
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

describe('PG-A: the echo scratch, AH_LONG, the fader curve and the style FX reach the bus (SCR-PG-AR)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  async function stab(id: 'fx_scratch_echo') {
    const { ctx, fireDjFx, getScratchVoicePool } = await setup(0.8);
    const { scratchFaderModelStats } = await import('../scratch/scratchFaderModel');
    const curves = scratchFaderModelStats.faderCurveCalls;
    expect(fireDjFx(id, { source: 'mcp', record: 'ONE', at: 0.05 })).toBe(true);
    await getScratchVoicePool().settled();
    const voice = getScratchVoicePool().voices.find((v) => v.record?.id === 'ONE')!;
    const delay = getScratchVoicePool().buses[voice.index]!.delay;
    const out = (await ctx.startRendering()).getChannelData(0);
    return { out, delay, curves: scratchFaderModelStats.faderCurveCalls - curves };
  }

  it('fx_scratch_echo on ONE: bus delay 0.35 at 0.16 s while it plays, and the echo is heard after the window closes', async () => {
    const { getGesture } = await import('../scratch/scratchGestureCatalog');
    const { cycleMs } = await import('../scratch/scratchFaderModel');
    const echo = await stab('fx_scratch_echo');
    expect(echo.delay.mix).toBeCloseTo(0.35, 2);
    expect(Math.abs(echo.delay.sec - 0.16)).toBeLessThanOrEqual(0.005);
    expect(echo.curves).toBe(1);
    // the echo gesture's window opens at 0.05 s and closes at 0.4 of its cycle (2 steps at 125 BPM): the
    // stab's echo arrives 0.16 s later, after a gap where only the room rings
    const close = 0.05 + 0.4 * cycleMs(getGesture('echo'), 125) / 1000;
    const gap = rms(echo.out, close + 0.015, close + 0.06);
    const repeat = rms(echo.out, close + 0.075, close + 0.15);
    expect(repeat, 'the echo').toBeGreaterThan(1e-4);
    expect(20 * Math.log10(repeat / Math.max(1e-9, gap)), 'the echo over the gap before it').toBeGreaterThan(3);
  }, 60_000);

  it('AH_LONG (record 51) loads into the worklet; two cut gestures, two fader curves; the style FX lifts the tail', async () => {
    const { ctx, fireDjFx, getScratchVoicePool, scratchPoolStats } = await setup(0.6);
    const { scratchFaderModelStats } = await import('../scratch/scratchFaderModel');
    const { scratchRingStats } = await import('../DeckScratchBuffer');
    const { SCRATCH_BUS, SCRATCH_FX_PROFILES } = await import('../scratch/scratchBus');
    const curves = scratchFaderModelStats.faderCurveCalls;
    const loads = scratchRingStats.loads;
    const styled = scratchPoolStats.styleFx;
    expect(fireDjFx('fx_scratch_baby', { source: 'mcp', record: 'AH_LONG', role: 'THEME', at: 0.05 })).toBe(true);
    expect(fireDjFx('fx_scratch_echo', { source: 'autodj', record: 'ONE', role: 'ANSWER', at: 0.1, scratchFx: { style: 'electro', amount: 0.5 } })).toBe(true);
    await getScratchVoicePool().settled();
    const pool = getScratchVoicePool();
    expect(pool.voices.map((v) => v.record?.id)).toEqual(['AH_LONG', 'ONE']);
    expect(scratchRingStats.loads - loads).toBe(2);
    expect(scratchFaderModelStats.faderCurveCalls - curves).toBeGreaterThanOrEqual(2);
    expect(scratchPoolStats.styleFx - styled).toBe(1);
    // AH_LONG's bus: the channel's own tail (ordinary ambience); ONE's: the echo's own fx while it plays
    expect(pool.buses[0]!.delay.mix).toBeCloseTo(SCRATCH_BUS.delayMix, 3);
    expect(pool.buses[1]!.delay.mix).toBeCloseTo(0.35, 3);
    // the echo over: the electro tail floor (0.16 + 0.19 x 0.5) at the electro preset's 0.14 s
    pool.buses[1]!.setGestureFx(null);
    expect(pool.buses[1]!.delay.mix).toBeCloseTo(SCRATCH_BUS.delayMix + (SCRATCH_BUS.tailDelayMix - SCRATCH_BUS.delayMix) * 0.5, 3);
    expect(pool.buses[1]!.delay.sec).toBeCloseTo(SCRATCH_FX_PROFILES.ELECTRO.delaySec, 6);
    await ctx.startRendering();
  }, 60_000);
});
