/**
 * Every master FX preset sounds the same in the tracker view and the DJ view.
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
import { FX_PRESETS, measureParity, warmNoiseBuffers } from './masterPresetRender';

/**
 * Heavy tier (tools/test-tiers/heavy.json): every preset in the master menu, ~4 minutes. The renders are
 * deterministic (seeded Math.random, shared noise buffers), so a failure is a real level, bass or clipping
 * difference between the views. MASTER_PARITY_PRESETS='A|B' renders only those presets. Only the preset's
 * Tone effects render headless: WASM / WAM / neural effects need a browser worklet.
 */
describe('every master FX preset in the tracker and the DJ view', () => {
  beforeAll(async () => {
    installRealWebAudio();
    await import('@/engine/registry/effects');
    await warmNoiseBuffers();
  }, 180_000); // imports the whole master chain + DJ mixer, then one warm-up render: minutes on a loaded machine

  const only = process.env.MASTER_PARITY_PRESETS?.split('|');
  for (const preset of FX_PRESETS.filter((p) => !only || only.includes(p.name))) {
    it(`${preset.name} plays at the same level and the same bass in both views, 0 samples over full scale`, async () => {
      const r = await measureParity(preset);
      expect(r.over).toBe(0);
      expect(r.levelDiffDb).toBeLessThan(0.5);
      expect(r.bassDiffDb).toBeLessThan(0.5);
    }, 120000);
  }
});
