/**
 * Shared offline renders for the master-preset parity tests: the real tracker
 * rebuildMasterEffects and the real DJMixerEngine, one input signal.
 *
 * Deterministic: a Tone reverb builds its impulse response from a cached noise
 * buffer read at a Math.random() start offset, so two renders of the same chain
 * differed by 0.4-3 dB. Every render reseeds Math.random, and the noise buffers
 * are filled under the same seed, so tracker and DJ render with the identical IR.
 */
import { MASTER_FX_PRESETS } from '@/constants/fxPresets';

export const FX_PRESETS = MASTER_FX_PRESETS;

/** mulberry32 */
export function seedRandom(seed: number): void {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Impulse responses still being rendered (Reverb.generate is async and the chains do not await it). */
const pendingIr: Promise<unknown>[] = [];
let irTracked = false;
async function trackReverbIr(): Promise<void> {
  if (irTracked) return;
  irTracked = true;
  const Tone = await import('tone');
  const generate = Tone.Reverb.prototype.generate;
  Tone.Reverb.prototype.generate = function (this: InstanceType<typeof Tone.Reverb>) {
    const result = generate.call(this);
    pendingIr.push(result);
    return result;
  };
}

/** Wait until every reverb built so far has its impulse response; a render started earlier plays a dry reverb. */
export async function settleReverbs(): Promise<void> {
  while (pendingIr.length) await Promise.all(pendingIr.splice(0));
}

/** Settle everything that is evaluated once per process, then fill Tone's module-level noise buffer cache under a fixed seed. */
export async function warmNoiseBuffers(): Promise<void> {
  const Tone = await import('tone');
  // First-time module evaluation may draw from Math.random: do it before any seeded render.
  await Promise.all([import('../MasterEffectsChain'), import('@/engine/dj/DJMixerEngine'), import('@/engine/dj/djLimiter'), import('@/stores/useAudioStore'), trackReverbIr()]);
  seedRandom(1);
  for (const type of ['white', 'pink', 'brown'] as const) new Tone.Noise(type).dispose();
  // The first chain built in a process lazy-loads its effect factories and renders its reverb impulse
  // response differently (measured: the first render of any chain sits 1.6 dB below every later one).
  // Build one throwaway chain with a reverb so every measured render starts from the settled state.
  const reverbPreset = FX_PRESETS.find((p) => p.effects.some((e) => e.category === 'tonejs' && e.type === 'Reverb'));
  if (reverbPreset) await renderTracker(reverbPreset);
}

export const SR = 48000;
export const SECONDS = 3;

/** Kick, bass and hats at a mix level well under the DJ limiter. */
export function loop(n: number): Float32Array<ArrayBuffer> {
  const x = new Float32Array(n);
  const beat = SR / 2;
  for (let i = 0; i < n; i++) {
    const t = (i % beat) / SR;
    const f = 50 + 80 * Math.exp(-t * 40);
    x[i] = 0.25 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 18)
      + 0.08 * Math.sin(2 * Math.PI * 55 * i / SR)
      + 0.03 * Math.sin(2 * Math.PI * 3000 * i / SR) * Math.exp(-t * 60);
  }
  return x;
}

export function rmsDb(x: Float32Array, from: number): number {
  let s = 0; for (let i = from; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (x.length - from) + 1e-20);
}

/** Level of the band below `hz` (two-pole low-pass, twice), dB. */
export function lowBandDb(x: Float32Array, hz: number, from: number): number {
  let y = x;
  for (let pass = 0; pass < 2; pass++) {
    const w = 2 * Math.PI * hz / SR, c = Math.cos(w), a = Math.sin(w) / (2 * Math.SQRT1_2);
    const b0 = (1 - c) / 2, b1 = 1 - c, b2 = (1 - c) / 2, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
    const o = new Float32Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = (b0 * y[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v;
    }
    y = o;
  }
  return rmsDb(y, from);
}

export type Preset = (typeof FX_PRESETS)[number];
export const tonePart = (preset: Preset) => preset.effects
  .filter((e) => e.category === 'tonejs')
  .map((e, i) => ({ ...e, id: `fx${i}`, enabled: true }));

export async function freshContext(preset: Preset) {
  seedRandom(2);
  await trackReverbIr();
  const Tone = await import('tone');
  const ctx = new OfflineAudioContext(2, SR * SECONDS, SR);
  Tone.setContext(ctx as never);
  const { useAudioStore } = await import('@/stores/useAudioStore');
  useAudioStore.setState({ presetGainCompensationDb: preset.gainCompensationDb ?? 0 });
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, SR * SECONDS, SR);
  buf.copyToChannel(loop(SR * SECONDS), 0);
  src.buffer = buf;
  return { Tone, ctx, src };
}

/** The preset on the tracker's master chain: masterEffectsInput → chain → blepInput. */
export async function renderTracker(preset: Preset): Promise<Float32Array> {
  const { Tone, ctx, src } = await freshContext(preset);
  const { rebuildMasterEffects } = await import('../MasterEffectsChain');
  const masterIn = new Tone.Gain(1);
  const blep = new Tone.Gain(1);
  // The tracker's output limiter is the DJ path's spec (djLimiter).
  const { createToneSafetyLimiter } = await import('@/engine/dj/djLimiter');
  const { compressor, makeupCancel } = createToneSafetyLimiter();
  Tone.connect(blep as never, compressor as never);
  Tone.connect(makeupCancel as never, ctx.destination as never);
  masterIn.connect(blep);
  const mctx = {
    masterEffectsInput: masterIn, blepInput: blep, masterEffectsNodes: [], masterEffectConfigs: new Map(),
    masterEffectAnalysers: new Map(), masterEffectsRebuildVersion: 0, _isPlaying: false,
    _notifyNoiseEffectsPlaying() {}, applyEffectParametersDiff() {}, updateBpmSyncedEffects: async () => {},
  };
  await rebuildMasterEffects(mctx as never, tonePart(preset) as never);
  Tone.connect(src as never, masterIn as never);
  await settleReverbs();
  src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}

/** The preset on the DJ mixer's master chain: deck C (no crossfader) → masterGain → chain → limiter → destination. */
export async function renderDJ(preset: Preset): Promise<Float32Array> {
  const { Tone, ctx, src } = await freshContext(preset);
  const { DJMixerEngine } = await import('@/engine/dj/DJMixerEngine');
  Tone.connect(Tone.getDestination() as never, ctx.destination as never);
  const mixer = new DJMixerEngine();
  await mixer.rebuildMasterEffects(tonePart(preset) as never);
  Tone.connect(src as never, mixer.inputC as never);
  await settleReverbs();
  src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}


/** Tracker vs DJ for one preset: level and bass difference (dB) after the DJ crossfade, samples over full scale. */
export async function measureParity(preset: Preset) {
  const tracker = await renderTracker(preset);
  const dj = await renderDJ(preset);
  const from = SR * 2;
  let over = 0;
  for (const out of [tracker, dj]) for (let i = 0; i < out.length; i++) if (Math.abs(out[i]) > 1) over++;
  return {
    levelDiffDb: Math.abs(rmsDb(dj, from) - rmsDb(tracker, from)),
    bassDiffDb: Math.abs(lowBandDb(dj, 120, from) - lowBandDb(tracker, 120, from)),
    over,
  };
}
