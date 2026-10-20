import { describe, expect, it } from 'vitest';
import { getSoftsynthVoice } from '../voiceRegistry';
import { DEVILBOX_TO_HOST_MIDI, SOFTSYNTH_RATE } from '../softsynthVoice';
import { renderBassVoiceNote } from '../voices/bassSynth';
import { VOICE_TO_SOFTSYNTH } from '@/lib/uprough/songFile';

const CASES: [string, string][] = [
  ['bassSampled', 'sampled'], ['bassElectric', 'electric'], ['bassWarmsub', 'warmsub'], ['bassGfunk', 'gfunk'],
  ['bassElectro', 'electro'], ['bassReese', 'reese'], ['bassVoice808', '808'],
];

describe('non-808 bass softsynth voices', () => {
  it.each(CASES)('%s renders through the registry as renderBassVoiceNote(%s)', (id, voice) => {
    const v = getSoftsynthVoice(id)!;
    expect(v, 'registered').toBeDefined();
    const midi = 36 + 9; // host midi: semi 9
    const got = v.render({}, { midi, durSec: 0.25, velocity: 1 }, SOFTSYNTH_RATE, 5);
    const want = renderBassVoiceNote(voice, { semi: 9, durS: 0.25, glide: null, seed: 5 }, SOFTSYNTH_RATE);
    const rms = Math.sqrt(got.reduce((a, x) => a + x * x, 0) / got.length);
    expect(rms).toBeGreaterThan(1e-4);
    expect(Array.from(got)).toEqual(Array.from(want));
    expect(DEVILBOX_TO_HOST_MIDI).toBe(12);
  });

  it('every file bass voice maps to a registered softsynth voice', () => {
    for (const [, voice] of CASES) expect(getSoftsynthVoice(VOICE_TO_SOFTSYNTH[voice]!)).toBeDefined();
  });
});
