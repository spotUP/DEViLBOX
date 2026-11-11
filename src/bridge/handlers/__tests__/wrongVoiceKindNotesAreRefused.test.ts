/**
 * Owner decision 2026-11-11: refuse the note. An FM instrument written to an
 * ADPCM or SSG channel of a Neo Geo song is silent or wrong, so the write
 * answers with an error that names the channels that take the instrument.
 * Entry point: the MCP set_cells / write_note_sequence handlers; the same
 * check sits in the tracker store's cell write, which the pattern editor uses.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

import { setCells, writeNoteSequence } from '../writeHandlers';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { resetStore } from '@/stores/__tests__/_harness';
import * as chipVoiceKinds from '@/engine/furnace-dispatch/chipVoiceKinds';
import type { InstrumentConfig } from '@typedefs/instrument';

const FM_ID = 1;
const SAMPLE_ID = 2;
const PIANO_ID = 3;

function current() {
  const st = useTrackerStore.getState();
  return st.patterns[st.currentPatternIndex];
}
const noteAt = (ch: number, row: number) => current().channels[ch].rows[row].note;

function instrument(id: number, synthType: string, furnace?: Record<string, unknown>): InstrumentConfig {
  return { id, name: `i${id}`, type: 'synth', synthType, furnace } as unknown as InstrumentConfig;
}

describe('a note on a channel of the wrong voice kind is refused', () => {
  let checkSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetStore(useTrackerStore);
    while (current().channels.length < 14) useTrackerStore.getState().addChannel();
    useInstrumentStore.setState({
      instruments: [
        instrument(FM_ID, 'FurnaceOPNB', { divInsType: 1 }),
        instrument(SAMPLE_ID, 'FurnaceOPNB', { divInsType: 38 }),
        instrument(PIANO_ID, 'Synth'),
      ],
    });
    checkSpy = vi.spyOn(chipVoiceKinds, 'checkNoteVoiceKind');
  });
  afterEach(() => checkSpy.mockRestore());

  it('set_cells: an FM voice on tracker channel 4 returns the channels that take FM and writes nothing; on channel 0 it is written', () => {
    const refused = setCells({ cells: [{ channel: 4, row: 0, note: 'C-3', instrument: FM_ID }] });
    expect(checkSpy).toHaveBeenCalled(); // sentinel: the check ran
    expect(String(refused.error)).toContain('FM voice');
    expect(String(refused.error)).toContain('channels 1, 2, 3, 4 (indexes 0, 1, 2, 3)');
    expect(noteAt(4, 0)).toBe(0);

    expect(setCells({ cells: [{ channel: 0, row: 0, note: 'C-3', instrument: FM_ID }] })).toMatchObject({ ok: true });
    expect(noteAt(0, 0)).not.toBe(0);
  });

  it('set_cells refuses the whole batch when one cell is wrong: no half-written batch', () => {
    const result = setCells({ cells: [
      { channel: 0, row: 0, note: 'C-3', instrument: FM_ID },
      { channel: 8, row: 1, note: 'C-3', instrument: FM_ID },
    ] });
    expect(result).toHaveProperty('error');
    expect(noteAt(0, 0)).toBe(0);
  });

  it('write_note_sequence refuses an FM voice on an ADPCM channel', () => {
    const result = writeNoteSequence({ channel: 8, startRow: 0, notes: ['C-3', 'E-3'], instrument: FM_ID });
    expect(String(result.error)).toContain('Channel 9 (index 8) plays ADPCM-A');
    expect(noteAt(8, 0)).toBe(0);
  });

  it('a sample voice plays on the ADPCM-B channel; a non-Furnace instrument plays anywhere', () => {
    expect(setCells({ cells: [{ channel: 13, row: 0, note: 'C-3', instrument: SAMPLE_ID }] })).toMatchObject({ ok: true });
    expect(setCells({ cells: [{ channel: 8, row: 0, note: 'C-3', instrument: PIANO_ID }] })).toMatchObject({ ok: true });
  });

  it('the pattern editor path (store setCell) refuses the note and warns through notify', () => {
    const before = useNotificationStore.getState().notifications.length;
    useTrackerStore.getState().setCell(4, 0, { note: 49, instrument: FM_ID });
    expect(noteAt(4, 0)).toBe(0);
    expect(useNotificationStore.getState().notifications.length).toBe(before + 1);
  });

  it('a paste puts back the cells on wrong-kind channels and warns once', () => {
    useTrackerStore.getState().setCell(0, 0, { note: 49, instrument: FM_ID });
    useTrackerStore.getState().setCell(0, 1, { note: 51, instrument: FM_ID });
    useTrackerStore.getState().copyTrack(0);
    const before = useNotificationStore.getState().notifications.length;
    useTrackerStore.getState().pasteTrack(8);
    expect(noteAt(8, 0)).toBe(0);
    expect(noteAt(8, 1)).toBe(0);
    expect(useNotificationStore.getState().notifications.length).toBe(before + 1);
    useTrackerStore.getState().pasteTrack(1);
    expect(noteAt(1, 0)).toBe(49);
  });

  it('loading a song with wrong-kind notes does not alter it', () => {
    const patterns = structuredClone(useTrackerStore.getState().patterns);
    patterns[0].channels[8].rows[0] = { ...patterns[0].channels[8].rows[0], note: 49, instrument: FM_ID };
    useTrackerStore.getState().loadPatterns(patterns);
    expect(noteAt(8, 0)).toBe(49);
  });
});
