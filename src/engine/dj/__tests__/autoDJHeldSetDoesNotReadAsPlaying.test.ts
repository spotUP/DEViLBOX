/**
 * DECK-C-DEMO-TAKEOVER (owner live report 2026-10-14): the Three Deck Showcase held the set - deck A paused at
 * 5.7 s, no deck playing, masterDeck null - yet the Auto DJ status read 'playing'. Pausing a deck pauses the Auto
 * DJ (its poll loop stops), but `DJAutoDJ.pause()` wrote 'playing' "to keep the status visible", so a held set
 * looked like a running one and the Auto DJ panel's Pause button kept its own copy of the truth.
 *
 * Drives the showcase's hold path (DJActions.togglePlay with spin-down 0, as `hold` calls it) on the real Auto DJ;
 * only the decks are stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown, pauses: [] as string[] }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, start: async () => undefined, getContext: () => ({ state: 'running', rawContext: { currentTime: 0 } }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));

import { useDJStore } from '@/stores/useDJStore';
import { getAutoDJ } from '../DJAutoDJ';
import { togglePlay, resumeAutoDJ } from '../DJActions';

describe('a set held by the Three Deck Showcase does not read as playing', () => {
  beforeEach(() => {
    holder.pauses.length = 0;
    const deck = (id: string) => ({
      id, playbackMode: 'audio', isPlaying: () => true,
      pause: () => { holder.pauses.push(id); }, stop: () => undefined, setVolume: () => undefined,
      audioPlayer: { getPosition: () => 5.7, getDuration: () => 130 },
    });
    const decks: Record<string, ReturnType<typeof deck>> = { A: deck('A'), B: deck('B'), C: deck('C') };
    holder.engine = { getDeck: (id: string) => decks[id], setCrossfader: () => undefined, mixer: {} };
    const s = useDJStore.getState();
    s.setDeckState('A', { fileName: 'suggestive vibes 1.wav', isPlaying: true, detectedBPM: 125, effectiveBPM: 125, durationMs: 130_000 });
    s.setAutoDJEnabled(true);
    s.setAutoDJStatus('playing');
    getAutoDJ();
  });
  afterEach(() => {
    (getAutoDJ() as unknown as { stopPolling(): void }).stopPolling();
    useDJStore.getState().setAutoDJEnabled(false);
  });

  it('the hold pauses the playing deck and the Auto DJ reports paused, not playing; resume reports playing', async () => {
    await togglePlay('A', { spinDownMs: 0 });
    const s = useDJStore.getState();
    expect(holder.pauses).toContain('A');
    expect(s.decks.A.isPlaying).toBe(false);
    expect(s.autoDJEnabled).toBe(true);
    expect(s.autoDJStatus).toBe('paused');

    resumeAutoDJ();
    expect(useDJStore.getState().autoDJStatus).toBe('playing');
  });
});
