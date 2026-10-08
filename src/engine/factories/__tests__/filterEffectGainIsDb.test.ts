/**
 * The Filter effect's shelf and peaking gain is the dB it is set to (FX3).
 *
 * Tone.Filter converts its decibel `gain` to a linear factor before the
 * biquads, which read decibels: a +6 dB shelf gave +2 dB and a -6 dB cut gave
 * a +0.4 dB boost - the bug the EQ3 bands had (amigaPresetPunch.test.ts).
 * Rendered offline with the real factory and registry nodes on real Tone.
 */
import { describe, it, expect } from 'vitest';
import type * as ToneNS from 'tone';
import { installRealWebAudio } from '@/test/audio/realWebAudio';

const SR = 48000;
const SECONDS = 2;
const HZ = 12000; // well above the 2 kHz shelf corner: the full shelf gain

const rmsDb = (x: Float32Array, from = SR / 2): number => {
  let s = 0; for (let i = from; i < x.length; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (x.length - from) + 1e-20);
};

type Make = (Tone: typeof ToneNS) => Promise<ToneNS.ToneAudioNode>;

async function gainDb(make: Make, after?: (node: ToneNS.ToneAudioNode) => Promise<void>): Promise<number> {
  installRealWebAudio();
  const Tone = await import('tone');
  const ctx = new OfflineAudioContext(1, SR * SECONDS, SR);
  Tone.setContext(ctx);
  const input = new Float32Array(SR * SECONDS);
  for (let i = 0; i < input.length; i++) input[i] = 0.1 * Math.sin(2 * Math.PI * HZ * i / SR);
  const buf = ctx.createBuffer(1, input.length, SR);
  buf.copyToChannel(input, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const node = await make(Tone);
  if (after) await after(node);
  Tone.connect(src as never, node as never);
  Tone.connect(node as never, ctx.destination as never);
  src.start();
  const out = (await ctx.startRendering()).getChannelData(0);
  return rmsDb(out) - rmsDb(input);
}

const shelf = (gain: number) => ({ type: 'highshelf', frequency: 2000, rolloff: -12, Q: 1, gain });
const viaFactory = (gain: number): Make => async () => {
  const { createEffect } = await import('@/engine/factories/EffectFactory');
  return await createEffect({ id: 'f', type: 'Filter', category: 'tonejs', enabled: true, wet: 100, parameters: shelf(gain) } as never) as unknown as ToneNS.ToneAudioNode;
};

describe('Filter effect shelf gain is the dB it is set to', () => {
  it('a +6 dB high shelf from the effect factory boosts by 6 dB, not 2 dB', async () => {
    const g = await gainDb(viaFactory(6));
    expect(g).toBeGreaterThan(5.5);
    expect(g).toBeLessThan(6.5);
  }, 60000);

  it('a -6 dB high shelf from the effect registry cuts instead of boosting', async () => {
    const g = await gainDb(async () => {
      const { createFilterEffect } = await import('@/engine/factories/dbGainFilter');
      // The registry's create() goes through the same createFilterEffect.
      const src = (await import('node:fs')).readFileSync('src/engine/registry/effects/tonejs.ts', 'utf8');
      expect(src).toMatch(/return createFilterEffect\(/);
      return createFilterEffect(shelf(-6) as never);
    });
    expect(g).toBeLessThan(-5.5);
    expect(g).toBeGreaterThan(-6.5);
  }, 60000);

  it('a gain knob move to -6 dB cuts by 6 dB (the parameter engine)', async () => {
    const g = await gainDb(viaFactory(0), async (node) => {
      const { applyEffectParametersDiff } = await import('@/engine/tone/EffectParameterEngine');
      applyEffectParametersDiff(node, 'Filter', { gain: -6 });
    });
    expect(g).toBeLessThan(-5.5);
    expect(g).toBeGreaterThan(-6.5);
  }, 60000);
});
