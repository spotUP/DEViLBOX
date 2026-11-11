/**
 * Owner report 2026-11-11: with a Neo Geo song open (instrument 1 an FM
 * voice), closing the start dialog raised a flood of warning toasts,
 * "Channel 10 (index 9) plays ADPCM-A, but this instrument is a FM voice ...
 * 1 note was not written.", one per lip channel per frame.
 *
 * The startup jingle draws lips as decorative cells (instrument 1) on ten
 * channels. It wrote them through `setChannelRows`, the song-edit action,
 * which refuses a note of the wrong voice kind and warns. The lips are a
 * display overlay: they must draw on every channel without a warning, and the
 * end of the jingle must put the song's own rows back exactly, also a cell
 * the edit path would refuse (a loaded song may hold one).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@engine/TrackerReplayer', () => ({
  peekTrackerReplayer: () => null,
  getTrackerReplayer: () => new Proxy({}, { get: () => () => undefined }),
}));
vi.mock('@/engine/TrackerReplayer', () => ({
  peekTrackerReplayer: () => null,
  getTrackerReplayer: () => new Proxy({}, { get: () => () => undefined }),
}));
vi.mock('../JingleEngine', () => {
  const analyser = {
    fftSize: 64,
    // A loud square wave, so the lips are open and lit cells are written.
    getByteTimeDomainData: (buf: Uint8Array) => buf.forEach((_, i) => { buf[i] = i % 2 ? 255 : 0; }),
  };
  return { getJingleEngine: () => ({ getAnalyser: () => analyser }) };
});

import { injectMouthPatterns, teardownMouthPatterns, updateChannels } from '../JinglePatterns';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useNotificationStore } from '@stores/useNotificationStore';
import { resetStore } from '@stores/__tests__/_harness';
import type { InstrumentConfig } from '@typedefs/instrument';

const SONG_CHANNELS = 8;
const SSG_CH = 5; // Neo Geo: tracker channels 0-3 FM, 4-6 SSG, 7-12 ADPCM-A
const OPEN_MOUTH_SECONDS = 4.9;

function current() {
  const st = useTrackerStore.getState();
  return st.patterns[st.currentPatternIndex];
}
const warnings = () => useNotificationStore.getState().notifications.length;
const litCells = (ch: number) => current().channels[ch].rows.filter((r) => r.note !== 0).length;

describe('startup jingle lips on a song with a mixed-kind chip', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    resetStore(useTrackerStore);
    while (current().channels.length < SONG_CHANNELS) useTrackerStore.getState().addChannel();
    useInstrumentStore.setState({
      instruments: [
        { id: 1, name: 'FM Bass', type: 'synth', synthType: 'FurnaceOPNB', furnace: { divInsType: 1 } } as unknown as InstrumentConfig,
      ],
    });
    // A cell the edit path refuses, as a loaded song may hold: an FM note on an SSG channel.
    useTrackerStore.setState((state) => {
      const cell = state.patterns[state.currentPatternIndex].channels[SSG_CH].rows[3];
      cell.note = 37;
      cell.instrument = 1;
    });
    useNotificationStore.setState({ notifications: [] });
  });

  it('the edit path does refuse an FM lip cell on that channel (sentinel)', () => {
    const rows = current().channels[SSG_CH].rows.map((r, i) => (i === 0 ? { ...r, note: 49, instrument: 1 } : { ...r }));
    useTrackerStore.getState().setChannelRows(SSG_CH, rows);
    expect(current().channels[SSG_CH].rows[0].note).toBe(0);
    expect(warnings()).toBe(1);
  });

  it('draws the lips on every channel and puts the song back, without a warning', () => {
    const before = current().channels.map((ch) => ch.rows.map((r) => ({ note: r.note, instrument: r.instrument })));

    injectMouthPatterns();
    updateChannels(useTrackerStore.getState().currentPatternIndex, OPEN_MOUTH_SECONDS);

    expect(current().channels.length).toBe(10);
    // Channels 4-9 are SSG and ADPCM-A: the lips must show there as on the FM channels.
    for (let ch = 0; ch < 10; ch++) expect(litCells(ch), `lip cells on channel ${ch}`).toBeGreaterThan(0);
    expect(warnings()).toBe(0);

    teardownMouthPatterns();

    expect(current().channels.length).toBe(SONG_CHANNELS);
    const after = current().channels.map((ch) => ch.rows.map((r) => ({ note: r.note, instrument: r.instrument })));
    expect(after).toEqual(before);
    expect(after[SSG_CH][3]).toEqual({ note: 37, instrument: 1 });
    expect(warnings()).toBe(0);
  });
});
