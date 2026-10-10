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
const engine = vi.hoisted(() => ({ releaseAll: vi.fn(), setGlobalPlaybackRate: vi.fn(), setGlobalDetune: vi.fn() }));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => engine }));

import { useTransportStore } from '@/stores/useTransportStore';
import { useDJStore } from '@/stores/useDJStore';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('starting a deck while the tracker plays stops the tracker and resets its pitch and rate', async () => {
    useTransportStore.setState({ isPlaying: true });
    const stop = vi.spyOn(useTransportStore.getState(), 'stop');
    useDJStore.getState().setDeckPlaying('B', true);
    await flush();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(engine.setGlobalPlaybackRate).toHaveBeenCalledWith(1.0);
    expect(useDJStore.getState().decks.B.isPlaying).toBe(true);
  });

  it('entering the DJ view does not stop a playing tracker', () => {
    // Owner 2026-10-10: "the dj view killed the tracker view when i switched to it".
    // The mount used to call useTransportStore stop() unconditionally (since bad3f3d3b).
    const src = readFileSync(join(process.cwd(), 'src/components/dj/DJView.tsx'), 'utf8');
    expect(src).not.toMatch(/if \(isPlaying\) stop\(\)/);
    expect(src).toContain('if (!useTransportStore.getState().isPlaying) void handOverToDJ();');
  });

  it('leaves the other side alone when it is not playing', async () => {
    useTransportStore.setState({ isPlaying: true });
    await flush();
    expect(stopDeck).not.toHaveBeenCalled();
    expect(disableAutoDJ).not.toHaveBeenCalled();
  });
});
