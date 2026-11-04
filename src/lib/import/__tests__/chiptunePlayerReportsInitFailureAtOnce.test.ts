/**
 * A ChiptunePlayer whose worklet cannot start (no AudioContext) must tell a
 * caller that subscribes to onError after onInitialized, the order
 * loadWithLibopenmpt uses. Before the fix the failure fired synchronously
 * inside onInitialized() with no onError subscriber yet, so the loader sat on
 * its 10 s timeout for every file that reached libopenmpt without audio.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@utils/audio-context', () => ({
  getDevilboxAudioContext: () => { throw new Error('no shared context'); },
}));

import { ChiptunePlayer } from '../ChiptunePlayer';

describe('ChiptunePlayer init failure', () => {
  it('reaches an onError handler registered after onInitialized, at once', () => {
    vi.stubGlobal('AudioContext', undefined);
    try {
      const player = new ChiptunePlayer();
      const initialized = vi.fn();
      const errors: Array<{ type: string }> = [];
      player.onInitialized(initialized);
      player.onError((e) => errors.push(e));
      expect(initialized).not.toHaveBeenCalled();
      expect(errors.map((e) => e.type)).toEqual(['init']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
