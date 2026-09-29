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
  it('a MOD sample at note 25 (C-2, period 428) plays at about its recorded speed', () => {
    expect(samplePlaybackRate(mod, 25)).toBeCloseTo(3546895 / 428 / 8363, 6);
  });
  it('a MOD sample at note 37 (C-3, period 214) plays twice as fast', () => {
    expect(samplePlaybackRate(mod, 37)).toBeCloseTo(3546895 / 214 / 8363, 6);
  });
  it('the cell\'s own period counts while it names the note (a finetuned or off-table period)', () => {
    expect(samplePlaybackRate(mod, 25, 430)).toBeCloseTo(3546895 / 430 / 8363, 6);
  });
  it('a stale period from before an edit does not count: the note decides', () => {
    expect(samplePlaybackRate(mod, 37, 428)).toBeCloseTo(3546895 / 214 / 8363, 6);
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
