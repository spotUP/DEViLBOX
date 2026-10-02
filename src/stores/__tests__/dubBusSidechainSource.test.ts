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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  // ─── 'drums' — the classifier key ────────────────────────────────────────
  // Added 2026-10-02. The user reported the sidechain as inaudible, and the
  // depth knob was measured healthy (threshold -33.3 dB at depth 0.91, no
  // stuck latch). The cause was that both reachable sources made the duck
  // useless in practice: 'bus' keys the dub return off itself, and ducking an
  // already-quiet filtered return by 27 dB cannot be heard; 'channel' requires
  // the performer to already know which channel holds the kick. 'drums' asks
  // the channel classifier instead — the same source of truth the Master FX
  // "Drums (auto)" key uses, so the two cannot drift apart.

  it('accepts and persists the classifier key', () => {
    useDrumPadStore.getState().setDubBus({ sidechainSource: 'drums' });
    expect(useDrumPadStore.getState().dubBus.sidechainSource).toBe('drums');
  });

  it('leaves the default alone — bus self-compression is still the default', () => {
    expect(DEFAULT_DUB_BUS.sidechainSource).toBe('bus');
  });

  it('the classifier key does not overwrite the performer\'s manual channel pick', () => {
    useDrumPadStore.getState().setDubBus({ sidechainSource: 'channel', sidechainChannelIndex: 7 });
    useDrumPadStore.getState().setDubBus({ sidechainSource: 'drums' });
    const s = useDrumPadStore.getState().dubBus;
    expect(s.sidechainChannelIndex, 'switching to the auto key threw away the manual pick').toBe(7);
  });

  it('offers the classifier key in the panel', () => {
    // Guards the UI: a setting the engine honours but the panel never exposes
    // is exactly the dead-knob shape this audit keeps finding.
    const panel = readFileSync(
      resolve(import.meta.dirname, '..', '..', 'components', 'dub', 'DubBusPanel.tsx'), 'utf8');
    expect(panel).toMatch(/value: 'drums', label: 'Drums \(auto\)'/);
  });

  it('re-resolves the drum key when the song changes', () => {
    // A drum key is a promise about one song. Without re-resolving on a new
    // song the duck keys on whichever channel held the kick in the last one.
    const strip = readFileSync(
      resolve(import.meta.dirname, '..', '..', 'components', 'dub', 'DubDeckStrip.tsx'), 'utf8');
    expect(strip).toMatch(/resolveDrumKeyChannel/);
    expect(strip).toMatch(/onSongChange\(\(\) => setDrumKeySong\(/);
    expect(strip).toMatch(/drumKeySong\]\);/);
  });

  it('sees a new song even when it has as many patterns as the last one', async () => {
    // The key used to re-resolve on `patterns.length`: two songs with the same
    // pattern count kept the first song's drum channel.
    const { onSongChange } = await import('@/engine/tone/sidechainKey');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const calls: number[] = [];
    const stop = onSongChange(() => calls.push(1), 0);
    await new Promise((r) => setTimeout(r, 20)); // the store import resolves
    const before = useTrackerStore.getState().patterns;
    useTrackerStore.setState({ patterns: [...before] });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(1);
    stop();
    useTrackerStore.setState({ patterns: [...before] });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls, 'an unsubscribed listener still fired').toHaveLength(1);
  });
});
