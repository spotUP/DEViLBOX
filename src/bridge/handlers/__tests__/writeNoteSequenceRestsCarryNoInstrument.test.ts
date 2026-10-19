/**
 * write_note_sequence stamps the instrument beside real notes only. Owner bug
 * (2026-10-19): a sequence with rests wrote `--- 01` on every rest row, so the
 * instrument column showed numbers between the notes. FT2 and ProTracker never
 * add an instrument without a note; the user may still type one by hand.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({ stop: () => undefined, hasReplacedInstruments: false, replacedInstrumentIds: [] }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined),
  }),
  peekTrackerReplayer: () => null,
}));
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = new Proxy({}, { get: () => () => Promise.resolve() });
  return { useInstrumentTypeStore: { getState: () => state } };
});

import { writeNoteSequence } from '../writeHandlers';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { resetStore } from '@/stores/__tests__/_harness';

describe('write_note_sequence', () => {
  beforeEach(() => resetStore(useTrackerStore));

  it('puts the instrument beside real notes only; rest and note-off rows stay instrument-free', () => {
    const result = writeNoteSequence({ channel: 0, startRow: 0, notes: ['C-3', '---', 'E-3', 'OFF', 'G-3'], instrument: 1 });
    expect(result).toMatchObject({ ok: true, count: 5 });

    const st = useTrackerStore.getState();
    const rows = st.patterns[st.currentPatternIndex].channels[0].rows;
    const noteRows = [0, 2, 4];
    for (const r of noteRows) {
      expect(rows[r].note, `row ${r} note`).toBeGreaterThan(0);
      expect(rows[r].instrument, `row ${r} instrument`).toBe(1);
    }
    expect(rows[1].note, 'rest row note').toBe(0);
    expect(rows[1].instrument ?? 0, 'rest row instrument').toBe(0);
    expect(rows[3].note, 'note-off row note').toBe(97);
    expect(rows[3].instrument ?? 0, 'note-off row instrument').toBe(0);
  });

  it('rejects an unparsable note without writing earlier rows twice', () => {
    const result = writeNoteSequence({ channel: 0, startRow: 0, notes: ['C-3', 'nope'], instrument: 1 });
    expect(result).toHaveProperty('error');
  });
});
