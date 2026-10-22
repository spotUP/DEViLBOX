/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 303 through the real factory: a note renders sound, and the cutoff knob moves the spectrum.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { setDevilboxAudioContext } from '@/utils/audio-context';
import { rms, toneAmplitude, type Rendered } from '../../tone/__tests__/toneKnobRender';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@/types/synth';
import type { ReBirth303Synth } from '../ReBirth303Synth';

const SR = 44100;
const F0 = 65.406; // C2

async function render(cutoff: number): Promise<{ r: Rendered; synth: ReBirth303Synth }> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * 1.2), SR);
  setDevilboxAudioContext(ctx as unknown as AudioContext);
  await import('../../registry/builtin/rebirth303');
  const { InstrumentFactory } = await import('../../InstrumentFactory');
  const inst = InstrumentFactory.createInstrument({
    id: 1, name: 'rb', type: 'synth', synthType: 'ReRebirth303', volume: -6, pan: 0, effects: [],
    rebirth303: { cutoff, envmod: 0, resonance: 0.2, waveform: 0 },
  } as unknown as InstrumentConfig);
  const synth = inst as unknown as ReBirth303Synth;
  (inst as unknown as DevilboxSynth).output.connect(ctx.destination);
  synth.triggerAttack('C2', 0.05, 1);
  const buf = await ctx.startRendering();
  return { r: { samples: buf.getChannelData(0), sampleRate: SR }, synth };
}

function highEnergy(r: Rendered): number {
  let sum = 0;
  for (let h = 6; h <= 16; h++) sum += toneAmplitude(r, F0 * h, 0.3, 0.9);
  return sum;
}

describe('ReRebirth303 via InstrumentFactory', () => {
  beforeAll(() => { installRealWebAudio(); });

  it('renders audible sound and the cutoff knob changes the spectrum', async () => {
    const low = await render(0.1);
    const high = await render(0.9);
    expect(low.synth.name).toBe('ReRebirth303'); // sentinel: the real synth ran
    expect(rms(low.r, 0.3, 0.9)).toBeGreaterThan(0.001);
    expect(rms(high.r, 0.3, 0.9)).toBeGreaterThan(0.001);
    expect(highEnergy(high.r)).toBeGreaterThan(highEnergy(low.r) * 2);
  });
});
