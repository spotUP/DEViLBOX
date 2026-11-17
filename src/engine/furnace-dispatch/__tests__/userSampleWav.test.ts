import { describe, expect, it } from 'vitest';
import { userSampleFromWavDataUrl, userSampleToWavDataUrl } from '../userSampleWav';

describe('userSample <-> sample editor WAV', () => {
  it('round-trips PCM and rate; a resampled edit carries its new rate', () => {
    const original = { name: 'kick', data: new Int16Array([0, 1200, -1200, 32767, -32768, 5]), rate: 18500 };
    const back = userSampleFromWavDataUrl(userSampleToWavDataUrl(original), 'kick');
    expect(Array.from(back.data)).toEqual(Array.from(original.data));
    expect(back.rate).toBe(18500);
    expect(userSampleFromWavDataUrl(userSampleToWavDataUrl({ ...original, rate: 11025 }), 'kick').rate).toBe(11025);
  });
});
