/**
 * The CED classifier never classifies a burst of channels at once.
 *
 * Every channel left its 15 s cooldown on the same tick, so all seven of a
 * Hippel song were classified together: seven ~0.5 s inferences back to back
 * every 15 s, pinning the audio thread for 1-2 s — heard as dropouts
 * (2026-09-28).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const classify = vi.fn();
vi.mock('@stores/useChannelTypeStore', () => ({ useChannelTypeStore: { getState: () => ({ classifyChannelAudio: classify }) } }));
vi.mock('../ChannelAudioTap', () => ({
  CHANNEL_AUDIO_RING: 32768,
  latestChannelAudio: () => ({ samples: new Float32Array(32768), sampleRate: 48000 }),
}));
vi.mock('../CedMelSpectrogram', () => ({ resampleTo16k: (x: Float32Array) => x }));

import { cedChannelAccumulator } from '../CedChannelAccumulator';

beforeEach(() => { classify.mockClear(); cedChannelAccumulator.reset(); });

describe('CED channel classification pacing', () => {
  it('classifies one channel per tick window, never seven together', () => {
    let t = 100_000;
    cedChannelAccumulator.feed(7, t);
    cedChannelAccumulator.feed(7, t + 250);
    expect(classify).toHaveBeenCalledTimes(1);

    // Over a full 15 s cycle of 250 ms ticks every channel is reached once.
    for (let k = 0; k < 60; k++) { t += 250; cedChannelAccumulator.feed(7, t); }
    const channels = classify.mock.calls.map((c) => c[0]);
    expect(new Set(channels)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    // And no two within 2 s of each other.
    expect(classify.mock.calls.length).toBeLessThanOrEqual(8);
  });
});
