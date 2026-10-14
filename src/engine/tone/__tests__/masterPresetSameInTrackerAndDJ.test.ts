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
import { FX_PRESETS, SR, measureParity, warmNoiseBuffers } from './masterPresetRender';

/**
 * Every preset the master menu offers is checked in masterPresetParityEveryPreset.test.ts (heavy tier).
 * This file keeps the presets that failed on noise before the renders were deterministic (reverb
 * impulse response drawn from Math.random), plus the bass-locked ones the original wiring bug hit.
 */
const GATE_PRESETS = ['Shoegaze', 'Dreamy Haze', 'Big Muff Doom', 'Amiga Bass Cannon'];

describe('a master FX preset in the tracker and the DJ view', () => {
  beforeAll(async () => {
    installRealWebAudio();
    await import('@/engine/registry/effects');
    await warmNoiseBuffers();
  }, 180_000); // imports the whole master chain + DJ mixer, then one warm-up render: minutes on a loaded machine

  for (const name of GATE_PRESETS) {
    it(`${name} plays at the same level and the same bass in both views, 0 samples over full scale`, async () => {
      const preset = FX_PRESETS.find((p) => p.name === name);
      expect(preset, `preset ${name} is in the master menu`).toBeDefined();
      const r = await measureParity(preset!);
      expect(r.over).toBe(0);
      expect(r.levelDiffDb).toBeLessThan(0.5);
      expect(r.bassDiffDb).toBeLessThan(0.5);
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
