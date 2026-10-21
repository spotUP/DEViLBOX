import { describe, it, expect } from 'vitest';
import { runActOne, FACTORY_RATE } from '../actOne';
import { bankVoice, oneShotBuffer } from '../voiceAudition';

/** The two AudioContext calls oneShotBuffer makes, recorded. */
function fakeContext(): BaseAudioContext {
  return {
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return {
        numberOfChannels: channels, length, sampleRate,
        copyToChannel: (src: Float32Array) => data.set(src),
        getChannelData: () => data,
      };
    },
  } as unknown as BaseAudioContext;
}

describe('voice audition', () => {
  it('builds a mono AudioBuffer of the bank length at 22050 Hz', () => {
    const bank = runActOne('trap', 3);
    const kick = bankVoice('kick')!;
    expect(kick.samples).toBe(bank.kick);
    const buffer = oneShotBuffer(fakeContext(), kick.samples, kick.rate);
    expect(buffer.length).toBe(bank.kick!.length);
    expect(buffer.sampleRate).toBe(22050);
    expect(FACTORY_RATE).toBe(22050);
    expect(buffer.numberOfChannels).toBe(1);
    expect(buffer.getChannelData(0)[100]).toBeCloseTo(bank.kick![100]!, 6);
  });
});
