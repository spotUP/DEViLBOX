/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * bass-voice.js step(): a note that slides in is not retriggered, so its accent flag adds no VCA boost.
 * Drives the synth through the registry descriptor's onTriggerAttack (the tracker's entry point).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import { setDevilboxAudioContext } from '@/utils/audio-context';
import { rms, type Rendered } from '../../tone/__tests__/toneKnobRender';
import type { ReBirth303Synth } from '../ReBirth303Synth';

const SR = 44100;

async function render(slideAccent: boolean): Promise<{ r: Rendered; ran: string }> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * 1.2), SR);
  setDevilboxAudioContext(ctx as unknown as AudioContext);
  const { SynthRegistry } = await import('../../registry/SynthRegistry');
  await import('../../registry/builtin/rebirth303');
  const desc = SynthRegistry.get('ReRebirth303')!;
  const synth = desc.create({ rebirth303: { cutoff: 0.5, resonance: 0.2, envmod: 0, accent: 1 } } as never) as ReBirth303Synth;
  synth.output.connect(ctx.destination);
  // Plain note, then a slide into a second note at t = 0.5 (the first note is released at the boundary).
  desc.onTriggerAttack!(synth, 'C2', 0.05, 1, { accent: false, slide: false } as never);
  desc.onTriggerRelease!(synth, 'C2', 0.5, {} as never);
  desc.onTriggerAttack!(synth, 'E2', 0.5, 1, { accent: slideAccent, slide: true } as never);
  const buf = await ctx.startRendering();
  return { r: { samples: buf.getChannelData(0), sampleRate: SR }, ran: synth.name };
}

describe('ReRebirth303 slide', () => {
  beforeAll(() => { installRealWebAudio(); });

  it('a slid note ignores its accent flag (no VCA boost)', async () => {
    const plain = await render(false);
    const accented = await render(true);
    expect(plain.ran).toBe('ReRebirth303'); // sentinel
    const a = rms(plain.r, 0.7, 1.0);
    const b = rms(accented.r, 0.7, 1.0);
    expect(a).toBeGreaterThan(0.001); // the slid note keeps sounding past the step boundary
    expect(b / a).toBeCloseTo(1, 2);
  });
});
