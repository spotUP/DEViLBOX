/**
 * useDJStore — per-deck FX targeting
 *
 * Covers the fxTargetChannels / channelModeUI plumbing behind the DJ
 * scope MUTE/FX mode chip.
 *
 * NOTE: the shared `resetStore` harness deep-clones via JSON round-trip,
 * which turns `Set` into `{}`. We can't use it here. Instead each test
 * puts the store back into a clean fxTarget/mute state through the
 * store's own actions — which do go through immer correctly and leave
 * a real Set instance behind.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDJStore } from '../useDJStore';

function clearFxState(): void {
  const s = useDJStore.getState();
  for (const deck of ['A', 'B', 'C'] as const) {
    s.clearFxTarget(deck);
    s.setChannelMode(deck, 'mute');
    s.setAllDeckChannels(deck, true);
  }
}

describe('useDJStore — per-deck fx target', () => {
  beforeEach(clearFxState);

  it('every deck starts with an empty fxTargetChannels Set and mute mode', () => {
    const s = useDJStore.getState();
    for (const deck of ['A', 'B', 'C'] as const) {
      expect(s.decks[deck].fxTargetChannels).toBeInstanceOf(Set);
      expect(s.decks[deck].fxTargetChannels.size).toBe(0);
      expect(s.decks[deck].channelModeUI).toBe('mute');
    }
  });

  it('toggleFxTarget adds and removes a channel', () => {
    const { toggleFxTarget } = useDJStore.getState();
    toggleFxTarget('A', 2);
    expect(useDJStore.getState().decks.A.fxTargetChannels.has(2)).toBe(true);
    toggleFxTarget('A', 2);
    expect(useDJStore.getState().decks.A.fxTargetChannels.has(2)).toBe(false);
  });

  it('setFxTarget replaces the whole set', () => {
    const { setFxTarget, toggleFxTarget } = useDJStore.getState();
    toggleFxTarget('A', 1);
    toggleFxTarget('A', 3);
    setFxTarget('A', [5, 7, 9]);
    const s = useDJStore.getState().decks.A.fxTargetChannels;
    expect([...s].sort((a, b) => a - b)).toEqual([5, 7, 9]);
  });

  it('clearFxTarget empties the set', () => {
    const { setFxTarget, clearFxTarget } = useDJStore.getState();
    setFxTarget('A', [1, 2, 3]);
    clearFxTarget('A');
    expect(useDJStore.getState().decks.A.fxTargetChannels.size).toBe(0);
  });

  it('setChannelMode flips between "mute" and "fx"', () => {
    const { setChannelMode } = useDJStore.getState();
    setChannelMode('A', 'fx');
    expect(useDJStore.getState().decks.A.channelModeUI).toBe('fx');
    setChannelMode('A', 'mute');
    expect(useDJStore.getState().decks.A.channelModeUI).toBe('mute');
  });

  it('fx targeting and channel mute are independent', () => {
    const { toggleDeckChannel, toggleFxTarget } = useDJStore.getState();
    // Mute ch 2.
    toggleDeckChannel('A', 2);
    const maskAfterMute = useDJStore.getState().decks.A.channelMask;
    // Toggle fx target on ch 3.
    toggleFxTarget('A', 3);
    const s = useDJStore.getState();
    // Mute mask unchanged by fx toggle.
    expect(s.decks.A.channelMask).toBe(maskAfterMute);
    // And fx set unaffected by mute.
    expect(s.decks.A.fxTargetChannels.has(3)).toBe(true);
    expect(s.decks.A.fxTargetChannels.has(2)).toBe(false);
  });

  it('fx target set does not leak across decks (factory defaults, not shared reference)', () => {
    const { toggleFxTarget } = useDJStore.getState();
    toggleFxTarget('A', 1);
    const s = useDJStore.getState();
    expect(s.decks.A.fxTargetChannels.has(1)).toBe(true);
    expect(s.decks.B.fxTargetChannels.size).toBe(0);
    expect(s.decks.C.fxTargetChannels.size).toBe(0);
    // Distinct Set instances.
    expect(s.decks.A.fxTargetChannels).not.toBe(s.decks.B.fxTargetChannels);
    expect(s.decks.B.fxTargetChannels).not.toBe(s.decks.C.fxTargetChannels);
  });

  it('resetDeck returns a fresh empty Set, not a shared reference', () => {
    const { toggleFxTarget, resetDeck } = useDJStore.getState();
    toggleFxTarget('A', 1);
    toggleFxTarget('A', 2);
    resetDeck('A');
    const fresh = useDJStore.getState().decks.A.fxTargetChannels;
    expect(fresh).toBeInstanceOf(Set);
    expect(fresh.size).toBe(0);
    // And the reset set must not alias any other deck's.
    expect(fresh).not.toBe(useDJStore.getState().decks.B.fxTargetChannels);
  });

  it('solo-in-fx-set pattern: setFxTarget with a single channel replaces the set', () => {
    const { toggleFxTarget, setFxTarget } = useDJStore.getState();
    toggleFxTarget('A', 1);
    toggleFxTarget('A', 3);
    // Shift+click semantic from DeckScopes/DeckChannelToggles.
    setFxTarget('A', [5]);
    const s = useDJStore.getState().decks.A.fxTargetChannels;
    expect([...s]).toEqual([5]);
  });
});
