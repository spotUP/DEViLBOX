/**
 * A master FX preset sounds the same in the tracker view and the DJ view.
 *
 * Owner, 2026-10-14: "master FX presets sound awesome in the DJ view but in
 * the tracker view most presets sound crackly and miss the bass" (mostly
 * Amiga Bass Cannon). The two views wired the same preset differently: the
 * tracker chain (MasterEffectsChain) applied each effect's level calibration
 * and the preset's make-up gain, the DJ mixer's chain applied neither and split
 * the bass off bass-locked effects instead - Bass Cannon ran about 6 dB hotter
 * in the DJ view. And the tracker's output limiter (a soft 4:1) let the hot
 * preset through above full scale: 1.06 peak at the destination, clipping,
 * where the DJ path's brick-wall held it.
 *
 * Offline, real nodes: the real tracker rebuildMasterEffects and the real
 * DJMixerEngine, one input signal, the preset's Tone effects (its WASM bass
 * enhancer needs a worklet and is left out - it is created the same way in
 * both views).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { FX_PRESETS } from '@/constants/fxPresets';

const SR = 48000;
const SECONDS = 3;

/** Kick, bass and hats at a mix level well under the DJ limiter. */
function loop(n: number): Float32Array<ArrayBuffer> {
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

function rmsDb(x: Float32Array, from: number): number {
  let s = 0; for (let i = from; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (x.length - from) + 1e-20);
}

/** Level of the band below `hz` (two-pole low-pass, twice), dB. */
function lowBandDb(x: Float32Array, hz: number, from: number): number {
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

type Preset = (typeof FX_PRESETS)[number];
const tonePart = (preset: Preset) => preset.effects
  .filter((e) => e.category === 'tonejs')
  .map((e, i) => ({ ...e, id: `fx${i}`, enabled: true }));

async function freshContext(preset: Preset) {
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
async function renderTracker(preset: Preset): Promise<Float32Array> {
  const { Tone, ctx, src } = await freshContext(preset);
  const { rebuildMasterEffects } = await import('../MasterEffectsChain');
  const masterIn = new Tone.Gain(1);
  const blep = new Tone.Gain(1);
  Tone.connect(blep as never, ctx.destination as never);
  masterIn.connect(blep);
  const mctx = {
    masterEffectsInput: masterIn, blepInput: blep, masterEffectsNodes: [], masterEffectConfigs: new Map(),
    masterEffectAnalysers: new Map(), masterEffectsRebuildVersion: 0, _isPlaying: false,
    _notifyNoiseEffectsPlaying() {}, applyEffectParametersDiff() {}, updateBpmSyncedEffects: async () => {},
  };
  await rebuildMasterEffects(mctx as never, tonePart(preset) as never);
  Tone.connect(src as never, masterIn as never);
  src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}

/** The preset on the DJ mixer's master chain: deck C (no crossfader) → masterGain → chain → limiter → destination. */
async function renderDJ(preset: Preset): Promise<Float32Array> {
  const { Tone, ctx, src } = await freshContext(preset);
  const { DJMixerEngine } = await import('@/engine/dj/DJMixerEngine');
  Tone.connect(Tone.getDestination() as never, ctx.destination as never);
  const mixer = new DJMixerEngine();
  await mixer.rebuildMasterEffects(tonePart(preset) as never);
  Tone.connect(src as never, mixer.inputC as never);
  src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}

describe('a master FX preset in the tracker and the DJ view', () => {
  beforeAll(async () => {
    installRealWebAudio();
    await import('@/engine/registry/effects');
  });

  // Amiga Bass Cannon: the owner's case. Cassette Dub: a bass-locked delay,
  // whose low end bypasses the effects in both views now.
  const PRESETS = (process.env.MASTER_PARITY_PRESETS ?? 'Amiga Bass Cannon|Cassette Dub').split('|');
  for (const name of PRESETS) {
    it(`${name} plays at the same level and the same bass in both views`, async () => {
      const preset = FX_PRESETS.find((p) => p.name === name)!;
      const tracker = await renderTracker(preset);
      const dj = await renderDJ(preset);
      const from = SR * 2; // after the DJ mixer's crossfade into the new chain
      expect(Math.abs(rmsDb(dj, from) - rmsDb(tracker, from))).toBeLessThan(0.5);
      expect(Math.abs(lowBandDb(dj, 120, from) - lowBandDb(tracker, 120, from))).toBeLessThan(0.5);
    }, 120000);
  }
});

describe('the tracker master limiter', () => {
  beforeAll(() => { installRealWebAudio(); });

  it('holds a bass line 6 dB over full scale below clipping (no crackle)', async () => {
    const Tone = await import('tone');
    const ctx = new OfflineAudioContext(1, SR, SR);
    Tone.setContext(ctx as never);
    const { createToneSafetyLimiter } = await import('@/engine/dj/djLimiter');
    const { compressor, makeupCancel } = createToneSafetyLimiter();
    const osc = ctx.createOscillator(); osc.frequency.value = 60;
    const hot = ctx.createGain(); hot.gain.value = 2; // +6 dBFS
    osc.connect(hot);
    Tone.connect(hot as never, compressor as never);
    Tone.connect(makeupCancel as never, ctx.destination as never);
    osc.start();
    const out = (await ctx.startRendering()).getChannelData(0);
    let clipped = 0;
    for (let i = SR / 10; i < out.length; i++) if (Math.abs(out[i]) >= 1) clipped++;
    expect(clipped).toBe(0);
  }, 60000);
});
