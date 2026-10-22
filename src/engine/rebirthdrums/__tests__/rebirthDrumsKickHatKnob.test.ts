/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 808 / 909 through the real factory: kick and hat notes sound, an unmapped note is silent,
 * and the kick decay knob changes the rendered tail.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { setDevilboxAudioContext } from '@/utils/audio-context';
import { rms, type Rendered } from '../../tone/__tests__/toneKnobRender';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@/types/synth';
import type { ReBirthDrumSynth } from '../ReBirthDrumSynth';

const SR = 44100;

async function render(kit: '808' | '909', note: string, cfg: Record<string, number>): Promise<{ r: Rendered; synth: ReBirthDrumSynth }> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * 1.2), SR);
  setDevilboxAudioContext(ctx as unknown as AudioContext);
  await import(`../../registry/builtin/rebirth${kit}`);
  const { InstrumentFactory } = await import('../../InstrumentFactory');
  const inst = InstrumentFactory.createInstrument({
    id: 1, name: 'rb', type: 'synth', synthType: `ReRebirth${kit}`, volume: -6, pan: 0, effects: [],
    [`rebirth${kit}`]: cfg,
  } as unknown as InstrumentConfig);
  const synth = inst as unknown as ReBirthDrumSynth;
  (inst as unknown as DevilboxSynth).output.connect(ctx.destination);
  synth.triggerAttack(note, 0.05, 1);
  const buf = await ctx.startRendering();
  return { r: { samples: buf.getChannelData(0), sampleRate: SR }, synth };
}

describe('ReBirth drums via InstrumentFactory', () => {
  beforeAll(() => { installRealWebAudio(); });

  for (const kit of ['808', '909'] as const) {
    it(`${kit}: kick and closed hat sound, unmapped note is silent`, async () => {
      const kick = await render(kit, 'C2', {});
      expect(kick.synth.name).toBe(`ReRebirth${kit}`); // sentinel: the real synth ran
      expect(rms(kick.r, 0.05, 0.5)).toBeGreaterThan(0.001);
      const hat = await render(kit, 'F#2', {});
      expect(rms(hat.r, 0.05, 0.3)).toBeGreaterThan(0.001);
      const none = await render(kit, 'C5', {});
      expect(rms(none.r, 0, 1.1)).toBe(0);
    });

    it(`${kit}: bass drum decay knob lengthens the tail`, async () => {
      const short = await render(kit, 'C2', { bdDecay: 0.05 });
      const long = await render(kit, 'C2', { bdDecay: 0.95 });
      expect(rms(long.r, 0.4, 1.1)).toBeGreaterThan(rms(short.r, 0.4, 1.1) * 2);
    });
  }
});
