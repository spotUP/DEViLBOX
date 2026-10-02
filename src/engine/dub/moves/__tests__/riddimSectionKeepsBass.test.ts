import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * riddimSection must leave the bass playing.
 *
 * Fired on `world class dub.mod`, whose roles read
 * ["pad", "percussion", "pad", "percussion"], it muted BOTH "pads" — and
 * channel 0 is the bassline (pitch 34-39, monophonic, 24 onsets at density
 * 0.375). The owner: "i only heard drums no bass".
 *
 * This drives the move's own `execute` with those exact roles, so the rule is
 * proved where it runs and not only in the helper. Live verification was not
 * possible at the time: HMR kept reloading the page and reverting the loaded
 * song (dub-studio-progress X27), so every reading measured a different tune.
 */
const { muted } = vi.hoisted(() => ({ muted: [] as number[] }));

vi.mock('@/stores/useMixerStore', () => ({
  useMixerStore: {
    getState: () => ({
      channels: [{ dubRole: null }, { dubRole: null }, { dubRole: null }, { dubRole: null }],
    }),
  },
}));

vi.mock('@/stores/useTrackerStore', () => {
  const rowsWithNote = (note: number) =>
    Array.from({ length: 64 }, (_, r) => ({ note: r % 4 === 0 ? note : 0 }));
  return {
    useTrackerStore: {
      getState: () => ({
        patterns: [{
          channels: [
            { rows: rowsWithNote(37) },  // bassline register
            { rows: rowsWithNote(45) },  // snare
            { rows: rowsWithNote(60) },  // pad, above the bass ceiling
            { rows: rowsWithNote(36) },  // kick
          ],
        }],
      }),
    },
  };
});

vi.mock('@/stores/useTransportStore', () => ({
  useTransportStore: { getState: () => ({ currentGlobalRow: 0, currentRow: 0, speed: 6 }) },
}));

vi.mock('@/stores/useInstrumentStore', () => ({
  useInstrumentStore: { getState: () => ({ instruments: [] }) },
}));

vi.mock('../../songChannelIdentity', () => ({
  // What the song identity resolves for this song.
  readSongChannelIdentity: () => ({ roles: ['pad', 'percussion', 'pad', 'percussion'], pattern: null, names: [], currentRow: 0 }),
}));

vi.mock('@/lib/dub/dubChannelTransient', () => ({
  beginDubTransient: () => {},
  setDubTransient: (i: number, s: { muted?: boolean }) => { if (s.muted) muted.push(i); },
  endDubTransient: () => {},
}));

vi.mock('../../DubRouter', () => ({ fire: () => null }));

import { riddimSection } from '../riddimSection';

beforeEach(() => { muted.length = 0; });

const ctx = { bpm: 120, params: { holdBars: 4 } } as never;

describe('riddimSection keeps the riddim', () => {
  it('leaves the lowest-register melodic channel playing when nothing is labelled bass', () => {
    const disposer = riddimSection.execute(ctx);
    expect(muted, 'the bassline (ch0) was muted — this is the report').not.toContain(0);
    expect(muted, 'the pad should still go').toContain(2);
    disposer?.dispose();
  });

  it('never mutes a percussion channel — the drums are the other half', () => {
    const disposer = riddimSection.execute(ctx);
    expect(muted).not.toContain(1);
    expect(muted).not.toContain(3);
    disposer?.dispose();
  });

  it('still does something — sparing the bass must not turn the move into a no-op', () => {
    const disposer = riddimSection.execute(ctx);
    expect(muted.length).toBeGreaterThan(0);
    disposer?.dispose();
  });
});
