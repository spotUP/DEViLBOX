import { describe, it, expect } from 'vitest';
import { SYNTH_INFO, SYNTH_CATEGORIES } from '../synthCategories';

describe('Ron Klaren catalog', () => {
  it('does not offer the standalone RonKlarenSynth (playback is the whole-song engine)', () => {
    expect(Object.keys(SYNTH_INFO)).not.toContain('RonKlarenSynth');
    const offered = SYNTH_CATEGORIES.flatMap((c) => c.synths.map((s) => s.type));
    expect(offered).not.toContain('RonKlarenSynth');
  });
});
