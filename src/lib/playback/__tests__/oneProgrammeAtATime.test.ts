/**
 * Owner 2026-10-10: "if I switch to the tracker view and load a song and play
 * it while the DJ view is playing, both play at the same time". Decision: one
 * programme at a time - starting either side stops the other.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { stopDeck, disableAutoDJ } = vi.hoisted(() => ({
  stopDeck: vi.fn(async (id: 'A' | 'B' | 'C') => (await import('@/stores/useDJStore')).useDJStore.getState().setDeckPlaying(id, false)),
  disableAutoDJ: vi.fn(async () => (await import('@/stores/useDJStore')).useDJStore.setState({ autoDJEnabled: false })),
}));
vi.mock('@/engine/dj/DJActions', () => ({ stopDeck, disableAutoDJ }));

import { useTransportStore } from '@/stores/useTransportStore';
import { useDJStore } from '@/stores/useDJStore';
import { installOneProgrammeAtATime } from '../oneProgrammeAtATime';

const flush = () => new Promise((r) => setTimeout(r, 0));
let uninstall: () => void;

beforeEach(() => {
  stopDeck.mockClear(); disableAutoDJ.mockClear();
  useTransportStore.setState({ isPlaying: false, isPaused: false });
  for (const id of ['A', 'B', 'C'] as const) useDJStore.getState().setDeckPlaying(id, false);
  useDJStore.setState({ autoDJEnabled: false });
  uninstall = installOneProgrammeAtATime();
});
afterEach(() => uninstall());

describe('the tracker and the DJ decks never play together', () => {
  it('starting the tracker while a DJ set plays stops the decks and turns Auto DJ off', async () => {
    useDJStore.getState().setDeckPlaying('A', true);
    useDJStore.setState({ autoDJEnabled: true });
    useTransportStore.setState({ isPlaying: true });
    await flush();
    expect(disableAutoDJ).toHaveBeenCalledTimes(1);
    expect(stopDeck).toHaveBeenCalledWith('A');
    expect(useDJStore.getState().decks.A.isPlaying).toBe(false);
    expect(useTransportStore.getState().isPlaying).toBe(true);
  });

  it('starting a deck while the tracker plays stops the tracker', () => {
    useTransportStore.setState({ isPlaying: true });
    const stop = vi.spyOn(useTransportStore.getState(), 'stop');
    useDJStore.getState().setDeckPlaying('B', true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(useDJStore.getState().decks.B.isPlaying).toBe(true);
  });

  it('leaves the other side alone when it is not playing', async () => {
    useTransportStore.setState({ isPlaying: true });
    await flush();
    expect(stopDeck).not.toHaveBeenCalled();
    expect(disableAutoDJ).not.toHaveBeenCalled();
  });
});
