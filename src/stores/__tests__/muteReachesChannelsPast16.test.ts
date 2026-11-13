/**
 * "The drum channel cannot be muted" (owner, 2026-11-13).
 *
 * A Neo Geo extended-FM song has 17 channels; its ADPCM-B kick sits on channel 16. The mixer held a
 * fixed 16 strips, so mute, solo and mute-all (which loop over the strips) never reached channel 16
 * and the kick kept playing. A song load now grows the strip list to the song's channel count.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

const engineMutes: Array<[number, boolean]> = [];
vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => new Proxy({}, {
    get: (_t, key) => key === 'setChannelMute'
      ? (ch: number, muted: boolean) => engineMutes.push([ch, muted])
      : () => undefined,
  }),
}));

describe('mute reaches channels past 16', () => {
  let useMixerStore: typeof import('@/stores/useMixerStore').useMixerStore;
  beforeAll(async () => { ({ useMixerStore } = await import('@/stores/useMixerStore')); }, 120_000);

  it('a 17-channel song load gives channel 16 a strip, and muting it reaches the engine', () => {
    useMixerStore.getState().resetMuteState(17);
    expect(useMixerStore.getState().channels).toHaveLength(17);

    engineMutes.length = 0;
    useMixerStore.getState().setChannelMute(16, true);
    expect(useMixerStore.getState().channels[16].muted).toBe(true);
    expect(engineMutes).toContainEqual([16, true]);
  });

  it('a smaller song never shrinks the strip list', () => {
    useMixerStore.getState().resetMuteState(4);
    expect(useMixerStore.getState().channels.length).toBeGreaterThanOrEqual(16);
  });
});
