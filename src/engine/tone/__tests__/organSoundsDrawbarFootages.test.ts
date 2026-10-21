/**
 * The Organ synth sounds each drawbar at its footage: 16' an octave below the key, 5 1/3' a fifth above the key,
 * 8' at the key. Before the fix the nine drawbar levels went straight into Tone's partials as harmonics 1-9 of the
 * key, so Rock Organ [8,8,8] lost its sub-octave and played the key, its octave and its twelfth: an octave too high
 * and thin ("smurf music" on an imported MIDI organ part). Rendered through the real InstrumentFactory and Tone on
 * an OfflineAudioContext (node-web-audio-api); nothing opens an output device.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installRealWebAudio } from '@/test/audio/realWebAudio';
import type * as ToneNS from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { InstrumentFactory as InstrumentFactoryT } from '../../InstrumentFactory';
import { renderOffline, toneAmplitude, type Rendered } from './toneKnobRender';

let Tone: typeof ToneNS;
let Factory: typeof InstrumentFactoryT;
let DEFAULT_ORGAN: typeof import('@/types/instrument').DEFAULT_ORGAN;

beforeAll(async () => {
  installRealWebAudio();
  Tone = await import('tone');
  Factory = (await import('../../InstrumentFactory')).InstrumentFactory;
  DEFAULT_ORGAN = (await import('@/types/instrument')).DEFAULT_ORGAN;
});

type Playable = { connect: (d: unknown) => void; triggerAttackRelease: (n: string, d: number, t: number) => void };

function renderOrgan(drawbars: number[]): Promise<Rendered> {
  const config = {
    id: 1, name: 'Rock Organ', type: 'synth', synthType: 'Organ', volume: -6, pan: 0,
    organ: { ...DEFAULT_ORGAN, drawbars, rotary: { enabled: false, speed: 'slow' } },
  } as unknown as InstrumentConfig;
  return renderOffline(Tone, 1, () => {
    const organ = Factory.createInstrument(config) as unknown as Playable;
    organ.connect(Tone.getDestination());
    organ.triggerAttackRelease('A3', 0.8, 0.05); // the key: 220 Hz
  });
}

describe('Organ drawbars sound at their footages', () => {
  it('Rock Organ [8,8,8] sounds 16\' (110 Hz), 8\' (220 Hz) and 5 1/3\' (330 Hz), and no octave above the key', async () => {
    const r = await renderOrgan([8, 8, 8, 0, 0, 0, 0, 0, 0]);
    const at = (hz: number) => toneAmplitude(r, hz, 0.2, 0.8);
    const key = at(220);
    expect(key).toBeGreaterThan(0.01);
    expect(at(110)).toBeGreaterThan(key * 0.5);
    expect(at(330)).toBeGreaterThan(key * 0.5);
    expect(at(440)).toBeLessThan(key * 0.05); // 4' is pulled out
    expect(at(660)).toBeLessThan(key * 0.05); // 2 2/3' is pulled out
  }, 60000);

  it('the 8\' drawbar alone sounds the pitch of the key', async () => {
    const r = await renderOrgan([0, 0, 8, 0, 0, 0, 0, 0, 0]);
    const at = (hz: number) => toneAmplitude(r, hz, 0.2, 0.8);
    expect(at(220)).toBeGreaterThan(0.01);
    expect(at(110)).toBeLessThan(at(220) * 0.05);
    expect(at(440)).toBeLessThan(at(220) * 0.05);
  }, 60000);
});
