/**
 * The speed a sample plays at for a written note - what the analyzer judges
 * a drum at, and what the editor playhead moves at.
 */
import { describe, it, expect } from 'vitest';
import { samplePlaybackRate } from '../samplePlaybackRate';
import type { InstrumentConfig } from '@typedefs/instrument';

const mod = { synthType: 'Sampler', sample: { sampleRate: 8363, baseNote: 'C3' }, metadata: { modPlayback: { usePeriodPlayback: true, periodMultiplier: 3546895, finetune: 0 } } } as unknown as InstrumentConfig;
const xm = { synthType: 'Sampler', sample: { sampleRate: 44100, baseNote: 'C4' } } as unknown as InstrumentConfig;

describe('samplePlaybackRate', () => {
  it('a MOD sample at XM 49 (period 428) plays at about its recorded speed', () => {
    expect(samplePlaybackRate(mod, 49)).toBeCloseTo(3546895 / 428 / 8363, 6);
  });
  it('a MOD sample at XM 61 (ProTracker C-3, period 214) plays twice as fast', () => {
    expect(samplePlaybackRate(mod, 61)).toBeCloseTo(3546895 / 214 / 8363, 6);
  });
  it('the cell\'s own period wins over its note: import paths number notes differently', () => {
    // convertMODModule names period 214 note 37; the MOD codec names it 61.
    expect(samplePlaybackRate(mod, 37, 214)).toBeCloseTo(3546895 / 214 / 8363, 6);
  });
  it('a sample without period playback is pitched against its base note', () => {
    expect(samplePlaybackRate(xm, 49)).toBeCloseTo(1, 9);   // C-4 on a C4 sample
    expect(samplePlaybackRate(xm, 61)).toBeCloseTo(2, 9);
  });
  it('no note plays at recorded speed', () => {
    expect(samplePlaybackRate(mod, 0)).toBe(1);
    expect(samplePlaybackRate(mod, 97)).toBe(1);
  });
});
