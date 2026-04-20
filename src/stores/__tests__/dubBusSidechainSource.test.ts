/**
 * G13 — sidechain source selector store behavior.
 *
 * Locks the rule that `sidechainSource` and `sidechainChannelIndex` are
 * plain settings that round-trip through `setDubBus` like any other
 * non-character field:
 *   - Default is 'bus' (self-compression, historical behaviour)
 *   - Switching to 'channel' doesn't auto-flip characterPreset (not a
 *     voicing field — the user's engineer choice stays stable)
 *   - Channel index clamps to a reasonable range on the UI side
 *     (asserted via setDubBus not mutating the value; clamping lives
 *     in the UI input handler since the store accepts any number).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDrumPadStore } from '../useDrumPadStore';
import { DEFAULT_DUB_BUS } from '../../types/dub';

function reset() {
  useDrumPadStore.setState({
    dubBus: { ...DEFAULT_DUB_BUS },
    dubBusStash: null,
  });
}

describe('useDrumPadStore — sidechain source fields (G13)', () => {
  beforeEach(reset);

  it('defaults to bus self-compression (no regression)', () => {
    const s = useDrumPadStore.getState().dubBus;
    expect(s.sidechainSource).toBe('bus');
    expect(s.sidechainChannelIndex).toBe(0);
  });

  it('setDubBus({ sidechainSource: "channel" }) persists', () => {
    useDrumPadStore.getState().setDubBus({ sidechainSource: 'channel' });
    expect(useDrumPadStore.getState().dubBus.sidechainSource).toBe('channel');
  });

  it('setDubBus({ sidechainChannelIndex: 3 }) persists', () => {
    useDrumPadStore.getState().setDubBus({ sidechainChannelIndex: 3 });
    expect(useDrumPadStore.getState().dubBus.sidechainChannelIndex).toBe(3);
  });

  it('switching source does NOT flip characterPreset (not a voicing field)', () => {
    // Load Tubby first — character fields are now owned by a preset.
    useDrumPadStore.getState().setDubBus({ characterPreset: 'tubby' });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('tubby');
    // Flip source to channel — preset name must NOT auto-flip to 'custom'
    // because sidechainSource isn't a character-owned field.
    useDrumPadStore.getState().setDubBus({ sidechainSource: 'channel' });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('tubby');
    // Same for the channel index.
    useDrumPadStore.getState().setDubBus({ sidechainChannelIndex: 2 });
    expect(useDrumPadStore.getState().dubBus.characterPreset).toBe('tubby');
  });

  it('both fields can be patched together in a single setDubBus call', () => {
    useDrumPadStore.getState().setDubBus({
      sidechainSource: 'channel',
      sidechainChannelIndex: 5,
    });
    const s = useDrumPadStore.getState().dubBus;
    expect(s.sidechainSource).toBe('channel');
    expect(s.sidechainChannelIndex).toBe(5);
  });

  it('setting source back to bus does not change the stored channel index', () => {
    // User picks channel 3, then switches back to bus. Their channel
    // choice is preserved so flipping back to 'channel' restores it.
    useDrumPadStore.getState().setDubBus({
      sidechainSource: 'channel',
      sidechainChannelIndex: 3,
    });
    useDrumPadStore.getState().setDubBus({ sidechainSource: 'bus' });
    expect(useDrumPadStore.getState().dubBus.sidechainSource).toBe('bus');
    expect(useDrumPadStore.getState().dubBus.sidechainChannelIndex).toBe(3);
  });
});
