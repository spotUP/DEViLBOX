/**
 * Port phase PG-D reachability (scratch ledger SCR-PG-DR; gap rows V1-V3, R7, C3; owner decisions
 * O2, O4): two planned forward stabs on the record ONE, velocity 0.3 and 0.95, through the real
 * ScratchExecutor -> the DJ FX registry -> the voice pool -> the record voice and its bus, rendered
 * offline. Numbers from the reference `render_gesture` / `VEL` (scratch.py :205-216, :303-307):
 * - tone: the soft stab is low-passed at 2500 + 6000 x 0.3 = 4300 Hz, the hard one gets 0.15 of a
 *   3 kHz high pass (the stage's sound on sines: scratchWetBusMatchesTheReference; a centroid over
 *   this voice barely moves - measured 1041 vs 1168 Hz - its power sits below the stages);
 * - level: 0.70 + 0.50 v: (0.7 + 0.15) / (0.7 + 0.475), within 0.5 dB;
 * - the record is the S950 grit (O4): one transform for the one record load;
 * - a dubbed transition request is the channel's Delay preset (C3): room 0.18, delay 0.28.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR = 48000;
const holder = vi.hoisted(() => ({ ctx: null as unknown, samplerInput: null as unknown }));

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
  const deck = { id: 'A', setScratchVelocity() {}, playPattern() {}, stopPattern() {}, finishPatternCycle() {}, getEffectiveBPM: () => 120 };
  return {
    getDJEngine: () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } }),
    getDJEngineIfActive: () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } }),
  };
});

describe('velocity shapes the stroke: level and tone; the record is the S950 grit (SCR-PG-DR)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('two planned stabs, v 0.3 and 0.95: tone and level by the reference; one grit transform; Delay preset for a dubbed request', async () => {
    const ctx = new OfflineAudioContext(1, Math.round(SR * 1.0), SR);
    holder.ctx = ctx;
    const samplerInput = ctx.createGain();
    samplerInput.connect(ctx.destination);
    holder.samplerInput = samplerInput;
    const { fireDjFx, releaseDjFx } = await import('@/engine/drumpad/DjFxActions');
    const { getScratchVoicePool, resetScratchVoicePool } = await import('../scratch/scratchVoicePool');
    const { ScratchExecutor } = await import('../scratch/ScratchExecutor');
    const { scratchGritStats } = await import('../scratch/scratchGrit');
    const { getScratchRecord } = await import('../scratch/scratchCatalogue');
    const { CHANNEL_PRESETS } = await import('../scratch/scratchBus');
    resetScratchVoicePool();
    const pool = getScratchVoicePool();
    await pool.ready;
    const levels: number[] = [];
    const tones: Array<{ lpHz: number; edge: number }> = [];
    for (const bus of pool.buses) {
      const set = bus.setVelocity.bind(bus);
      bus.setVelocity = (v, at, kind) => { set(v, at, kind); levels.push(bus.velocityLevel); tones.push(bus.velocityTone); };
    }
    const intervals: Array<() => void> = [];
    const exec = new ScratchExecutor({
      clock: { beatNow: () => ctx.currentTime / 0.5, beatSec: () => 0.5 },
      contextTime: () => ctx.currentTime,
      fire: (id, o) => fireDjFx(id, o),
      release: (id, o) => releaseDjFx(id, o),
      probe: { capture: () => ({ rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false, crossfader: 0.5, busLevel: 1 }), restore: () => {} },
      recueDeck: () => ({ recued: true, mode: 'audio', returnsToAnchor: true }),
      timers: { now: () => ctx.currentTime * 1000, setInterval: (fn) => { intervals.push(fn); return fn; }, clearInterval: (h) => { const i = intervals.indexOf(h as () => void); if (i >= 0) intervals.splice(i, 1); }, setTimeout: () => null, clearTimeout: () => undefined },
      tickMs: 5, lookaheadSec: 0.1,
    });
    const one = getScratchRecord('ONE')!;
    const source = { type: 'CRATE' as const, recordId: 'ONE', anchor: one.anchor };
    const stab = (beat: number, velocity: number, preset?: 'delay') => ({
      executeAtBeat: beat, durationBeats: 0.25, role: 'ACCENT' as const, source, anchor: one.anchor, gesture: 'forwardStab' as const,
      velocity, humanizeMs: 0, intensity: 0.3, returnToAnchor: true, fx: preset ? { amount: 0, preset } : { style: 'boomBap' as const, amount: 0 },
    });
    const gritBefore = scratchGritStats.transforms;
    exec.schedule(stab(0.2, 0.3));               // 0.1 s
    exec.schedule(stab(1.2, 0.95, 'delay'));     // 0.6 s
    for (const fn of [...intervals]) fn();
    await pool.settled();
    void ctx.suspend(0.5).then(async () => { for (const fn of [...intervals]) fn(); await pool.settled(); void ctx.resume(); });
    const out = (await ctx.startRendering()).getChannelData(0);
    exec.cancel();

    expect(scratchGritStats.transforms - gritBefore, 'one S950 transform for the one record').toBe(1);
    expect(levels).toHaveLength(2);
    expect(20 * Math.log10(levels[0]! / levels[1]!)).toBeCloseTo(20 * Math.log10((0.7 + 0.15) / (0.7 + 0.475)), 0);
    expect(Math.abs(20 * Math.log10(levels[0]! / levels[1]!) - 20 * Math.log10((0.7 + 0.15) / (0.7 + 0.475)))).toBeLessThan(0.5);
    // the tone the stage got from each planned velocity (the stage's sound is measured in
    // scratchWetBusMatchesTheReference); and the soft stab is heard
    expect(tones[0]).toEqual({ lpHz: 2500 + 6000 * 0.3, edge: 0 });
    expect(tones[1]).toEqual({ lpHz: 20000, edge: 0.15 });
    let q = 0; for (let i = Math.round(0.1 * SR); i < Math.round(0.15 * SR); i++) q += out[i]! * out[i]!;
    expect(Math.sqrt(q / (0.05 * SR))).toBeGreaterThan(1e-3);
    // the dubbed request's Delay preset on the second stab's bus
    const busOfHard = pool.buses[pool.voices.findIndex((v) => v.record?.id === 'ONE')]!;
    expect(busOfHard.delay.mix).toBeCloseTo(CHANNEL_PRESETS.delay.delayMix, 3);
  }, 120_000);
});
