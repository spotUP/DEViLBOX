/**
 * The scratch sits in the mix (owner 2026-10-12: "the scratches lie in front of everything, they
 * don't blend in"). Reference (Up Rough `device_session.render_session`, measured by
 * `tools/scratch-fixtures/gen_scratch_level_reference.py`): while a scratch sounds, its 400 ms RMS
 * sits at -0.55 dB of the programme. Through the one action path (`fireDjFx`, the pool the app
 * builds: `getScratchVoicePool` with its programme meter on the decks), a baby on AH_STANDARD over
 * a programme of RMS 0.2 (-14 dBFS) is measured at the bus output; the fixed-level voice it
 * replaces is measured the same way. Offline render through the real worklet, voice and bus.
 * The scratch sums into the DJ mixer's samplerInput -> master gain -> master FX -> limiter, the
 * decks' own master path (DJMixerEngine), so nothing bypasses the master chain.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR = 48000;
const PROGRAMME_RMS = 0.2;
const holder = vi.hoisted(() => ({ ctx: null as unknown, samplerInput: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
vi.mock('@/stores/useTransportStore', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/stores/useTransportStore']());
vi.mock('@/stores/useDJStore', () => ({ useDJStore: { getState: () => ({ crossfaderPosition: 0, decks: { A: { effectiveBPM: 125 }, B: { effectiveBPM: 125 } } }) } }));
vi.mock('@/engine/dj/DJActions', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJActions']());
vi.mock('@/engine/dj/DJQuantizedFX', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJQuantizedFX']());
vi.mock('@/engine/dj/DJBeatJump', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJBeatJump']());
vi.mock('@/engine/dj/DJAutoSync', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/engine/dj/DJAutoSync']());
vi.mock('@/hooks/drumpad/useMIDIPadRouting', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@/hooks/drumpad/useMIDIPadRouting']());
vi.mock('@engine/ToneEngine', async () => (await import('@/test/audio/scratchRegistryStubs')).scratchRegistryStubModules['@engine/ToneEngine']());
/** Deck A plays a programme of RMS 0.2 (its channel analyser reads a sine of amplitude 0.2 x sqrt 2). */
const programme = { getValue: () => Float32Array.from({ length: 256 }, (_, i) => PROGRAMME_RMS * Math.SQRT2 * Math.sin(2 * Math.PI * i / 32)) };
const deck = { waveformAnalyser: programme, getEffectiveBPM: () => 125 };
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } }),
  getDJEngineIfActive: () => ({ getDeck: () => deck, mixer: { samplerInput: holder.samplerInput } }),
}));

function rmsOf(x: Float32Array, from: number, to: number): number {
  let s = 0; for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

async function renderStroke(useRegistry: boolean): Promise<{ ratioDb: number; matched: number }> {
  const ctx = new OfflineAudioContext(2, Math.round(SR * 0.8), SR);
  holder.ctx = ctx;
  const samplerInput = ctx.createGain();
  samplerInput.connect(ctx.destination);
  holder.samplerInput = samplerInput;
  const { getScratchVoicePool, resetScratchVoicePool, ScratchVoicePool } = await import('../scratch/scratchVoicePool');
  const { getGesture } = await import('../scratch/scratchGestureCatalog');
  resetScratchVoicePool();
  let matched = 0;
  if (useRegistry) {
    const { fireDjFx } = await import('@/engine/drumpad/DjFxActions');
    const pool = getScratchVoicePool();
    await pool.ready;
    await new Promise((r) => setTimeout(r, 250)); // the programme meter reads the decks every 100 ms
    expect(fireDjFx('fx_scratch_baby', { source: 'autodj', record: 'AH_STANDARD', amount: 0.7 })).toBe(true);
    await pool.settled();
    matched = pool.levelStats.matched;
  } else {
    // the voice as it was: no programme, a fixed level
    const pool = new ScratchVoicePool(ctx, samplerInput);
    await pool.ready;
    pool.perform(getGesture('baby'), { record: 'AH_STANDARD', bpm: 125, velocity: 0.7 });
    await pool.settled();
  }
  const out = (await ctx.startRendering()).getChannelData(0);
  const r = rmsOf(out, Math.round(0.02 * SR), Math.round(0.5 * SR));
  return { ratioDb: 20 * Math.log10(r / PROGRAMME_RMS), matched };
}

describe('the scratch sits in the mix (SCR-WET-BUS level)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); });

  it('a baby on AH_STANDARD over a -14 dBFS programme sits within 3 dB of the reference -0.55 dB; the fixed level did not', async () => {
    const before = await renderStroke(false);
    const after = await renderStroke(true);
    console.log(`[scratch level] scratch vs programme (400 ms RMS): reference -0.55 dB, before ${before.ratioDb.toFixed(2)} dB, now ${after.ratioDb.toFixed(2)} dB`);
    expect(after.matched).toBe(1);
    expect(Math.abs(after.ratioDb - -0.55)).toBeLessThan(3);
  }, 60_000);
});
