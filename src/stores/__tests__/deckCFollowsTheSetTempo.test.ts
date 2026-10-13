/**
 * Owner report 2026-10-13: Deck C showed 125 BPM (the store's default) while A and B played at 100 (A detected 100,
 * B 93.75 pitched to 100), so a pad's or the MCP's scratch stroke on Deck C was timed at 125. Deck C without a track
 * of its own follows the set's master clock - one writer - and the MCP's dj_get_state reports it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDJStore, setMasterDeck } from '@/stores/useDJStore';
import { getDJState } from '@/bridge/handlers/djHandlers';

describe('Deck C follows the set tempo', () => {
  beforeEach(() => {
    const s = useDJStore.getState();
    for (const d of ['A', 'B'] as const) s.setDeckPlaying(d, false);
    s.setDeckState('C', { fileName: null, effectiveBPM: 125, detectedBPM: 125 });
  });

  it('with A at 100 and B (93.75) pitched to 100, Deck C reports 100 - in the store and in dj_get_state', () => {
    const s = useDJStore.getState();
    s.setDeckState('A', { detectedBPM: 100, effectiveBPM: 100 });
    s.setDeckState('B', { detectedBPM: 93.75, effectiveBPM: 100 });
    s.setCrossfader(0.3);
    s.setDeckPlaying('A', true);
    s.setDeckPlaying('B', true);
    expect(useDJStore.getState().decks.C.effectiveBPM).toBe(100);
    const mcp = getDJState() as { decks: Record<string, { effectiveBPM: number; isPlaying: boolean; audioPosition: number }>; masterDeck: string };
    expect(mcp.decks.C!.effectiveBPM).toBe(100);
    expect(mcp.masterDeck).toBe('A');
    expect(typeof mcp.decks.C!.isPlaying).toBe('boolean');
  });

  it('follows the deck the crossfader favours, and a tempo change on it', () => {
    const s = useDJStore.getState();
    s.setDeckState('A', { effectiveBPM: 100 });
    s.setDeckState('B', { effectiveBPM: 128 });
    s.setDeckPlaying('A', true);
    s.setDeckPlaying('B', true);
    s.setCrossfader(0.9);
    expect(setMasterDeck(useDJStore.getState())).toBe('B');
    expect(useDJStore.getState().decks.C.effectiveBPM).toBe(128);
    s.setDeckState('B', { effectiveBPM: 126.5 });
    expect(useDJStore.getState().decks.C.effectiveBPM).toBe(126.5);
  });

  it('a track loaded on Deck C keeps its own tempo', () => {
    const s = useDJStore.getState();
    s.setDeckState('C', { fileName: 'own.mod', effectiveBPM: 140, detectedBPM: 140 });
    s.setDeckState('A', { effectiveBPM: 100 });
    s.setDeckPlaying('A', true);
    expect(useDJStore.getState().decks.C.effectiveBPM).toBe(140);
  });
});
